import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'C:/work-space/hr-blockbot/apps/web';
const STATIC = path.join(ROOT, 'dist');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.jpg': 'image/jpeg' };

const s = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(STATIC, p);
  if (fs.existsSync(f) && fs.statSync(f).isFile()) {
    r.writeHead(200, { 'Content-Type': mime[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(r);
  } else {
    r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    fs.createReadStream(path.join(STATIC, 'index.html')).pipe(r);
  }
});
await new Promise((r) => s.listen(5331, '127.0.0.1', r));

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs = [];
p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
p.on('console', (m) => { if (m.type() === 'error') errs.push('c:' + m.text().slice(0, 160)); });

await p.goto('http://127.0.0.1:5331/', { waitUntil: 'networkidle' });
await p.waitForTimeout(2500);

const info = await p.evaluate(() => ({
  buttons: [...document.querySelectorAll('button')].map((x) => x.innerText.trim()).filter(Boolean),
  links: [...document.querySelectorAll('a')].map((x) => x.innerText.trim()).filter(Boolean).slice(0, 12),
  bodyLen: document.body.innerText.length,
  rootLen: document.getElementById('root')?.innerHTML.length ?? 0,
}));

console.log(JSON.stringify({ info, errs }, null, 2));
await b.close();
s.close();
