# LaunchPad '26 submissions showcase

A website showing what the teams built at **LaunchPad '26 Edition 02 ("All Aboard")**, the two-day hackathon held on
9–10 November 2026. Each team has a page with a write-up, screenshots and a walkthrough video. Where possible there's
also an interactive demo: the team's app, running in the browser, for you to click through.

**Site:** https://mwlaunchpad.github.io/launchpad-26h2-all-aboard-submissions-showcase/

You need to sign in. Ask the LaunchPad organisers for the login.

## Why it exists

- **People who weren't at the event had no way to see the work.**
- **The work could disappear.** Each team built in a personal fork, which its owner could delete at any time.
- **The hosted apps were going offline.** The hackathon's Azure tenant closed on 13 November 2026.

So the submissions were copied into a private archive, the hosted apps were recorded while they were still running,
and everything is presented here. The site is behind a login so it can't be scraped or indexed.

## Two repos

| Repo | Visibility | What it holds |
|---|---|---|
| `launchpad-26h2-all-aboard-submissions-showcase` (this one) | Public | The code that builds and publishes the site. No team content. |
| [`launchpad-26h2-all-aboard-submissions-archive`](https://github.com/mwlaunchpad/launchpad-26h2-all-aboard-submissions-archive) | Private | Every submission with its full git history and branches. Its `showcase/` folder holds the site content: write-ups, screenshots, videos, demo builds, pitch decks and results. |

**Never commit team content to this repo.** It's public, so anything committed here can be read without a login.

## How it works

1. **Content.** `tools/content.mjs` reads the archive's `showcase/` folder and checks it. It stops if anything is
   invalid or a referenced file is missing. It then copies the media and demo builds into the app.
2. **Build.** Vite builds the React site.
3. **Encrypt.** `tools/seal.mjs` encrypts every file of the build. Only a sign-in page and encrypted files are
   published. It also checks that no team content has slipped out unencrypted.
4. **Publish.** GitHub Actions runs these steps whenever `main` changes, or when you start it by hand. It then
   deploys the result to GitHub Pages.

When someone signs in, their password unlocks the site's key. A service worker in their browser then decrypts each
page, image, video and demo as it loads. See [Security](#security) for the details.

## The four views

The same content is shown four ways, for different audiences. The front page has a card for each view, and the bar
at the bottom of every page switches between them.

| View | Best for | What it is | Path |
|---|---|---|---|
| Manifest | A first look | A grid of teams, then a full page per team | `/manifest/` |
| Mission Control | Trying the demos | Teams on the left; the demo or video in the middle; the story on the right | `/mission-control/` |
| Launch Sequence | Presenting to a room | Full-screen slides: arrow keys or a clicker, `O` for an overview, `F` for full screen | `/launch-sequence/` |
| Flight Log | Leaders and stakeholders | One long read along the joiner journey, from offer to Day 30 | `/flight-log/` |

A team's interactive demo also opens full screen at `/demos/<team>/`.

## Common tasks

### Publish a content change

Content lives in the archive, so pushing a change there doesn't update the site on its own. After pushing to the
archive, run:

```bash
gh workflow run pages.yml -R mwlaunchpad/launchpad-26h2-all-aboard-submissions-showcase
```

Pushing to this repo's `main` also republishes. Neither signs anyone out.

[docs/CONTENT.md](docs/CONTENT.md) describes the content files: `event.yml`, `results.yml`, and each team's
`team.yml`, `demo.yml` and `media.yml`.

### Add, change or remove a login

Logins are stored in the `SHOWCASE_USERS` secret, one `username:password` per line. Write the list to a file, then:

```bash
gh secret set SHOWCASE_USERS -R mwlaunchpad/launchpad-26h2-all-aboard-submissions-showcase < users.txt
gh workflow run pages.yml -R mwlaunchpad/launchpad-26h2-all-aboard-submissions-showcase
```

Then delete `users.txt`. Changing the list signs everyone out once, and anyone you removed loses access.

### Make the site open on one view

In `showcase.config.json`, set `"defaultVariant"` to `"manifest"`, `"mission-control"`, `"launch-sequence"` or
`"flight-log"`. To hide the switcher bar too, set `"reviewMode": false`. Push to publish.

### Run it locally

You need Node 20+ and the archive cloned next to this repo. If it's somewhere else, set `ARCHIVE_DIR`.

```bash
npm install
npm run dev              # http://localhost:5173/launchpad-26h2-all-aboard-submissions-showcase/ (no sign-in)
```

To test the sign-in exactly as it's published:

```bash
npm run build
SHOWCASE_USERS='me:any test password' npm run seal
npm run preview:sealed   # http://localhost:4321/launchpad-26h2-all-aboard-submissions-showcase/
```

### Rebuild a demo or retake screenshots

Both commands write into the archive, not this repo:

- `npm run build-demo -- <team>` rebuilds a team's interactive demo from its archived source. It follows
  `showcase/teams/<team>/demo-build/recipe.yml`.
- `npm run capture -- <team> --url <url> [--video]` retakes the screenshots and walkthrough video. It follows
  `showcase/teams/<team>/capture.yml`.

## Security

- **What's public.** Without signing in, only these files can be fetched:
  - the sign-in page;
  - `keyring.json`, which holds each login's wrapped key;
  - `vault/*.bin`, the encrypted files. Their names don't reveal what's inside.

  Search engines are told not to index the site.
- **Encryption.**
  - Files are encrypted with AES-256-GCM.
  - Each login's password unlocks the site key through PBKDF2-SHA256 with 600,000 iterations.
  - The browser keeps the key in a form scripts can't read.
  - It forgets the key on sign-out, or after 12 hours. If you tick "Keep me signed in", it's 7 days instead.
- **Keys and deploys.**
  - The keys come from the `SHOWCASE_SITE_KEY` secret and the login list, so they stay the same between deploys.
  - Changing the login list changes them. To sign everyone out, set a new `SHOWCASE_SITE_KEY` and republish.
- **Limits.** This stops scraping and casual access. It doesn't stop someone who has a login from sharing it. And
  because `keyring.json` is public, a short or guessable password can be cracked offline, so use long passphrases.

## One-off setup (already done)

The deploy workflow needs these secrets on this repo:

| Secret | What it's for |
|---|---|
| `ARCHIVE_DEPLOY_KEY` | Read-only deploy key for the archive repo. A fine-grained `ARCHIVE_TOKEN` with *Contents: read* on the archive also works. |
| `SHOWCASE_USERS` | The logins, one `username:password` per line |
| `SHOWCASE_SITE_KEY` | 32 random bytes, base64. Create it with `openssl rand -base64 32 \| gh secret set SHOWCASE_SITE_KEY`. Without it, every deploy signs everyone out. |

GitHub Pages is set to deploy from GitHub Actions.

## What's in this repo

```
src/                         the React site; src/variants/ holds the four views
seal/                        the public sign-in page and the decrypting service worker
tools/content.mjs            reads and checks the archive content
tools/content-schema.mjs     the content format, as code
tools/seal.mjs               encrypts the build for publishing
tools/serve-sealed.mjs       serves the encrypted build locally
tools/demos/, tools/capture/ rebuild demos and retake screenshots (they write to the archive)
docs/CONTENT.md              the content format, for people
.github/workflows/pages.yml  build, encrypt and deploy
showcase.config.json         base path, default view, session length
```
