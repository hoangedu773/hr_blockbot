/**
 * Theme contract checks. Run from apps/web after `pnpm --filter web build`:
 *
 *   node scripts/verify-theme.mjs
 *
 * Asserts what a screenshot cannot: that the toggle exists in both shells, that
 * switching repaints the surfaces, that text clears 4.5:1 in light mode, that
 * the choice survives a reload, and that a choice made on the landing carries
 * into the signed-in shell.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const dist = path.resolve('di' + 'st');
const shots = path.resolve('..', '..', '.taste-skill', 'inspect');
fs.mkdirSync(shots, { recursive: true });

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const p = req.url.split('?')[0];
  const f = path.join(dist, p === '/' ? 'index.html' : p);
  const t = fs.existsSync(f) && fs.statSync(f).isFile() ? f : path.join(dist, 'index.html');
  res.writeHead(200, { 'Content-Type': MIME[path.extname(t)] || 'application/octet-stream' });
  fs.createReadStream(t).pipe(res);
});

const STORES = [
  { id: 's1', code: 'GT-CH-01', name: 'GUTA CAFE - Tân Bình', kind: 'outlet', district: 'Tân Bình', managerName: 'Nguyễn Thị Phương Anh', employeeCount: 46, activeEmployeeCount: 44, status: 'ACTIVE' },
];
const OVERVIEW = {
  stores: { outlets: 1, groups: 0, support: 0 },
  employees: { total: 46, active: 44, inactive: 2 },
  profileCompletionRate: { value: 92.4, reason: null, source: 'employees', asOf: '2026-10-29' },
  managersCovered: { value: 66.7, reason: null, source: 'employees', asOf: '2026-10-29' },
  employeesPerOutlet: { value: 46, reason: null, source: 'employees', asOf: '2026-10-29' },
  revenue: { value: null, reason: 'Chưa có nguồn', source: 'none', asOf: null },
  onTimeRate: { value: null, reason: 'Chưa có nguồn', source: 'none', asOf: null },
  latestScheduleDate: '2026-10-29',
  generatedAt: '2026-10-30T03:00:00.000Z',
};

const stub = async (page) => {
  const json = (r, b) => r.fulfill({ status: 200, json: b });
  await page.route('**/api/auth/login', (r) => json(r, { accessToken: 't', user: { id: 'u', role: 'Employee', username: 'employee', mustChangePassword: false } }));
  await page.route('**/api/auth/refresh', (r) => json(r, { accessToken: 't' }));
  await page.route('**/api/auth/me', (r) => json(r, { userId: 'u', role: 'Employee', username: 'employee', mustChangePassword: false, skills: [] }));
  await page.route('**/api/stores**', (r) => json(r, { items: STORES, paging: { page: 1, limit: 20, totalItems: 1, totalPages: 1, hasNext: false, hasPrev: false }, summary: { totalOutlets: 1, totalGroups: 0 } }));
  await page.route('**/api/dashboard/overview', (r) => json(r, OVERVIEW));
  await page.route('**/api/chat', (r) => json(r, { reply: 'ok' }));
};

const signIn = async (page, origin) => {
  await page.goto(origin, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Get Started/i }).click();
  await page.getByLabel('Tên đăng nhập', { exact: true }).fill('employee');
  await page.getByLabel('Mật khẩu', { exact: true }).fill('fixture-password');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.getByRole('table').waitFor({ state: 'visible' });
  await page.waitForTimeout(500);
};

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  ${detail ?? ''}`);
};

// contrast helper inside the page
const CONTRAST_FN = `(fg, bg) => {
  const parse = (c) => {
    const m = c.match(/rgba?\\(([^)]+)\\)/);
    if (!m) return null;
    const p = m[1].split(',').map((n) => parseFloat(n));
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const lum = ({ r, g, b }) => {
    const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const F = parse(fg), B = parse(bg);
  if (!F || !B) return null;
  const a = lum(F), b = lum(B);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}`;

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await stub(page);
  await signIn(page, origin);

  // 1. toggle exists in CRM
  const crmToggle = await page.evaluate(() => {
    const t = document.querySelector('#crm-theme-portal .theme-toggle');
    return t ? { buttons: t.querySelectorAll('button').length, visible: t.getBoundingClientRect().height > 0 } : null;
  });
  check('CRM has a theme toggle with two states', crmToggle && crmToggle.buttons === 2 && crmToggle.visible, JSON.stringify(crmToggle));

  // 2. switching to light repaints the shell
  const before = await page.evaluate(() => getComputedStyle(document.querySelector('.crm-main')).backgroundColor);
  await page.getByRole('button', { name: 'Chế độ sáng' }).click();
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => ({
    html: document.documentElement.className,
    main: getComputedStyle(document.querySelector('.crm-main')).backgroundColor,
    sidebar: getComputedStyle(document.querySelector('.crm-sidebar')).backgroundColor,
    text: getComputedStyle(document.querySelector('.crm-breadcrumb-current')).color,
    stored: localStorage.getItem('guta-theme'),
  }));
  check(
    'light switch repaints shell and persists',
    /light/.test(after.html) && after.main !== before && after.stored === 'light',
    JSON.stringify({ before, ...after }),
  );

  // 3. contrast of key text pairs in light mode
  const contrast = await page.evaluate(`(() => {
    const cr = ${CONTRAST_FN};
    const pairs = [
      ['.crm-breadcrumb-current', '.crm-header-smooth'],
      ['.crm-nav-item', '.crm-sidebar'],
      ['.crm-brand-name', '.crm-sidebar'],
      ['.crm-user-scope', '.crm-sidebar'],
    ];
    return pairs.map(([fgSel, bgSel]) => {
      const fgEl = document.querySelector(fgSel);
      const bgEl = document.querySelector(bgSel);
      if (!fgEl || !bgEl) return { fgSel, missing: true };
      const ratio = cr(getComputedStyle(fgEl).color, getComputedStyle(bgEl).backgroundColor);
      return { fgSel, ratio: ratio ? Number(ratio.toFixed(2)) : null };
    });
  })()`);
  const bad = contrast.filter((c) => !c.missing && (c.ratio === null || c.ratio < 4.5));
  check('light mode text meets 4.5:1', bad.length === 0, JSON.stringify(contrast));

  await page.screenshot({ path: path.join(shots, 'theme-crm-light.png') });

  // 4. persists across reload and into chat
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const afterReload = await page.evaluate(() => ({
    html: document.documentElement.className,
    stored: localStorage.getItem('guta-theme'),
  }));
  check('theme survives reload', /light/.test(afterReload.html) && afterReload.stored === 'light', JSON.stringify(afterReload));

  await page.locator('nav a.crm-copilot').click();
  await page.getByTestId('chat-page').waitFor();
  await page.waitForTimeout(400);
  const chat = await page.evaluate(() => ({
    toggle: !!document.querySelector('.guta-chat .theme-toggle'),
    bg: getComputedStyle(document.querySelector('.guta-chat')).backgroundColor,
    text: getComputedStyle(document.querySelector('.guta-chat-header-title strong')).color,
    scheme: getComputedStyle(document.querySelector('.guta-chat')).colorScheme,
  }));
  check('chat follows the same theme', chat.toggle && chat.scheme === 'light' && chat.bg === 'rgb(255, 255, 255)', JSON.stringify(chat));
  await page.screenshot({ path: path.join(shots, 'theme-chat-light.png') });

  // 5. back to dark from chat, and it propagates
  await page.locator('.guta-chat .theme-toggle button[aria-label="Chế độ tối"]').click();
  await page.waitForTimeout(400);
  const backDark = await page.evaluate(() => ({
    html: document.documentElement.className,
    stored: localStorage.getItem('guta-theme'),
    chatBg: getComputedStyle(document.querySelector('.guta-chat')).backgroundColor,
  }));
  check('switching back to dark from chat works', !/light/.test(backDark.html) && backDark.stored === 'dark' && backDark.chatBg === 'rgb(23, 23, 23)', JSON.stringify(backDark));

  await page.close();

  // 6. landing choice carries into the shell
  const p2 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await stub(p2);
  await p2.goto(origin, { waitUntil: 'networkidle' });
  await p2.getByRole('button', { name: 'Light theme' }).click();
  await p2.waitForTimeout(300);
  const landingStored = await p2.evaluate(() => localStorage.getItem('guta-theme'));
  await p2.getByRole('button', { name: /Get Started/i }).click();
  await p2.getByLabel('Tên đăng nhập', { exact: true }).fill('employee');
  await p2.getByLabel('Mật khẩu', { exact: true }).fill('fixture-password');
  await p2.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await p2.getByRole('table').waitFor({ state: 'visible' });
  await p2.waitForTimeout(500);
  const shell = await p2.evaluate(() => ({
    html: document.documentElement.className,
    main: getComputedStyle(document.querySelector('.crm-main')).backgroundColor,
  }));
  check(
    'landing choice carries into the signed-in shell',
    landingStored === 'light' && /light/.test(shell.html) && shell.main !== 'rgb(8, 9, 11)',
    JSON.stringify({ landingStored, ...shell }),
  );
  await p2.close();
} finally {
  await browser.close();
  server.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
