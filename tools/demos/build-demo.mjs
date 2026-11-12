#!/usr/bin/env node
// Builds one team's static live demo from the private archive, driven by a recipe.
//
//   node tools/demos/build-demo.mjs <slug> [--archive <dir>] [--work <dir>] [--site-base <path>]
//
// Reads   <archive>/showcase/teams/<slug>/demo-build/recipe.yml (+ *.patch files beside it)
// Copies  <archive>/submissions/<slug>  ->  <work>/<slug>   (never touches submissions/)
// Applies the patches, runs the commands, then replaces <archive>/showcase/teams/<slug>/demo/
// with the output. The demo is served at <site-base>demos/<slug>/ (site base from showcase.config.json).
//
// recipe.yml (every key is optional except where noted):
//   copy:                         # filter for submissions/<slug> -> work copy
//     include: [web]              #   top-level entries to copy (default: all)
//     exclude: [docs, '*.pptx']   #   names or globs to skip ('.git' is always skipped)
//   patches: [01-a.patch]         # default: every *.patch in demo-build/, in name order
//   workdir: web                  # where commands run, relative to the work copy (default: .)
//   env: { NAME: value }          # extra environment for the commands
//   commands:                     # shell commands; {BASE} and {BASE_PATH} are substituted
//     - npm ci
//     - npx vite build --base {BASE}
//   output: web/dist              # required: folder to publish, relative to the work copy
//   static:                       # extra folders copied into the published demo
//     - { from: docs/deck, to: deck }
//   exclude: ['*.md', 'CLAUDE*']  # entries left out of the published demo
//
// Globs: '*' and '?' only. A pattern without '/' matches a name at any depth; with '/' it
// matches the path relative to the folder being copied. {BASE} is the demo's URL prefix with a
// trailing slash; {BASE_PATH} is the same without it. Both are also set as DEMO_BASE and
// DEMO_BASE_PATH in the commands' environment.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import YAML from 'yaml';
import { z } from 'zod';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');
const configFile = path.join(repoRoot, 'showcase.config.json');
const DEFAULT_SITE_BASE = fs.existsSync(configFile)
  ? JSON.parse(fs.readFileSync(configFile, 'utf8')).base
  : '/launchpad-26h2-all-aboard-submissions-showcase/';

const { values: opts, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    archive: { type: 'string', default: path.resolve(repoRoot, '../launchpad-26h2-all-aboard-submissions-archive') },
    work: { type: 'string', default: path.join(os.tmpdir(), 'demo-build') },
    'site-base': { type: 'string', default: DEFAULT_SITE_BASE },
  },
});
const slug = positionals[0];
if (!slug || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) fail('usage: build-demo.mjs <slug> [--archive <dir>] [--work <dir>]');

const globs = z.array(z.string()).default([]);
const recipeSchema = z.object({
  copy: z.object({ include: globs.optional(), exclude: globs }).default({}),
  patches: z.array(z.string()).optional(),
  workdir: z.string().default('.'),
  env: z.record(z.string()).default({}),
  commands: z.array(z.string()).default([]),
  output: z.string(),
  static: z.array(z.object({ from: z.string(), to: z.string().default('.') })).default([]),
  exclude: globs,
});

const archive = path.resolve(opts.archive);
const source = path.join(archive, 'submissions', slug);
const teamDir = path.join(archive, 'showcase', 'teams', slug);
const recipeDir = path.join(teamDir, 'demo-build');
const recipeFile = path.join(recipeDir, 'recipe.yml');
const demoDir = path.join(teamDir, 'demo');
const work = path.join(path.resolve(opts.work), slug);

if (!fs.existsSync(source)) fail(`no submission at ${source}`);
if (!fs.existsSync(recipeFile)) fail(`no recipe at ${recipeFile}`);
const parsed = recipeSchema.safeParse(YAML.parse(fs.readFileSync(recipeFile, 'utf8')) ?? {});
if (!parsed.success) fail(`invalid recipe ${recipeFile}\n${parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n')}`);
const recipe = parsed.data;

const siteBase = opts['site-base'].replace(/\/?$/, '/');
const BASE = `${siteBase}demos/${slug}/`;
const BASE_PATH = BASE.slice(0, -1);
const fill = (s) => s.replaceAll('{BASE}', BASE).replaceAll('{BASE_PATH}', BASE_PATH);
const inside = (root, rel) => {
  const p = path.resolve(root, rel);
  if (p !== root && !p.startsWith(root + path.sep)) fail(`path escapes its folder: ${rel}`);
  return p;
};

// 1. Fresh work copy of the submission.
step(`copy submissions/${slug} -> ${work}`);
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });
const skipCopy = matcher(['.git', ...recipe.copy.exclude]);
const top = recipe.copy.include ?? fs.readdirSync(source);
for (const entry of top) {
  const from = inside(source, entry);
  if (!fs.existsSync(from)) fail(`copy.include: ${entry} not found in the submission`);
  fs.cpSync(from, path.join(work, entry), { recursive: true, filter: (p) => !skipCopy(path.relative(source, p)) });
}

// 2. Patches, applied with git (outside any repository, so paths are relative to the work copy).
const patches = recipe.patches ?? fs.readdirSync(recipeDir).filter((f) => f.endsWith('.patch')).sort();
for (const patch of patches) {
  step(`apply ${patch}`);
  run(`git apply --whitespace=nowarn ${JSON.stringify(inside(recipeDir, patch))}`, work, { GIT_CEILING_DIRECTORIES: path.dirname(work) });
}

// 3. Build commands.
const cwd = inside(work, recipe.workdir);
const env = { DEMO_BASE: BASE, DEMO_BASE_PATH: BASE_PATH, ...Object.fromEntries(Object.entries(recipe.env).map(([k, v]) => [k, fill(String(v))])) };
for (const command of recipe.commands) {
  step(fill(command));
  run(fill(command), cwd, env);
}

// 4. Publish: clean demo/, copy the output and any static folders, leaving out excluded entries.
const output = inside(work, recipe.output);
if (!fs.existsSync(path.join(output))) fail(`output folder ${recipe.output} was not produced`);
step(`publish -> ${path.relative(archive, demoDir)}/`);
fs.rmSync(demoDir, { recursive: true, force: true });
const skipOut = matcher(recipe.exclude);
const publish = (from, to) =>
  fs.cpSync(from, to, { recursive: true, filter: (p) => p === from || !skipOut(path.relative(from, p)) });
publish(output, demoDir);
for (const s of recipe.static) publish(inside(work, s.from), inside(demoDir, s.to));

// 5. Summary.
const files = walk(demoDir);
const bytes = files.reduce((n, f) => n + fs.statSync(f).size, 0);
console.log(`\n${slug}: ${files.length} files, ${(bytes / 1024 / 1024).toFixed(2)} MB in ${demoDir}`);
console.log(`served at ${BASE}`);

// ---------------------------------------------------------------------------------------------
function matcher(patterns) {
  const res = patterns.map((g) => ({
    deep: !g.includes('/'),
    re: new RegExp(`^${g.replace(/\/$/, '').replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]')}$`),
  }));
  return (rel) => {
    if (!rel) return false;
    const posix = rel.split(path.sep).join('/');
    const name = path.posix.basename(posix);
    return res.some(({ deep, re }) => re.test(deep ? name : posix));
  };
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? walk(p) : [p];
  });
}

function run(command, dir, extraEnv = {}) {
  const r = spawnSync(command, { cwd: dir, shell: true, stdio: 'inherit', env: { ...process.env, ...extraEnv } });
  if (r.status !== 0) fail(`command failed (${r.status ?? r.signal}): ${command}`);
}

function step(msg) {
  console.log(`\n▸ ${msg}`);
}

function fail(msg) {
  console.error(`build-demo: ${msg}`);
  process.exit(1);
}
