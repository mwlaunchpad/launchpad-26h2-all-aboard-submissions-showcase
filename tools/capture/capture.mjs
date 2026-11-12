#!/usr/bin/env node
// Data-driven screenshot and walkthrough capture for a team's showcase media.
//
//   node tools/capture/capture.mjs <slug> --url <baseUrl> [--video] [--no-shots] [--media] [--archive <dir>]
//
// Reads   <archive>/showcase/teams/<slug>/capture.yml
// Writes  <archive>/showcase/teams/<slug>/media/screens/NN-name.webp   (screenshot pass)
//         <archive>/showcase/teams/<slug>/media/walkthrough.mp4 + .jpg (--video)
//         <archive>/showcase/teams/<slug>/media/deck/slide-NN.webp      (when capture.yml has a deck)
//         <archive>/showcase/teams/<slug>/media.yml                     (--media; from the shots that have captions)
//
// Flags
//   --url <base>      base URL; step paths resolve against it ("/portal" -> <base>/portal). Optional when no step navigates.
//   --video           also record the steps as a phone-sized walkthrough (H.264 MP4 + poster JPG)
//   --no-shots        skip the screenshot pass (e.g. a second run after resetting a stateful app)
//   --media           write media.yml from capture.yml (captions, stage, role, cover, video, deck)
//   --archive <dir>   archive repo root (default: $ARCHIVE_DIR, then ./.archive)
//   --headed          show the browser
//   --debug           log every step
//   --keep-going      log failing steps and carry on (steps can also set `optional: true`)
//
// capture.yml (all keys optional except steps)
//   devices:   { phone: {width, height, scale, mobile, output: {width, quality}}, desktop: {...} }  merged over the presets
//   device:    starting device (default phone)
//   init:      { localStorage: { key: string | object } }   seeded once per browser profile, before the app's scripts run
//   clock:     ISO date-time the page's Date starts from (time still flows)
//   css:       extra CSS injected on every page (hide banners, toolbars); or { all, shots, video } to differ by pass
//   dismiss:   [locator, ...] clicked if visible after each navigation (cookie banners)
//   settle:    ms to wait after the page is idle before each shot (default 600)
//   video:     { device, poster: <shot name>|seconds, pace, speed, maxSeconds, include: [devices], caption,
//                from: <file>, trimStart: seconds|auto, crop: {width, height, x, y} }   (from: re-encode an existing recording)
//   deck:      { title, slides: [file, ...], pdf }      slide images are converted to media/deck/slide-NN.webp
//   steps:     see STEP REFERENCE below
//
// STEP REFERENCE (each step is a map with one action key; any step may also set
//   only: shots|video   optional: true   pause: ms (extra video-only pause after the step))
//   goto: <path|url>                      navigate and settle
//   reload: true | back: true
//   click: <locator>                      a string matches a button, link or text; or {text|role+name|selector|label|placeholder|testId|alt|title, exact, nth, last, within}
//   tap: <locator>                        same as click
//   hover: <locator>
//   fill: <locator>, value: <text>        set a field instantly
//   type: <locator>, text: <text>         type key by key (visible in the video)
//   press: <key>, on: <locator>?
//   select: <locator>, value: <value|label>
//   check: <locator> | uncheck: <locator>
//   upload: <locator>, file: <path> | "@avatar"   ("@avatar" generates a neutral placeholder portrait)
//   wait: ms | <locator> (+ state: visible|hidden|attached) | { url: <glob> } | networkidle
//   scroll: top | bottom | <px> | { to: <locator> } | { by: px } | { through: true }   ("through" pans the page; video only)
//   session: <name> | { name, fresh }     switch between named logins (cookies + localStorage) in the same browser
//   setDevice: phone|desktop              screenshot pass only; the video stays on one device
//   localStorage: { key: value }, merge: true?   write keys on the current origin (objects are JSON-encoded)
//   clearStorage: true
//   evaluate: <js expression>
//   shot: <name> | { name, device, full, element: <locator>, maxHeight, settle, hold, caption, stage, role, cover }
//   import: <file>, name, device, caption, stage, role, cover, crop: {top, height}, maxHeight   reuse an existing image
//           as the next screen (crop and maxHeight are CSS pixels of the device)
//   log: <message>
//
// File paths in capture.yml (import, upload, video.from, deck.slides) are relative to the archive root.

import { chromium } from 'playwright';
import sharp from 'sharp';
import YAML from 'yaml';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FFMPEG = process.env.FFMPEG ?? (fs.existsSync('/opt/homebrew/bin/ffmpeg') ? '/opt/homebrew/bin/ffmpeg' : 'ffmpeg');
const FFPROBE = process.env.FFPROBE ?? FFMPEG.replace(/ffmpeg$/, 'ffprobe');

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36';

const ACTIONS = ['goto', 'reload', 'back', 'click', 'tap', 'hover', 'fill', 'type', 'press', 'select', 'check', 'uncheck', 'upload', 'wait', 'scroll', 'session', 'setDevice', 'localStorage', 'clearStorage', 'evaluate', 'shot', 'import', 'log'];
const DEVICE_PRESETS = {
  phone: { width: 390, height: 844, scale: 3, mobile: true, output: { width: 1170, quality: 82 } },
  desktop: { width: 1440, height: 900, scale: 2, mobile: false, output: { width: 1920, quality: 80 } },
};
const VIDEO_PACE = { goto: 1200, click: 1000, fill: 400, type: 600, press: 800, select: 700, check: 500, upload: 1000, scroll: 600, shot: 2000, session: 300, reload: 1200, back: 1000, hover: 500 };
const SEED_MARKER = '__capture_seeded';
const WEBP_MAX = 16383;

// ---------------------------------------------------------------------------------------------- args
function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const key = a.slice(2);
    if (['url', 'archive'].includes(key)) out[key] = argv[++i];
    else out[key.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = true;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const slug = args._[0];
if (!slug) {
  console.error('usage: node tools/capture/capture.mjs <slug> --url <baseUrl> [--video] [--no-shots] [--media] [--archive <dir>]');
  process.exit(2);
}
const ARCHIVE = path.resolve(args.archive ?? process.env.ARCHIVE_DIR ?? path.join(ROOT, '.archive'));
const TEAM_DIR = path.join(ARCHIVE, 'showcase', 'teams', slug);
const CONFIG_FILE = path.join(TEAM_DIR, 'capture.yml');
if (!fs.existsSync(CONFIG_FILE)) {
  console.error(`No capture.yml at ${CONFIG_FILE}. Pass --archive <dir> or set ARCHIVE_DIR.`);
  process.exit(2);
}
const cfg = YAML.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) ?? {};
const MEDIA_DIR = path.join(TEAM_DIR, 'media');
const SCREENS_DIR = path.join(MEDIA_DIR, 'screens');
const DEVICES = Object.fromEntries(
  Object.entries({ ...DEVICE_PRESETS, ...(cfg.devices ?? {}) }).map(([k, v]) => [
    k,
    { ...(DEVICE_PRESETS[k] ?? DEVICE_PRESETS.phone), ...v, output: { ...(DEVICE_PRESETS[k]?.output ?? DEVICE_PRESETS.phone.output), ...(v?.output ?? {}) } },
  ]),
);
const STEPS = (cfg.steps ?? []).map(normaliseStep);
const BASE = args.url ?? cfg.url ?? null;
const log = (...m) => console.log(...m);
const debug = (...m) => args.debug && console.log(' ', ...m);

// ---------------------------------------------------------------------------------------------- steps

function normaliseStep(raw, i) {
  if (typeof raw === 'string') raw = { [raw]: true };
  const action = ACTIONS.find((a) => a in raw);
  if (!action) throw new Error(`step ${i + 1}: no known action in ${JSON.stringify(raw)}`);
  const arg = raw[action];
  // `only` may also sit inside a shot's map.
  const only = raw.only ?? (action === 'shot' && arg && typeof arg === 'object' ? arg.only : undefined);
  return { ...raw, action, arg, only, index: i + 1 };
}

const isShotStep = (s) => (s.action === 'shot' || s.action === 'import') && s.only !== 'video';
function shotName(s) {
  const a = s.action === 'shot' ? s.arg : s;
  return (typeof a === 'string' ? a : a.name) ?? `screen-${s.index}`;
}
const shotMeta = (s) => (s.action === 'shot' && typeof s.arg === 'object' ? s.arg : s);

// Screens are numbered by their position among shot/import steps, so media.yml can be written without capturing.
function plannedScreens() {
  let n = 0;
  return STEPS.filter(isShotStep).map((s) => {
    n += 1;
    const meta = shotMeta(s);
    const device = (s.action === 'shot' ? meta.device : s.device) ?? null;
    return { step: s, n, file: `screens/${String(n).padStart(2, '0')}-${shotName(s)}.webp`, meta, device };
  });
}

// ---------------------------------------------------------------------------------------------- helpers
function resolveUrl(target) {
  if (/^[a-z]+:/i.test(target)) return target;
  if (!BASE) throw new Error(`a step navigates to "${target}" but no --url was given`);
  const base = BASE.endsWith('/') ? BASE : BASE + '/';
  return new URL(String(target).replace(/^\//, ''), base).toString();
}
const archivePath = (p) => (path.isAbsolute(p) ? p : path.join(ARCHIVE, p));

function locate(page, spec) {
  if (spec == null || spec === true) throw new Error('missing locator');
  let root = page;
  if (typeof spec === 'object' && spec.within) root = locate(page, spec.within);
  let l;
  if (typeof spec === 'string') {
    const name = spec;
    l = root
      .getByRole('button', { name })
      .or(root.getByRole('link', { name }))
      .or(root.getByRole('tab', { name }))
      .or(root.getByRole('menuitem', { name }))
      .or(root.getByText(name));
  } else if (spec.selector) l = root.locator(spec.selector, spec.hasText ? { hasText: spec.hasText } : undefined);
  else if (spec.role) l = root.getByRole(spec.role, { name: spec.name, exact: spec.exact });
  else if (spec.label) l = root.getByLabel(spec.label, { exact: spec.exact });
  else if (spec.placeholder) l = root.getByPlaceholder(spec.placeholder, { exact: spec.exact });
  else if (spec.testId) l = root.getByTestId(spec.testId);
  else if (spec.alt) l = root.getByAltText(spec.alt, { exact: spec.exact });
  else if (spec.title) l = root.getByTitle(spec.title, { exact: spec.exact });
  else if (spec.text) l = root.getByText(spec.text, { exact: spec.exact });
  else throw new Error(`cannot build a locator from ${JSON.stringify(spec)}`);
  if (typeof spec === 'object' && spec.hasText && !spec.selector) l = l.filter({ hasText: spec.hasText });
  if (!(typeof spec === 'object' && spec.hidden)) l = l.filter({ visible: true });
  if (typeof spec === 'object' && spec.last) return l.last();
  if (typeof spec === 'object' && Number.isInteger(spec.nth)) return l.nth(spec.nth);
  return l.first();
}

async function avatarFile() {
  const file = path.join(os.tmpdir(), 'capture-avatar.png');
  if (fs.existsSync(file)) return file;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000" viewBox="0 0 800 1000">
    <defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#dfe7ee"/><stop offset="1" stop-color="#b9c7d3"/></linearGradient></defs>
    <rect width="800" height="1000" fill="url(#bg)"/>
    <circle cx="400" cy="400" r="170" fill="#7d8f9f"/>
    <path d="M110 1000c0-190 130-330 290-330s290 140 290 330z" fill="#7d8f9f"/></svg>`;
  await sharp(Buffer.from(svg)).png().toFile(file);
  return file;
}

function run(cmd, argv) {
  const r = spawnSync(cmd, argv, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`${path.basename(cmd)} failed: ${(r.stderr || r.stdout || '').split('\n').slice(-8).join('\n')}`);
  return r;
}
function probeDuration(file) {
  const r = run(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file]);
  return Number(r.stdout.trim());
}
function detectLeadingFreeze(file) {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-i', file, '-vf', 'freezedetect=n=0.003:d=0.4', '-map', '0:v', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const text = r.stderr ?? '';
  const start = text.match(/freeze_start: ([\d.]+)/);
  const end = text.match(/freeze_end: ([\d.]+)/);
  if (start && Number(start[1]) < 0.2 && end) return Math.max(0, Number(end[1]) - 0.3);
  return 0;
}

// Encode a source video to the showcase MP4 + poster. Returns { duration, bytes }.
function encodeWalkthrough(src, { trimStart = 0, speed = 1, posterAt = null, maxSeconds = null, crop = null } = {}) {
  const out = path.join(MEDIA_DIR, 'walkthrough.mp4');
  const poster = path.join(MEDIA_DIR, 'walkthrough.jpg');
  const srcDuration = probeDuration(src) - trimStart;
  if (maxSeconds && srcDuration / speed > maxSeconds) speed = Math.min(2, srcDuration / maxSeconds);
  const filters = [];
  if (crop) {
    // e.g. a recording whose picture only fills part of its frame: cut it out and scale it to the walkthrough frame.
    const frame = videoFrame();
    filters.push(`crop=${crop.width}:${crop.height}:${crop.x ?? 0}:${crop.y ?? 0}`, `scale=${frame.width}:${frame.height}:flags=lanczos`);
  }
  filters.push('scale=trunc(iw/2)*2:trunc(ih/2)*2');
  if (speed !== 1) filters.push(`setpts=PTS/${speed.toFixed(3)}`);
  let crf = 28;
  for (;;) {
    run(FFMPEG, [
      '-y', '-hide_banner', '-loglevel', 'error',
      ...(trimStart > 0 ? ['-ss', trimStart.toFixed(2)] : []),
      '-i', src, '-an', '-vf', filters.join(','), '-r', '30',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out,
    ]);
    const bytes = fs.statSync(out).size;
    if (bytes < 25 * 1024 * 1024 || crf >= 36) break;
    crf += 3;
  }
  const duration = probeDuration(out);
  const at = Math.max(0, Math.min(duration - 0.5, posterAt != null ? (posterAt - trimStart) / speed : Math.min(4, duration / 3)));
  run(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', '-ss', at.toFixed(2), '-i', out, '-frames:v', '1', '-q:v', '3', poster]);
  return { duration, bytes: fs.statSync(out).size, crf, speed };
}

async function writeWebp(input, file, device, { crop, maxHeight } = {}) {
  const dev = DEVICES[device] ?? DEVICES.phone;
  let img = sharp(input);
  const metaIn = await img.metadata();
  if (crop) {
    // crop is in CSS pixels of the device (e.g. {top: 0, height: 844} keeps the first phone screen);
    // crop.width gives the source's CSS width when it differs from the device's (e.g. a 1280px-wide 1x shot).
    const scale = metaIn.width / (crop.width ?? dev.width);
    const top = Math.round((crop.top ?? 0) * scale);
    const height = Math.min(metaIn.height - top, Math.round((crop.height ?? metaIn.height) * scale));
    img = sharp(await img.extract({ left: 0, top, width: metaIn.width, height }).toBuffer());
  }
  img = img.resize({ width: dev.output.width, withoutEnlargement: true });
  let buf = await img.toBuffer();
  const meta = await sharp(buf).metadata();
  const capCss = maxHeight ? Math.round(maxHeight * (meta.width / dev.width)) : Infinity;
  const cap = Math.min(WEBP_MAX, capCss);
  if (meta.height > cap) buf = await sharp(buf).extract({ left: 0, top: 0, width: meta.width, height: cap }).toBuffer();
  await sharp(buf).webp({ quality: dev.output.quality, effort: 5 }).toFile(file);
  const out = await sharp(file).metadata();
  return `${out.width}x${out.height}`;
}

// ---------------------------------------------------------------------------------------------- browser session
function initScript({ seeds, marker, css, video }) {
  try {
    if (seeds && Object.keys(seeds).length && !localStorage.getItem(marker)) {
      for (const [k, v] of Object.entries(seeds)) localStorage.setItem(k, v);
      localStorage.setItem(marker, '1');
    }
  } catch {}
  const style = `
    nextjs-portal, [data-nextjs-toast], [data-nextjs-dialog-overlay], #__next-build-watcher, #__next-prerender-indicator,
    vite-error-overlay, #webpack-dev-server-client-overlay, [data-next-badge-root] { display: none !important; }
    *, *::before, *::after { scrollbar-width: none !important; }
    *::-webkit-scrollbar { display: none !important; }
    ${css ?? ''}`;
  const add = () => {
    if (document.getElementById('__capture_css')) return;
    const el = document.createElement('style');
    el.id = '__capture_css';
    el.textContent = style;
    (document.head || document.documentElement).appendChild(el);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add);
  else add();
  if (video) {
    window.__captureTap = (x, y) => {
      const d = document.createElement('div');
      d.style.cssText = `position:fixed;left:${x - 24}px;top:${y - 24}px;width:48px;height:48px;border-radius:50%;
        background:rgba(20,20,20,.22);border:3px solid rgba(255,255,255,.95);box-shadow:0 0 0 1px rgba(0,0,0,.25);
        pointer-events:none;z-index:2147483647;transform:scale(.55);opacity:1;transition:transform .5s ease-out,opacity .6s ease-out`;
      document.documentElement.appendChild(d);
      requestAnimationFrame(() => { d.style.transform = 'scale(1.25)'; d.style.opacity = '0'; });
      setTimeout(() => d.remove(), 800);
    };
  }
}

class Runner {
  constructor(browser, { video }) {
    this.browser = browser;
    this.video = video;
    this.device = cfg.device ?? 'phone';
    this.session = 'default';
    this.sessions = {};
    this.shots = [];
    this.segments = []; // video pass: one recording per browser context (device switches start a new one)
    this.shotIndex = 0;
    this.pendingUrl = null;
    this.planned = plannedScreens();
    this.videoDir = video ? fs.mkdtempSync(path.join(os.tmpdir(), `capture-${slug}-`)) : null;
  }

  recordsDevice(devName) {
    return (cfg.video?.include ?? Object.keys(DEVICES)).includes(devName);
  }

  contextOptions(devName, storageState) {
    const dev = DEVICES[devName];
    if (!dev) throw new Error(`unknown device "${devName}"`);
    const opts = {
      viewport: { width: dev.width, height: dev.height },
      deviceScaleFactor: dev.scale,
      isMobile: !!dev.mobile,
      hasTouch: !!dev.mobile,
      userAgent: dev.userAgent ?? (dev.mobile ? IPHONE_UA : DESKTOP_UA),
      locale: cfg.locale ?? 'en-GB',
      timezoneId: cfg.timezone ?? 'Europe/London',
      colorScheme: cfg.colorScheme ?? 'light',
      permissions: cfg.permissions ?? [],
      ignoreHTTPSErrors: true,
      ...(storageState ? { storageState } : {}),
    };
    if (this.video && this.recordsDevice(devName)) {
      // Chromium's screencast delivers CSS-pixel frames whatever the device scale factor, so record at the
      // viewport size; the segments are scaled into the final frame when they are joined.
      opts.recordVideo = { dir: this.videoDir, size: { width: dev.width, height: dev.height } };
    }
    return opts;
  }

  async open(devName, storageState) {
    this.context = await this.browser.newContext(this.contextOptions(devName, storageState));
    this.segment = { device: devName, startedAt: null, firstContentAt: null, marks: [] };
    if (cfg.clock) await this.context.clock.setSystemTime(new Date(cfg.clock));
    const seeds = Object.fromEntries(Object.entries(cfg.init?.localStorage ?? {}).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]));
    const css = typeof cfg.css === 'object' && cfg.css ? [cfg.css.all, this.video ? cfg.css.video : cfg.css.shots].filter(Boolean).join('\n') : (cfg.css ?? '');
    await this.context.addInitScript(initScript, { seeds, marker: SEED_MARKER, css, video: this.video });
    const context = this.context;
    let opening = true;
    context.on('page', (p) => {
      if (opening || p === this.page || context !== this.context) return;
      // A link opened a new tab: follow it in the main tab instead, so the walkthrough stays in one video.
      this.pendingPopup = (async () => {
        try {
          await p.waitForURL((u) => u.toString() !== 'about:blank', { timeout: 10000, waitUntil: 'commit' }).catch(() => {});
          const url = p.url();
          await p.close();
          return url && url !== 'about:blank' ? url : null;
        } catch {
          return null;
        }
      })();
    });
    this.page = await this.context.newPage();
    opening = false;
    this.segment.startedAt = Date.now();
    this.page.on('dialog', (d) => d.accept().catch(() => {}));
    this.page.on('pageerror', (e) => debug('pageerror:', e.message.split('\n')[0]));
    this.device = devName;
  }

  async close() {
    const video = this.page?.video();
    const segment = this.segment;
    await this.context?.close();
    if (video && segment) {
      segment.file = await video.path();
      segment.endedAt = Date.now();
      if (segment.firstContentAt) this.segments.push(segment);
    }
    this.context = null;
  }

  // Re-open the browser on another device (or with another login), carrying the given storage state.
  // The current URL is reloaded lazily, before the next step that needs a page, so a following goto
  // doesn't record a wasted page load.
  async reopen(devName, state) {
    const url = this.page.url();
    await this.close();
    await this.open(devName, state);
    if (url.startsWith('http')) this.pendingUrl = url;
  }

  async restorePending() {
    if (!this.pendingUrl) return;
    const url = this.pendingUrl;
    this.pendingUrl = null;
    await this.page.goto(url, { waitUntil: 'load' });
    await this.afterNavigation();
  }

  async pace(step, fallback) {
    if (!this.video) return;
    const ms = (VIDEO_PACE[step.action] ?? fallback ?? 600) * (cfg.video?.pace ?? 1) + (step.pause ?? 0);
    await this.page.waitForTimeout(ms);
  }

  async settle(extra = 400) {
    const page = this.page;
    await page.waitForLoadState('load', { timeout: 15000 }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    await page
      .evaluate(async () => {
        await document.fonts?.ready;
        const pending = [...document.images].filter((i) => !i.complete && i.loading !== 'lazy');
        await Promise.race([
          Promise.all(pending.map((i) => new Promise((r) => { i.addEventListener('load', r); i.addEventListener('error', r); }))),
          new Promise((r) => setTimeout(r, 5000)),
        ]);
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      })
      .catch(() => {});
    if (extra) await page.waitForTimeout(extra);
  }

  async afterNavigation() {
    await this.settle(this.video ? 300 : 200);
    if (this.segment && !this.segment.firstContentAt && this.page.url().startsWith('http')) this.segment.firstContentAt = Date.now();
    for (const spec of cfg.dismiss ?? []) {
      const l = locate(this.page, spec);
      if (await l.isVisible().catch(() => false)) {
        await l.click({ timeout: 3000 }).catch(() => {});
        await this.page.waitForTimeout(300);
      }
    }
  }

  async followPopup() {
    await this.page.waitForTimeout(400);
    if (!this.pendingPopup) return;
    const url = await this.pendingPopup;
    this.pendingPopup = null;
    if (!url) return;
    debug('following new tab in place:', url);
    await this.page.goto(url, { waitUntil: 'load' });
    await this.afterNavigation();
  }

  async scrollIntoView(l) {
    if (!this.video) return;
    await l.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' })).catch(() => {});
    await this.page.waitForTimeout(550);
  }

  async showTap(l) {
    if (!this.video) return;
    const box = await l.boundingBox().catch(() => null);
    if (!box) return;
    await this.page.evaluate(([x, y]) => window.__captureTap?.(x, y), [box.x + box.width / 2, box.y + box.height / 2]).catch(() => {});
    await this.page.waitForTimeout(260);
  }

  async setDevice(devName) {
    if (devName === this.device) return;
    await this.reopen(devName, await this.context.storageState());
  }

  async switchSession(name, fresh) {
    if (name === this.session && !fresh) return;
    this.sessions[this.session] = await this.context.storageState();
    const state = fresh ? { cookies: [], origins: [] } : this.sessions[name] ?? { cookies: [], origins: [] };
    this.session = name;
    if (!this.page.url().startsWith('http')) {
      // Nothing loaded yet (e.g. just after a device switch): start the browser profile again with this login.
      const pending = this.pendingUrl;
      await this.reopen(this.device, state);
      this.pendingUrl = pending;
      return;
    }
    await this.context.clearCookies();
    if (state.cookies?.length) await this.context.addCookies(state.cookies);
    const origin = new URL(this.page.url()).origin;
    const items = state.origins?.find((o) => o.origin === origin)?.localStorage ?? [];
    await this.page.evaluate((items) => { localStorage.clear(); sessionStorage.clear(); for (const { name, value } of items) localStorage.setItem(name, value); }, items).catch(() => {});
  }

  async ensureOrigin() {
    await this.restorePending();
    if (!this.page.url().startsWith('http')) {
      await this.page.goto(resolveUrl(''), { waitUntil: 'load' });
      await this.afterNavigation();
    }
  }

  // The element that scrolls the main content: the document, or an app-shell container under the viewport centre.
  async scroller() {
    const vp = this.page.viewportSize();
    return this.page.evaluateHandle(([x, y]) => {
      let el = document.elementFromPoint(x, y);
      while (el && el !== document.documentElement && el !== document.body) {
        const s = getComputedStyle(el);
        if (/(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 4) return el;
        el = el.parentElement;
      }
      return document.scrollingElement;
    }, [vp.width / 2, vp.height / 2]);
  }

  async scrollThrough() {
    const page = this.page;
    const vp = page.viewportSize();
    await page.mouse.move(vp.width / 2, vp.height / 2);
    const el = await this.scroller();
    const distance = await el.evaluate((e) => e.scrollHeight - e.clientHeight - e.scrollTop);
    const stepPx = Math.round(vp.height * 0.3);
    for (let moved = 0; moved < distance; moved += stepPx) {
      await el.evaluate((e, by) => e.scrollBy({ top: by, behavior: 'smooth' }), stepPx);
      await page.waitForTimeout(480);
    }
    await page.waitForTimeout(900);
    await el.evaluate((e) => e.scrollTo({ top: 0, behavior: 'smooth' }));
    await page.waitForTimeout(1000);
  }

  // Full-page shot: grow the viewport to the content height, so fixed headers and tab bars stay where they belong.
  async fullPageShot(opts, maxHeight) {
    const page = this.page;
    const vp = page.viewportSize();
    await page.evaluate(async () => {
      const d = document.scrollingElement;
      for (let y = 0; y < d.scrollHeight; y += window.innerHeight) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 100)); }
      window.scrollTo(0, 0);
    }).catch(() => {});
    const extra = await (await this.scroller()).evaluate((e) => e.scrollHeight - e.clientHeight);
    const height = Math.min(vp.height + Math.max(0, extra), maxHeight ?? 6000, Math.floor(WEBP_MAX / (DEVICES[this.device].scale || 1)));
    await page.setViewportSize({ width: vp.width, height });
    try {
      await this.settle(500);
      await page.evaluate(() => window.scrollTo(0, 0));
      return await page.screenshot(opts);
    } finally {
      await page.setViewportSize(vp);
    }
  }

  async shot(step) {
    const meta = typeof step.arg === 'object' ? step.arg : {};
    const name = shotName(step);
    if (meta.device) await this.setDevice(meta.device);
    await this.restorePending();
    if (this.video) {
      this.segment.marks.push({ name, at: Date.now() });
      if (meta.full && meta.pan !== false) await this.scrollThrough();
      await this.page.waitForTimeout(meta.hold ?? VIDEO_PACE.shot * (cfg.video?.pace ?? 1));
      return;
    }
    const plan = this.planned[this.shotIndex++];
    // Drop focus rings and open keyboards' carets unless the shot asks to keep them.
    if (!meta.focus) await this.page.evaluate(() => document.activeElement?.blur?.()).catch(() => {});
    await this.settle(meta.settle ?? cfg.settle ?? 600);
    const opts = { animations: 'disabled', caret: 'hide', timeout: 30000 };
    const buf = meta.element
      ? await locate(this.page, meta.element).screenshot(opts)
      : meta.full
        ? await this.fullPageShot(opts, meta.maxHeight)
        : await this.page.screenshot(opts);
    const file = path.join(MEDIA_DIR, plan.file);
    const dims = await writeWebp(buf, file, this.device);
    this.shots.push({ file: plan.file, device: this.device });
    log(`  shot ${plan.file} (${this.device}, ${dims})`);
  }

  async importImage(step) {
    if (this.video) return;
    const plan = this.planned[this.shotIndex++];
    const src = archivePath(step.arg);
    const device = step.device ?? 'phone';
    const dims = await writeWebp(src, path.join(MEDIA_DIR, plan.file), device, { crop: step.crop, maxHeight: step.maxHeight });
    this.shots.push({ file: plan.file, device });
    log(`  import ${plan.file} <- ${path.relative(ARCHIVE, src)} (${dims})`);
  }

  async step(s) {
    const page = this.page;
    const a = s.arg;
    switch (s.action) {
      case 'goto':
        this.pendingUrl = null;
        await page.goto(resolveUrl(typeof a === 'object' ? a.url : a), { waitUntil: (typeof a === 'object' && a.waitUntil) || 'load', timeout: 60000 });
        await this.afterNavigation();
        break;
      case 'reload':
        await page.reload({ waitUntil: 'load' });
        await this.afterNavigation();
        break;
      case 'back':
        await page.goBack({ waitUntil: 'load' });
        await this.afterNavigation();
        break;
      case 'click':
      case 'tap': {
        const l = locate(page, a);
        await l.waitFor({ state: 'visible', timeout: s.timeout ?? 15000 });
        await this.scrollIntoView(l);
        await this.showTap(l);
        const urlBefore = page.url();
        await l.click({ timeout: s.timeout ?? 15000, force: !!s.force, position: s.position });
        await this.followPopup();
        if (page.url() !== urlBefore) await this.afterNavigation();
        else await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => {});
        break;
      }
      case 'hover': {
        const l = locate(page, a);
        await l.hover({ timeout: s.timeout ?? 15000 });
        break;
      }
      case 'fill': {
        const l = locate(page, a);
        await this.scrollIntoView(l);
        await l.fill(String(s.value ?? ''), { timeout: s.timeout ?? 15000 });
        break;
      }
      case 'type': {
        const l = locate(page, a);
        await this.scrollIntoView(l);
        await this.showTap(l);
        if (s.clear !== false) await l.fill('', { timeout: s.timeout ?? 15000 });
        else await l.focus({ timeout: s.timeout ?? 15000 });
        await l.pressSequentially(String(s.text ?? ''), { delay: this.video ? (s.delay ?? 45) : 0 });
        break;
      }
      case 'press':
        if (s.on) await locate(page, s.on).press(a);
        else await page.keyboard.press(a);
        await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => {});
        break;
      case 'select': {
        const l = locate(page, a);
        await l.selectOption(s.value);
        break;
      }
      case 'check':
      case 'uncheck': {
        const l = locate(page, a);
        await this.showTap(l);
        await l[s.action]({ force: !!s.force });
        break;
      }
      case 'upload': {
        const file = s.file === '@avatar' ? await avatarFile() : archivePath(s.file);
        const l = typeof a === 'object' && a.selector ? page.locator(a.selector).first() : locate(page, a);
        await l.setInputFiles(file);
        await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
        break;
      }
      case 'wait':
        if (typeof a === 'number') await page.waitForTimeout(a);
        else if (a === 'networkidle' || a === 'load') await page.waitForLoadState(a, { timeout: s.timeout ?? 15000 }).catch(() => {});
        else if (typeof a === 'object' && a.url) await page.waitForURL(a.url, { timeout: s.timeout ?? 20000 });
        else await locate(page, typeof a === 'object' ? { ...a, hidden: s.state === 'hidden' || a.hidden } : a).waitFor({ state: s.state ?? 'visible', timeout: s.timeout ?? 20000 });
        break;
      case 'scroll': {
        const smooth = this.video ? 'smooth' : 'instant';
        if (a === 'top' || a === 'bottom') {
          // Both the document and any app-shell scroller under the viewport centre.
          const el = await this.scroller();
          await el.evaluate((e, [where, behavior]) => e.scrollTo({ top: where === 'top' ? 0 : e.scrollHeight, behavior }), [a, smooth]);
          await page.evaluate(([where, behavior]) => {
            const d = document.scrollingElement;
            window.scrollTo({ top: where === 'top' ? 0 : d.scrollHeight, left: 0, behavior });
          }, [a, smooth]);
        } else if (typeof a === 'number' || (typeof a === 'object' && a.by != null)) {
          const by = typeof a === 'number' ? a : a.by;
          await (await this.scroller()).evaluate((e, [by, behavior]) => e.scrollBy({ top: by, behavior }), [by, smooth]);
        } else if (typeof a === 'object' && a.through) {
          if (this.video) await this.scrollThrough();
        } else if (typeof a === 'object' && a.to) {
          await locate(page, a.to).evaluate((el, [behavior, block]) => el.scrollIntoView({ behavior, block }), [smooth, a.block ?? 'start']);
        }
        if (!this.video) await page.waitForTimeout(250);
        break;
      }
      case 'session':
        await this.switchSession(typeof a === 'object' ? a.name : a, typeof a === 'object' && a.fresh);
        break;
      case 'setDevice':
        await this.setDevice(a);
        break;
      case 'localStorage':
        await this.ensureOrigin();
        await page.evaluate(([items, merge]) => {
          for (const [k, v] of Object.entries(items)) {
            let value = v;
            if (merge && v && typeof v === 'object') {
              let prev = {};
              try { prev = JSON.parse(localStorage.getItem(k) || '{}') || {}; } catch {}
              value = { ...prev, ...v };
            }
            localStorage.setItem(k, typeof value === 'string' ? value : JSON.stringify(value));
          }
        }, [a, !!s.merge]);
        break;
      case 'clearStorage':
        await this.context.clearCookies();
        if (page.url().startsWith('http')) await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); }).catch(() => {});
        break;
      case 'evaluate':
        await page.evaluate(a);
        break;
      case 'shot':
        await this.shot(s);
        break;
      case 'import':
        await this.importImage(s);
        break;
      case 'log':
        log('  ' + a);
        break;
    }
  }

  async runAll() {
    for (const s of STEPS) {
      if (s.only && s.only !== (this.video ? 'video' : 'shots')) continue;
      if (s.action === 'import' && this.video) continue;
      debug(`#${s.index} ${s.action} ${typeof s.arg === 'object' ? JSON.stringify(s.arg) : s.arg ?? ''}`);
      try {
        const lazy = ['goto', 'session', 'setDevice', 'log', 'import', 'shot', 'localStorage'].includes(s.action) || (s.action === 'wait' && typeof s.arg === 'number');
        if (!lazy) await this.restorePending();
        await this.step(s);
        if (!['shot', 'import', 'log', 'session', 'setDevice', 'localStorage', 'clearStorage', 'evaluate', 'wait'].includes(s.action)) await this.pace(s);
        else if (s.pause && this.video) await this.page.waitForTimeout(s.pause);
      } catch (err) {
        const msg = `step ${s.index} (${s.action}) failed: ${err.message.split('\n')[0]}`;
        if (s.optional || args.keepGoing) { console.warn('  warn: ' + msg); continue; }
        const dump = path.join(os.tmpdir(), `capture-${slug}-error.png`);
        await this.page.screenshot({ path: dump }).catch(() => {});
        throw new Error(`${msg}\n  page: ${this.page.url()}\n  screenshot: ${dump}`);
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------- passes
async function shotsPass(browser) {
  fs.mkdirSync(SCREENS_DIR, { recursive: true });
  for (const f of fs.readdirSync(SCREENS_DIR)) if (f.endsWith('.webp')) fs.rmSync(path.join(SCREENS_DIR, f));
  const r = new Runner(browser, { video: false });
  await r.open(r.device);
  try { await r.runAll(); } finally { await r.close(); }
  log(`screens: ${r.shots.length} written to ${path.relative(ARCHIVE, SCREENS_DIR)}`);
}

// The final walkthrough frame: the video device at 2x (phone: 780x1688).
function videoFrame() {
  const device = cfg.video?.device ?? 'phone';
  const dev = DEVICES[device];
  return { device, width: dev.width * 2, height: dev.height * 2 };
}

async function videoPass(browser) {
  const v = cfg.video ?? {};
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
  if (v.from) {
    const src = archivePath(v.from);
    const trimStart = v.trimStart === 'auto' || v.trimStart == null ? detectLeadingFreeze(src) : Number(v.trimStart);
    const res = encodeWalkthrough(src, { trimStart, speed: v.speed ?? 1, posterAt: typeof v.poster === 'number' ? v.poster : null, maxSeconds: v.maxSeconds, crop: v.crop });
    report(res, trimStart);
    return;
  }
  const r = new Runner(browser, { video: true });
  await r.open(cfg.device ?? 'phone');
  try {
    await r.runAll();
    await r.page.waitForTimeout(1200);
  } finally {
    await r.close();
  }
  if (!r.segments.length) throw new Error('nothing was recorded');

  // Join the recordings in order. Segments on the frame's device fill it; others are letterboxed.
  const frame = videoFrame();
  const bg = v.background ?? '0x1d1d1f';
  const inputs = [];
  const filters = [];
  let offset = 0;
  const marks = [];
  r.segments.forEach((seg, i) => {
    const trim = Math.max(0, (seg.firstContentAt - seg.startedAt) / 1000 - 0.15);
    const length = probeDuration(seg.file) - trim;
    for (const m of seg.marks) marks.push({ name: m.name, at: offset + (m.at - seg.startedAt) / 1000 - trim });
    offset += length;
    inputs.push('-ss', trim.toFixed(2), '-i', seg.file);
    filters.push(
      `[${i}:v]scale=${frame.width}:${frame.height}:force_original_aspect_ratio=decrease:flags=lanczos,` +
        `pad=${frame.width}:${frame.height}:(ow-iw)/2:(oh-ih)/2:color=${bg},setsar=1,fps=30,format=yuv420p[v${i}]`,
    );
  });
  const joined = path.join(r.videoDir, 'joined.mp4');
  const graph = `${filters.join(';')};${r.segments.map((_, i) => `[v${i}]`).join('')}concat=n=${r.segments.length}:v=1:a=0[out]`;
  run(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', ...inputs, '-filter_complex', graph, '-map', '[out]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '14', joined]);

  let posterAt = typeof v.poster === 'number' ? v.poster : null;
  const mark = typeof v.poster === 'string' ? marks.find((m) => m.name === v.poster) : marks[0];
  if (posterAt == null && mark) posterAt = mark.at + 0.8;
  const res = encodeWalkthrough(joined, { trimStart: 0, speed: v.speed ?? 1, posterAt, maxSeconds: v.maxSeconds });
  fs.rmSync(r.videoDir, { recursive: true, force: true });
  log(`video: ${r.segments.length} segment(s): ${r.segments.map((s) => s.device).join(', ')}`);
  report(res, 0);
}

function report(res, trimStart) {
  log(`video: walkthrough.mp4 ${res.duration.toFixed(1)}s, ${(res.bytes / 1024 / 1024).toFixed(1)} MB (crf ${res.crf}, speed ${res.speed.toFixed(2)}x, trimmed ${trimStart.toFixed(1)}s) + walkthrough.jpg`);
}

async function deckPass() {
  const deck = cfg.deck;
  if (!deck?.slides?.length) return;
  const dir = path.join(MEDIA_DIR, 'deck');
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) if (/^slide-\d+\.webp$/.test(f)) fs.rmSync(path.join(dir, f));
  let n = 0;
  for (const src of deck.slides) {
    n += 1;
    const file = path.join(dir, `slide-${String(n).padStart(2, '0')}.webp`);
    await sharp(archivePath(src)).resize({ width: 1920, withoutEnlargement: true }).webp({ quality: 80, effort: 5 }).toFile(file);
  }
  log(`deck: ${n} slides written to ${path.relative(ARCHIVE, dir)}`);
}

async function writeMediaYml() {
  const screens = plannedScreens().filter((p) => p.meta.caption);
  if (!screens.length) throw new Error('--media needs at least one shot or import with a caption');
  const cover = screens.find((p) => p.meta.cover) ?? screens[0];
  const media = {
    cover: cover.file,
    screens: screens.map((p) => ({
      file: p.file,
      caption: p.meta.caption,
      device: p.device ?? (p.step.action === 'shot' ? deviceAt(p.step) : 'phone'),
      ...(p.meta.stage ? { stage: p.meta.stage } : {}),
      ...(p.meta.role ? { role: p.meta.role } : {}),
    })),
  };
  if (fs.existsSync(path.join(MEDIA_DIR, 'walkthrough.mp4'))) {
    media.video = 'walkthrough.mp4';
    if (fs.existsSync(path.join(MEDIA_DIR, 'walkthrough.jpg'))) media.poster = 'walkthrough.jpg';
    if (cfg.video?.caption) media.videoCaption = cfg.video.caption;
  }
  if (cfg.deck?.slides?.length || cfg.deck?.pdf || cfg.deck?.html) {
    media.deck = {
      ...(cfg.deck.title ? { title: cfg.deck.title } : {}),
      slides: (cfg.deck.slides ?? []).map((_, i) => `deck/slide-${String(i + 1).padStart(2, '0')}.webp`),
      ...(cfg.deck.pdf ? { pdf: cfg.deck.pdf } : {}),
      ...(cfg.deck.html ? { html: cfg.deck.html } : {}),
    };
  }
  for (const s of media.screens) if (!fs.existsSync(path.join(MEDIA_DIR, s.file))) console.warn(`  warn: ${s.file} is listed but not on disk yet`);
  try {
    const { teamSchema } = await import(path.join(ROOT, 'tools', 'content-schema.mjs'));
    teamSchema.shape.media.parse(media);
  } catch (err) {
    if (err?.issues) throw new Error('media does not match teamSchema.media: ' + JSON.stringify(err.issues, null, 2));
    debug('schema check skipped:', err.message);
  }
  const file = path.join(TEAM_DIR, 'media.yml');
  fs.writeFileSync(file, '# Generated by tools/capture/capture.mjs --media from capture.yml. Edit captions there.\n' + YAML.stringify({ media }, { lineWidth: 0 }));
  log(`media.yml: ${media.screens.length} screens, cover ${media.cover}${media.video ? ', video' : ''}${media.deck ? `, deck (${media.deck.slides.length} slides)` : ''}`);
}

// The device in force at a shot step, following setDevice steps and earlier shot devices.
function deviceAt(step) {
  let device = cfg.device ?? 'phone';
  for (const s of STEPS) {
    if (s.only === 'video') continue;
    if (s.action === 'setDevice') device = s.arg;
    if (s.action === 'shot' && typeof s.arg === 'object' && s.arg.device) device = s.arg.device;
    if (s === step) break;
  }
  return device;
}

// ---------------------------------------------------------------------------------------------- main
const needsBrowser = STEPS.some((s) => s.action !== 'import' && s.action !== 'log');
const browser = needsBrowser && (!args.noShots || (args.video && !cfg.video?.from)) ? await chromium.launch({ headless: !args.headed }) : null;
try {
  log(`capture ${slug}${BASE ? ` from ${BASE}` : ''}`);
  if (!args.noShots) {
    if (browser) await shotsPass(browser);
    else {
      // Import-only configurations: no browser needed.
      fs.mkdirSync(SCREENS_DIR, { recursive: true });
      for (const f of fs.readdirSync(SCREENS_DIR)) if (f.endsWith('.webp')) fs.rmSync(path.join(SCREENS_DIR, f));
      const r = new Runner(null, { video: false });
      for (const s of STEPS) if (s.action === 'import' && s.only !== 'video') await r.importImage(s);
      log(`screens: ${r.shots.length} written to ${path.relative(ARCHIVE, SCREENS_DIR)}`);
    }
    await deckPass();
  }
  if (args.video) await videoPass(browser);
  if (args.media) await writeMediaYml();
} finally {
  await browser?.close();
}
