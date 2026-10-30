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
await new Promise((r) => s.listen(5351, '127.0.0.1', r));

const b = await chromium.launch();
const user = { id: 'u1', role: 'Admin', username: 'admin', mustChangePassword: false };

async function makePage(width, height) {
  const p = await b.newPage({ viewport: { width, height } });
  await p.route('**/api/**', async (route) => {
    const u = new URL(route.request().url());
    if (u.pathname === '/api/auth/login') return route.fulfill({ status: 200, json: { accessToken: 't', user } });
    if (u.pathname === '/api/auth/refresh') return route.fulfill({ status: 200, json: { accessToken: 't' } });
    if (u.pathname === '/api/auth/me') return route.fulfill({ status: 200, json: { userId: 'u1', role: 'Admin', username: 'admin', mustChangePassword: false, skills: [] } });
    return route.fulfill({ status: 200, json: {} });
  });
  await p.goto('http://127.0.0.1:5351/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1200);
  await p.locator('a[href="#login"]').first().click();
  await p.waitForTimeout(400);
  await p.getByLabel('Tên đăng nhập', { exact: true }).fill('admin');
  await p.getByLabel('Mật khẩu', { exact: true }).fill('fixture-password');
  await p.locator('#auth-modal button[type=submit]').click();
  await p.waitForTimeout(3000);
  const crmBtn = p.getByRole('button', { name: /Quay lại Vận Hành/i }).first();
  if (await crmBtn.count()) { await crmBtn.click(); await p.waitForTimeout(1800); }
  return p;
}

const desktop = await makePage(1440, 900);
await desktop.screenshot({ path: `${OUT}/base-crm-1440.png` });
const tablet = await makePage(768, 1024);
await tablet.screenshot({ path: `${OUT}/base-crm-768.png` });
const mobile = await makePage(390, 844);
await mobile.screenshot({ path: `${OUT}/base-crm-390.png` });
const m = await mobile.evaluate(() => ({
  scrollW: document.documentElement.scrollWidth,
  clientW: document.documentElement.clientWidth,
  overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  sidebarW: document.querySelector('.crm-sidebar')?.getBoundingClientRect().width ?? 0,
  tableW: document.querySelector('.crm-table-shell')?.getBoundingClientRect().width ?? 0,
  bodyText: document.body.innerText.replace(/\n+/g, ' | ').slice(0, 160),
}));

console.log(JSON.stringify(m, null, 2));
await b.close();
s.close();
