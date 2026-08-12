const CONFIG = {
  // The stats workflow writes the real organization name into github-stats.json.
  // Keep this as a fallback only, or replace it with your GitHub organization slug.
  githubOrg: "YOUR_GITHUB_ORG",
  statsUrl: "data/github-stats.json",
  membersUrl: "data/members.json",
  workUrl: "data/lab-work.json",
  commitsPerCoffee: 20,
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
let labWork = { currentWork: [], projects: [] };

const $ = (id) => document.getElementById(id);
const safe = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

function safeUrl(value = "") {
  try {
    const url = new URL(String(value), window.location.href);
    return ["http:", "https:"].includes(url.protocol) ? safe(url.href) : "";
  } catch {
    return "";
  }
}

function formatNumber(n) {
  return new Intl.NumberFormat("en", { notation: n > 9999 ? "compact" : "standard", maximumFractionDigits: 1 }).format(n || 0);
}

function formatDate(iso) {
  if (!iso) return "Run the stats workflow to populate live data";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Unknown";
  const diffHours = Math.round((d - Date.now()) / 3600000);
  return `Updated ${new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(diffHours, "hour")}`;
}

function profileFor(member) {
  if (!member?.github) return {};
  const profiles = githubStats?.profiles || {};
  return profiles[member.github] || profiles[Object.keys(profiles).find(key => key.toLowerCase() === member.github.toLowerCase())] || {};
}

function memberPhoto(member) {
  const profile = profileFor(member);
  return member?.photo || profile.avatar_url || "";
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
  const src = memberPhoto(member);
  if (src) {
    return `<div class="${className}"><img src="${safe(src)}" alt="${safe(member.name)}" onerror="this.remove(); this.parentElement.classList.add('photo-missing')"></div>`;
  }
  return `<div class="${className} photo-missing"><span class="portrait-fallback" aria-hidden="true"></span></div>`;
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

function bindMemberCards() {
  document.querySelectorAll("[data-member-index]").forEach(card => {
    if (card.dataset.bound === "1") return;
    card.dataset.bound = "1";
    const open = () => openMemberModal(members[Number(card.dataset.memberIndex)]);
    card.addEventListener("click", open);
    card.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") open(); });
  });
}

function renderPeople() {
  const director = members.find(m => m.leadership === "director");
  const leads = members.filter(m => m.leadership === "lead");
  const regular = members.filter(m => !["director", "lead"].includes(m.leadership));
  if (director) renderDirector(director);
  $("leadGrid").innerHTML = leads.map(m => memberCard(m, true, members.indexOf(m))).join("") || `<div class="panel">Add lead members in data/members.json</div>`;
  $("memberGrid").innerHTML = regular.map(m => memberCard(m, false, members.indexOf(m))).join("") || `<div class="panel">Add members in data/members.json</div>`;
  bindMemberCards();
}

function openMemberModal(member) {
  if (!member) return;
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

function normalizeMemberRef(value) {
  return String(value || "").trim().toLocaleLowerCase();
}

function resolveMember(ref) {
  const wanted = normalizeMemberRef(ref);
  if (!wanted) return null;
  return members.find(member =>
    normalizeMemberRef(member.name) === wanted ||
    normalizeMemberRef(member.github) === wanted
  ) || null;
}

function resolveTeam(memberRefs = []) {
  const found = [];
  const seen = new Set();
  memberRefs.forEach(ref => {
    const member = resolveMember(ref);
    if (!member) {
      console.warn(`[DINA] Member "${ref}" from data/lab-work.json was not found in data/members.json.`);
      return;
    }
    const key = normalizeMemberRef(member.github || member.name);
    if (!seen.has(key)) {
      seen.add(key);
      found.push(member);
    }
  });
  return found;
}

function workTeamMarkup(memberRefs = [], compact = false) {
  const team = resolveTeam(memberRefs);
  if (!team.length) {
    return `<div class="work-team-empty"><i data-lucide="users"></i><span>Add member names in lab-work.json</span></div>`;
  }

  const visible = team.slice(0, compact ? 5 : 7);
  const extra = Math.max(0, team.length - visible.length);
  const names = team.map(member => member.name).join(", ");
  return `<div class="work-team">
    <div class="avatar-stack" aria-label="Team: ${safe(names)}">
      ${visible.map(member => {
        const index = members.indexOf(member);
        const src = memberPhoto(member);
        return `<button class="stack-avatar${src ? "" : " photo-missing"}" type="button" data-member-index="${index}" title="${safe(member.name)}" aria-label="Open ${safe(member.name)} profile">
          ${src ? `<img src="${safe(src)}" alt="" onerror="this.remove(); this.parentElement.classList.add('photo-missing')">` : `<span class="stack-avatar-fallback" aria-hidden="true"></span>`}
        </button>`;
      }).join("")}
      ${extra ? `<span class="stack-avatar stack-extra">+${extra}</span>` : ""}
    </div>
    <div class="team-copy"><span>${team.length === 1 ? "Researcher" : `${team.length} researchers`}</span><strong>${safe(team.slice(0, 3).map(m => m.name).join(" · "))}${team.length > 3 ? ` · +${team.length - 3}` : ""}</strong></div>
  </div>`;
}

function tagsMarkup(tags = [], limit = 4) {
  return `<div class="work-tags">${tags.slice(0, limit).map(tag => `<span>${safe(tag)}</span>`).join("")}</div>`;
}

function projectLinksMarkup(links = []) {
  const valid = links.map(link => ({ ...link, safeHref: safeUrl(link.url) })).filter(link => link.safeHref);
  if (!valid.length) return "";
  return `<div class="project-links">${valid.map(link => `<a href="${link.safeHref}" target="_blank" rel="noreferrer"><i data-lucide="${safe(link.icon || "external-link")}"></i>${safe(link.label || "Open")}</a>`).join("")}</div>`;
}

function renderNowBuilding() {
  const items = Array.isArray(labWork.currentWork) ? labWork.currentWork : [];
  $("nowBuildingGrid").innerHTML = items.length ? items.map((item, i) => `
    <article class="now-card reveal" style="transition-delay:${Math.min(i * 55, 220)}ms">
      <div class="now-card-orbit" aria-hidden="true"></div>
      <div class="work-card-top">
        <span class="work-status"><span></span>${safe(item.status || "Active")}</span>
        <span class="work-index">NOW / ${String(i + 1).padStart(2, "0")}</span>
      </div>
      <div class="now-card-main">
        <h3>${safe(item.title || "Untitled research thread")}</h3>
        <p>${safe(item.description || "Add a short description in data/lab-work.json.")}</p>
        ${tagsMarkup(item.tags || [], 5)}
      </div>
      ${workTeamMarkup(item.members || [])}
    </article>`).join("") : `
      <article class="empty-work-card reveal">
        <i data-lucide="sparkles"></i>
        <div><strong>Add what DINA is building now</strong><span>Edit <code>data/lab-work.json</code> and add entries under <code>currentWork</code>.</span></div>
      </article>`;
}

function renderProjects() {
  const items = Array.isArray(labWork.projects) ? labWork.projects : [];
  $("projectGrid").innerHTML = items.length ? items.map((item, i) => `
    <article class="project-card curated-project reveal" style="transition-delay:${Math.min(i * 45, 180)}ms">
      <div class="project-accent" aria-hidden="true"></div>
      <div class="work-card-top">
        <span class="project-type">${safe(item.type || "Research Project")}</span>
        <span class="work-index">${String(i + 1).padStart(2, "0")}</span>
      </div>
      <div class="project-title-row">
        <h3>${safe(item.title || "Untitled project")}</h3>
        <span class="project-status">${safe(item.status || "Active")}</span>
      </div>
      <p>${safe(item.description || "Add a project description in data/lab-work.json.")}</p>
      ${tagsMarkup(item.tags || [], 4)}
      <div class="project-bottom">
        ${workTeamMarkup(item.members || [], true)}
        ${projectLinksMarkup(item.links || [])}
      </div>
    </article>`).join("") : `
      <article class="empty-work-card reveal">
        <i data-lucide="folder-kanban"></i>
        <div><strong>Add selected DINA projects</strong><span>Edit <code>data/lab-work.json</code> and add entries under <code>projects</code>.</span></div>
      </article>`;
}

function renderWork() {
  renderNowBuilding();
  renderProjects();
  bindMemberCards();
  window.lucide?.createIcons();
  activateReveal();
}

function renderStats(stats) {
  const commits = Number(stats.totalCommits || 0);
  const coffeeRate = Math.max(1, Number(CONFIG.commitsPerCoffee || 20));
  const coffees = Math.floor(commits / coffeeRate);
  const remainder = commits % coffeeRate;
  const toNextCoffee = remainder === 0 ? coffeeRate : coffeeRate - remainder;

  $("statCommits").textContent = formatNumber(commits);
  $("statRepos").textContent = formatNumber(stats.repoCount);
  $("statCoffee").textContent = formatNumber(coffees);
  $("coffeeProgress").textContent = commits ? `${toNextCoffee} commits to next ☕` : `1 coffee / ${coffeeRate} commits`;
  $("lastUpdated").textContent = stats.snapshot === "last-known-good"
    ? "Last known GitHub snapshot"
    : formatDate(stats.generatedAt);
}

async function getJson(url) {
  const res = await fetch(`${url}${url.includes("?") ? "&" : "?"}v=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

function statsAreUseful(stats) {
  return stats && (Number(stats.totalCommits || 0) > 0 || Number(stats.repoCount || 0) > 0);
}

function readCachedStats() {
  try {
    const cached = JSON.parse(localStorage.getItem("dina:last-good-github-stats") || "null");
    return statsAreUseful(cached) ? cached : null;
  } catch {
    return null;
  }
}

function cacheStats(stats) {
  if (!statsAreUseful(stats)) return;
  try { localStorage.setItem("dina:last-good-github-stats", JSON.stringify(stats)); }
  catch { /* localStorage may be unavailable; live data still works. */ }
}

async function loadGithubStats() {
  const cached = readCachedStats();
  try {
    const fresh = await getJson(CONFIG.statsUrl);
    if (statsAreUseful(fresh)) {
      cacheStats(fresh);
      return fresh;
    }
    if (cached) {
      console.warn("[DINA] GitHub stats returned an empty snapshot; keeping the last good snapshot.");
      return cached;
    }
    return fresh;
  } catch (error) {
    console.error(error);
    if (cached) {
      console.warn("[DINA] GitHub stats could not be loaded; using the last good browser snapshot.");
      return cached;
    }
    return { organization: "", repoCount: 0, totalCommits: 0, activeContributors: [], repositories: [], profiles: {}, windowDays: 90 };
  }
}

async function loadData() {
  try { members = await getJson(CONFIG.membersUrl); }
  catch (e) { console.error(e); members = []; }

  githubStats = await loadGithubStats();

  try { labWork = await getJson(CONFIG.workUrl); }
  catch (e) {
    console.error(e);
    labWork = { currentWork: [], projects: [] };
  }

  renderPeople();
  renderStats(githubStats);
  renderWork();
  configureLinks(githubStats.organization);
  window.lucide?.createIcons();
  activateReveal();
}

function configureLinks(statsOrg = "") {
  const org = statsOrg || CONFIG.githubOrg;
  const href = org && org !== "YOUR_GITHUB_ORG" ? `https://github.com/${encodeURIComponent(org)}` : "https://github.com";
  ["orgLinkTop", "orgLinkHero"].forEach(id => { if ($(id)) $(id).href = href; });
}

function activateReveal() {
  if (!("IntersectionObserver" in window)) {
    document.querySelectorAll(".reveal").forEach(el => el.classList.add("visible"));
    return;
  }
  const io = new IntersectionObserver(entries => entries.forEach(entry => {
    if (entry.isIntersecting) { entry.target.classList.add("visible"); io.unobserve(entry.target); }
  }), { threshold: .12 });
  document.querySelectorAll(".reveal:not(.visible)").forEach(el => io.observe(el));
}

function setupMotion() {
  const glow = $("cursorGlow");
  if (glow) window.addEventListener("pointermove", e => { glow.style.left = `${e.clientX}px`; glow.style.top = `${e.clientY}px`; }, { passive: true });
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
