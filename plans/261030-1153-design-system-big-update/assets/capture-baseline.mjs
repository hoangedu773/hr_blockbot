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
await new Promise((r) => server.listen(5311, '127.0.0.1', r));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));

await page.route('**/api/auth/login', (r) => r.fulfill({ status: 200, json: { accessToken: 't', user: { id: 'u1', role: 'Admin', username: 'admin', mustChangePassword: false } } }));
await page.route('**/api/auth/refresh', (r) => r.fulfill({ status: 200, json: { accessToken: 't' } }));
await page.route('**/api/auth/me', (r) => r.fulfill({ status: 200, json: { userId: 'u1', role: 'Admin', username: 'admin', mustChangePassword: false, skills: [] } }));
await page.route('**/api/**', (r) => r.fulfill({ status: 200, json: {} }));

await page.goto('http://127.0.0.1:5311/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);
await page.screenshot({ path: `${OUT}/base-01-landing.png` });

const openBtn = page.getByRole('button', { name: /Đăng nhập|Get Started|Xem dashboard/i }).first();
await openBtn.click({ timeout: 5000 }).catch(() => {});
await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT}/base-02-authmodal.png` });

const inputs = await page.evaluate(() => [...document.querySelectorAll('input')].map((i) => ({ name: i.name, ph: i.placeholder, type: i.type })));
const buttons = await page.evaluate(() => [...document.querySelectorAll('button')].map((b) => b.innerText.trim()).filter(Boolean).slice(0, 14));

await page.fill('input[name="username"], input[placeholder*="mã"], input[placeholder*="tài khoản"]', 'admin').catch(() => {});
await page.fill('input[type="password"]', 'fixture-password').catch(() => {});
await page.keyboard.press('Enter');
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/base-03-after-login.png` });

const shell = await page.evaluate(() => ({
  h1: [...document.querySelectorAll('h1')].map((h) => h.innerText.slice(0, 60)),
  sidebar: !!document.querySelector('.crm-sidebar'),
  rows: document.querySelectorAll('tbody tr[data-id]').length,
  text: document.body.innerText.slice(0, 200),
}));

const crmBtn = page.getByRole('button', { name: /Quay lại Vận Hành|CRM/i }).first();
await crmBtn.click({ timeout: 4000 }).catch(() => {});
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/base-04-crm.png` });

const crmInfo = await page.evaluate(() => ({
  rows: document.querySelectorAll('tbody tr[data-id]').length,
  kpis: [...document.querySelectorAll('.crm-kpi-card')].map((c) => c.innerText.replace(/\n/g, ' | ').slice(0, 80)),
  title: document.querySelector('h1')?.innerText ?? null,
}));

console.log(JSON.stringify({ inputs, buttons, shell, crmInfo, errors }, null, 2));
await browser.close();
server.close();
