import fs from "node:fs/promises";

const ORG = process.env.GITHUB_ORG || "YOUR_GITHUB_ORG";
const TOKEN = process.env.DINA_GITHUB_TOKEN || "";
const API = "https://api.github.com";
const API_VERSION = "2026-03-10";
const WINDOW_DAYS = Number(process.env.ACTIVITY_WINDOW_DAYS || 90);
const MAX_API_REQUESTS = 400;
const RATE_LIMIT_RESERVE = 25;
const EXCLUDE_REPOS = new Set(
  (process.env.EXCLUDE_REPOS || `${ORG}.github.io`)
    .split(",")
    .map(x => x.trim().toLowerCase())
    .filter(Boolean)
);

const headers = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": API_VERSION,
  "User-Agent": "DINA-LAB-private-metadata-stats",
  Authorization: `Bearer ${TOKEN}`,
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let requestCount = 0;
let lastRequestAt = 0;
let remainingRequests = null;
let requestLimit = null;
let stopRequests = false;

function stopRefresh(message, status) {
  const error = new Error(message);
  error.stopRefresh = true;
  error.status = status;
  return error;
}

async function request(path, { allow202 = false, allow204 = false } = {}) {
  if (stopRequests || requestCount >= MAX_API_REQUESTS ||
      (remainingRequests !== null && remainingRequests <= RATE_LIMIT_RESERVE)) {
    throw stopRefresh("API request budget is low; preserving the last successful snapshot.");
  }
  // Keep requests sequential and paced to avoid bursts and secondary rate limits.
  await sleep(Math.max(0, 250 - (Date.now() - lastRequestAt)));
  lastRequestAt = Date.now();
  requestCount += 1;
  const response = await fetch(`${API}${path}`, { headers, signal: AbortSignal.timeout(20000) });
  const remaining = response.headers.get("x-ratelimit-remaining");
  const limit = response.headers.get("x-ratelimit-limit");
  if (remaining !== null && Number.isFinite(Number(remaining))) remainingRequests = Number(remaining);
  if (limit !== null && Number.isFinite(Number(limit))) requestLimit = Number(limit);
  if (allow202 && response.status === 202) return { status: 202, data: null, headers: response.headers };
  if (allow204 && response.status === 204) return { status: 204, data: null, headers: response.headers };
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    if (response.status === 429 || (response.status === 403 &&
        (remainingRequests === 0 || response.headers.has("retry-after") || /rate limit/i.test(body.message || "")))) {
      stopRequests = true;
      // Do not retry before Retry-After/reset: this run uses the fallback instead.
      throw stopRefresh("GitHub rate limit reached; stopping API requests for this run.", response.status);
    }
    const err = new Error(`GitHub API returned HTTP ${response.status}`);
    err.status = response.status;
    throw err;
  }
  return { status: response.status, data: await response.json(), headers: response.headers };
}

async function paginate(path) {
  const out = [];
  let page = 1;
  while (true) {
    const glue = path.includes("?") ? "&" : "?";
    const { data, headers: h } = await request(`${path}${glue}per_page=100&page=${page}`);
    out.push(...data);
    if (!h.get("link")?.includes('rel="next"') || data.length < 100) break;
    page += 1;
    await sleep(80);
  }
  return out;
}

async function listRepos() {
  return paginate(`/orgs/${encodeURIComponent(ORG)}/repos?type=all&sort=updated&direction=desc`);
}


async function readPreviousStats() {
  try {
    const previous = JSON.parse(await fs.readFile("data/github-stats.json", "utf8"));
    return previous && typeof previous === "object" ? previous : null;
  } catch {
    return null;
  }
}

function usablePreviousStats(previous) {
  return previous && [ORG.toLowerCase(), "your_github_org"].includes(String(previous.organization || "").toLowerCase()) &&
    Number.isFinite(Number(previous.repoCount)) && Number.isFinite(Number(previous.totalCommits)) &&
    Number(previous.repoCount) >= 0 && Number(previous.totalCommits) >= 0 &&
    (Number(previous.repoCount) > 0 || Number(previous.totalCommits) > 0);
}

async function writeSnapshot(output) {
  await fs.mkdir("data", { recursive: true });
  await fs.writeFile("data/github-stats.json", JSON.stringify(output, null, 2) + "\n");
}

async function readMembers() {
  try {
    return JSON.parse(await fs.readFile("data/members.json", "utf8"));
  } catch {
    return [];
  }
}

async function fetchProfiles(members, previousProfiles = {}) {
  const usernames = [...new Set(members.map(m => m.github).filter(Boolean))];
  const profiles = Object.fromEntries(usernames.filter(username => previousProfiles[username])
    .map(username => [username, previousProfiles[username]]));

  for (const username of usernames) {
    try {
      const { data } = await request(`/users/${encodeURIComponent(username)}`);
      profiles[username] = {
        login: data.login,
        name: data.name,
        avatar_url: data.avatar_url,
        html_url: data.html_url,
        bio: data.bio,
        company: data.company,
        location: data.location,
        blog: data.blog,
        public_repos: data.public_repos,
      };
    } catch (error) {
      if (error.stopRefresh) throw error;
      console.warn(`Could not refresh public profile for @${username}.`);
    }
    await sleep(50);
  }

  return profiles;
}

async function contributorStats(repoName) {
  const path = `/repos/${encodeURIComponent(ORG)}/${encodeURIComponent(repoName)}/stats/contributors`;
  const waits = [0, 1200, 2500, 4500, 7000];

  for (const wait of waits) {
    if (wait) await sleep(wait);
    const result = await request(path, { allow202: true, allow204: true });
    if (result.status === 200) {
      if (!Array.isArray(result.data)) throw new Error("GitHub returned invalid contributor statistics.");
      return result.data;
    }
    if (result.status === 204) return [];
  }

  // Exhausted 202 responses mean incomplete data, not a repository with zero commits.
  throw new Error("GitHub is still calculating contributor statistics.");
}

function commitsInsideWindow(weeks = [], cutoffMs) {
  return weeks.reduce((sum, week) => {
    const start = Number(week.w || 0) * 1000;
    const end = start + 7 * 86400000;
    return end >= cutoffMs ? sum + Number(week.c || 0) : sum;
  }, 0);
}

async function collectStats(previousStats) {
  if (!ORG || ORG === "YOUR_GITHUB_ORG") {
    throw new Error("Set DINA_GITHUB_ORG in repository variables before refreshing statistics.");
  }
  if (!TOKEN) throw new Error("DINA_GITHUB_TOKEN is required for private repository statistics.");
  console.log(`Collecting privacy-preserving aggregate GitHub statistics for ${ORG} ...`);

  const allRepos = await listRepos();
  const repos = allRepos.filter(repo =>
    !repo.archived &&
    !repo.fork &&
    !EXCLUDE_REPOS.has(String(repo.name || "").toLowerCase())
  );

  const members = await readMembers();
  const configuredUsers = new Set(members.map(m => String(m.github || "").toLowerCase()).filter(Boolean));
  const profiles = await fetchProfiles(members, previousStats?.profiles || {});
  const cutoffMs = Date.now() - WINDOW_DAYS * 86400000;
  const activity = new Map();
  let totalCommits = 0;
  let reposWithStats = 0;

  for (let i = 0; i < repos.length; i += 1) {
    // Intentionally do not print private repository names into public Actions logs.
    console.log(`[${i + 1}/${repos.length}] Reading repository statistics ...`);

    let stats = [];
    try {
      stats = await contributorStats(repos[i].name);
      if (!stats.length && Number(repos[i].size || 0) > 0) {
        throw new Error("Contributor statistics are empty for a nonempty repository.");
      }
      reposWithStats += 1;
    } catch (error) {
      if (error.stopRefresh) throw error;
      console.warn(`[${i + 1}/${repos.length}] Statistics unavailable (HTTP ${error.status || "error"}).`);
      continue;
    }

    for (const contributor of stats) {
      const contributorTotal = Number(contributor.total || 0);
      totalCommits += contributorTotal;

      const login = String(contributor.author?.login || "");
      if (!login || !configuredUsers.has(login.toLowerCase())) continue;

      const recent = commitsInsideWindow(contributor.weeks || [], cutoffMs);
      if (recent <= 0) continue;

      const existing = activity.get(login.toLowerCase()) || {
        login,
        name: profiles[login]?.name || login,
        avatar_url: contributor.author?.avatar_url || profiles[login]?.avatar_url || "",
        commits: 0,
      };
      existing.commits += recent;
      activity.set(login.toLowerCase(), existing);
    }
  }

  const activeContributors = [...activity.values()].sort((a, b) => b.commits - a.commits);

  // GitHub's repository-statistics endpoints can temporarily return 202/empty data while
  // their cache is being rebuilt. Never replace a known-good public snapshot with zeros.
  const previousCommitTotal = Number(previousStats?.totalCommits || 0);
  const previousRepoCount = Number(previousStats?.repoCount || 0);
  if (reposWithStats !== repos.length) {
    throw new Error("Some repository statistics are incomplete; keeping the last successful snapshot.");
  }
  if (repos.length === 0 && previousRepoCount > 0) {
    throw new Error("GitHub returned zero repositories; refusing to overwrite the last good statistics snapshot.");
  }
  if (totalCommits === 0 && previousCommitTotal > 0) {
    throw new Error("Contributor statistics were temporarily empty; keeping the last successful snapshot.");
  }

  const output = {
    organization: ORG,
    generatedAt: new Date().toISOString(),
    snapshot: "fresh",
    windowDays: WINDOW_DAYS,
    repoCount: repos.length,
    totalCommits,
    activeContributors,
    // Deliberately empty: private repository names, URLs and descriptions are never published to Pages.
    repositories: [],
    profiles,
    privacy: {
      repositoryDetailsPublished: false,
      sourceContentsPermissionRequired: false,
      statsMode: "metadata-only",
      repositoriesWithStats: reposWithStats,
    },
    notes: {
      totalCommits: "Sum of GitHub contributor-stat totals across included repositories. GitHub repository statistics exclude merge commits; contributor statistics also exclude empty commits.",
      activeContributors: `Configured DINA members with contributor-stat activity in weekly buckets overlapping the last ${WINDOW_DAYS} days.`,
      repositories: "Private repository names, URLs, descriptions and source contents are not written to the public JSON output.",
    },
  };

  await writeSnapshot(output);
  console.log(`Done: ${repos.length} repositories counted, ${totalCommits} tracked commits, ${activeContributors.length} active configured members.`);
}

async function main() {
  const previous = await readPreviousStats();
  const previousStats = usablePreviousStats(previous) ? previous : null;
  try {
    await collectStats(previousStats);
  } catch (error) {
    if (!previousStats) throw error;
    await writeSnapshot({
      ...previousStats,
      snapshot: "last-known-good",
      lastAttemptAt: new Date().toISOString(),
    });
    // Preserve generatedAt: a failed attempt must not appear as newly collected data.
    console.warn(`Stats refresh unavailable: ${error.message} Deploying the last successful snapshot.`);
  } finally {
    console.log(`GitHub API requests this run: ${requestCount}. Remaining: ${remainingRequests ?? "unknown"}/${requestLimit ?? "unknown"}.`);
  }
}

main().catch(err => {
  console.error(`Stats workflow failed: ${err.message}`);
  process.exit(1);
});
