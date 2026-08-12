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

function renderProjects() {
  $("projectGrid").innerHTML = `<div class="panel reveal">Research repositories are private. This public site exposes aggregate activity metrics only; repository names, links and source contents are not published.</div>`;
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

  $("repoPulse").innerHTML = `<p style="color:#74808d;font-size:11px;line-height:1.8">Private repository details are intentionally hidden. Only aggregate repository count, commit activity and configured-member activity are published.</p>`;

  renderProjects();
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
