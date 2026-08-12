import fs from "node:fs/promises";

const ORG = process.env.GITHUB_ORG || "YOUR_GITHUB_ORG";
const TOKEN = process.env.DINA_GITHUB_TOKEN || "";
const API = "https://api.github.com";
const API_VERSION = "2026-03-10";
const WINDOW_DAYS = Number(process.env.ACTIVITY_WINDOW_DAYS || 90);
const EXCLUDE_REPOS = new Set(
  (process.env.EXCLUDE_REPOS || `${ORG}.github.io`)
    .split(",")
    .map(x => x.trim().toLowerCase())
    .filter(Boolean)
);

if (!ORG || ORG === "YOUR_GITHUB_ORG") {
  throw new Error("Set GITHUB_ORG in the workflow/repository variable before running this script.");
}

if (!TOKEN) {
  throw new Error("DINA_GITHUB_TOKEN is required for private repository statistics.");
}

const headers = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": API_VERSION,
  "User-Agent": "DINA-LAB-private-metadata-stats",
  Authorization: `Bearer ${TOKEN}`,
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function request(path, { allow202 = false, allow204 = false } = {}) {
  const response = await fetch(`${API}${path}`, { headers });
  if (allow202 && response.status === 202) return { status: 202, data: null, headers: response.headers };
  if (allow204 && response.status === 204) return { status: 204, data: null, headers: response.headers };
  if (!response.ok) {
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

async function readMembers() {
  try {
    return JSON.parse(await fs.readFile("data/members.json", "utf8"));
  } catch {
    return [];
  }
}

async function fetchProfiles(members) {
  const usernames = [...new Set(members.map(m => m.github).filter(Boolean))];
  const profiles = {};

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
    } catch {
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
    if (result.status === 200) return Array.isArray(result.data) ? result.data : [];
    if (result.status === 204) return [];
  }

  return [];
}

function commitsInsideWindow(weeks = [], cutoffMs) {
  return weeks.reduce((sum, week) => {
    const start = Number(week.w || 0) * 1000;
    const end = start + 7 * 86400000;
    return end >= cutoffMs ? sum + Number(week.c || 0) : sum;
  }, 0);
}

async function main() {
  console.log(`Collecting privacy-preserving aggregate GitHub statistics for ${ORG} ...`);

  const allRepos = await listRepos();
  const repos = allRepos.filter(repo =>
    !repo.archived &&
    !repo.fork &&
    !EXCLUDE_REPOS.has(String(repo.name || "").toLowerCase())
  );

  const members = await readMembers();
  const configuredUsers = new Set(members.map(m => String(m.github || "").toLowerCase()).filter(Boolean));
  const profiles = await fetchProfiles(members);
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
      reposWithStats += 1;
    } catch (error) {
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

  const output = {
    organization: ORG,
    generatedAt: new Date().toISOString(),
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

  await fs.mkdir("data", { recursive: true });
  await fs.writeFile("data/github-stats.json", JSON.stringify(output, null, 2) + "\n");
  console.log(`Done: ${repos.length} repositories counted, ${totalCommits} tracked commits, ${activeContributors.length} active configured members.`);
}

main().catch(err => {
  console.error(`Stats workflow failed: ${err.message}`);
  process.exit(1);
});
