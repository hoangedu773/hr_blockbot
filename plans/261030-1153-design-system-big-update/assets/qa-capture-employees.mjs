// QA tool — Phase 00 gate. Captures the Employees surface, which is the only
// live view that consumes the broken `--surface` alias (EmployeeListView.tsx:69,
// :108). Reached by clicking the "Nhân sự" nav item, so it is user-reachable.
//
//   node plans/261030-1153-design-system-big-update/assets/qa-capture-employees.mjs

import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const STATIC = path.join('C:/work-space/hr-blockbot/apps/web', 'd' + 'ist');
const OUT = path.join(
  'C:/work-space/hr-blockbot/plans/261030-1153-design-system-big-update/assets/qa-gate'
);
fs.mkdirSync(OUT, { recursive: true });

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.json': 'application/json',
};

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(STATIC, p);
  if (fs.existsSync(f) && fs.statSync(f).isFile()) {
    res.writeHead(200, { 'Content-Type': mime[path.extname(f)] ?? 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  } else {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    fs.createReadStream(path.join(STATIC, 'index.html')).pipe(res);
  }
});
await new Promise((r) => server.listen(5393, '127.0.0.1', r));

const user = { id: 'qa-user', role: 'Admin', username: 'admin', mustChangePassword: false };
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));

await page.route('**/api/**', (route) => {
  const u = new URL(route.request().url());
  if (u.pathname === '/api/auth/login')
    return route.fulfill({ status: 200, json: { accessToken: 'qa-token', user } });
  if (u.pathname === '/api/auth/refresh')
    return route.fulfill({ status: 200, json: { accessToken: 'qa-token' } });
  if (u.pathname === '/api/auth/me')
    return route.fulfill({
      status: 200,
      json: {
        userId: user.id,
        role: user.role,
        username: user.username,
        mustChangePassword: false,
        skills: [],
      },
    });
  if (u.pathname === '/api/auth/logout') return route.fulfill({ status: 204, body: '' });
  if (u.pathname.includes('employee'))
    return route.fulfill({
      status: 200,
      json: { items: [], total: 0 },
    });
  return route.fulfill({ status: 200, json: {} });
});

await page.goto('http://127.0.0.1:5393/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.locator('a[href="#login"]').first().click({ timeout: 15000 });
await page.waitForTimeout(500);
await page.getByLabel('Tên đăng nhập', { exact: true }).fill('admin');
await page.getByLabel('Mật khẩu', { exact: true }).fill('qa-password');
await page.locator('#auth-modal button[type=submit]').click();
await page.waitForTimeout(3500);

const back = page.getByRole('button', { name: /Quay lại Vận Hành/i }).first();
if (await back.count()) {
  await back.click();
  await page.waitForTimeout(1500);
}

await page.locator('[data-section="employees"]').first().click({ timeout: 15000 });
await page.waitForTimeout(1800);
await page.screenshot({ path: path.join(OUT, 'employees-1440.png') });

// Measure the controls that carry `background: var(--surface)` /
// `var(--surface-card)` (EmployeeListView.tsx:69, :82). React writes them as
// inline style properties, not a literal `style` attribute string.
const measured = await page.evaluate(() => {
  const rows = [];
  for (const el of document.querySelectorAll('input, button')) {
    const bg = el.style.background || el.style.backgroundColor || '';
    if (!bg.includes('var(--surface')) continue;
    rows.push({
      tag: el.tagName.toLowerCase(),
      declared: bg,
      computedBg: getComputedStyle(el).backgroundColor,
      label: el.placeholder || el.innerText.slice(0, 30),
    });
  }
  return rows;
});

console.log(`controls whose inline style references var(--surface*): ${measured.length}`);
for (const m of measured) {
  console.log(`  <${m.tag}> "${m.label}"`);
  console.log(`    declared: ${m.declared}`);
  console.log(`    computed: ${m.computedBg}`);
}

const transparent = measured.filter((m) => m.computedBg === 'rgba(0, 0, 0, 0)');
console.log(`\ntransparent (declaration dropped): ${transparent.length} of ${measured.length}`);
console.log(`page errors: ${errors.length}${errors.length ? ' -> ' + errors.join(' | ') : ''}`);
console.log(`screenshot: ${path.join(OUT, 'employees-1440.png')}`);

await browser.close();
server.close();
process.exit(transparent.length ? 1 : 0);
