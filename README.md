<div align="center">

# DINA LAB

### Distributed Infrastructure for NextGen Applications

**Researching intelligent, distributed, cloud-native systems for the next generation of applications.**

<br>

![HTML5](https://img.shields.io/badge/HTML5-111827?style=for-the-badge&logo=html5&logoColor=FF7A18)
![CSS3](https://img.shields.io/badge/CSS3-111827?style=for-the-badge&logo=css3&logoColor=1572B6)
![JavaScript](https://img.shields.io/badge/JavaScript-111827?style=for-the-badge&logo=javascript&logoColor=F7DF1E)
![JSON](https://img.shields.io/badge/JSON-111827?style=for-the-badge&logo=json&logoColor=F5E7CE)
![GitHub Actions](https://img.shields.io/badge/GitHub_Actions-111827?style=for-the-badge&logo=githubactions&logoColor=2088FF)
![GitHub Pages](https://img.shields.io/badge/GitHub_Pages-111827?style=for-the-badge&logo=github&logoColor=FFFFFF)

</div>

---

## About DINA LAB

**DINA LAB — Distributed Infrastructure for NextGen Applications** is a research lab focused on the intersection of intelligent systems and modern distributed infrastructure.

The lab explores how next-generation applications can be designed, deployed, and coordinated across cloud, edge, serverless, and federated environments.

The lab is directed by **Dr. Mehrdad Ashtiani**, alongside core research leads and researchers working across systems, AI, and distributed computing.

### Research Areas

`LLM` · `Federated Learning` · `FedLLM` · `Software Systems` · `FaaS` · `Serverless` · `Cloud Computing` · `Edge Computing`

---

## Website

This repository contains the official DINA LAB website — a modern, responsive research showcase designed around the lab's identity, people, projects, and activity.

### Main Sections

- **Research** — visual presentation of the lab's main research directions.
- **People** — profiles for the Lab Director, Core Leads, and researchers.
- **Academic Badges** — compact degree indicators for B.Sc, M.Sc, and Ph.D members.
- **Current Work** — manually curated research threads showing what teams are currently building.
- **Projects** — project cards with descriptions, research tags, contributors, and optional publication/demo links.
- **GitHub Activity** — privacy-aware aggregate repository and commit statistics.
- **Research Coffee Meter** — a playful activity metric derived from commit count.

---

## Member & Project Data

The website is content-driven and keeps most frequently edited information in simple JSON files.

```text
data/
├── members.json        # People, roles, photos, links, degree and research focus
├── presentations.json  # Upcoming talks; member name, title, date, time and link
├── lab-work.json       # Current work and project information
└── github-stats.json   # Generated aggregate GitHub activity
```

Member references inside project data are automatically matched with `members.json`, allowing the site to reuse profile photos and identity information consistently across sections.

### Upcoming presentations

Edit `data/presentations.json` to manage the numbered presentation list shown immediately before **Now Building**. The `member` value is matched against `name` (or `github`) in `data/members.json`; the card then reuses that person's photo, role and research-focus tags automatically.

```json
{
  "member": "Ali Ahmadi",
  "title": "Presentation title",
  "date": "Monday, 7 September",
  "time": "10:00",
  "location": "DINA Lab / Online",
  "link": "https://example.com/presentation",
  "linkLabel": "Join presentation",
  "series": "NEXT WEEK"
}
```

Add, remove or reorder objects inside `presentations`; the visible card numbers update automatically. Leave `link` empty to show “Link coming soon”.

---

## GitHub Analytics

DINA LAB includes an automated statistics workflow built with **GitHub Actions**.

The workflow always requests fresh GitHub statistics before deploying after a push to `main`, on manual runs, and every two hours (`17 */2 * * *`, UTC). Restoring a cache never skips the refresh step. The page requests the published JSON on load and every two hours while it remains open; the existing browser fallback cache is retained. If an older fallback is deployed, the browser keeps its newer successful snapshot.

Each run restores the last successful public snapshot with `actions/cache/restore` and saves the resulting fallback snapshot with `actions/cache/save`. If GitHub is still preparing statistics (`202`), some repositories fail, or the API is unavailable, the last complete snapshot is deployed instead of a partial/zero total. Its original `generatedAt` is preserved and `snapshot` becomes `last-known-good`.

Set the repository variable `DINA_GITHUB_ORG` and secret `DINA_GITHUB_TOKEN` with access to the included organization repositories. Fine-grained tokens need **Metadata: read** for contributor statistics. No token is sent to the browser or written to the public JSON. A missing/expired token preserves existing statistics but cannot collect new ones; the Actions log reports the problem.

Requests are sequential, paced at least 250 ms apart, and capped at 400 per run. The collector checks `x-ratelimit-remaining`, keeps a 25-request reserve, and stops immediately on rate-limit responses without further retries. A typical run uses one request per 100 repositories, one per configured GitHub profile, and one to five per included repository (because `202` responses may require polling).

GitHub's normal personal access token allowance is 5,000 requests/hour, shared with other uses of that account. The built-in `GITHUB_TOKEN` normally has 1,000 requests/hour per repository and does not grant access to other private repositories. Reference: [REST API rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api).

GitHub's own contributor-statistics cache is rebuilt after pushes to a repository's default branch and cannot be forcibly bypassed by this site. Scheduled Actions can also run late during busy periods and public-repository schedules can be disabled after 60 days without repository activity. Reference: [repository statistics](https://docs.github.com/en/rest/metrics/statistics) and [scheduled workflow events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

Run the offline collector and browser-cache checks with `node --test scripts/update-github-stats.test.mjs`. These use simulated API responses and never send real GitHub requests.

It can surface aggregate information such as:

- total repository count
- organization-wide commit activity
- last statistics update
- derived activity indicators such as the Research Coffee Meter

The public website is designed to expose **aggregate metrics only** and does not need to publish private repository names, source code, or internal project details.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Structure | HTML5 |
| Styling | Modern CSS3 |
| Interactions | Vanilla JavaScript |
| Content | JSON |
| Automation | GitHub Actions |
| Hosting | GitHub Pages |
| Icons | Lucide |
| GitHub Data | GitHub REST API |

The site intentionally avoids a heavy frontend framework, keeping the codebase lightweight, transparent, and easy to maintain.

---

## Design Language

The visual identity combines:

- deep navy backgrounds
- warm cream typography
- DINA orange accents
- gold leadership highlights
- subtle glass surfaces
- minimal motion and glow effects
- responsive research-oriented layouts

The goal is to give the lab a visual identity that feels equally at home in **AI research, distributed systems, and production-grade infrastructure**.

---

<div align="center">

### DINA LAB

**Distributed Infrastructure for NextGen Applications**

*Research · Engineering · Intelligent Infrastructure*

</div>
