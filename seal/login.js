// Login shell: derives the key from username + password, unwraps the site keys from keyring.json,
// hands them (non-extractable) to the vault service worker, then reloads into the decrypted site.
(function () {
  const root = document.documentElement;
  const BASE = root.dataset.base;
  const HOURS = Number(root.dataset.sessionHours) || 12;
  const form = document.getElementById('login');
  const msg = document.getElementById('msg');
  const go = document.getElementById('go');
  const enc = new TextEncoder();
  const say = (t, bad) => {
    msg.textContent = t;
    msg.className = bad ? 'msg msg--bad' : 'msg';
  };
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const hex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');

  if (!('serviceWorker' in navigator) || !window.crypto || !crypto.subtle || !window.indexedDB) {
    say('This browser cannot open the showcase (it needs service workers, which some private-browsing modes turn off). Try a normal window in Chrome, Edge, Safari or Firefox.', true);
    form.querySelectorAll('input, button').forEach((el) => (el.disabled = true));
    return;
  }

  const ready = navigator.serviceWorker.register(BASE + 'sw.js', { scope: BASE }).then(() => navigator.serviceWorker.ready);

  // Already signed in (e.g. a deep link answered by the host before the worker took over)? Go straight in.
  ready.then(async (reg) => {
    const status = await ask(reg.active, { type: 'status' });
    if (status && status.signedIn && status.build === root.dataset.build && !sessionStorage.getItem('vault-retry')) {
      sessionStorage.setItem('vault-retry', '1');
      location.reload();
    } else {
      sessionStorage.removeItem('vault-retry');
    }
  });

  function ask(worker, message) {
    return new Promise((resolve) => {
      if (!worker) return resolve(null);
      const ch = new MessageChannel();
      ch.port1.onmessage = (e) => resolve(e.data);
      worker.postMessage(message, [ch.port2]);
      setTimeout(() => resolve(null), 3000);
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = form.username.value.trim().toLowerCase();
    const password = form.password.value;
    if (!username || !password) return say('Enter your username and password.', true);
    go.disabled = true;
    say('Checking…');
    try {
      const ring = await (await fetch(BASE + 'keyring.json', { cache: 'no-cache' })).json();
      const id = hex(await crypto.subtle.digest('SHA-256', new Uint8Array([...unb64(ring.salt), ...enc.encode(username)])));
      const entry = ring.users.find((u) => u.id === id);
      const salt = entry ? unb64(entry.s) : crypto.getRandomValues(new Uint8Array(16)); // same work either way
      const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
      const kek = await crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ring.iter }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
      if (!entry) throw new Error('auth');
      const w = unb64(entry.w);
      let raw;
      try {
        raw = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: w.slice(0, 12), additionalData: enc.encode('keyring:' + ring.build) }, kek, w.slice(12)));
      } catch {
        throw new Error('auth');
      }
      const encKey = await crypto.subtle.importKey('raw', raw.slice(0, 32), { name: 'AES-GCM' }, false, ['decrypt']);
      const macKey = await crypto.subtle.importKey('raw', raw.slice(32, 64), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      raw.fill(0);
      const hours = document.getElementById('remember').checked ? 24 * 7 : HOURS;
      const reg = await ready;
      const ok = await ask(reg.active, { type: 'login', enc: encKey, mac: macKey, build: ring.build, exp: Date.now() + hours * 3600e3 });
      if (!ok) throw new Error('worker');
      say('Signed in. Opening the showcase…');
      sessionStorage.removeItem('vault-retry');
      location.replace(location.pathname + location.search + location.hash);
    } catch (err) {
      go.disabled = false;
      if (err.message === 'auth') say('That username and password do not match.', true);
      else say('Something went wrong opening the showcase. Refresh the page and try again.', true);
    }
  });
})();
