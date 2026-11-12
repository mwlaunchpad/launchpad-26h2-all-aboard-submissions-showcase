# LaunchPad '26 · Submissions showcase

The presentation site for the LaunchPad '26 Edition 02 hackathon submissions, published to GitHub Pages behind a
username/password login.

**This repo is public and holds only the engine.** Team content (write-ups, screenshots, walkthroughs, prebuilt demos)
and the archived submissions live in the private repo
[`mwlaunchpad/launchpad-26h2-all-aboard-submissions-archive`](https://github.com/mwlaunchpad/launchpad-26h2-all-aboard-submissions-archive).
Don't commit team content here; see [docs/CONTENT.md](docs/CONTENT.md).

## How it works

```
private archive (showcase/)  ──►  tools/content.mjs  ──►  vite build (dist/)  ──►  tools/seal.mjs  ──►  site/  ──►  GitHub Pages
                                  validate + stage          React app, 4 layouts      AES-256-GCM vault       login shell
                                  media and demos                                     + keyring.json          + ciphertext only
```

- **Login on a static host.** `tools/seal.mjs` encrypts every built file with a fresh per-build key. That key is
  wrapped once per user in `keyring.json`, under a PBKDF2-SHA256 (600k iterations) key derived from the user's
  password.
- **In the browser.** The login shell (`seal/`) unwraps the key and hands it, non-extractable, to a service worker
  (`seal/sw.js`). The service worker decrypts vault files on the fly, including the embedded team demos and video
  range requests.
- **What's public.** Without a valid login, only the shell and opaque `vault/*.bin` files are reachable.
- **Revoking access.** Every deploy rotates the keys, so removing a user from `SHOWCASE_USERS` and redeploying
  revokes them.
- **Limits.** This is client-side encryption: it stops scraping and casual access, but anyone holding a login can
  share it, and short passwords can be brute-forced offline against `keyring.json`. Use long passphrases.

## Views

| URL | Option |
|---|---|
| `/` | Front door: a card per view, with who it suits |
| `/manifest/`, `/manifest/<team>` | A: Manifest. The event site, extended: team grid and team pages |
| `/mission-control/<team>` | B: Mission Control. Dark console: rail, device stage, story panel |
| `/launch-sequence/` | C: Launch Sequence. Full-screen presenter slides (←/→, O overview, F full screen) |
| `/flight-log/` | D: Flight Log. Long read along the joiner journey, Offer to Day 30 |
| `/demos/<team>/` | A team's live demo, full screen |

All four views stay available for different audiences. To make `/` open one view directly, set
`"defaultVariant": "manifest"` (or another) in `showcase.config.json`; `"reviewMode": false` hides the switcher bar.

## Local development

You need Node 20+ and a clone of the archive next to this repo (or `ARCHIVE_DIR=/path/to/archive`).

```bash
npm install
npm run dev                         # http://localhost:5173/launchpad-26h2-all-aboard-submissions-showcase/ (no login in dev)
node tools/content.mjs --partial    # tolerate teams whose demo.yml / media.yml aren't written yet

npm run build
SHOWCASE_USERS=$'me:a long test passphrase' npm run seal
npm run preview:sealed              # http://localhost:4321/launchpad-26h2-all-aboard-submissions-showcase/ (with login)
```

Content tooling (it writes into the archive):

- `npm run build-demo -- <team>` builds a team's static demo from `submissions/<team>`, using
  `showcase/teams/<team>/demo-build/recipe.yml`.
- `npm run capture -- <team> --url <url> [--video]` captures screenshots and a walkthrough, using
  `showcase/teams/<team>/capture.yml`.

## Deploying

`.github/workflows/pages.yml` runs on push to `main` or manually (`gh workflow run pages.yml`). It needs two
secrets on this repo:

| Secret | What |
|---|---|
| `ARCHIVE_DEPLOY_KEY` **or** `ARCHIVE_TOKEN` | Read access to the archive: a read-only deploy key (needs *Deploy keys* allowed in the org settings), or a fine-grained token limited to the archive repo with *Contents: read* |
| `SHOWCASE_USERS` | One `username:password` per line. Set it yourself: `gh secret set SHOWCASE_USERS < users.txt` |

After the archive's content changes, re-run the workflow to publish it.
