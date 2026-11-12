#!/usr/bin/env node
// Seals the built site (dist/) into an encrypted vault for public static hosting (site/).
//
// Every file in dist/ becomes site/vault/<hmac(path)>.bin = IV(12) ‖ AES-256-GCM(header ‖ body, aad = path).
// A content key + HMAC path key (stable across deploys when SHOWCASE_SITE_KEY is set) are wrapped once per user in site/keyring.json
// under a PBKDF2-SHA256 key derived from that user's password. Only a login shell and the service worker
// (seal/) are published in plaintext; the service worker decrypts vault files in the browser after login.
//
//   SHOWCASE_USERS="alice:correct horse battery staple\nbob:another long passphrase" node tools/seal.mjs
//
// Lines are "username:password"; blank lines and lines starting with # are ignored.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const SITE = path.join(ROOT, 'site');
const SHELL = path.join(ROOT, 'seal');
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'showcase.config.json'), 'utf8'));
const BASE = config.base;
const ITER = config.pbkdf2Iterations ?? 600000;

const die = (m) => {
  console.error(`seal: ${m}`);
  process.exit(1);
};

// ---- users -----------------------------------------------------------------------------
const raw = process.env.SHOWCASE_USERS ?? '';
const users = raw
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'))
  .map((l) => {
    const i = l.indexOf(':');
    if (i < 1) die('each SHOWCASE_USERS line must be "username:password"');
    return { username: l.slice(0, i).trim().toLowerCase(), password: l.slice(i + 1) };
  });
if (!users.length) die('SHOWCASE_USERS is empty: set at least one "username:password" line');
for (const u of users) {
  if (!/^[a-z0-9._@-]{2,64}$/.test(u.username)) die(`username "${u.username}" must be 2–64 chars of a-z 0-9 . _ @ -`);
  if (u.password.length < 8) die(`password for "${u.username}" is shorter than 8 characters`);
  if (u.password.length < 14) console.warn(`seal: warning: password for "${u.username}" is short; prefer a 4+ word passphrase`);
}
if (new Set(users.map((u) => u.username)).size !== users.length) die('duplicate usernames in SHOWCASE_USERS');
if (!fs.existsSync(path.join(DIST, 'index.html'))) die('dist/index.html not found: run `npm run build` first');

// ---- keys ------------------------------------------------------------------------------
// With SHOWCASE_SITE_KEY set (CI), the content keys are derived from it plus the user list, so they stay the same
// from one deploy to the next and a redeploy doesn't sign anyone out. Changing the user list (or the site key)
// rotates them, which is how a removed user loses access. Without it (local runs), every seal gets random keys.
const siteKey = process.env.SHOWCASE_SITE_KEY?.trim() ? Buffer.from(process.env.SHOWCASE_SITE_KEY.trim(), 'base64') : null;
if (siteKey && siteKey.length < 32) die('SHOWCASE_SITE_KEY must be 32+ random bytes, base64 (openssl rand -base64 32)');
const userSalt = crypto.createHash('sha256').update(users.map((u) => `${u.username}:${u.password}`).sort().join('\n')).digest();
const derive = (info) => Buffer.from(crypto.hkdfSync('sha256', siteKey, userSalt, info, 32));
const encKey = siteKey ? derive('showcase content key') : crypto.randomBytes(32);
const macKey = siteKey ? derive('showcase path key') : crypto.randomBytes(32);
const keyId = crypto.createHmac('sha256', macKey).update('key id').digest('hex').slice(0, 16);
const siteSalt = crypto.randomBytes(16);
const build = `${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}-${crypto.randomBytes(4).toString('hex')}`;
const b64 = (b) => Buffer.from(b).toString('base64');
const vaultName = (rel) => crypto.createHmac('sha256', macKey).update(rel, 'utf8').digest('hex').slice(0, 32);

function gcm(key, plaintext, aad) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  c.setAAD(Buffer.from(aad, 'utf8'));
  return Buffer.concat([iv, c.update(plaintext), c.final(), c.getAuthTag()]);
}

const MIME = {
  html: 'text/html; charset=utf-8', htm: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8', json: 'application/json; charset=utf-8', webmanifest: 'application/manifest+json', map: 'application/json',
  txt: 'text/plain; charset=utf-8', md: 'text/plain; charset=utf-8', xml: 'application/xml', svg: 'image/svg+xml', png: 'image/png',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', ico: 'image/x-icon',
  mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', wav: 'audio/wav', pdf: 'application/pdf', woff: 'font/woff', woff2: 'font/woff2',
  ttf: 'font/ttf', otf: 'font/otf', wasm: 'application/wasm',
};
const mimeOf = (f) => MIME[path.extname(f).slice(1).toLowerCase()] ?? 'application/octet-stream';

function* walk(dir, rel = '') {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) yield* walk(path.join(dir, e.name), r);
    else if (e.isFile()) yield r;
  }
}

// ---- seal ------------------------------------------------------------------------------
fs.rmSync(SITE, { recursive: true, force: true });
fs.mkdirSync(path.join(SITE, 'vault'), { recursive: true });
let count = 0;
let bytes = 0;
const names = new Set();
for (const rel of walk(DIST)) {
  if (rel === '.DS_Store' || rel.endsWith('/.DS_Store')) continue;
  const body = fs.readFileSync(path.join(DIST, rel));
  const header = Buffer.from(JSON.stringify({ t: mimeOf(rel) }), 'utf8');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(header.length);
  const name = vaultName(rel);
  if (names.has(name)) die(`vault name collision for ${rel}`);
  names.add(name);
  const sealed = gcm(encKey, Buffer.concat([len, header, body]), rel);
  fs.writeFileSync(path.join(SITE, 'vault', `${name}.bin`), sealed);
  count += 1;
  bytes += sealed.length;
  if (sealed.length > 95 * 1024 * 1024) die(`${rel} is over GitHub Pages' 100 MB per-file limit`);
}

const keyring = {
  v: 1,
  build,
  keyId,
  iter: ITER,
  salt: b64(siteSalt),
  users: users
    .map(({ username, password }) => {
      const s = crypto.randomBytes(16);
      const kek = crypto.pbkdf2Sync(password, s, ITER, 32, 'sha256');
      return {
        id: crypto.createHash('sha256').update(Buffer.concat([siteSalt, Buffer.from(username, 'utf8')])).digest('hex'),
        s: b64(s),
        w: b64(gcm(kek, Buffer.concat([encKey, macKey]), `keyring:${build}`)),
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id)),
};
fs.writeFileSync(path.join(SITE, 'keyring.json'), JSON.stringify(keyring));

// ---- public shell ------------------------------------------------------------------------
const fill = (s) => s.replaceAll('%BASE%', BASE).replaceAll('%BUILD%', build).replaceAll('%KEYID%', keyId).replaceAll('%SESSION_HOURS%', String(config.sessionHours ?? 12));
const shellHtml = fill(fs.readFileSync(path.join(SHELL, 'index.html'), 'utf8'));
fs.writeFileSync(path.join(SITE, 'index.html'), shellHtml);
fs.writeFileSync(path.join(SITE, '404.html'), shellHtml);
fs.writeFileSync(path.join(SITE, 'sw.js'), fill(fs.readFileSync(path.join(SHELL, 'sw.js'), 'utf8')));
fs.mkdirSync(path.join(SITE, '_shell'));
for (const f of ['login.css', 'login.js']) fs.writeFileSync(path.join(SITE, '_shell', f), fill(fs.readFileSync(path.join(SHELL, f), 'utf8')));
fs.copyFileSync(path.join(ROOT, 'public', 'mw_launchpad.png'), path.join(SITE, '_shell', 'logo.png'));
fs.writeFileSync(path.join(SITE, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
fs.writeFileSync(path.join(SITE, '.nojekyll'), '');

// ---- leak guard ----------------------------------------------------------------------------
const ALLOWED = /^(index\.html|404\.html|sw\.js|keyring\.json|robots\.txt|\.nojekyll|_shell\/(login\.css|login\.js|logo\.png)|vault\/[0-9a-f]{32}\.bin)$/;
const content = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/generated/content.json'), 'utf8'));
const sentinels = [
  ...content.teams.flatMap((t) => [t.name, t.product, t.tagline, ...t.members.map((m) => m.name)]),
  ...content.teams.flatMap((t) => t.highlights.map((h) => h.title)),
]
  .filter((s) => s && s.length >= 5)
  .map((s) => s.toLowerCase());
for (const rel of walk(SITE)) {
  if (!ALLOWED.test(rel)) die(`leak guard: unexpected plaintext file site/${rel}`);
  if (rel.startsWith('vault/') || rel.endsWith('.png')) continue;
  const text = fs.readFileSync(path.join(SITE, rel), 'utf8').toLowerCase();
  const hit = sentinels.find((s) => text.includes(s));
  if (hit) die(`leak guard: site/${rel} contains team content ("${hit}")`);
}

// ---- self-test: decrypt index.html the way the browser will ---------------------------------
{
  const sealed = fs.readFileSync(path.join(SITE, 'vault', `${vaultName('index.html')}.bin`));
  const d = crypto.createDecipheriv('aes-256-gcm', encKey, sealed.subarray(0, 12));
  d.setAAD(Buffer.from('index.html'));
  d.setAuthTag(sealed.subarray(sealed.length - 16));
  const pt = Buffer.concat([d.update(sealed.subarray(12, sealed.length - 16)), d.final()]);
  const n = pt.readUInt32BE(0);
  if (!pt.subarray(4 + n).toString('utf8').includes('<div id="root">')) die('self-test failed');
}

console.log(`seal: ${count} files sealed (${(bytes / 1e6).toFixed(1)} MB), ${users.length} user(s), build ${build}, keys ${keyId}${siteKey ? '' : ' (random: no SHOWCASE_SITE_KEY)'} → ${path.relative(ROOT, SITE)}/`);
