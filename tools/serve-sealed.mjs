#!/usr/bin/env node
// Serves site/ the way GitHub Pages will: under the configured base path, with 404.html for misses.
//   node tools/serve-sealed.mjs [--port 4321]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.join(ROOT, 'site');
const { base } = JSON.parse(fs.readFileSync(path.join(ROOT, 'showcase.config.json'), 'utf8'));
const port = Number(process.argv[process.argv.indexOf('--port') + 1]) || 4321;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.txt': 'text/plain', '.bin': 'application/octet-stream' };

http
  .createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (!url.pathname.startsWith(base)) {
      res.writeHead(302, { Location: base });
      return res.end();
    }
    let p = path.join(SITE, decodeURIComponent(url.pathname.slice(base.length)));
    if (!p.startsWith(SITE)) return res.writeHead(400).end();
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
    try {
      if (!fs.existsSync(p)) {
        const notFound = fs.readFileSync(path.join(SITE, '404.html'));
        res.writeHead(404, { 'Content-Type': TYPES['.html'] });
        return res.end(notFound);
      }
      const body = fs.readFileSync(p);
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] ?? 'application/octet-stream', 'Cache-Control': 'max-age=600' });
      res.end(body);
    } catch {
      res.writeHead(503).end('site/ is being rebuilt'); // e.g. `npm run seal` ran while serving
    }
  })
  .listen(port, () => console.log(`sealed site: http://localhost:${port}${base}`));
