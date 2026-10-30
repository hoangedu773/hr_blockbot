import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const STATIC = path.join('C:/work-space/hr-blockbot/apps/web', 'd' + 'ist');
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(STATIC, p);
  if (fs.existsSync(f) && fs.statSync(f).isFile()) {
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] ?? 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  } else {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    fs.createReadStream(path.join(STATIC, 'index.html')).pipe(res);
  }
});
await new Promise((r) => server.listen(5394, '127.0.0.1', r));

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
p.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 300)));
await p.route('**/api/**', (r) => r.fulfill({ status: 200, json: {} }));
await p.goto('http://127.0.0.1:5394/', { waitUntil: 'networkidle' });
await p.waitForTimeout(2500);
const info = await p.evaluate(() => [...document.querySelectorAll('a[href="#login"]')].map((a) => {
  const r = a.getBoundingClientRect();
  const s = getComputedStyle(a);
  let clipped = null;
  let n = a;
  while (n && n !== document.body) {
    const cs = getComputedStyle(n);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') { clipped = n.tagName + '.' + String(n.className).slice(0, 60); break; }
    n = n.parentElement;
  }
  return { text: a.innerText.trim().slice(0, 20), w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y), display: s.display, visibility: s.visibility, opacity: s.opacity, clipped };
}));
console.log(JSON.stringify(info, null, 1));
await p.screenshot({ path: 'plans/261030-1153-design-system-big-update/assets/tmp-landing-debug.png' });
await b.close();
server.close();
