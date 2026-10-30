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
await new Promise((r) => server.listen(5395, '127.0.0.1', r));

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' });
const p = await ctx.newPage();
p.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 400)));
p.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 200)); });
p.on('request', (r) => { if (r.url().includes('/api/')) console.log('REQ', r.method(), r.url()); });
p.on('response', (r) => { if (r.url().includes('/api/')) console.log('RES', r.status(), r.url()); });

await p.route('**/api/**', (route) => {
  const u = new URL(route.request().url());
  if (u.pathname === '/api/auth/login') return route.fulfill({ status: 200, json: { accessToken: 'qa-token', user: { id: 'qa', role: 'Admin', username: 'admin' } } });
  if (u.pathname === '/api/auth/refresh') return route.fulfill({ status: 200, json: { accessToken: 'qa-token' } });
  if (u.pathname === '/api/auth/me') return route.fulfill({ status: 401, json: { error: 'unauthenticated' } });
  if (u.pathname === '/api/auth/logout') return route.fulfill({ status: 204, body: '' });
  return route.fulfill({ status: 200, json: {} });
});

await p.goto('http://127.0.0.1:5395/', { waitUntil: 'networkidle' });
await p.waitForTimeout(2500);
console.log('splash', await p.getByTestId('guta-splash').count());
console.log('bodyLen', (await p.evaluate(() => document.body.innerText.length)));
console.log('loginLinks', JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('a[href="#login"]')].map((a) => {
  const r = a.getBoundingClientRect();
  const s = getComputedStyle(a);
  return { w: Math.round(r.width), h: Math.round(r.height), y: Math.round(r.y), display: s.display, vis: s.visibility };
}))));
await p.screenshot({ path: 'plans/261030-1153-design-system-big-update/assets/tmp-landing-debug2.png' });
await b.close();
server.close();
