const CONFIG = {
  githubOrg: "YOUR_GITHUB_ORG",
  statsUrl: "data/github-stats.json",
  membersUrl: "data/members.json",
  maxProjects: 6,
};

const RESEARCH = [
  { name: "Large Language Models", short: "LLM", icon: "brain-circuit", text: "Efficient model systems, inference, adaptation and AI-native applications." },
  { name: "Federated Learning", short: "FL", icon: "network", text: "Collaborative learning across distributed data without centralizing raw information." },
  { name: "Federated LLM", short: "FedLLM", icon: "waypoints", text: "Federated fine-tuning and serving strategies for distributed foundation models." },
  { name: "Software Systems", short: "SW", icon: "braces", text: "Architecture, runtime design and systems software for next-generation applications." },
  { name: "Function as a Service", short: "FaaS", icon: "workflow", text: "Event-driven compute, scheduling, elasticity and fine-grained cloud execution." },
  { name: "Serverless", short: "SVLS", icon: "zap", text: "Resource-efficient serverless platforms, orchestration and performance engineering." },
  { name: "Cloud Computing", short: "CLOUD", icon: "cloud-cog", text: "Scalable infrastructure, resource management and cloud-native application systems." },
  { name: "Edge Computing", short: "EDGE", icon: "cpu", text: "Low-latency computation and intelligence across the cloud-to-edge continuum." },
];

let members = [];
let githubStats = null;

const $ = (id) => document.getElementById(id);
const safe = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

function formatNumber(n) {
  return new Intl.NumberFormat("en", { notation: n > 9999 ? "compact" : "standard", maximumFractionDigits: 1 }).format(n || 0);
}

function formatDate(iso) {
  if (!iso) return "Run the stats workflow to populate live data";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Unknown";
  return `Updated ${new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(Math.round((d - Date.now()) / 3600000), "hour")}`;
}

function profileFor(member) {
  return member.github && githubStats?.profiles?.[member.github] ? githubStats.profiles[member.github] : {};
}

function renderResearch() {
  $("researchGrid").innerHTML = RESEARCH.map((r, i) => `
    <article class="research-card reveal" style="transition-delay:${Math.min(i * 35, 180)}ms">
      <div>
        <div class="research-index">0${i + 1} / ${safe(r.short)}</div>
        <div class="research-icon" style="margin-top:27px"><i data-lucide="${r.icon}"></i></div>
      </div>
      <div>
        <h3>${safe(r.name)}</h3>
        <p>${safe(r.text)}</p>
      </div>
    </article>`).join("");
}

function imageMarkup(member, className = "member-avatar") {
  const p = profileFor(member);
  const src = p.avatar_url || member.photo || "";
  return `<div class="${className}"><span class="portrait-fallback" aria-hidden="true"><i data-lucide="user-round"></i></span>${src ? `<img src="${safe(src)}" alt="${safe(member.name)}" onerror="this.style.display='none'">` : ""}</div>`;
}

function linkButtons(member, mini = false) {
  const gh = member.github ? `https://github.com/${encodeURIComponent(member.github)}` : "";
  const links = [];
  if (gh) links.push(`<a href="${gh}" target="_blank" rel="noreferrer" aria-label="${safe(member.name)} on GitHub"><i data-lucide="github"></i></a>`);
  if (member.linkedin) links.push(`<a href="${safe(member.linkedin)}" target="_blank" rel="noreferrer" aria-label="${safe(member.name)} on LinkedIn"><i data-lucide="linkedin"></i></a>`);
  if (!links.length && !mini) return `<span style="font-size:9px;color:#64717d">Add profile links</span>`;
  return links.join("");
}

function renderDirector(member) {
  const p = profileFor(member);
  const bio = member.bio || p.bio || "";
  $("directorStage").innerHTML = `
    <article class="director-card">
      ${imageMarkup(member, "portrait")}
      <div class="director-info">
        <span class="member-role">Lab Director</span>
        <h3>${safe(member.name)}</h3>
        <p>${safe(bio)}</p>
        <div class="focus-chips">${(member.focus || []).map(x => `<span>${safe(x)}</span>`).join("")}</div>
      </div>
      <div class="profile-links">${linkButtons(member)}</div>
    </article>`;
}

function memberCard(member, isLead = false, index = 0) {
  const p = profileFor(member);
  const bio = member.bio || p.bio || "No bio yet.";
  const location = p.location || member.role || "DINA LAB";
  return `
    <article class="member-card ${isLead ? "lead" : ""} reveal" data-member-index="${index}" tabindex="0" role="button" aria-label="Open profile for ${safe(member.name)}">
      ${isLead ? `<span class="lead-badge">CORE LEAD</span>` : ""}
      <div class="member-inner">
        <div class="member-head">
          ${imageMarkup(member)}
          <div><div class="member-name">${safe(member.name)}</div><div class="member-title">${safe(member.role)}</div></div>
        </div>
        <p class="member-bio">${safe(bio)}</p>
        <div class="member-tags">${(member.focus || []).slice(0, 3).map(x => `<span>${safe(x)}</span>`).join("")}</div>
        <div class="member-footer"><small>${safe(location)}</small><div class="mini-links" onclick="event.stopPropagation()">${linkButtons(member, true)}</div></div>
      </div>
    </article>`;
}

function renderPeople() {
  const director = members.find(m => m.leadership === "director");
  const leads = members.filter(m => m.leadership === "lead");
  const regular = members.filter(m => !["director", "lead"].includes(m.leadership));
  if (director) renderDirector(director);
  $("leadGrid").innerHTML = leads.map(m => memberCard(m, true, members.indexOf(m))).join("") || `<div class="panel">Add lead members in data/members.json</div>`;
  $("memberGrid").innerHTML = regular.map(m => memberCard(m, false, members.indexOf(m))).join("") || `<div class="panel">Add members in data/members.json</div>`;
  document.querySelectorAll("[data-member-index]").forEach(card => {
    const open = () => openMemberModal(members[Number(card.dataset.memberIndex)]);
    card.addEventListener("click", open);
    card.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") open(); });
  });
}

function openMemberModal(member) {
  const p = profileFor(member);
  const body = member.bio || p.bio || "No bio yet.";
  $("modalContent").innerHTML = `<div class="modal-body">
    <div class="modal-profile">${imageMarkup(member)}<div><span class="member-role">${safe(member.role)}</span><h3>${safe(member.name)}</h3><span style="font-size:10px;color:#7f8b97">${safe(p.company || "DINA LAB")}</span></div></div>
    <p>${safe(body)}</p>
    <div class="member-tags">${(member.focus || []).map(x => `<span>${safe(x)}</span>`).join("")}</div>
    <div class="modal-actions">${member.github ? `<a class="button button-primary" target="_blank" rel="noreferrer" href="https://github.com/${encodeURIComponent(member.github)}"><i data-lucide="github"></i> GitHub</a>` : ""}${member.linkedin ? `<a class="button button-soft" target="_blank" rel="noreferrer" href="${safe(member.linkedin)}"><i data-lucide="linkedin"></i> LinkedIn</a>` : ""}</div>
  </div>`;
  $("memberModal").showModal();
  window.lucide?.createIcons();
}

function renderProjects(repos = []) {
  $("projectGrid").innerHTML = repos.slice(0, CONFIG.maxProjects).map(r => `
    <a class="project-card reveal" href="${safe(r.html_url)}" target="_blank" rel="noreferrer">
      <div class="project-card-head"><h3>${safe(r.name)}</h3><span class="language">${safe(r.language || "Research")}</span></div>
      <p>${safe(r.description || "DINA LAB research and engineering project.")}</p>
      <div class="project-stats"><span><i data-lucide="star"></i>${formatNumber(r.stargazers_count)}</span><span><i data-lucide="git-fork"></i>${formatNumber(r.forks_count)}</span><span><i data-lucide="clock-3"></i>${safe(r.updated_relative || "recently")}</span></div>
    </a>`).join("") || `<div class="panel reveal">Projects will be loaded after the first stats workflow run.</div>`;
}

async function refreshLiveOrgPulse() {
  const org = CONFIG.githubOrg;
  if (!org || org === "YOUR_GITHUB_ORG") return;
  try {
    const [orgRes, repoRes] = await Promise.all([
      fetch(`https://api.github.com/orgs/${encodeURIComponent(org)}`),
      fetch(`https://api.github.com/orgs/${encodeURIComponent(org)}/repos?type=public&sort=updated&direction=desc&per_page=${CONFIG.maxProjects}`),
    ]);
    if (orgRes.ok) {
      const orgData = await orgRes.json();
      if (Number.isFinite(orgData.public_repos)) $("statRepos").textContent = formatNumber(orgData.public_repos);
    }
    if (repoRes.ok) {
      const liveRepos = (await repoRes.json()).filter(r => !r.archived && !r.fork).map(r => ({
        ...r,
        updated_relative: formatDate(r.updated_at).replace("Updated ", ""),
      }));
      if (liveRepos.length) renderProjects(liveRepos);
    }
    window.lucide?.createIcons();
    activateReveal();
  } catch (error) {
    console.debug("Live GitHub pulse unavailable; using scheduled snapshot.", error);
  }
}

function renderStats(stats) {
  $("statCommits").textContent = formatNumber(stats.totalCommits);
  $("statRepos").textContent = formatNumber(stats.repoCount);
  $("statActive").textContent = formatNumber(stats.activeContributors?.length || 0);
  $("activeWindow").textContent = `last ${stats.windowDays || 90} days`;
  $("activityRange").textContent = `${stats.windowDays || 90} days`;
  $("lastUpdated").textContent = formatDate(stats.generatedAt);

  const contributors = (stats.activeContributors || []).slice(0, 7);
  $("contributorsList").innerHTML = contributors.length ? contributors.map((c, i) => `
    <a class="contributor-row" href="https://github.com/${encodeURIComponent(c.login || "")}" target="_blank" rel="noreferrer">
      <span class="rank">${String(i + 1).padStart(2, "0")}</span>
      <img class="tiny-avatar" src="${safe(c.avatar_url || "")}" alt="" onerror="this.style.visibility='hidden'">
      <div class="contributor-main"><strong>${safe(c.name || c.login || "Unknown")}</strong><span>@${safe(c.login || "unknown")}</span></div>
      <span class="contribution-count">${formatNumber(c.commits)} commits</span>
    </a>`).join("") : `<p style="color:#74808d;font-size:11px;line-height:1.7">No activity data yet. Run the GitHub Actions workflow after setting the organization name.</p>`;

  const repos = (stats.repositories || []).slice(0, 7);
  $("repoPulse").innerHTML = repos.length ? repos.map(r => `
    <a class="repo-row" href="${safe(r.html_url)}" target="_blank" rel="noreferrer">
      <span class="rank"><i data-lucide="git-branch"></i></span>
      <div class="repo-main"><strong>${safe(r.name)}</strong><span>${safe(r.description || "No description")}</span></div>
      <div class="repo-meta"><span><i data-lucide="star"></i>${formatNumber(r.stargazers_count)}</span><span>${safe(r.language || "—")}</span></div>
    </a>`).join("") : `<p style="color:#74808d;font-size:11px">Repository activity will appear here.</p>`;

  renderProjects(stats.repositories || []);
}

async function getJson(url) {
  const res = await fetch(`${url}${url.includes("?") ? "&" : "?"}v=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

async function loadData() {
  try { members = await getJson(CONFIG.membersUrl); }
  catch (e) { console.error(e); members = []; }
  try { githubStats = await getJson(CONFIG.statsUrl); }
  catch (e) { console.error(e); githubStats = { repoCount: 0, totalCommits: 0, activeContributors: [], repositories: [], profiles: {}, windowDays: 90 }; }
  renderPeople();
  renderStats(githubStats);
  refreshLiveOrgPulse();
  window.lucide?.createIcons();
  activateReveal();
}

function configureLinks() {
  const org = CONFIG.githubOrg;
  const href = org && org !== "YOUR_GITHUB_ORG" ? `https://github.com/${encodeURIComponent(org)}` : "https://github.com";
  ["orgLinkTop", "orgLinkHero", "orgLinkProjects"].forEach(id => $(id).href = href);
}

function activateReveal() {
  const io = new IntersectionObserver(entries => entries.forEach(entry => {
    if (entry.isIntersecting) { entry.target.classList.add("visible"); io.unobserve(entry.target); }
  }), { threshold: .12 });
  document.querySelectorAll(".reveal:not(.visible)").forEach(el => io.observe(el));
}

function setupMotion() {
  const glow = $("cursorGlow");
  window.addEventListener("pointermove", e => { glow.style.left = `${e.clientX}px`; glow.style.top = `${e.clientY}px`; }, { passive: true });
  const card = $("orbitalCard");
  if (!card || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  card.addEventListener("pointermove", e => {
    const r = card.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - .5;
    const y = (e.clientY - r.top) / r.height - .5;
    card.style.transform = `rotateY(${x * 7}deg) rotateX(${-y * 7}deg)`;
  });
  card.addEventListener("pointerleave", () => card.style.transform = "rotateY(0) rotateX(0)");
}

renderResearch();
configureLinks();
setupMotion();
$("year").textContent = new Date().getFullYear();
$("modalClose").addEventListener("click", () => $("memberModal").close());
$("memberModal").addEventListener("click", e => { if (e.target === $("memberModal")) $("memberModal").close(); });
window.addEventListener("DOMContentLoaded", () => { window.lucide?.createIcons(); activateReveal(); loadData(); });
