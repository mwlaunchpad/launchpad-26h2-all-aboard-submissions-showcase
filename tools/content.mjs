#!/usr/bin/env node
// Reads showcase content from the PRIVATE archive repo, validates it, and stages it for the app:
//   src/generated/content.json        bundled into the app (the whole app is encrypted at deploy time)
//   public/_content/teams/<slug>/...  only the media files team.yml/media.yml reference
//   public/demos/<slug>/...           prebuilt static demos
//
// Archive location: --archive <dir> | $ARCHIVE_DIR | ../launchpad-26h2-all-aboard-submissions-archive
// --partial (or CONTENT_PARTIAL=1)  tolerate teams whose demo.yml / media.yml are not written yet;
//            those teams get a "screens coming soon" placeholder
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import sharp from 'sharp';
import { eventSchema, resultsSchema, teamSchema } from './content-schema.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const argVal = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const PARTIAL = args.includes('--partial') || process.env.CONTENT_PARTIAL === '1';
const ARCHIVE = path.resolve(
  argVal('--archive') ?? process.env.ARCHIVE_DIR ?? path.join(ROOT, '..', 'launchpad-26h2-all-aboard-submissions-archive'),
);
const SHOWCASE = path.join(ARCHIVE, 'showcase');
const OUT_JSON = path.join(ROOT, 'src/generated/content.json');
const OUT_MEDIA = path.join(ROOT, 'public/_content');
const OUT_DEMOS = path.join(ROOT, 'public/demos');

const fail = (msg) => {
  console.error(`content: ${msg}`);
  process.exit(1);
};
const readYaml = (file) => YAML.parse(fs.readFileSync(file, 'utf8'));
const exists = (p) => fs.existsSync(p);
const rel = (p) => path.relative(ROOT, p);

if (!exists(SHOWCASE)) fail(`no showcase/ folder in archive at ${ARCHIVE} (set ARCHIVE_DIR)`);

function parse(schema, data, where) {
  const r = schema.safeParse(data);
  if (!r.success) {
    const issues = r.error.issues.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`).join('\n');
    fail(`${where} is invalid:\n${issues}`);
  }
  return r.data;
}

const event = parse(eventSchema, readYaml(path.join(SHOWCASE, 'event.yml')), 'event.yml');
const results = exists(path.join(SHOWCASE, 'results.yml'))
  ? parse(resultsSchema, readYaml(path.join(SHOWCASE, 'results.yml')), 'results.yml')
  : { published: false, categories: [], finalists: [], bestInShow: null };

const PLACEHOLDER_MEDIA = { cover: '__placeholder.webp', screens: [{ file: '__placeholder.webp', caption: 'Screens coming soon.', device: 'phone' }] };

const teams = [];
const teamsDir = path.join(SHOWCASE, 'teams');
for (const slug of fs.readdirSync(teamsDir).sort()) {
  const dir = path.join(teamsDir, slug);
  if (!fs.statSync(dir).isDirectory() || !exists(path.join(dir, 'team.yml'))) continue;
  const team = readYaml(path.join(dir, 'team.yml'));
  for (const part of ['demo', 'media']) {
    const f = path.join(dir, `${part}.yml`);
    if (exists(f)) Object.assign(team, readYaml(f));
    else if (!PARTIAL) fail(`teams/${slug}/${part}.yml is missing`);
  }
  if (PARTIAL) {
    team.demo ??= { kind: 'walkthrough', entries: [] };
    team.media ??= PLACEHOLDER_MEDIA;
  }
  const t = parse(teamSchema, team, `teams/${slug}`);
  if (t.slug !== slug) fail(`teams/${slug}/team.yml has slug "${t.slug}"`);
  // The showcase never shows team members' names; they stay in the private archive only.
  t.members = [];
  teams.push(t);
}
if (!teams.length) fail('no teams found');

// ---- stage media and demos --------------------------------------------------------------
fs.rmSync(OUT_MEDIA, { recursive: true, force: true });
fs.rmSync(OUT_DEMOS, { recursive: true, force: true });
const dims = {};
let mediaBytes = 0;

async function stageMedia(slug, file) {
  if (!file || file === '__placeholder.webp') return;
  const src = path.join(teamsDir, slug, 'media', file);
  if (!exists(src)) {
    if (PARTIAL) return console.warn(`content: (partial) missing ${slug}/media/${file}`);
    fail(`teams/${slug}/media/${file} is referenced but does not exist`);
  }
  const dest = path.join(OUT_MEDIA, 'teams', slug, file);
  if (exists(dest)) return;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  mediaBytes += fs.statSync(src).size;
  if (/\.(webp|png|jpe?g|gif)$/i.test(file)) {
    const m = await sharp(src).metadata();
    dims[`${slug}/${file}`] = [m.width, m.height];
  }
}

for (const t of teams) {
  const m = t.media;
  const files = [m.cover, m.video, m.poster, m.deck?.pdf, ...(m.deck?.slides ?? []), ...m.screens.map((s) => s.file), ...t.highlights.map((h) => h.screen)];
  for (const f of files) await stageMedia(t.slug, f);

  const demoSrc = path.join(teamsDir, t.slug, 'demo');
  if (exists(demoSrc)) fs.cpSync(demoSrc, path.join(OUT_DEMOS, t.slug), { recursive: true });
  for (const e of [...t.demo.entries, ...(m.deck?.html ? [{ path: m.deck.html }] : [])]) {
    const p = e.path.replace(/^demos\//, '').replace(/\/$/, '/index.html').split('?')[0].split('#')[0];
    if (!exists(path.join(OUT_DEMOS, p))) {
      if (PARTIAL) console.warn(`content: (partial) demo entry ${e.path} not built yet`);
      else fail(`${t.slug}: demo entry ${e.path} does not exist in teams/${t.slug}/demo/`);
    }
  }
}

// Results must reference real teams.
const slugs = new Set(teams.map((t) => t.slug));
for (const s of [...results.categories.map((c) => c.winner), ...results.finalists, results.bestInShow].filter(Boolean)) {
  if (!slugs.has(s)) fail(`results.yml references unknown team "${s}"`);
}

const content = { generatedAt: new Date().toISOString(), event, results, teams, dims };
fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
fs.writeFileSync(OUT_JSON, JSON.stringify(content, null, 2));

const demoCount = exists(OUT_DEMOS) ? fs.readdirSync(OUT_DEMOS).length : 0;
console.log(
  `content: ${teams.length} teams, ${Object.keys(dims).length} images, ${(mediaBytes / 1e6).toFixed(1)} MB media, ${demoCount} demos → ${rel(OUT_JSON)}`,
);
