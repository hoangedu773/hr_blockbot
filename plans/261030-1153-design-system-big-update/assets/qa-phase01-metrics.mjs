// QA probe — Phase 01 acceptance measurements on the built CRM screen.
//
//   node plans/261030-1153-design-system-big-update/assets/qa-phase01-metrics.mjs [outDir]
//
// Writes screenshots (1440/768/390) plus report.json with every number the
// phase-01 acceptance table names. Exit 1 if any threshold is missed.

import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const STATIC = 'C:/work-space/hr-blockbot/apps/web/dist';
const OUT = process.argv[2] ?? 'C:/work-space/hr-blockbot/plans/261030-1153-design-system-big-update/assets/phase01';
fs.mkdirSync(OUT, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.json': 'application/json', '.woff2': 'font/woff2', '.webp': 'image/webp',
};

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(STATIC, p);
  if (fs.existsSync(f) && fs.statSync(f).isFile()) {
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] ?? 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  } else {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    fs.createReadStream(path.join(STATIC, 'index.html')).pipe(res);
  }
});
await new Promise((r) => server.listen(5393, '127.0.0.1', r));

const browser = await chromium.launch();
const user = { id: 'qa-user', role: 'Admin', username: 'admin', mustChangePassword: false };
const report = { viewports: {}, failures: [], errors: [] };

async function newPage(width, height, reducedMotion = 'no-preference') {
  const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => report.errors.push(`${width}x${height}: ${String(e).slice(0, 240)}`));
  p.on('console', (m) => { if (m.type() === 'error') report.errors.push(`${width}x${height} console: ${m.text().slice(0, 240)}`); });
  let loggedIn = false;
  await p.route('**/api/**', (route) => {
    const u = new URL(route.request().url());
    if (u.pathname === '/api/auth/login') { loggedIn = true; return route.fulfill({ status: 200, json: { accessToken: 'qa-token', user } }); }
    // Boot must land unauthenticated so the landing page renders; only a
    // post-login /me may resolve a session, otherwise the splash never clears.
    if (u.pathname === '/api/auth/refresh') return route.fulfill({ status: 200, json: { accessToken: loggedIn ? 'qa-token' : null } });
    if (u.pathname === '/api/auth/me') {
      if (!loggedIn) return route.fulfill({ status: 401, json: { error: 'unauthenticated' } });
      return route.fulfill({ status: 200, json: { userId: user.id, role: user.role, username: user.username, mustChangePassword: false, skills: [] } });
    }
    if (u.pathname === '/api/auth/logout') return route.fulfill({ status: 204, body: '' });
    if (u.pathname.startsWith('/api/stores')) {
      return route.fulfill({
        status: 200,
        json: {
          items: Array.from({ length: 10 }, (_, i) => ({
            id: `store-${i+1}`,
            code: `GT-CH-${String(i+1).padStart(2, '0')}`,
            name: `GUTA CAFE Chi Nhánh ${i+1}`,
            kind: 'outlet',
            district: 'Quận 1',
            status: 'ACTIVE',
            employeeCount: 45,
            activeEmployeeCount: 42,
            managerName: 'Nguyễn Văn Quản Lý',
          })),
          paging: { page: 1, limit: 10, totalItems: 45, totalPages: 5, hasNext: true, hasPrev: false },
        },
      });
    }
    if (u.pathname.startsWith('/api/dashboard/overview')) {
      return route.fulfill({
        status: 200,
        json: {
          stores: { total: 45, outlets: 45, groups: 0, support: 0 },
          employees: { total: 135, active: 130, inactive: 5 },
          revenue: { value: null, reason: 'Chưa có nguồn dữ liệu' },
          onTimeRate: { value: null, reason: 'Chưa có nguồn dữ liệu' },
        },
      });
    }
    return route.fulfill({ status: 200, json: {} });
  });
  return p;
}

async function login(p) {
  await p.getByTestId('guta-splash').waitFor({ state: 'detached', timeout: 20000 }).catch(() => {});
  if (await p.locator('.crm-table').count()) return;
  const entry = p.locator('a[href="#login"]').filter({ visible: true }).first();
  await entry.waitFor({ state: 'visible', timeout: 20000 });
  await entry.click({ timeout: 20000 });
  await p.waitForTimeout(300);
  await p.getByLabel('Tên đăng nhập', { exact: true }).fill('admin');
  await p.getByLabel('Mật khẩu', { exact: true }).fill('qa-password');
  await p.locator('#auth-modal button[type=submit]').click();
  await p.waitForTimeout(2800);
  const back = p.getByRole('button', { name: /Quay lại Vận Hành/i }).first();
  if (await back.count()) { await back.click(); await p.waitForTimeout(1600); }
  await p.getByRole('table').waitFor({ state: 'visible', timeout: 15000 });
  await p.waitForTimeout(300);
}

const measure = () => {
  const q = (s) => document.querySelector(s);
  const cs = (s, k) => (q(s) ? getComputedStyle(q(s))[k] : null);
  const all = [...document.querySelectorAll('*')];
  const shell = q('.crm-table-shell');
  const statusCell = q('tbody tr[data-id] td[data-col="status"]');

  const numericCells = [...document.querySelectorAll('tbody td[data-col="staff"], tbody td[data-col="revenue"], tbody td[data-col="ontime"]')];
  const tabular = numericCells.filter((td) => getComputedStyle(td).fontVariantNumeric.includes('tabular-nums'));

  const punctuality = [...document.querySelectorAll('tbody .crm-punctuality')].map((el) => ({
    pct: el.style.getPropertyValue('--pct'),
    barWidth: parseFloat(getComputedStyle(el, '::after').width),
    right: getComputedStyle(el, '::after').right,
    align: getComputedStyle(el).textAlign,
    font: getComputedStyle(el).fontFamily,
    numeric: getComputedStyle(el).fontVariantNumeric,
  }));

  const yellow = all.some((el) => {
    const c = getComputedStyle(el);
    return ['color', 'backgroundColor', 'borderColor', 'backgroundImage', 'boxShadow']
      .some((k) => /(?:255, 209, 0|234, 179, 8|245, 158, 11|253, 214, 99)/.test(c[k]));
  });

  const headerCells = [...document.querySelectorAll('.crm-table thead th')].map((th) => ({
    text: th.innerText.trim(),
    uppercase: getComputedStyle(th).textTransform,
    bg: getComputedStyle(th).backgroundColor,
    borderBottom: getComputedStyle(th).borderBottomWidth,
    height: Math.round(th.getBoundingClientRect().height),
  }));

  const identityCol = q('.crm-table thead th:nth-child(1)');
  const tableRect = q('.crm-table')?.getBoundingClientRect();

  return {
    rows: document.querySelectorAll('tbody tr[data-id]').length,
    columns: document.querySelectorAll('.crm-table thead th').length,
    shellScrollWidth: shell?.scrollWidth ?? null,
    shellClientWidth: shell?.clientWidth ?? null,
    shellScrollsX: shell ? shell.scrollWidth > shell.clientWidth : null,
    tableWidth: tableRect ? Math.round(tableRect.width) : null,
    identityWidth: identityCol ? Math.round(identityCol.getBoundingClientRect().width) : null,
    identityShare: identityCol && tableRect ? +(identityCol.getBoundingClientRect().width / tableRect.width).toFixed(3) : null,
    statusRight: statusCell ? Math.round(statusCell.getBoundingClientRect().right) : null,
    statusVisible: statusCell ? statusCell.getBoundingClientRect().right <= window.innerWidth : null,
    kpiBackgroundImage: cs('.crm-kpi-card', 'backgroundImage'),
    kpiBackdrop: cs('.crm-kpi-card', 'backdropFilter'),
    kpiRadius: cs('.crm-kpi-card', 'borderRadius'),
    kpiGap: cs('.crm-kpi-grid', 'gap'),
    kpiCols: cs('.crm-kpi-grid', 'gridTemplateColumns'),
    kpiLabelTransform: cs('.crm-kpi-title', 'textTransform'),
    kpiLabelSize: cs('.crm-kpi-title', 'fontSize'),
    kpiLeadSize: cs('.crm-kpi-value--lead', 'fontSize'),
    kpiValueSize: cs('.crm-kpi-value', 'fontSize'),
    kpiDeltaSize: cs('.crm-kpi-meta', 'fontSize'),
    kpiDeltaBad: cs('.crm-kpi-meta--bad', 'color'),
    kpiDeltaGood: cs('.crm-kpi-meta', 'color'),
    sidebarBackdrop: cs('.crm-sidebar', 'backdropFilter'),
    sidebarBg: cs('.crm-sidebar', 'backgroundColor'),
    headerBackdrop: cs('.crm-header-smooth', 'backdropFilter'),
    headerBg: cs('.crm-header-smooth', 'backgroundColor'),
    headerHeight: cs('.crm-header-smooth', 'height'),
    sidebarWidth: Math.round(q('.crm-sidebar')?.getBoundingClientRect().width ?? 0),
    logoBoxBg: cs('.crm-brand-mark', 'backgroundColor'),
    logoFilter: cs('.crm-brand-mark img', 'filter'),
    navActiveBg: cs('.crm-nav-item[aria-current="page"]', 'backgroundColor'),
    navActiveColor: cs('.crm-nav-item[aria-current="page"]', 'color'),
    navIdleColor: cs('.crm-nav-item:not([aria-current="page"])', 'color'),
    navRuleWidth: getComputedStyle(q('.crm-nav-item[aria-current="page"]'), '::before').width,
    navRuleColor: getComputedStyle(q('.crm-nav-item[aria-current="page"]'), '::before').backgroundColor,
    tabularPct: numericCells.length ? Math.round((tabular.length / numericCells.length) * 100) : null,
    numericCells: numericCells.length,
    // `transition-property`'s initial value is `all`; only a non-zero duration
    // makes it an actual blanket transition.
    transitionAll: all.filter((el) => {
      const s = getComputedStyle(el);
      return s.transitionProperty === 'all' && s.transitionDuration.split(',').some((d) => parseFloat(d) > 0);
    }).length,
    punctuality,
    punctualityMinBar: punctuality.length ? Math.min(...punctuality.map((p) => p.barWidth)) : null,
    punctualityAllBars: punctuality.every((p) => p.barWidth > 0),
    rowHeights: [...new Set([...document.querySelectorAll('tbody tr[data-id]')].map((r) => Math.round(r.getBoundingClientRect().height)))],
    headerCells,
    statusPill: statusCell ? {
      height: Math.round(statusCell.querySelector('.crm-status').getBoundingClientRect().height),
      bg: getComputedStyle(statusCell.querySelector('.crm-status')).backgroundColor,
      color: getComputedStyle(statusCell.querySelector('.crm-status')).color,
      marks: statusCell.querySelectorAll('.crm-status').length,
    } : null,
    branchIcons: document.querySelectorAll('.crm-branch-icon').length,
    moneySamples: [...document.querySelectorAll('tbody td[data-col="revenue"]')].slice(0, 2).map((td) => ({
      text: td.innerText.trim(),
      align: getComputedStyle(td).textAlign,
      unitSize: td.querySelector('.crm-money-unit') ? getComputedStyle(td.querySelector('.crm-money-unit')).fontSize : null,
      unitColor: td.querySelector('.crm-money-unit') ? getComputedStyle(td.querySelector('.crm-money-unit')).color : null,
    })),
    docScrollWidth: document.documentElement.scrollWidth,
    docClientWidth: document.documentElement.clientWidth,
    docNoOverflow: document.documentElement.scrollWidth === document.documentElement.clientWidth,
    yellow,
  };
};

const VIEWPORTS = [
  { name: '1440', width: 1440, height: 900 },
  { name: '768', width: 768, height: 1024 },
  { name: '390', width: 390, height: 844 },
];

for (const vp of VIEWPORTS) {
  // Authenticate at desktop width: the landing header collapses its login
  // entry behind a menu below 1024, which is not the surface under test.
  const p = await newPage(1440, 900);
  await p.goto('http://127.0.0.1:5393/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1400);
  await login(p);
  await p.setViewportSize({ width: vp.width, height: vp.height });
  await p.waitForTimeout(400);
  await p.screenshot({ path: path.join(OUT, `crm-${vp.name}.png`), fullPage: false });
  const metrics = await p.evaluate(measure);
  report.viewports[vp.name] = metrics;

  // Row hover: ring, not fill.
  const row = p.locator('tbody tr[data-id]').first();
  const before = await row.evaluate((el) => ({ bg: getComputedStyle(el).backgroundColor, shadow: getComputedStyle(el).boxShadow }));
  await row.hover();
  await p.waitForTimeout(220);
  const after = await row.evaluate((el) => ({ bg: getComputedStyle(el).backgroundColor, shadow: getComputedStyle(el).boxShadow }));
  report.viewports[vp.name].rowHover = { before, after, fillUnchanged: before.bg === after.bg };

  // Drawer: focus, duration, backdrop.
  await row.click();
  await p.waitForTimeout(320);
  report.viewports[vp.name].drawer = await p.evaluate(() => {
    const d = document.querySelector('#detail-drawer');
    const b = document.querySelector('#drawer-backdrop');
    const ds = getComputedStyle(d);
    return {
      open: d.classList.contains('drawer-open'),
      transform: ds.transform,
      transitionProperty: ds.transitionProperty,
      transitionDuration: ds.transitionDuration,
      transitionTiming: ds.transitionTimingFunction,
      backdropFilter: ds.backdropFilter,
      background: ds.backgroundColor,
      backdropBg: getComputedStyle(b).backgroundColor,
      backdropFilterB: getComputedStyle(b).backdropFilter,
      backdropOpacity: getComputedStyle(b).opacity,
      focused: document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.tagName,
      focusedInsideDrawer: d.contains(document.activeElement),
    };
  });
  await p.screenshot({ path: path.join(OUT, `drawer-${vp.name}.png`), fullPage: false });

  // Focus trap cycle + restore.
  report.viewports[vp.name].focus = await p.evaluate(async () => {
    const drawer = document.querySelector('#detail-drawer');
    const focusables = [...drawer.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter((el) => el.offsetParent !== null);
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    first.focus();
    const started = document.activeElement === first;
    last.focus();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    const wrapped = document.activeElement === first;
    return { count: focusables.length, started, wrapped };
  });
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);
  report.viewports[vp.name].afterClose = await p.evaluate(() => ({
    open: document.querySelector('#detail-drawer').classList.contains('drawer-open'),
    focusRestoredToRow: document.activeElement?.matches('tbody tr[data-id]') ?? false,
    focusTag: document.activeElement?.tagName,
  }));

  await p.context().close();
}

// Touch viewport: hover rules must not apply.
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, hasTouch: true, isMobile: false });
  const p = await ctx.newPage();
  await p.route('**/api/**', (route) => {
    const u = new URL(route.request().url());
    if (u.pathname === '/api/auth/login') return route.fulfill({ status: 200, json: { accessToken: 'qa-token', user } });
    if (u.pathname === '/api/auth/refresh') return route.fulfill({ status: 200, json: { accessToken: 'qa-token' } });
    if (u.pathname === '/api/auth/me') return route.fulfill({ status: 200, json: { userId: user.id, role: user.role, username: user.username, mustChangePassword: false, skills: [] } });
    return route.fulfill({ status: 200, json: {} });
  });
  await p.goto('http://127.0.0.1:5393/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1200);
  await login(p);
  report.touchHover = await p.evaluate(() => ({
    hoverNone: matchMedia('(hover: none)').matches,
    rowShadow: getComputedStyle(document.querySelector('tbody tr[data-id]')).boxShadow,
  }));
  await ctx.close();
}

// Reduced motion: no transforms introduced by hover.
{
  const p = await newPage(1440, 900, 'reduce');
  await p.goto('http://127.0.0.1:5393/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1200);
  await login(p);
  report.reducedMotion = await p.evaluate(() => ({
    kpiTransform: getComputedStyle(document.querySelector('.crm-kpi-card')).transform,
    rowTransition: getComputedStyle(document.querySelector('tbody tr[data-id]')).transitionDuration,
  }));
  await p.context().close();
}

await browser.close();
server.close();

// ---- thresholds ---------------------------------------------------
const v1440 = report.viewports['1440'];
const v390 = report.viewports['390'];
const checks = [
  ['shell scrollWidth === clientWidth @1440', v1440.shellScrollWidth === v1440.shellClientWidth],
  ['status column right <= innerWidth @1440', v1440.statusVisible === true],
  ['kpi backgroundImage === none', v1440.kpiBackgroundImage === 'none'],
  ['sidebar backdropFilter === none', v1440.sidebarBackdrop === 'none'],
  ['numeric cells tabular-nums 100%', v1440.tabularPct === 100],
  ['elements with transitionProperty "all" === 0', v1440.transitionAll === 0],
  ['punctuality ::after width > 0 for every row', v1440.punctualityAllBars === true],
  ['documentElement scrollWidth === clientWidth @390', v390.docNoOverflow === true],
  ['yellowCount === 0', v1440.yellow === false],
  ['columns <= 8', v1440.columns <= 8],
  ['identity column is widest', v1440.identityShare >= 0.3],
  ['row height 42px', v1440.rowHeights.length === 1 && v1440.rowHeights[0] === 42],
  ['header not uppercase, no fill band', v1440.headerCells.every((h) => h.uppercase === 'none' && h.bg === 'rgba(0, 0, 0, 0)')],
  ['no branch icon blocks', v1440.branchIcons === 0],
  ['hover does not change row fill', v1440.rowHover.fillUnchanged === true],
  ['hover draws inset ring', /inset/.test(v1440.rowHover.after.shadow)],
  ['drawer open transform is identity', v1440.drawer.transform === 'none' || v1440.drawer.transform === 'matrix(1, 0, 0, 1, 0, 0)'],
  ['drawer transition only transform', v1440.drawer.transitionProperty === 'transform'],
  ['drawer focus inside on open', v1440.drawer.focusedInsideDrawer === true],
  ['focus trap wraps last -> first', v1440.focus.wrapped === true],
  ['focus restored to row on close', v1440.afterClose.focusRestoredToRow === true],
  ['status pill 20px, one mark', v1440.statusPill.height === 20 && v1440.statusPill.marks === 1],
  ['logo box has no tint', v1440.logoBoxBg === 'rgba(0, 0, 0, 0)' || v1440.logoBoxBg === 'transparent'],
  ['nav active has no fill', v1440.navActiveBg === 'rgba(0, 0, 0, 0)'],
  ['nav active accent rule is 1px', v1440.navRuleWidth === '1px'],
  ['touch: no hover fill', report.touchHover.rowShadow === 'none'],
];

for (const [name, ok] of checks) if (!ok) report.failures.push(name);
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));

console.log(JSON.stringify({ checks, failures: report.failures, errors: report.errors }, null, 2));
process.exit(report.failures.length ? 1 : 0);
