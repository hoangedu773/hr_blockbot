import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const DIST = 'C:/work-space/hr-blockbot/apps/web/dist';
const OUT = 'C:/work-space/hr-blockbot/plans/261030-1153-design-system-big-update/assets';
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.jpg': 'image/jpeg' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(DIST, p);
  if (fs.existsSync(f) && fs.statSync(f).isFile()) {
    res.writeHead(200, { 'Content-Type': mime[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  } else {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    fs.createReadStream(path.join(DIST, 'index.html')).pipe(res);
  }
});
await new Promise((r) => server.listen(5321, '127.0.0.1', r));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));

const user = { id: 'u1', role: 'Admin', username: 'admin', mustChangePassword: false };
await page.route('**/api/auth/login', (r) => r.fulfill({ status: 200, json: { accessToken: 't', user } }));
await page.route('**/api/auth/refresh', (r) => r.fulfill({ status: 200, json: { accessToken: 't' } }));
await page.route('**/api/auth/me', (r) => r.fulfill({ status: 200, json: { userId: 'u1', role: 'Admin', username: 'admin', mustChangePassword: false, skills: [] } }));
await page.route('**/api/**', (r) => r.fulfill({ status: 200, json: {} }));

await page.goto('http://127.0.0.1:5321/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1800);

await page.locator('a[href="#login"]').first().click();
await page.waitForTimeout(500);
await page.getByLabel('Tên đăng nhập', { exact: true }).fill('admin');
await page.getByLabel('Mật khẩu', { exact: true }).fill('fixture-password');
await page.locator('#auth-modal button[type=submit]').first().click();
await page.waitForTimeout(3000);
await page.screenshot({ path: `${OUT}/base-03-after-login.png` });

const shell = await page.evaluate(() => ({
  h1: [...document.querySelectorAll('h1')].map((h) => h.innerText.slice(0, 70)),
  hasSidebar: !!document.querySelector('.crm-sidebar'),
  rows: document.querySelectorAll('tbody tr[data-id]').length,
  kpis: [...document.querySelectorAll('.crm-kpi-card')].map((c) => c.innerText.replace(/\n/g, ' / ').slice(0, 70)),
  text: document.body.innerText.replace(/\n+/g, ' | ').slice(0, 260),
}));

const backCrm = page.getByRole('button', { name: /Quay lại Vận Hành/i }).first();
if (await backCrm.count()) { await backCrm.click(); await page.waitForTimeout(2000); }
await page.screenshot({ path: `${OUT}/base-04-crm.png` });

const crm = await page.evaluate(() => ({
  rows: document.querySelectorAll('tbody tr[data-id]').length,
  h1: [...document.querySelectorAll('h1')].map((h) => h.innerText.slice(0, 70)),
  text: document.body.innerText.replace(/\n+/g, ' | ').slice(0, 300),
}));

// drawer open
const firstRow = page.locator('tbody tr[data-id]').first();
if (await firstRow.count()) { await firstRow.click(); await page.waitForTimeout(900); }
await page.screenshot({ path: `${OUT}/base-05-drawer.png` });
const drawer = await page.evaluate(() => {
  const d = document.querySelector('#detail-drawer');
  return d ? { visible: getComputedStyle(d).display !== 'none', text: d.innerText.replace(/\n+/g, ' | ').slice(0, 200) } : null;
});

console.log(JSON.stringify({ shell, crm, drawer, errors }, null, 2));
await browser.close();
server.close();
