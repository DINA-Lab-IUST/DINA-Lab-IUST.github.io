import fs from "node:fs/promises";

const ORG = process.env.GITHUB_ORG || "YOUR_GITHUB_ORG";
const TOKEN = process.env.DINA_GITHUB_TOKEN || "";
const API = "https://api.github.com";
const API_VERSION = "2026-03-10";
const WINDOW_DAYS = Number(process.env.ACTIVITY_WINDOW_DAYS || 90);
const MAX_COMMIT_PAGES_PER_REPO = Number(process.env.MAX_COMMIT_PAGES_PER_REPO || 20);

if (!ORG || ORG === "YOUR_GITHUB_ORG") {
  throw new Error("Set GITHUB_ORG in the workflow/repository variable before running this script.");
}

const headers = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": API_VERSION,
  "User-Agent": "DINA-LAB-pages-stats",
  ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function request(path, { allow202 = false } = {}) {
  const response = await fetch(`${API}${path}`, { headers });
  if (allow202 && response.status === 202) return { status: 202, data: null, headers: response.headers };
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status} ${path}: ${text.slice(0, 300)}`);
  }
  return { status: response.status, data: await response.json(), headers: response.headers };
}

async function paginate(path, maxPages = Infinity) {
  const out = [];
  let page = 1;
  while (page <= maxPages) {
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
  return paginate(`/orgs/${encodeURIComponent(ORG)}/repos?type=public&sort=updated&direction=desc`);
}

function lastPageFromLink(link = "") {
  const m = link.match(/[?&]page=(\d+)>; rel="last"/);
  return m ? Number(m[1]) : null;
}

async function estimateTotalCommits(repo) {
  try {
    const { data, headers: h } = await request(`/repos/${encodeURIComponent(ORG)}/${encodeURIComponent(repo)}/commits?per_page=1`);
    const last = lastPageFromLink(h.get("link") || "");
    return last || data.length;
  } catch (e) {
    console.warn(`Could not count total commits for ${repo}: ${e.message}`);
    return 0;
  }
}

async function recentCommits(repo, sinceIso) {
  try {
    return await paginate(`/repos/${encodeURIComponent(ORG)}/${encodeURIComponent(repo)}/commits?since=${encodeURIComponent(sinceIso)}`, MAX_COMMIT_PAGES_PER_REPO);
  } catch (e) {
    console.warn(`Could not load recent commits for ${repo}: ${e.message}`);
    return [];
  }
}

async function readMembers() {
  try { return JSON.parse(await fs.readFile("data/members.json", "utf8")); }
  catch { return []; }
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
    } catch (e) { console.warn(`Profile ${username}: ${e.message}`); }
    await sleep(60);
  }
  return profiles;
}

function relativeTime(iso) {
  const hours = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 3600000));
  if (hours < 24) return `${hours || 1}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

async function main() {
  console.log(`Collecting GitHub stats for ${ORG} ...`);
  const repos = (await listRepos()).filter(r => !r.archived && !r.fork);
  const since = new Date(Date.now() - WINDOW_DAYS * 86400000).toISOString();
  const memberConfig = await readMembers();
  const profiles = await fetchProfiles(memberConfig);
  const activity = new Map();
  let totalCommits = 0;
  const repositoryData = [];

  for (const [index, repo] of repos.entries()) {
    console.log(`[${index + 1}/${repos.length}] ${repo.name}`);
    const [total, recent] = await Promise.all([
      estimateTotalCommits(repo.name),
      recentCommits(repo.name, since),
    ]);
    totalCommits += total;

    for (const commit of recent) {
      const login = commit.author?.login || commit.committer?.login;
      if (!login) continue;
      const current = activity.get(login) || {
        login,
        name: commit.author?.login || login,
        avatar_url: commit.author?.avatar_url || "",
        commits: 0,
      };
      current.commits += 1;
      activity.set(login, current);
    }

    repositoryData.push({
      name: repo.name,
      html_url: repo.html_url,
      description: repo.description,
      language: repo.language,
      stargazers_count: repo.stargazers_count,
      forks_count: repo.forks_count,
      open_issues_count: repo.open_issues_count,
      updated_at: repo.updated_at,
      updated_relative: relativeTime(repo.updated_at),
      recent_commits: recent.length,
      estimated_total_commits: total,
    });
    await sleep(100);
  }

  const activeContributors = [...activity.values()]
    .sort((a, b) => b.commits - a.commits)
    .map(c => ({ ...c, name: profiles[c.login]?.name || c.name }));

  const output = {
    organization: ORG,
    generatedAt: new Date().toISOString(),
    windowDays: WINDOW_DAYS,
    repoCount: repos.length,
    totalCommits,
    activeContributors,
    repositories: repositoryData.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at)),
    profiles,
    notes: {
      totalCommits: "Estimated from the default-branch commit pagination for each public, non-fork, non-archived repository.",
      activeContributors: `Counts commits visible on default repository history since the last ${WINDOW_DAYS} days; capped per repository by MAX_COMMIT_PAGES_PER_REPO.`,
    },
  };

  await fs.mkdir("data", { recursive: true });
  await fs.writeFile("data/github-stats.json", JSON.stringify(output, null, 2) + "\n");
  console.log(`Done: ${repos.length} repos, ~${totalCommits} commits, ${activeContributors.length} active contributors.`);
}

main().catch(err => { console.error(err); process.exit(1); });
