/**
 * Final measurement pass for the UI/UX changes. Prints machine-checkable facts
 * (geometry, computed colour, asset choice) instead of relying on screenshots.
 * Run: node scripts/verify-ui.mjs   (needs a prior `pnpm --filter web build`)
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(webRoot, 'dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.json': 'application/json',
};

const STORES = [
  { id: 's1', code: 'GT-CH-01', name: 'GUTA CAFE - Tân Bình', kind: 'outlet', district: 'Tân Bình', managerName: 'Nguyễn Thị Phương Anh', employeeCount: 46, activeEmployeeCount: 44, status: 'ACTIVE' },
  { id: 's2', code: 'GT-CH-02', name: 'GUTA CAFE - Quận 10', kind: 'outlet', district: 'Quận 10', managerName: 'Đỗ Quỳnh Anh', employeeCount: 56, activeEmployeeCount: 51, status: 'ACTIVE' },
];

const OVERVIEW = {
  stores: { outlets: 2, groups: 0, support: 0 },
  employees: { total: 102, active: 95, inactive: 7 },
  profileCompletionRate: { value: 92.4, reason: null, source: 'employees', asOf: '2026-10-29' },
  managersCovered: { value: 66.7, reason: null, source: 'employees', asOf: '2026-10-29' },
  employeesPerOutlet: { value: 48.3, reason: null, source: 'employees', asOf: '2026-10-29' },
  revenue: { value: null, reason: 'Chưa có nguồn', source: 'none', asOf: null },
  onTimeRate: { value: null, reason: 'Chưa có nguồn', source: 'none', asOf: null },
  latestScheduleDate: '2026-10-29',
  generatedAt: '2026-10-30T03:00:00.000Z',
};

const serve = () => new Promise((resolve) => {
  const server = http.createServer((req, res) => {
    const urlPath = req.url.split('?')[0];
    const file = path.join(dist, urlPath === '/' ? 'index.html' : urlPath);
    const target = fs.existsSync(file) && fs.statSync(file).isFile() ? file : path.join(dist, 'index.html');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(target)] ?? 'application/octet-stream' });
    fs.createReadStream(target).pipe(res);
  });
  server.listen(0, '127.0.0.1', () => resolve({ server, origin: `http://127.0.0.1:${server.address().port}` }));
});

const stubApi = async (page) => {
  const json = (route, body) => route.fulfill({ status: 200, json: body });
  await page.route('**/api/auth/login', (route) => json(route, {
    accessToken: 'fixture-token',
    user: { id: 'u', role: 'Employee', username: 'employee', mustChangePassword: false },
  }));
  await page.route('**/api/auth/refresh', (route) => json(route, { accessToken: 'fixture-token' }));
  await page.route('**/api/auth/me', (route) => json(route, {
    userId: 'u', role: 'Employee', username: 'employee', mustChangePassword: false, skills: [],
  }));
  await page.route('**/api/stores**', (route) => json(route, {
    items: STORES,
    paging: { page: 1, limit: 20, totalItems: STORES.length, totalPages: 1, hasNext: false, hasPrev: false },
    summary: { totalOutlets: 2, totalGroups: 0 },
  }));
  await page.route('**/api/dashboard/overview', (route) => json(route, OVERVIEW));
  await page.route('**/api/chat', (route) => json(route, { reply: 'ok' }));
};

const signIn = async (page, origin) => {
  await page.goto(origin, { waitUntil: 'networkidle' });
  if (!(await page.getByRole('button', { name: /Get Started/i }).isVisible())) {
    await page.getByRole('button', { name: 'Open Menu' }).click();
  }
  await page.getByRole('button', { name: /Get Started/i }).click();
  await page.getByLabel('Tên đăng nhập', { exact: true }).fill('employee');
  await page.getByLabel('Mật khẩu', { exact: true }).fill('fixture-password');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.getByRole('table').waitFor({ state: 'visible' });
  await page.waitForTimeout(700);
};

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  ${detail ?? ''}`);
};

const { server, origin } = await serve();
const browser = await chromium.launch();

try {
  // ---- nav: links must not collide with the action cluster at any width ----
  for (const width of [1440, 1280, 1024]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await stubApi(page);
    await page.goto(origin, { waitUntil: 'networkidle' });
    await page.evaluate(() => window.scrollTo(0, 300));
    await page.waitForTimeout(500);
    const geo = await page.evaluate(() => {
      const links = document.querySelector('.folio-nav-links')?.getBoundingClientRect();
      const actions = document.querySelector('.folio-nav-actions')?.getBoundingClientRect();
      const brand = document.querySelector('.folio-nav-brand')?.getBoundingClientRect();
      const bar = document.querySelector('.folio-nav')?.getBoundingClientRect();
      const theme = document.querySelector('[data-theme-toggle]')?.getBoundingClientRect();
      return {
        linksRight: Math.round(links?.right ?? 0),
        actionsLeft: Math.round(actions?.left ?? 0),
        brandRight: Math.round(brand?.right ?? 0),
        linksLeft: Math.round(links?.left ?? 0),
        themeRight: Math.round(theme?.right ?? 0),
        barRight: Math.round(bar?.right ?? 0),
        overflowX: document.documentElement.scrollWidth > window.innerWidth,
      };
    });
    check(
      `nav ${width}: links clear the actions and the brand`,
      geo.linksRight <= geo.actionsLeft && geo.linksLeft >= geo.brandRight && !geo.overflowX,
      JSON.stringify(geo),
    );
    await page.close();
  }

  // ---- logo: asset follows the theme, both directions ----
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await stubApi(page);
    await page.goto(origin, { waitUntil: 'networkidle' });
    const navMark = await page.evaluate(() => {
      const el = document.querySelector('.folio-nav-logo');
      const style = getComputedStyle(el);
      return { bg: style.backgroundColor, mask: style.webkitMaskImage || style.maskImage };
    });
    check('landing mark is mask-painted (follows theme, no filter)', /svg/.test(navMark.mask) && navMark.bg !== 'rgba(0, 0, 0, 0)', JSON.stringify(navMark));

    await signIn(page, origin);
    const crmMark = await page.evaluate(() => {
      const img = document.querySelector('.crm-brand-mark img');
      const style = getComputedStyle(img);
      return { src: img.getAttribute('src'), filter: style.filter, loaded: img.complete && img.naturalWidth > 0 };
    });
    check('CRM mark is the white asset, no invert filter', crmMark.src.endsWith('guta-mark-white.svg') && crmMark.filter === 'none' && crmMark.loaded, JSON.stringify(crmMark));

    // ---- CRM: filter row must be one line, sidebar must exist on mobile ----
    for (const width of [1440, 768, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(400);
      const layout = await page.evaluate(() => {
        const triggers = [...document.querySelectorAll('.select-trigger.w-auto')];
        const tops = new Set(triggers.map((el) => Math.round(el.getBoundingClientRect().top)));
        const sidebar = document.querySelector('.crm-sidebar');
        const chat = document.querySelector('nav a.crm-copilot');
        return {
          filterRows: tops.size,
          filterCount: triggers.length,
          sidebarVisible: !!sidebar && sidebar.getBoundingClientRect().height > 0,
          chatReachable: !!chat && chat.getBoundingClientRect().height > 0,
          overflowX: document.documentElement.scrollWidth > window.innerWidth,
        };
      });
      check(
        `CRM ${width}: filters on one row, navigation reachable`,
        layout.filterRows <= 1 && layout.sidebarVisible && layout.chatReachable && !layout.overflowX,
        JSON.stringify(layout),
      );
    }

    // ---- chat: label + white mark ----
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator('nav a.crm-copilot').click();
    await page.getByTestId('chat-page').waitFor();
    const chat = await page.evaluate(() => ({
      title: document.querySelector('.guta-chat-header-title strong')?.textContent,
      brand: document.querySelector('.guta-chat-brand')?.textContent?.trim(),
      marks: [...document.querySelectorAll('.guta-chat img')].map((img) => img.getAttribute('src')),
    }));
    check(
      'chat: surface named Chat, brand reads Guta Workspace, white marks',
      chat.title === 'Chat' && chat.brand === 'Guta Workspace' && chat.marks.every((src) => src.endsWith('guta-mark-white.svg')),
      JSON.stringify(chat),
    );
    await page.close();
  }

  // ---- org chart: present, revealed, legible, no page overflow ----
  for (const width of [1440, 1024, 768, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.goto(origin, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.querySelector('#org')?.scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(1200);
    const org = await page.evaluate(() => {
      const section = document.querySelector('.folio-org');
      const svg = document.querySelector('.org-chart');
      const scroll = document.querySelector('.org-scroll');
      const cards = [...document.querySelectorAll('.folio-org .oc-card')];
      const r = svg?.getBoundingClientRect();
      // Rendered type size: canvas font-size x the SVG's on-screen scale.
      const label = document.querySelector('.folio-org .oc-label');
      const canvasH = svg?.viewBox?.baseVal?.height ?? 1;
      const scale = (r?.height ?? 0) / canvasH;
      return {
        present: !!section,
        revealed: section?.classList.contains('is-in') ?? false,
        cards: cards.length,
        hidden: cards.filter((c) => getComputedStyle(c).opacity === '0').length,
        renderedLabelPx: label ? Number(getComputedStyle(label).fontSize.replace('px', '')) * scale : 0,
        scrollable: scroll ? scroll.scrollWidth > scroll.clientWidth : null,
        pageOverflowX: document.documentElement.scrollWidth > window.innerWidth,
      };
    });
    check(
      `org chart ${width}: all cards revealed, labels legible, no page overflow`,
      org.present && org.revealed && org.cards === 38 && org.hidden === 0
        && org.renderedLabelPx >= 5.5 && !org.pageOverflowX
        && (width >= 1024 ? org.scrollable === false : org.scrollable === true),
      JSON.stringify({ ...org, renderedLabelPx: Number(org.renderedLabelPx.toFixed(1)) }),
    );
    await page.close();
  }

  // ---- org chart: theme, keyboard, layout stability ----
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

    await page.goto(origin, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Light theme' }).click();
    await page.waitForTimeout(500);
    await page.evaluate(() => document.querySelector('#org')?.scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(1100);
    const light = await page.evaluate(() => ({
      htmlClass: document.documentElement.className,
      topLabel: getComputedStyle(document.querySelector('.oc-tier-0 .oc-label')).fill,
      linkStroke: getComputedStyle(document.querySelector('.oc-link')).stroke,
    }));
    check(
      'org chart light theme: labels and links repaint',
      /light/.test(light.htmlClass) && light.topLabel === 'rgb(246, 244, 241)' && light.linkStroke !== 'none',
      JSON.stringify(light),
    );

    // Keyboard access to the horizontal scroll region (mobile only).
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(400);
    const keyboard = await page.evaluate(async () => {
      const el = document.querySelector('.org-scroll');
      el.focus();
      el.scrollLeft = 0;
      el.scrollBy({ left: 240 });
      await new Promise((r) => setTimeout(r, 120));
      return {
        focused: document.activeElement === el,
        tabIndex: el.tabIndex,
        role: el.getAttribute('role'),
        label: el.getAttribute('aria-label'),
        scrollLeft: el.scrollLeft,
      };
    });
    check(
      'org scroll region: focusable, labelled, scrolls',
      keyboard.focused && keyboard.tabIndex === 0 && keyboard.role === 'region' && !!keyboard.label && keyboard.scrollLeft > 0,
      JSON.stringify(keyboard),
    );

    // Layout stability while scrolling the whole page.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(400);
    const heights = new Set();
    for (let i = 0; i < 10; i++) {
      await page.evaluate(() => window.scrollBy(0, 600));
      await page.waitForTimeout(160);
      heights.add(await page.evaluate(() => Math.round(document.querySelector('.org-chart').getBoundingClientRect().height)));
    }
    check(
      'org chart height stable through a full-page scroll, zero console errors',
      heights.size === 1 && errors.length === 0,
      JSON.stringify({ heights: [...heights], errors: errors.slice(0, 2) }),
    );
    await page.close();
  }

  // ---- diagram: continuous loop, no toolbar, no overflow ----
  for (const width of [1440, 1024, 768, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.goto(`${origin}/diagrams/chatbot-architecture.html`, { waitUntil: 'load' });
    await page.waitForTimeout(900);
    const state = await page.evaluate(() => {
      const svg = document.querySelector('.ak-diagram-svg');
      const flow = document.querySelector('.ak-edge-flow');
      const stack = document.querySelector('.ak-stack');
      return {
        motion: svg?.getAttribute('data-motion'),
        hasToolbar: !!document.querySelector('.ak-diagram-toolbar, .ak-diagram-btn'),
        flowAnimation: flow ? getComputedStyle(flow).animationName : null,
        stackVisible: stack ? getComputedStyle(stack).display !== 'none' : false,
        overflowX: document.documentElement.scrollWidth > window.innerWidth,
        nodes: document.querySelectorAll('.ak-node').length,
      };
    });
    check(
      `diagram ${width}: runs by default, no internal toolbar, no overflow`,
      state.motion === 'play' && !state.hasToolbar && !state.overflowX && state.nodes === 21
        && (width <= 900 ? state.stackVisible : state.flowAnimation === 'ak-edge-flow'),
      JSON.stringify(state),
    );
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
