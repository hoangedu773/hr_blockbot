// QA capture — chụp 4 bề mặt × 3 viewport từ dist đã build.
// Dùng cho Gate 3 (Phase 05) và để so sánh trước/sau Phase 00.
//
//   node plans/261030-1153-design-system-big-update/assets/qa-capture.mjs <outDir>
//
// Yêu cầu: `pnpm --filter web build` đã chạy.

import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const STATIC = 'C:/work-space/hr-blockbot/apps/web/dist';
const OUT = process.argv[2] ?? 'C:/work-space/hr-blockbot/plans/261030-1153-design-system-big-update/assets/qa';
fs.mkdirSync(OUT, { recursive: true });

const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.json': 'application/json', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.webp': 'image/webp',
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
await new Promise((r) => server.listen(5391, '127.0.0.1', r));

const browser = await chromium.launch();
const user = { id: 'qa-user', role: 'Admin', username: 'admin', mustChangePassword: false };
const report = { surfaces: {}, errors: [] };

async function newPage(width, height, reducedMotion = 'no-preference') {
  const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => report.errors.push(`${width}x${height}: ${String(e).slice(0, 200)}`));
  p.on('console', (m) => { if (m.type() === 'error') report.errors.push(`${width}x${height} console: ${m.text().slice(0, 200)}`); });
  await p.route('**/api/**', (route) => {
    const u = new URL(route.request().url());
    if (u.pathname === '/api/auth/login') return route.fulfill({ status: 200, json: { accessToken: 'qa-token', user } });
    if (u.pathname === '/api/auth/refresh') return route.fulfill({ status: 200, json: { accessToken: 'qa-token' } });
    if (u.pathname === '/api/auth/me') return route.fulfill({ status: 200, json: { userId: user.id, role: user.role, username: user.username, mustChangePassword: false, skills: [] } });
    if (u.pathname === '/api/auth/logout') return route.fulfill({ status: 204, body: '' });
    return route.fulfill({ status: 200, json: {} });
  });
  return p;
}

async function login(p) {
  await p.locator('a[href="#login"]').first().click({ timeout: 15000 });
  await p.waitForTimeout(400);
  await p.getByLabel('Tên đăng nhập', { exact: true }).fill('admin');
  await p.getByLabel('Mật khẩu', { exact: true }).fill('qa-password');
  await p.locator('#auth-modal button[type=submit]').click();
  await p.waitForTimeout(3200);
  const back = p.getByRole('button', { name: /Quay lại Vận Hành/i }).first();
  if (await back.count()) { await back.click(); await p.waitForTimeout(2000); }
}

const VIEWPORTS = [
  { name: '1440', width: 1440, height: 900 },
  { name: '768', width: 768, height: 1024 },
  { name: '390', width: 390, height: 844 },
];

for (const vp of VIEWPORTS) {
  // Landing
  const lp = await newPage(vp.width, vp.height);
  await lp.goto('http://127.0.0.1:5391/', { waitUntil: 'networkidle' });
  await lp.waitForTimeout(2200);
  await lp.screenshot({ path: path.join(OUT, `landing-${vp.name}.png`), fullPage: false });
  const landingMetrics = await lp.evaluate(() => ({
    h1: [...document.querySelectorAll('h1')].map((h) => h.innerText.slice(0, 80)),
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
    bodyLen: document.body.innerText.length,
    fonts: [...new Set([...document.querySelectorAll('*')].slice(0, 400).map((e) => getComputedStyle(e).fontFamily))].slice(0, 6),
  }));
  report.surfaces[`landing-${vp.name}`] = landingMetrics;

  // Auth modal
  await lp.locator('a[href="#login"]').first().click();
  await lp.waitForTimeout(700);
  await lp.screenshot({ path: path.join(OUT, `auth-${vp.name}.png`), fullPage: false });
  await lp.context().close();

  // CRM
  const cp = await newPage(vp.width, vp.height);
  await cp.goto('http://127.0.0.1:5391/', { waitUntil: 'networkidle' });
  await cp.waitForTimeout(1500);
  await login(cp);
  await cp.screenshot({ path: path.join(OUT, `crm-${vp.name}.png`), fullPage: false });

  const crmMetrics = await cp.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const cs = (s, k) => (q(s) ? getComputedStyle(q(s))[k] : null);
    const all = [...document.querySelectorAll('*')];
    const yellow = all.some((el) => {
      const c = getComputedStyle(el);
      return ['color', 'backgroundColor', 'borderColor', 'backgroundImage', 'boxShadow']
        .some((k) => /(?:255, 209, 0|234, 179, 8|245, 158, 11|253, 214, 99)/.test(c[k]));
    });
    const numericCells = [...document.querySelectorAll('tbody td')].filter((td) => /\d/.test(td.innerText) && td.innerText.length < 40);
    const tabular = numericCells.filter((td) => getComputedStyle(td).fontVariantNumeric.includes('tabular-nums')).length;
    const transitionAll = all.filter((el) => getComputedStyle(el).transitionProperty === 'all').length;
    return {
      rows: document.querySelectorAll('tbody tr[data-id]').length,
      h1: [...document.querySelectorAll('h1')].map((h) => h.innerText.slice(0, 80)),
      yellow,
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
      tabularPct: numericCells.length ? Math.round((tabular / numericCells.length) * 100) : null,
      numericCells: numericCells.length,
      transitionAll,
      sidebarBlur: cs('.crm-sidebar', 'backdropFilter'),
      kpiBlur: cs('.crm-kpi-card', 'backdropFilter'),
      kpiGradient: cs('.crm-kpi-card', 'backgroundImage'),
      bodyText: document.body.innerText.replace(/\n+/g, ' | ').slice(0, 200),
    };
  });
  report.surfaces[`crm-${vp.name}`] = crmMetrics;

  // Drawer
  const row = cp.locator('tbody tr[data-id]').first();
  if (await row.count()) { await row.click(); await cp.waitForTimeout(900); }
  await cp.screenshot({ path: path.join(OUT, `drawer-${vp.name}.png`), fullPage: false });

  // Reduced motion check
  await cp.emulateMedia({ reducedMotion: 'reduce' });
  await cp.waitForTimeout(300);
  const reduced = await cp.evaluate(() => {
    const bad = [...document.querySelectorAll('.crm-kpi-card, .nav-item, button')]
      .filter((el) => getComputedStyle(el).transform !== 'none').length;
    return { elementsWithTransform: bad };
  });
  report.surfaces[`reduced-motion-${vp.name}`] = reduced;
  await cp.context().close();
}

fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
server.close();
