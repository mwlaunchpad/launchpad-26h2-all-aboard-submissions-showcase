/* Vault service worker. Published in plaintext; holds no secrets.
 * After sign-in the login shell hands it two non-extractable CryptoKeys (AES-GCM content key, HMAC path key).
 * It then serves every same-origin request under BASE by fetching vault/<hmac(path)>.bin and decrypting it.
 * Signed out (or keys that no longer match keyring.json) → navigations get the login shell, everything else 401.
 * Keys normally stay the same across deploys, so a redeploy doesn't sign anyone out; HTML is always revalidated.
 */
const BASE = '%BASE%';
const DB_NAME = 'showcase-vault';
const PASSTHROUGH = /^(sw\.js|keyring\.json|robots\.txt|_shell\/.*|vault\/.*)$/;
const enc = new TextEncoder();

let keys; // { enc: CryptoKey, mac: CryptoKey, kid: string, exp: number } | null
let lastKeyCheck = 0;
let seenBuild = null;
const mem = new Map(); // rel -> { mime, body }  (small LRU for media, so video seeks don't re-decrypt)
let memBytes = 0;
const MEM_LIMIT = 160 * 1024 * 1024;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

// ---------- key storage (IndexedDB keeps CryptoKeys across worker restarts) ----------
function db() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function idb(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction('kv', mode);
    const req = fn(tx.objectStore('kv'));
    tx.oncomplete = () => resolve(req && req.result);
    tx.onerror = () => reject(tx.error);
  });
}
async function getKeys() {
  if (keys === undefined) {
    try {
      keys = (await idb('readonly', (s) => s.get('keys'))) || null;
    } catch {
      keys = null;
    }
  }
  if (keys && Date.now() > keys.exp) await clearKeys();
  return keys;
}
async function setKeys(k) {
  keys = k;
  await idb('readwrite', (s) => s.put(k, 'keys'));
}
async function clearKeys() {
  keys = null;
  mem.clear();
  memBytes = 0;
  try {
    await idb('readwrite', (s) => s.delete('keys'));
  } catch {}
}

self.addEventListener('message', (e) => {
  const reply = (m) => e.ports[0] && e.ports[0].postMessage(m);
  const d = e.data || {};
  if (d.type === 'login') e.waitUntil(setKeys({ enc: d.enc, mac: d.mac, kid: d.kid, exp: d.exp }).then(() => reply({ ok: true })));
  else if (d.type === 'logout') e.waitUntil(clearKeys().then(() => reply({ ok: true })));
  else if (d.type === 'status') e.waitUntil(getKeys().then((k) => reply({ signedIn: Boolean(k), kid: k ? k.kid : null })));
});

// ---------- vault ----------
const hex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');

async function readVault(rel, k) {
  const hit = mem.get(rel);
  if (hit) {
    mem.delete(rel);
    mem.set(rel, hit);
    return hit;
  }
  const name = hex(await crypto.subtle.sign('HMAC', k.mac, enc.encode(rel))).slice(0, 32);
  // HTML is revalidated every time so a new deploy never pairs an old page with assets that are gone.
  const res = await fetch(`${BASE}vault/${name}.bin`, rel.endsWith('.html') ? { cache: 'no-cache' } : undefined);
  if (!res.ok) return null;
  const buf = await res.arrayBuffer();
  let pt;
  try {
    pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf.slice(0, 12), additionalData: enc.encode(rel) }, k.enc, buf.slice(12));
  } catch {
    return 'stale'; // keys no longer match this deploy
  }
  const n = new DataView(pt).getUint32(0);
  const head = JSON.parse(new TextDecoder().decode(pt.slice(4, 4 + n)));
  const out = { mime: head.t, body: pt.slice(4 + n) };
  if (/^(video|audio)\//.test(out.mime) || out.body.byteLength > 2e6) {
    mem.set(rel, out);
    memBytes += out.body.byteLength;
    while (memBytes > MEM_LIMIT && mem.size > 1) {
      const [oldest, v] = mem.entries().next().value;
      mem.delete(oldest);
      memBytes -= v.body.byteLength;
    }
  }
  return out;
}

function candidates(rel, nav) {
  const demo = rel.match(/^demos\/[^/]+\//);
  const hasExt = /\.[a-z0-9]{1,8}$/i.test(rel.split('/').pop());
  const list = [];
  if (rel === '' || rel.endsWith('/')) list.push(`${rel}index.html`);
  else if (hasExt) list.push(rel);
  else list.push(rel, `${rel}/index.html`, `${rel}.html`);
  if (nav) list.push(demo ? `${demo[0]}index.html` : 'index.html');
  return [...new Set(list)];
}

function respond(file, req) {
  const total = file.body.byteLength;
  const headers = { 'Content-Type': file.mime, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' };
  const range = req.headers.get('range');
  const m = range && range.match(/bytes=(\d*)-(\d*)/);
  if (m && (m[1] || m[2])) {
    let start = m[1] ? Number(m[1]) : total - Number(m[2]);
    let end = m[1] && m[2] ? Number(m[2]) : total - 1;
    start = Math.max(0, start);
    end = Math.min(end, total - 1);
    if (start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${total}` } });
    return new Response(file.body.slice(start, end + 1), {
      status: 206,
      headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${total}`, 'Content-Length': String(end - start + 1) },
    });
  }
  return new Response(req.method === 'HEAD' ? null : file.body, { status: 200, headers: { ...headers, 'Content-Length': String(total) } });
}

const shell = () => fetch(BASE, { cache: 'no-cache' }).then((r) => new Response(r.body, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }));

async function keysAreCurrent(k) {
  if (Date.now() - lastKeyCheck < 60000) return true;
  try {
    const ring = await (await fetch(`${BASE}keyring.json`, { cache: 'no-cache' })).json();
    lastKeyCheck = Date.now();
    if (seenBuild && ring.build !== seenBuild) {
      mem.clear(); // new deploy: drop decrypted media so replaced files are re-read
      memBytes = 0;
    }
    seenBuild = ring.build;
    return (ring.keyId || ring.build) === k.kid;
  } catch {
    return true; // offline: keep going with what we have
  }
}

async function handle(req, rel) {
  const nav = req.mode === 'navigate';
  let k = await getKeys();
  if (k && nav && !(await keysAreCurrent(k))) {
    await clearKeys();
    k = null;
  }
  if (!k) return nav ? shell() : new Response('Sign in required', { status: 401 });
  if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('Not available in the archived showcase', { status: 404 });
  for (const c of candidates(rel, nav)) {
    const file = await readVault(c, k);
    if (file === 'stale') {
      await clearKeys();
      return nav ? shell() : new Response('Session expired', { status: 401 });
    }
    if (file) return respond(file, req);
  }
  return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain' } });
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;
  let rel;
  try {
    rel = decodeURIComponent(url.pathname.slice(BASE.length));
  } catch {
    return;
  }
  if (PASSTHROUGH.test(rel)) return;
  e.respondWith(handle(e.request, rel));
});
