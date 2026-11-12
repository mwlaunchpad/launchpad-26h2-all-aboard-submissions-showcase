# Showcase content contract

All team and event content lives in the **private** archive repo
(`mwlaunchpad/launchpad-26h2-all-aboard-submissions-archive`) under `showcase/`. Nothing in this public repo
names a team or reproduces their work: the public repo is the engine, the archive is the data.

The schema is enforced by `tools/content-schema.mjs` (zod) when `tools/content.mjs` runs.

```
archive/
  submissions/<slug>/                 untouched git-subtree copy of the team's fork
  showcase/
    event.yml                         the brief, challenge areas, journey stages, side quests, judging, schedule
    results.yml                       awards (hidden until published: true)
    teams/<slug>/
      team.yml                        the words: identity, problem, approach, highlights, tech, source
      demo.yml                        { demo: {...} }  how the demo is offered (kind, entries, howTo, limitations)
      media.yml                       { media: {...} } cover, screens, video, deck
                                      (the three files are merged, then validated as one teamSchema object)
      capture.yml                     Playwright capture steps (tools/capture/capture.mjs)
      demo-build/                     build recipe + *.patch files (tools/demos/build-demo.mjs)
      demo/                           PREBUILT static demo, served at <base>/demos/<slug>/
      media/
        screens/*.webp                optimised screenshots (phone: 1170px wide; desktop: 1920px wide)
        walkthrough.mp4 + .jpg        H.264 walkthrough + poster
        deck/slide-NN.webp, *.pdf     pitch deck renders
        live/                         raw captures from live deployments (archival, not rendered)
```

## Conventions

- **Slugs** are kebab-case and match the folder name.
- **Paths in `team.yml` `media`** are relative to `showcase/teams/<slug>/media/`.
- **Demo paths** are site-relative and start with `demos/<slug>/` (or `demos/<slug>-deck/` for an HTML deck).
- **Challenge areas** (`domains`): `offer-handover`, `before-day-one`, `manager-buddy`, `first-30-days`.
- **Journey stages** (`stages`, `highlights[].stage`, `screens[].stage`): `offer`, `unlock`, `meet`, `manager-ready`,
  `day-one-week-one`, `day-30`. These map to the event brief's reference journey: Offer → Unlock & choose →
  Meet your people → Manager ready → Day 1 to Week 1 → Day 30.
- **Roles**: `joiner`, `manager`, `buddy`, `hr`, `admin`, `recruiter`.
- **Copy style** follows the event site:
  - plain, confident British English with short sentences
  - no hype words ("revolutionary", "seamless", "leverage")
  - say what the thing does
  - taglines are at most 110 characters
  - `summary` is 2–3 sentences
  - `problem` and `approach` are one short paragraph each
- **Facts only.** Every claim must be traceable to the team's repo (README, docs, code). Mark anything simulated as
  simulated.
