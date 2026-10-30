import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const STATIC = 'C:/work-space/hr-blockbot/apps/web/dist';
const OUT = 'C:/work-space/hr-blockbot/plans/261030-1153-design-system-big-update/assets';
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
await new Promise((r) => s.listen(5341, '127.0.0.1', r));

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const log = [];
p.on('request', (r) => { if (r.url().includes('/api/')) log.push('REQ ' + r.method() + ' ' + r.url().replace('http://127.0.0.1:5341', '')); });
p.on('response', (r) => { if (r.url().includes('/api/')) log.push('RES ' + r.status() + ' ' + r.url().replace('http://127.0.0.1:5341', '')); });
p.on('pageerror', (e) => log.push('ERR ' + String(e).slice(0, 160)));

const user = { id: 'u1', role: 'Admin', username: 'admin', mustChangePassword: false };
await p.route('**/api/**', async (route) => {
  const u = new URL(route.request().url());
  if (u.pathname === '/api/auth/login') return route.fulfill({ status: 200, json: { accessToken: 't', user } });
  if (u.pathname === '/api/auth/refresh') return route.fulfill({ status: 200, json: { accessToken: 't' } });
  if (u.pathname === '/api/auth/me') return route.fulfill({ status: 200, json: { userId: 'u1', role: 'Admin', username: 'admin', mustChangePassword: false, skills: [] } });
  if (u.pathname === '/api/auth/logout') return route.fulfill({ status: 204, body: '' });
  return route.fulfill({ status: 200, json: {} });
});

await p.goto('http://127.0.0.1:5341/', { waitUntil: 'networkidle' });
await p.waitForTimeout(1500);
await p.locator('a[href="#login"]').first().click();
await p.waitForTimeout(600);
const modalVisible = await p.locator('#auth-modal').isVisible();
await p.getByLabel('Tên đăng nhập', { exact: true }).fill('admin');
await p.getByLabel('Mật khẩu', { exact: true }).fill('fixture-password');
await p.locator('#auth-modal button[type=submit]').click();
await p.waitForTimeout(3500);

const state = await p.evaluate(() => ({
  bodyText: document.body.innerText.replace(/\n+/g, ' | ').slice(0, 240),
  hasSidebar: !!document.querySelector('.crm-sidebar'),
  rows: document.querySelectorAll('tbody tr[data-id]').length,
  chatInput: !!document.querySelector('[placeholder*="Hỏi AI"]'),
}));
await p.screenshot({ path: `${OUT}/base-03-after-login.png` });

const crmBtn = p.getByRole('button', { name: /Quay lại Vận Hành/i }).first();
if (await crmBtn.count()) { await crmBtn.click(); await p.waitForTimeout(2000); }
await p.screenshot({ path: `${OUT}/base-04-crm.png` });

const crm = await p.evaluate(() => ({
  rows: document.querySelectorAll('tbody tr[data-id]').length,
  h1: [...document.querySelectorAll('h1')].map((h) => h.innerText.slice(0, 70)),
  kpis: [...document.querySelectorAll('.crm-kpi-card')].map((c) => c.innerText.replace(/\n/g, ' / ').slice(0, 60)),
  sidebarText: document.querySelector('.crm-sidebar')?.innerText.replace(/\n+/g, ' | ').slice(0, 160) ?? null,
}));

const row = p.locator('tbody tr[data-id]').first();
if (await row.count()) { await row.click(); await p.waitForTimeout(900); }
await p.screenshot({ path: `${OUT}/base-05-drawer.png` });

await p.setViewportSize({ width: 390, height: 844 });
await p.waitForTimeout(700);
await p.screenshot({ path: `${OUT}/base-06-crm-390.png` });

console.log(JSON.stringify({ modalVisible, state, crm, log }, null, 2));
await b.close();
s.close();
