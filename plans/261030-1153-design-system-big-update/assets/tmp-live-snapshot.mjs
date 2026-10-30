/**
 * Live-app computed-style capture. Boots the REAL built app (dist/) behind a
 * static server, drives login exactly like the e2e suite, and dumps computed
 * styles for the classes that matter. This is the ground truth for
 * "no visual change", not a synthetic re-render.
 *
 *   node tmp-live-snapshot.mjs <distDir> <outLabel>
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'file:///C:/work-space/hr-blockbot/apps/web/test/helpers/browser-deps.mjs';

const root = 'C:/work-space/hr-blockbot/apps/web';
const distDir = process.argv[2] && process.argv[2].includes('/') ? process.argv[2] : path.join(root, 'dist');
const label = process.argv[3] ?? process.argv[2] ?? 'live';

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/' || p === '') p = '/index.html';
  const f = path.join(distDir, p);
  if (fs.existsSync(f) && fs.statSync(f).isFile()) {
    const ext = path.extname(f);
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
    res.writeHead(200, { 'Content-Type': types[ext] ?? 'application/octet-stream' });
    return fs.createReadStream(f).pipe(res);
  }
  const idx = path.join(distDir, 'index.html');
  if (fs.existsSync(idx)) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return fs.createReadStream(idx).pipe(res); }
  res.writeHead(404); res.end('nope');
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const PROBE = () => {
  const s = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const cs = getComputedStyle(el);
    return {
      backdropFilter: cs.backdropFilter,
      backgroundImage: cs.backgroundImage,
      backgroundColor: cs.backgroundColor,
      color: cs.color,
      borderRadius: cs.borderTopLeftRadius,
      boxShadow: cs.boxShadow,
      fontFamily: cs.fontFamily,
      fontSize: cs.fontSize,
      transform: cs.transform,
      borderTopColor: cs.borderTopColor,
      borderTopWidth: cs.borderTopWidth,
    };
  };
  return {
    html: { register: document.documentElement.dataset.register ?? null, cls: document.documentElement.className },
    sidebar: s('.crm-sidebar'),
    header: s('.crm-header-smooth'),
    kpi: s('.crm-kpi-card'),
    thead: s('.crm-table-head'),
    logoBox: s('.crm-sidebar .size-8.rounded-xl'),
    tableShell: s('.crm-table-shell'),
    icon: s('tbody tr[data-id] td:nth-child(2) > div'),
    kpiGrid: s('.crm-kpi-grid'),
    kpiTitle: s('.crm-kpi-title'),
    kpiValue: s('.crm-kpi-value'),
    branchIcon: s('.crm-branch-icon'),
    navItem: s('.crm-nav-item'),
    row: s('tbody tr[data-id]'),
    brandLabel: s('.crm-sidebar .tracking-wider.text-foreground, .crm-sidebar .tracking-tight.text-foreground'),
  };
};

const browser = await chromium.launch({ headless: true });
const out = {};
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  let activeUser = null;
  await page.route('**/api/auth/login', (route) => {
    const { username } = route.request().postDataJSON();
    activeUser = { id: 'u', role: username.startsWith('admin') ? 'Admin' : 'Employee', username, mustChangePassword: false };
    return route.fulfill({ status: 200, json: { accessToken: 't', user: activeUser } });
  });
  await page.route('**/api/auth/refresh', (r) => r.fulfill({ status: 200, json: { accessToken: activeUser ? 't' : null } }));
  await page.route('**/api/auth/me', (r) => r.fulfill({ status: 200, json: { userId: 'u', role: activeUser?.role ?? 'Employee', username: activeUser?.username ?? 'employee', mustChangePassword: false, skills: [] } }));
  await page.route('**/api/auth/logout', (r) => { activeUser = null; return r.fulfill({ status: 204 }); });
  await page.route('**/api/chat', (r) => r.fulfill({ status: 200, json: {} }));

  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  out.landing = await page.evaluate(PROBE);
  out.landingClasses = await page.evaluate(() => {
    const pick = ['.folio-preview', '.folio-preview section.bg-background', '.guta-card', '.crm-card', '.crm-pill', '.guta-container'];
    return Object.fromEntries(pick.map((sel) => {
      const el = document.querySelector(sel);
      if (!el) return [sel, null];
      const cs = getComputedStyle(el);
      return [sel, { bg: cs.backgroundColor, color: cs.color, radius: cs.borderTopLeftRadius, pad: cs.padding, font: cs.fontFamily, border: cs.borderTopColor }];
    }));
  });

  await page.getByRole('button', { name: /Get Started/i }).click();
  await page.getByRole('heading', { name: /Đăng nhập Guta Workspace/i }).waitFor({ timeout: 8000 });
  await page.getByLabel('Tên đăng nhập', { exact: true }).fill('employee');
  await page.getByLabel('Mật khẩu', { exact: true }).fill('fixture-password');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.getByRole('heading', { name: /Chào mừng HR-BlockBot AI Copilot/i }).waitFor({ timeout: 8000 });
  out.chat = await page.evaluate(PROBE);

  await page.getByRole('button', { name: 'Quay lại Vận Hành (CRM)', exact: true }).click();
  await page.getByRole('table').waitFor({ state: 'visible', timeout: 8000 });
  await page.waitForTimeout(500);
  out.crm = await page.evaluate(PROBE);
  out.errors = errors;

  await page.screenshot({ path: `C:/work-space/hr-blockbot/plans/261030-1153-design-system-big-update/assets/${label}-crm-1440.png` });
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `C:/work-space/hr-blockbot/plans/261030-1153-design-system-big-update/assets/${label}-landing-1440.png`, fullPage: false });
} finally {
  await browser.close();
  server.close();
}

const f = `C:/work-space/hr-blockbot/plans/261030-1153-design-system-big-update/assets/${label}.json`;
fs.writeFileSync(f, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out.crm, null, 1).slice(0, 3000));
console.log('errors:', out.errors);
console.log('wrote', f);
