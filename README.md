# DINA LAB Website

Static GitHub Pages website for **DINA LAB — Distributed Infrastructure for NextGen Applications**.

## 1. Replace organization handle

Edit `app.js`:

```js
const CONFIG = {
  githubOrg: "YOUR_ORG_HANDLE",
  ...
};
```

Then in GitHub repository **Settings → Secrets and variables → Actions → Variables**, create:

- `DINA_GITHUB_ORG` = your exact GitHub organization handle

## 2. Add team members

Edit `data/members.json`.

For each member set:
- `name`
- `role`
- `leadership`: `director`, `lead`, or `member`
- `github`: GitHub username only (no URL)
- `linkedin`: full LinkedIn URL
- `photo`: local image path, e.g. `assets/name.jpg` (or leave it empty to use initials/GitHub avatar)
- `bio`
- `focus`

The first director is rendered in the Director section. `lead` members receive the gold frame.

## 3. Add photos

Place JPG/WebP files in `assets/` and point `photo` to them in `data/members.json`.
If a GitHub username is set, the scheduled workflow also retrieves the user's current GitHub avatar and profile metadata; the GitHub avatar is preferred by the UI.

## 4. Token for organization-wide statistics

Do **not** place a token in `app.js` or any public file.

Create a fine-grained personal access token owned by / able to access the organization, with minimum read-only permissions needed for the repositories you want included. For public-repo stats, select the relevant repositories and grant repository **Contents: Read-only** (Metadata is included automatically). If organization policy requires approval, an owner may need to approve it.

Add the token as repository secret:

- Repository → Settings → Secrets and variables → Actions → Secrets → New repository secret
- Name: `DINA_GITHUB_TOKEN`
- Value: the token

The normal workflow `GITHUB_TOKEN` is not enough to read other organization repositories because it is scoped to the repository running the workflow.

## 5. GitHub Pages settings

Repository → Settings → Pages → Build and deployment → Source → **GitHub Actions**.

Then open **Actions** and manually run `Build DINA Lab stats and deploy Pages` once.
The workflow also runs after every push to `main` and every 6 hours.

## 6. Local preview

Because the page loads JSON using `fetch`, don't open `index.html` directly via `file://`.
Run a tiny web server:

```bash
python3 -m http.server 8080
```

Then visit `http://localhost:8080`.

## Notes on the metrics

- `Projects`: public, non-fork, non-archived organization repositories.
- `Total commits`: an estimate based on pagination of each repository's default-branch commit history.
- `Active contributors`: GitHub users with commits in the configured 90-day window.
- For extremely high-activity repositories, the workflow caps commit pagination using `MAX_COMMIT_PAGES_PER_REPO` to avoid excessive API usage. Increase it if needed.
