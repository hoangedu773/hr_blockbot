import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from './helpers/browser-deps.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// E2E_DIST_DIR lets a build be verified from a scratch outDir without replacing dist/.
const distDir = path.resolve(__dirname, process.env.E2E_DIST_DIR ?? '../dist');

// ---------------------------------------------------------------------------
// Store directory fixture. Mirrors StoreListResponse: the route emulates the
// real server-side filters (q/kind/district/status) so a regression that drops
// a query param from `fetchStores` fails here instead of passing vacuously.
// `581 Sư Vạn Hạnh` keeps the historic search rhythm of this suite.
// ---------------------------------------------------------------------------
const STORE_FIXTURE_ITEMS = [
  {
    id: '65f1c0ffee00000000000001',
    code: 'GT-CH-01',
    name: 'GUTA CAFE - Tân Bình - 02 Đặng Văn Sâm',
    kind: 'outlet',
    district: 'Tân Bình',
    managerName: 'Nguyễn Thị Phương Anh',
    managerEmployeeId: '65f1c0ffee0000000000e001',
    storeManagerStatus: 'identified',
    employeeCount: 46,
    activeEmployeeCount: 44,
    status: 'ACTIVE',
  },
  {
    id: '65f1c0ffee00000000000002',
    code: 'GT-CH-02',
    name: 'GUTA CAFE - Quận 10 - 581 Sư Vạn Hạnh',
    kind: 'outlet',
    district: 'Quận 10',
    managerName: 'Đỗ Quỳnh Anh',
    managerEmployeeId: '65f1c0ffee0000000000e002',
    storeManagerStatus: 'identified',
    employeeCount: 56,
    activeEmployeeCount: 51,
    status: 'ACTIVE',
  },
  {
    id: '65f1c0ffee00000000000003',
    code: 'GT-CH-03',
    name: 'GUTA CAFE - Quận 1 - 146 Nguyễn Văn Thủ',
    kind: 'outlet',
    district: 'Quận 1',
    managerName: 'Trương Quốc Thái',
    managerEmployeeId: '65f1c0ffee0000000000e003',
    storeManagerStatus: 'identified',
    employeeCount: 43,
    activeEmployeeCount: 43,
    status: 'ACTIVE',
  },
  {
    id: '65f1c0ffee00000000000004',
    code: null,
    name: 'GUTA EXPRESS - Bình Thạnh - 193F Điện Biên Phủ',
    kind: 'support',
    district: 'Bình Thạnh',
    managerName: null,
    managerEmployeeId: null,
    employeeCount: 0,
    activeEmployeeCount: 0,
    status: 'INACTIVE',
  },
];

const DASHBOARD_OVERVIEW_FIXTURE = {
  stores: { outlets: 3, groups: 0, support: 1 },
  employees: { total: 145, active: 138, inactive: 7 },
  profileCompletionRate: { value: 92.4, reason: null, source: 'employees', asOf: '2026-10-29' },
  managersCovered: { value: 66.7, reason: null, source: 'employees', asOf: '2026-10-29' },
  employeesPerOutlet: { value: 48.3, reason: null, source: 'employees', asOf: '2026-10-29' },
  // No verified revenue source -> value MUST stay null and the UI must not print 0.
  revenue: {
    value: null,
    reason: 'Chỉ 9/45 cửa hàng có cash_counts trong 1 kỳ',
    source: 'cash_counts',
    asOf: '2026-10-28',
  },
  onTimeRate: {
    value: null,
    reason: 'Không có dữ liệu chấm công/punch trong nguồn',
    source: 'none',
    asOf: null,
  },
  latestScheduleDate: '2026-10-29',
  generatedAt: '2026-10-30T03:00:00.000Z',
};

const normalize = (value) => (value ?? '').toString().trim().toLowerCase();

const buildStoreResponse = (url) => {
  const params = url.searchParams;
  const q = normalize(params.get('q'));
  const kind = normalize(params.get('kind'));
  const district = normalize(params.get('district'));
  const status = normalize(params.get('status'));
  const page = Number(params.get('page') ?? 1);
  const limit = Number(params.get('limit') ?? 20);

  const filtered = STORE_FIXTURE_ITEMS.filter((store) => {
    if (kind && normalize(store.kind) !== kind) return false;
    if (district && normalize(store.district) !== district) return false;
    if (status && normalize(store.status) !== status) return false;
    if (q) {
      const haystack = [store.name, store.code, store.district].map(normalize).join(' ');
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  const start = (page - 1) * limit;
  const items = filtered.slice(start, start + limit);
  return {
    items,
    paging: {
      page,
      limit,
      totalItems: filtered.length,
      totalPages: Math.max(1, Math.ceil(filtered.length / limit)),
      hasNext: start + limit < filtered.length,
      hasPrev: page > 1,
    },
    summary: {
      totalOutlets: filtered.filter((store) => store.kind === 'outlet').length,
      totalGroups: filtered.filter((store) => store.kind === 'group').length,
    },
  };
};

describe('Guta UI Revamp E2E Flow (Playwright)', () => {
  let server;
  let serverUrl;
  let browser;
  let page;
  let activeUser = null;
  let streamRouteHandler = null;
  const consoleErrors = [];

  before(async () => {
    // 1. Start static file server for dist/
    server = http.createServer((req, res) => {
      const origin = req.headers.origin || `http://127.0.0.1:${server.address()?.port}`;
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, x-ai-service-key');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      if (streamRouteHandler && req.url.startsWith('/api/chat/stream')) {
        streamRouteHandler(req, res);
        return;
      }
      let reqPath = req.url.split('?')[0];
      if (reqPath === '/' || reqPath === '') reqPath = '/index.html';
      const filePath = path.join(distDir, reqPath);

      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath);
        const mimeTypes = {
          '.html': 'text/html; charset=utf-8',
          '.js': 'application/javascript; charset=utf-8',
          '.css': 'text/css; charset=utf-8',
          '.png': 'image/png',
          '.svg': 'image/svg+xml',
          '.json': 'application/json',
        };
        res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
        fs.createReadStream(filePath).pipe(res);
      } else {
        // SPA Fallback to index.html
        const indexPath = path.join(distDir, 'index.html');
        if (fs.existsSync(indexPath)) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          fs.createReadStream(indexPath).pipe(res);
        } else {
          res.writeHead(404);
          res.end('Not Found');
        }
      }
    });

    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        serverUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    // 2. Launch headless Chromium
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
    });

    page.on('pageerror', (error) => consoleErrors.push(error.message));
    page.on('requestfailed', (request) => {
      if (request.failure()?.errorText !== 'net::ERR_ABORTED') console.log('Failed fixture request:', new URL(request.url()).pathname, request.failure()?.errorText);
    });
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Isolated auth boundary; never use real accounts or contact Atlas in this suite.
    // P0 account-provisioning: login is by provisioned USERNAME (employee code), not email.
    activeUser = null;
    const authorizationFor = (technical) => {
      const profile = technical ? 'system_admin' : 'sm';
      const capabilities = technical ? ['authorization.inspect_self', 'accounts.manage', 'grants.configure', 'grants.revoke', 'security_audit.read', 'provider_settings.manage'] : ['authorization.inspect_self', 'chatbot.data_read', 'profile.read_self', 'stores.read', 'dashboard.read', 'employees.read_operational'];
      const scope = { kind: technical ? 'system' : 'organization', storeIds: technical ? [] : STORE_FIXTURE_ITEMS.map((store) => store.id), regionIds: [], reportingEmployeeIds: [] };
      return { configured: true, profile, securityVersion: 0, enforcement: 'MIGRATING', capabilities, pendingCapabilities: [],
        grants: [{ id: '11111111-1111-4111-8111-111111111111', profile, scope, capabilities: capabilities.filter((capability) => !['authorization.inspect_self', 'chatbot.data_read', 'profile.read_self'].includes(capability)), approvalRef: 'isolated-visual-ui-fixture', grantedBy: 'a'.repeat(24), grantedAt: '2026-01-01T00:00:00Z', validFrom: '2026-01-01T00:00:00Z', validUntil: null, revokedAt: null }],
        stores: technical ? [] : STORE_FIXTURE_ITEMS.map((store) => ({ id: store.id, name: store.name, departmentId: null, regionId: null, capabilities: ['stores.read', 'dashboard.read', 'employees.read_operational'] })), delegations: [] };
    };
    await page.route('**/api/auth/login', (route) => {
      const { username, password } = route.request().postDataJSON();
      assert.equal(password, 'fixture-password');
      activeUser = {
        id: `fixture-${username}`,
        role: username.startsWith('admin') ? 'Admin' : 'Employee',
        username,
        mustChangePassword: false,
        authorization: authorizationFor(username.startsWith('admin')),
      };
      return route.fulfill({ status: 200, json: { accessToken: 'fixture-token', user: activeUser } });
    });
    await page.route('**/api/auth/refresh', (route) => route.fulfill({ status: 200, json: { accessToken: activeUser ? 'fixture-token' : null } }));
    await page.route('**/api/auth/me', (route) => {
      if (!activeUser) return route.fulfill({ status: 401, json: { error: { message: 'Unauthorized' } } });
      return route.fulfill({ status: 200, json: { userId: activeUser.id, role: activeUser.role, username: activeUser.username, mustChangePassword: false, skills: [], authorization: activeUser.authorization } });
    });
    await page.route('**/api/admin/users**', (route) => route.fulfill({ status: 200, json: { items: [], paging: { page: 1, totalItems: 0, totalPages: 1, hasPrev: false, hasNext: false } } }));
    await page.route('**/api/admin/authorization-catalog', (route) => route.fulfill({ status: 200, json: { policies: {}, stores: [] } }));
    await page.route('**/api/admin/llm-providers', (route) => route.fulfill({ status: 200, json: { configVersion: 0, providers: [] } }));
    await page.route('**/api/auth/logout', (route) => { activeUser = null; return route.fulfill({ status: 204 }); });
    await page.route('**/api/stores**', (route) => {
      const request = route.request();
      if (request.method() !== 'GET') {
        return route.fulfill({ status: 405, json: { error: { code: 'METHOD_NOT_ALLOWED', message: 'fixture read-only' } } });
      }
      return route.fulfill({ status: 200, json: buildStoreResponse(new URL(request.url())) });
    });
    await page.route('**/api/dashboard/overview', (route) => route.fulfill({ status: 200, json: DASHBOARD_OVERVIEW_FIXTURE }));
    // KPI feature gates: baseline suite has no KPI feature enabled.
    await page.route('**/api/performance-kpi/config', (route) => route.fulfill({ status: 200, json: { enabled: false } }));
    await page.route('**/api/revenue-kpi/config', (route) => route.fulfill({ status: 200, json: { enabled: false } }));
    // DashboardRevenue contract (packages/contracts/src/index.ts:1176): no verified
    // revenue source -> value/orderCount MUST stay null/0 with dataKind 'none',
    // matching the overview revenue fixture above.
    await page.route('**/api/dashboard/revenue**', (route) => route.fulfill({ status: 200, json: {
      value: null,
      reason: DASHBOARD_OVERVIEW_FIXTURE.revenue.reason,
      source: 'cash_counts',
      asOf: DASHBOARD_OVERVIEW_FIXTURE.revenue.asOf,
      orderCount: 0,
      dataKind: 'none',
      period: { from: '2026-10-23T00:00:00.000Z', to: '2026-10-29T23:59:59.999Z', timezone: 'Asia/Ho_Chi_Minh' },
    } }));
    await page.route('**/api/departments', (route) => route.fulfill({ status: 200, json: { items: [] } }));
    // This visual suite starts with no persisted conversations; persistence is
    // exercised separately against real Node/MongoDB by chat-history.integration.mjs.
    await page.route('**/api/chat/conversations?*', (route) => route.fulfill({ status: 200, json: { items: [], nextCursor: null } }));
    // Invalid payload exercises the safe demo boundary without a live backend.
    await page.route('**/api/chat', (route) => route.fulfill({ status: 200, json: {} }));
    await page.route('**/api/chat/stream', (route) => {
      if (route.request().method() === 'OPTIONS') {
        return route.fulfill({
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': route.request().headers().origin || `http://127.0.0.1:${server.address()?.port}`,
            'Access-Control-Allow-Credentials': 'true',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept, x-ai-service-key',
          },
        });
      }
      return route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Access-Control-Allow-Origin': route.request().headers().origin || `http://127.0.0.1:${server.address()?.port}`,
          'Access-Control-Allow-Credentials': 'true',
        },
        body: '',
      });
    });

    // Clear any previous state
    await page.goto(serverUrl, { waitUntil: 'networkidle' });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle' });
  });

  after(async () => {
    if (browser) await browser.close();
    if (server) {
      if (typeof server.closeAllConnections === 'function') {
        server.closeAllConnections();
      }
      server.close();
    }
  });

  // The workspace opens on the CRM tab; chat is reached from the sidebar.
  const returnToCrm = async () => {
    if (await page.getByTestId('chat-page').count()) {
      await page.getByRole('button', { name: 'Quay lại Vận Hành (CRM)', exact: true }).click();
    }
    await page.getByRole('table').waitFor({ state: 'visible' });
    await page.waitForFunction(
      (expected) => document.querySelectorAll('table tbody tr[data-id]').length === expected,
      STORE_FIXTURE_ITEMS.length
    );
  };
  const routeChatStream = async () => {
    await page.route('**/api/chat/stream', async (route) => {
      if (route.request().method() === 'OPTIONS') {
        await route.fulfill({
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': route.request().headers()['origin'] || serverUrl,
            'Access-Control-Allow-Credentials': 'true',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept, x-ai-service-key',
          },
        });
        return;
      }
      await route.continue({ url: `${serverUrl}/api/chat/stream` });
    });
  };

  // Re-establishes a known identity. Mutating-control tests must not inherit
  // whatever role the previous step happened to leave behind.
  const signInAs = async (username) => {
    const getStarted = page.getByRole('button', { name: /Get Started/i });
    const logoutBtn = page.getByRole('button', { name: /Đăng Xuất Phiên/i });
    if (await logoutBtn.count()) {
      await logoutBtn.click();
      await getStarted.waitFor({ state: 'visible' });
    }
    if (await getStarted.isVisible().catch(() => false)) await getStarted.click();
    if (await page.getByLabel('Tên đăng nhập', { exact: true }).isVisible().catch(() => false)) {
      await page.getByLabel('Tên đăng nhập', { exact: true }).fill(username);
      await page.getByLabel('Mật khẩu', { exact: true }).fill('fixture-password');
      await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    }
    await returnToCrm();
  };

  it('Bước 1: Render Landing Page, tiêu đề chuẩn, logo marquee và 0 pixel màu vàng', async () => {
    // Kiểm tra headline
    const heroText = await page.textContent('h1');
    assert.match(heroText, /Quản Trị Nhân Sự & Phân Ca Tự Động/i);

    // Kiểm tra Logo Marquee tồn tại
    const marqueeText = await page.textContent('body');
    assert.match(marqueeText, /Vinamilk/);
    assert.match(marqueeText, /La Marzocco/);

    // Kiểm tra Zero Yellow (#ffd100, #eab308, #f59e0b) trong toàn bộ computed DOM styles
    const yellowCount = await page.evaluate(() => {
      const allElements = Array.from(document.querySelectorAll('*'));
      let count = 0;
      const bannedRgb = [
        'rgb(255, 209, 0)', // #ffd100
        'rgb(234, 179, 8)', // #eab308
        'rgb(245, 158, 11)', // #f59e0b
      ];

      for (const el of allElements) {
        const style = window.getComputedStyle(el);
        if (bannedRgb.includes(style.color) || bannedRgb.includes(style.backgroundColor) || bannedRgb.includes(style.borderColor)) {
          count++;
        }
      }
      return count;
    });

    assert.equal(yellowCount, 0, 'Phát hiện phần tử chứa màu vàng cấm (#ffd100, #eab308, #f59e0b)');
  });

  it('Bước 2: Bấm nút "Get Started", kiểm tra Auth Modal mở ra', async () => {
    // Click button "Get Started"
    const getStartedBtn = page.getByRole('button', { name: /Get Started/i });
    await getStartedBtn.click();

    // Account credentials replace the unrestricted role picker.
    const modalHeading = page.getByRole('heading', { name: 'Đăng nhập Guta Workspace' });
    await modalHeading.waitFor({ state: 'visible', timeout: 3000 });
    assert.equal(await modalHeading.isVisible(), true);
  });

  it('Bước 3: đăng nhập bằng tài khoản, mở thẳng CRM Dashboard rồi vào Chat', async () => {
    await page.getByLabel('Tên đăng nhập', { exact: true }).fill('employee');
    await page.getByLabel('Mật khẩu', { exact: true }).fill('fixture-password');
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();

    // First View: the operating surface (CRM), not the assistant.
    const headerTitle = page.getByText(/Vận Hành Chi Nhánh & Phân Ca/i);
    await headerTitle.waitFor({ state: 'visible', timeout: 5000 });
    assert.equal(await page.getByTestId('chat-page').count(), 0, 'login must land on CRM, not chat');
    assert.equal(await headerTitle.isVisible(), true);

    // The directory is API-backed now: wait for real rows before reading any
    // computed style off the KPI ribbon / table cells below.
    await page.waitForFunction(
      (expected) => document.querySelectorAll('table tbody tr[data-id]').length === expected,
      STORE_FIXTURE_ITEMS.length
    );

    assert.equal(await page.evaluate(() => sessionStorage.getItem('guta_user')), null);
    assert.equal(await page.evaluate(() => localStorage.getItem('guta_user')), null);

    // Kiểm tra thông tin user hiển thị ở sidebar (username-based identity since
    // account provisioning; the role label is only a fallback without username)
    const sidebarUser = page.locator('.crm-sidebar').getByText('employee', { exact: true });
    assert.equal(await sidebarUser.count() > 0, true);
    const logo = page.locator('.crm-sidebar img');
    assert.equal(await logo.getAttribute('src'), '/assets/logos/guta-mark-white.svg');
    assert.match(await logo.getAttribute('alt'), /^Guta Workspace$/);
    assert.equal(await logo.evaluate((img) => img.complete && img.naturalWidth > 0), true);
    const brandColors = await page.locator('.crm-sidebar .tracking-wider.text-foreground, .crm-sidebar .tracking-tight.text-foreground').evaluateAll((labels) => labels.map((label) => getComputedStyle(label).color));
    assert.equal(brandColors.length, 2);
    assert.equal(brandColors[0], brandColors[1], 'GUTA and WORKSPACE must share the foreground color');
    // Behavioural surface contract (ADR-021): measure what the sheet promises,
    // not the literals an earlier aesthetic happened to use. The store table is
    // fed by the API now, so it carries no revenue/punctuality column — those
    // two figures have no data source (ADR-020) and are asserted at the KPI
    // strip instead of per row.
    const surface = await page.evaluate(() => {
      const style = (selector) => getComputedStyle(document.querySelector(selector));
      const all = [...document.querySelectorAll('*')];
      const figures = [...document.querySelectorAll('tbody td[data-col="staff"]')];
      const shell = document.querySelector('.crm-table-shell');
      const statusCell = document.querySelector('tbody tr[data-id] td[data-col="status"]');
      const rgb = (value) => (value.match(/\d+(?:\.\d+)?/g) ?? []).slice(0, 3).map(Number);
      const luminance = (value) => rgb(value)
        .map((channel) => channel / 255)
        .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
        .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
      const contrast = (a, b) => {
        const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
        return (hi + 0.05) / (lo + 0.05);
      };
      return {
        kpiBackgroundImages: [...document.querySelectorAll('.crm-kpi-card')].map((el) => getComputedStyle(el).backgroundImage),
        kpiRadius: style('.crm-kpi-card').borderRadius,
        sidebarBlur: style('.crm-sidebar').backdropFilter,
        headerBlur: style('.crm-header-smooth').backdropFilter,
        canvasBg: style('.crm-main').backgroundColor,
        sidebarBg: style('.crm-sidebar').backgroundColor,
        headerBg: style('.crm-header-smooth').backgroundColor,
        logoBoxBg: style('.crm-brand-mark').backgroundColor,
        navActiveBg: style('.crm-nav-item[aria-current="page"]').backgroundColor,
        navIdleColor: style('.crm-nav-item:not([aria-current="page"])').color,
        navActiveColor: style('.crm-nav-item[aria-current="page"]').color,
        navRuleWidth: getComputedStyle(document.querySelector('.crm-nav-item[aria-current="page"]'), '::before').width,
        labelContrast: contrast(style('.crm-kpi-title').color, style('.crm-kpi-card').backgroundColor),
        figureContrast: contrast(style('tbody td[data-col="staff"]').color, style('.crm-main').backgroundColor),
        // `transition-property` defaults to `all`; only a non-zero duration
        // turns that into a real blanket transition.
        transitionAll: all.filter((el) => {
          const computed = getComputedStyle(el);
          return computed.transitionProperty === 'all'
            && computed.transitionDuration.split(',').some((duration) => parseFloat(duration) > 0);
        }).length,
        figures: figures.length,
        tabularFigures: figures.filter((td) => getComputedStyle(td).fontVariantNumeric.includes('tabular-nums')).length,
        shellScrollsX: shell ? shell.scrollWidth > shell.clientWidth : null,
        statusRight: statusCell ? Math.round(statusCell.getBoundingClientRect().right) : null,
        yellow: all.some((el) => {
          const computed = getComputedStyle(el);
          return ['color', 'backgroundColor', 'borderColor', 'backgroundImage', 'boxShadow'].some((key) => /(?:255, 209, 0|234, 179, 8|245, 158, 11)/.test(computed[key]));
        }),
      };
    });

    // Flat surfaces, tiered by lightness rather than blur.
    assert.equal(surface.sidebarBlur, 'none');
    assert.equal(surface.headerBlur, 'none');
    assert.equal(surface.sidebarBg, surface.headerBg, 'sidebar and top bar share one ground');
    assert.notEqual(surface.sidebarBg, surface.canvasBg, 'chrome and canvas must differ by a lightness step');
    assert.equal(surface.logoBoxBg, 'rgba(0, 0, 0, 0)', 'logo sits on the ground, not in a tinted tile');
    assert.equal(surface.navActiveBg, 'rgba(0, 0, 0, 0)', 'active nav is a rule, not a filled pill');
    assert.notEqual(surface.navActiveColor, surface.navIdleColor);
    assert.equal(surface.navRuleWidth, '1px');

    // KPI strip: one container, no gradient, no hover lift.
    assert.deepEqual(surface.kpiBackgroundImages.filter((image) => image !== 'none'), []);
    assert.equal(surface.kpiRadius, '0px', 'KPI cells are dividers inside one container, not tiles');
    assert.ok(surface.labelContrast >= 4.5, `KPI label contrast ${surface.labelContrast.toFixed(2)}:1 < 4.5:1`);
    assert.ok(surface.figureContrast >= 4.5, `figure contrast ${surface.figureContrast.toFixed(2)}:1 < 4.5:1`);

    // Table: no horizontal scroll at 1440, every numeric cell tabular.
    assert.equal(surface.shellScrollsX, false, 'store table must not scroll horizontally at 1440');
    assert.ok(surface.statusRight <= 1440, 'status column must stay inside the viewport');
    assert.ok(surface.figures > 0, 'staff column must render a figure per row');
    assert.equal(surface.tabularFigures, surface.figures, 'every numeric cell uses tabular figures');

    // Motion: no `all` transitions anywhere on the screen.
    assert.equal(surface.transitionAll, 0);
    assert.equal(surface.yellow, false);

    await page.reload({ waitUntil: 'networkidle' });
    // A reload restores the session and re-enters on CRM; no tab hop needed.
    await page.getByText(/Vận Hành Chi Nhánh & Phân Ca/i).waitFor({ state: 'visible' });
    await page.getByTestId('guta-splash').waitFor({ state: 'detached', timeout: 1000 });
  });

  it('Bước 4: Bảng cửa hàng render đúng số hàng của fixture, tìm kiếm chi nhánh "Sư Vạn Hạnh"', async () => {
    // Đếm thật: số <tr> phải khớp items của fixture, không phải một con số trang trí.
    await page.waitForFunction(
      (expected) => document.querySelectorAll('table tbody tr[data-id]').length === expected,
      STORE_FIXTURE_ITEMS.length
    );
    assert.equal(await page.locator('table tbody tr[data-id]').count(), STORE_FIXTURE_ITEMS.length);
    assert.equal(await page.locator('table tbody tr').count(), STORE_FIXTURE_ITEMS.length);

    // Mỗi hàng mang data-id là ObjectId thật từ fixture.
    assert.deepEqual(
      await page.locator('table tbody tr[data-id]').evaluateAll((rows) => rows.map((row) => row.getAttribute('data-id'))),
      STORE_FIXTURE_ITEMS.map((store) => store.id)
    );

    const tableRow = page.getByText(/581 Sư Vạn Hạnh/i);
    assert.equal(await tableRow.isVisible(), true);

    // Gõ tìm kiếm
    const searchInput = page.getByPlaceholder(/Lọc theo tên, quận, mã.../i);
    await page.keyboard.press('Control+KeyK');
    assert.equal(await searchInput.evaluate((input) => document.activeElement === input), true);
    await searchInput.fill('KhongTonTai123');
    await page.getByText('Không tìm thấy chi nhánh nào phù hợp với từ khóa tìm kiếm.').waitFor({ state: 'visible' });
    assert.equal(await page.getByText(/581 Sư Vạn Hạnh/i).isVisible(), false);

    // Debounce 250ms + round-trip: chờ đúng số hàng thay vì sleep mù.
    await searchInput.fill('Sư Vạn Hạnh');
    await page.waitForFunction(() => document.querySelectorAll('table tbody tr[data-id]').length === 1);
    const filteredRow = page.getByText(/581 Sư Vạn Hạnh/i);
    assert.equal(await filteredRow.isVisible(), true);

    // Xóa tìm kiếm để hiển thị lại đủ
    await searchInput.fill('');
    await page.waitForFunction(
      (expected) => document.querySelectorAll('table tbody tr[data-id]').length === expected,
      STORE_FIXTURE_ITEMS.length
    );
  });

  it('Bước 5: Click vào dòng cửa hàng, kiểm tra Slide-Over Drawer mở đúng dữ liệu của dòng đó', async () => {
    // Dùng data-id của fixture thay vì phụ thuộc mã cứng GT-CH-02.
    const target = STORE_FIXTURE_ITEMS.find((store) => store.name.includes('Sư Vạn Hạnh'));
    assert.ok(target, 'fixture phải có cửa hàng Sư Vạn Hạnh');

    const row = page.locator(`table tbody tr[data-id="${target.id}"]`);
    await row.hover();
    // Hover marks the row with an inset ring, not a fill (ADR-021).
    await page.waitForFunction(
      (id) => /inset/.test(getComputedStyle(document.querySelector(`tr[data-id="${id}"]`)).boxShadow),
      target.id
    );
    await row.click();

    // Drawer trượt ra với đúng bản ghi đã bấm, không phải hàng đầu tiên.
    await page.waitForFunction((id) => document.querySelector('#detail-drawer')?.classList.contains('drawer-open'), target.id);
    assert.equal(await page.locator('#d-id').textContent(), target.code);
    assert.equal(await page.locator('#d-name').textContent(), target.name);
    assert.equal(await page.locator('#d-district').textContent(), `Quận: ${target.district}`);
    const leadership = page.getByRole('region', { name: 'Phân công quản lý' });
    assert.equal(await leadership.getByText('Cửa hàng trưởng · SM').isVisible(), true);
    assert.equal(await leadership.getByText(target.managerName).isVisible(), true);
    assert.match(await page.locator('#d-staff').textContent(), new RegExp(`${target.activeEmployeeCount} / ${target.employeeCount}`));

    // Flat drawer, no blur (ADR-021); wait for 240ms slide-in transition to settle.
    await page.waitForFunction(() => getComputedStyle(document.querySelector('#detail-drawer')).transform === 'matrix(1, 0, 0, 1, 0, 0)');
    const drawerSurface = await page.locator('#detail-drawer').evaluate((el) => {
      const style = getComputedStyle(el);
      return {
        transform: style.transform,
        transitionProperty: style.transitionProperty,
        backdropFilter: style.backdropFilter,
        borderLeftWidth: style.borderLeftWidth,
      };
    });
    assert.equal(drawerSurface.transform, 'matrix(1, 0, 0, 1, 0, 0)', 'drawer slides in by transform only');
    assert.equal(drawerSurface.transitionProperty, 'transform');
    assert.equal(drawerSurface.backdropFilter, 'none', 'flat surface, no glass');
    assert.equal(drawerSurface.borderLeftWidth, '1px');
    assert.equal(await page.locator('#drawer-backdrop').evaluate((el) => getComputedStyle(el).backdropFilter), 'none');
  });

  it('Bước 6: Bấm nút "Gửi Cảnh Báo Telegram", kiểm tra toast xuất hiện', async () => {
    const telegramBtn = page.getByRole('button', { name: /Gửi Cảnh Báo Telegram/i });
    await telegramBtn.click();

    // No false success: the baseline has no configured Telegram delivery channel.
    const toastMsg = page.getByText(/Chưa gửi cảnh báo cho cửa hàng/i);
    await toastMsg.waitFor({ state: 'visible', timeout: 3000 });
    assert.equal(await toastMsg.isVisible(), true);

    // Đóng Drawer
    const closeBtn = page.getByRole('button', { name: 'Đóng', exact: true });
    await closeBtn.click();
    await page.waitForTimeout(300);

    await page.getByRole('table').getByText(/581 Sư Vạn Hạnh/i).click();
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('#detail-drawer')?.classList.contains('drawer-open'));
  });

  it('Regression: đóng liên tục, double click, Escape sớm và filter ký tự đặc biệt', async () => {
    await page.waitForFunction(
      (expected) => document.querySelectorAll('table tbody tr[data-id]').length === expected,
      STORE_FIXTURE_ITEMS.length
    );
    assert.deepEqual(await page.evaluate(() => [typeof window.openDrawer, typeof window.closeDrawer]), ['function', 'function']);
    assert.equal(await page.locator('[onclick]').count(), 0);
    await page.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      const row = document.querySelector('tbody tr[data-id]');
      row.click();
      row.click();
    });
    assert.equal(await page.locator('#detail-drawer').evaluate((drawer) => drawer.classList.contains('drawer-open')), true);
    assert.equal(await page.locator('#d-id').textContent(), STORE_FIXTURE_ITEMS[0].code);
    await page.evaluate(() => {
      const close = document.querySelector('[aria-label="Đóng chi tiết"]');
      for (let i = 0; i < 10; i++) close.click();
      window.closeDrawer();
    });
    assert.equal(await page.locator('#detail-drawer').evaluate((drawer) => drawer.classList.contains('drawer-open')), false);
    const search = page.getByPlaceholder(/Lọc theo tên, quận, mã.../i);
    for (const keyword of ['[]()*', '\'"\\', '<script>alert(1)</script>', '☕ tiếng Việt']) {
      await search.fill(keyword);
      await page.getByText('Không tìm thấy chi nhánh nào phù hợp với từ khóa tìm kiếm.').waitFor({ state: 'visible' });
      assert.equal(await page.getByText('Không tìm thấy chi nhánh nào phù hợp với từ khóa tìm kiếm.').isVisible(), true);
    }
    await search.fill('');
    await page.waitForFunction(
      (expected) => document.querySelectorAll('table tbody tr[data-id]').length === expected,
      STORE_FIXTURE_ITEMS.length
    );
    await page.locator('nav a.crm-copilot').click();
    await page.getByTestId('chat-page').waitFor({ state: 'visible' });
    await page.keyboard.press('Escape');
    assert.equal(await page.getByTestId('chat-page').count(), 0);
    // Returning to CRM remounts the view, so the portal + first fetch are async.
    await page.getByRole('table').waitFor({ state: 'visible' });
    await page.waitForFunction(
      (expected) => document.querySelectorAll('table tbody tr[data-id]').length === expected,
      STORE_FIXTURE_ITEMS.length
    );
    assert.equal(await page.getByRole('table').isVisible(), true);
    assert.deepEqual(consoleErrors, []);
  });

  it('Regression: logout aborts an in-flight ChatPage request without reviving the session', async () => {
    let release;
    let started;
    const waiting = new Promise((resolve) => { release = resolve; });
    const requestStarted = new Promise((resolve) => { started = resolve; });
    const pendingReply = async (route) => {
      started();
      await waiting;
      await route.fulfill({ status: 200, json: { reply: 'Late answer', citations: [] } }).catch(() => {});
    };
    await page.route('**/api/chat/stream', pendingReply);
    try {
      await page.locator('nav a.crm-copilot').click();
      await page.getByPlaceholder('Hỏi AI về ca trực, nhân sự, tiền két...').fill('thiếu người');
      await page.keyboard.press('Enter');
      await requestStarted;
      assert.equal(await page.locator('.guta-chat-status').isVisible(), true);
      const aborted = page.waitForEvent('requestfailed', { predicate: (request) => request.url().includes('/api/chat') });
      await page.getByRole('button', { name: 'Đăng Xuất Phiên', exact: true }).click();
      await aborted;
      await page.getByRole('button', { name: /Get Started/i }).waitFor();
      assert.equal(await page.getByTestId('chat-page').count(), 0);
      assert.deepEqual(await page.evaluate(() => [typeof window.openDrawer, typeof window.closeDrawer]), ['undefined', 'undefined']);
      assert.deepEqual(consoleErrors, []);
    } finally {
      release();
      await page.unroute('**/api/chat/stream', pendingReply);
    }
    await page.getByRole('button', { name: /Get Started/i }).click();
    await page.getByLabel('Tên đăng nhập', { exact: true }).fill('employee');
    await page.getByLabel('Mật khẩu', { exact: true }).fill('fixture-password');
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await page.getByRole('table').waitFor({ state: 'visible' });
  });

  it('ChatPage: desktop empty state, demo an toàn, citations, action giả bị reject và không confirm', async () => {
    await page.locator('nav a.crm-copilot').click();
    const chat = page.getByTestId('chat-page');
    assert.doesNotMatch(fs.readFileSync(path.resolve(__dirname, '../src/components/chat/ChatPageView.tsx'), 'utf8'), /#(?:2563eb|93c5fd|35435a|233149)\b/i);
    const heading = chat.getByRole('heading', { name: 'Chào mừng đến HR BlockBot' });
    await heading.waitFor();
    assert.deepEqual(await heading.evaluate((h1) => {
      const style = getComputedStyle(h1);
      return [style.outlineStyle === 'none' || style.outlineWidth === '0px', style.borderTopWidth, style.boxShadow];
    }), [true, '0px', 'none']);
    // The surface names itself "Chat"; the role label sits beneath it.
    assert.equal(await chat.locator('.guta-chat-header-title strong').innerText(), 'Chat');
    assert.equal(await chat.getByText('Guta Workspace', { exact: true }).count(), 1);
    // The mark must be the white variant on the dark product ground; the old
    // `currentColor` asset resolved to black inside an <img> and vanished.
    assert.deepEqual(await chat.locator('img').evaluateAll((images) => images.map((img) => ({ src: img.getAttribute('src'), loaded: img.complete && img.naturalWidth > 0 }))), [
      { src: '/assets/logos/guta-mark-white.svg', loaded: true },
      { src: '/assets/logos/guta-mark-white.svg', loaded: true },
    ]);
    assert.equal(await chat.locator('.guta-chat-hero img').evaluate((img) => img.getBoundingClientRect().width), 48);
    assert.equal(await page.getByRole('dialog').count(), 0);
    assert.equal(await chat.getByRole('navigation', { name: 'Câu hỏi nhanh' }).getByRole('button').count(), 3);
    const width = await chat.locator('.guta-chat-width').first().evaluate((el) => el.getBoundingClientRect().width);
    assert.ok(width >= 768 && width <= 800);
    const input = chat.getByRole('textbox', { name: 'Tin nhắn cho Guta AI' });
    const send = chat.getByRole('button', { name: 'Gửi', exact: true });
    const composerStyle = await chat.locator('.guta-chat-composer').evaluate((form) => {
      const style = getComputedStyle(form);
      const input = form.querySelector('textarea');
      const label = form.querySelector('label');
      return {
        radius: style.borderRadius, background: style.backgroundColor,
        border: style.borderTopColor, blur: style.backdropFilter, display: style.display,
        rows: input.rows, labelClass: label.className, labelWidth: label.getBoundingClientRect().width,
        order: [...form.children].map((el) => el.tagName),
      };
    });
    assert.deepEqual(composerStyle, {
      radius: '9999px', background: 'rgba(255, 255, 255, 0.05)',
      border: 'rgba(255, 255, 255, 0.12)', blur: 'blur(20px)', display: 'flex',
      rows: 1, labelClass: 'sr-only', labelWidth: 1,
      order: ['LABEL', 'BUTTON', 'TEXTAREA', 'BUTTON'],
    });
    assert.equal(await chat.getByText('Enter gửi · Shift+Enter xuống dòng', { exact: true }).count(), 0);
    const attach = chat.getByRole('button', { name: 'Thao tác bổ sung', exact: true });
    for (const button of [attach, send]) {
      assert.deepEqual(await button.evaluate((el) => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        // Layout can return 44.000030517578125 for a 44px box at a non-integer DPR;
        // compare the rendered pixel size, not the subpixel float.
        return [Math.round(rect.width), Math.round(rect.height), style.borderRadius, style.borderTopWidth];
      }), [44, 44, '9999px', '0px']);
    }
    await input.focus();
    await page.keyboard.press('Shift+Tab');
    assert.equal(await attach.evaluate((el) => document.activeElement === el && el.matches(':focus-visible') && parseFloat(getComputedStyle(el).outlineWidth) >= 2), true);
    await page.keyboard.press('Enter');
    assert.equal(await input.evaluate((el) => document.activeElement === el), true);
    assert.deepEqual(await input.evaluate((el) => {
      const style = getComputedStyle(el);
      return [style.borderTopWidth, style.outlineStyle, style.boxShadow, style.backgroundColor];
    }), ['0px', 'none', 'none', 'rgba(0, 0, 0, 0)']);
    assert.equal(await chat.locator('.guta-chat-composer').evaluate((el) => getComputedStyle(el).borderTopColor), 'rgba(255, 255, 255, 0.28)');
    await input.fill('   ');
    await input.press('Enter');
    assert.equal(await send.isDisabled(), true);
    assert.deepEqual(await send.evaluate((el) => {
      const style = getComputedStyle(el);
      return [style.backgroundColor, style.color, style.opacity];
    }), ['rgba(255, 255, 255, 0.08)', 'rgba(255, 255, 255, 0.3)', '1']);
    assert.equal(await chat.getByRole('log').count(), 0);
    await input.fill('Tin nhắn kiểm thử');
    assert.equal(await send.isDisabled(), false);
    assert.deepEqual(await send.evaluate((el) => {
      const style = getComputedStyle(el);
      return [style.backgroundColor, style.color];
    }), ['rgb(255, 255, 255)', 'rgb(0, 0, 0)']);
    await send.hover();
    assert.deepEqual(await send.evaluate((el) => {
      const style = getComputedStyle(el);
      return [style.backgroundColor, style.color];
    }), ['rgb(222, 222, 222)', 'rgb(0, 0, 0)']);
    const offlineChat = (route) => route.abort('connectionrefused');
    const errorsBeforeOffline = consoleErrors.length;
    const expectedOfflineConsole = page.waitForEvent('console', { predicate: (message) => message.type() === 'error' && message.text() === 'Failed to load resource: net::ERR_CONNECTION_REFUSED' });
    await page.route('**/api/chat/stream', offlineChat);
    await chat.getByRole('navigation', { name: 'Câu hỏi nhanh' }).getByRole('button', { name: 'Gợi ý điều động ca' }).click();
    assert.equal(await send.isDisabled(), true);
    await chat.getByText('Demo an toàn · Dịch vụ AI chưa khả dụng', { exact: true }).waitFor();
    await expectedOfflineConsole;
    assert.equal(await chat.getByRole('button', { name: 'Xác nhận kế hoạch' }).count(), 0);
    await page.unroute('**/api/chat/stream', offlineChat);
    // Wait for Chromium's asynchronous error before consuming ONLY this
    // expected probe result. Unexpected errors remain visible to later gates.
    assert.deepEqual(consoleErrors.slice(errorsBeforeOffline), ['Failed to load resource: net::ERR_CONNECTION_REFUSED']);
    consoleErrors.splice(errorsBeforeOffline, 1);

    const chatReplies = [
      {
        // Match on the actual suggestion prompt text (ChatPageView TOPIC_PROMPTS),
        // not the button title — the title is a label, the prompt is what's sent.
        match: 'thiếu người ca trưa nay',
        json: {
          reply: 'Đề xuất điều động ca trực cho chi nhánh đang thiếu người.',
          proposedAction: { type: 'request_shift_swap', preview: 'Điều động một barista sang chi nhánh thiếu người' },
        },
      },
      {
        match: 'đi trễ quá 15 phút',
        json: {
          reply: 'Đây là trích dẫn tham khảo, không phải chính sách có hiệu lực.',
          citations: [{ document: 'Quy chế nhân sự Guta', version: 'demo', article: 'Điều tham khảo', score: 0.8 }],
          proposedAction: null,
        },
      },
      {
        match: 'doanh thu két sáng',
        json: {
          reply: 'Không có số doanh thu đã xác thực trong phiên demo.',
          citations: [{ document: 'Biểu mẫu đối soát két — không phải báo cáo thực tế', version: 'demo', article: 'Ghi chú', score: 0.7 }],
          proposedAction: null,
        },
      },
    ];
    const onlineChat = async (route) => {
      if (route.request().method() === 'OPTIONS') {
        await route.fulfill({
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': route.request().headers().origin || `http://127.0.0.1:${server.address()?.port}`,
            'Access-Control-Allow-Credentials': 'true',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept, x-ai-service-key',
          },
        });
        return;
      }
      const request = route.request().postDataJSON();
      const reply = chatReplies.find((item) => request.message.includes(item.match)) ?? chatReplies[0];
      const clientMessageId = request.clientMessageId || '11111111-1111-4111-8111-111111111111';
      const convId = '11111111-1111-4111-8111-111111111111';
      const sseBody = [
        `event: accepted\ndata: ${JSON.stringify({ clientMessageId, messageId: clientMessageId, conversationId: convId, acceptedAt: new Date().toISOString() })}\n\n`,
        `event: done\ndata: ${JSON.stringify({
          conversationId: convId,
          turn: {
            id: clientMessageId,
            userMessage: request.message,
            createdAt: new Date().toISOString(),
            status: 'COMPLETED',
            reply: reply.json.reply,
            replyHidden: false,
            citations: reply.json.citations || [],
            attachments: [],
            proposedAction: reply.json.proposedAction,
          },
        })}\n\n`,
      ].join('');
      await route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Access-Control-Allow-Origin': route.request().headers().origin || `http://127.0.0.1:${server.address()?.port}`,
          'Access-Control-Allow-Credentials': 'true',
        },
        body: sseBody,
      });
    };
    await page.route('**/api/chat/stream', onlineChat);
    try {
      await chat.getByRole('button', { name: 'Hội thoại mới', exact: true }).click();
      await chat.getByRole('navigation', { name: 'Câu hỏi nhanh' }).getByRole('button', { name: 'Gợi ý điều động ca' }).click();
      // Action giả từ provider không khớp ChatHistoryTurnSchema bị reject fail-closed:
      // không render reply, không hiện nút confirm, không giả completed.
      await chat.locator('[data-sender="assistant"]').getByText('Dữ liệu hoàn tất phản hồi không đúng cấu trúc.', { exact: true }).waitFor();
      assert.equal(await chat.getByRole('button', { name: 'Xác nhận kế hoạch' }).count(), 0, 'Only server-bound actions can be confirmed');
      assert.equal(await chat.getByText('Đề xuất điều động ca trực cho chi nhánh đang thiếu người.').count(), 0, 'Unapproved provider action must not be marked completed');
      await chat.getByRole('button', { name: 'Hội thoại mới', exact: true }).click();
      await chat.getByRole('navigation', { name: 'Câu hỏi nhanh' }).getByRole('button', { name: 'Quy định kỷ luật' }).click();
      await chat.locator('details[aria-label="Trích dẫn"]').waitFor();
      assert.match(await chat.getByRole('log').textContent(), /không phải chính sách có hiệu lực/);
      await chat.getByRole('button', { name: 'Hội thoại mới', exact: true }).click();
      await chat.getByRole('navigation', { name: 'Câu hỏi nhanh' }).getByRole('button', { name: 'Báo cáo két ca' }).click();
      await chat.locator('[data-sender="assistant"]').getByText(/Không có số doanh thu đã xác thực/).waitFor();
      assert.match(await chat.locator('details[aria-label="Trích dẫn"]').textContent(), /không phải báo cáo thực tế/);
    } finally {
    await page.unroute('**/api/chat/stream', onlineChat);
    }
    assert.equal(await chat.evaluate((root) => {
      const banned = /(?:255, 209, 0|234, 179, 8|245, 158, 11|37, 99, 235|147, 197, 253|53, 67, 90|35, 49, 73)/;
      return [...root.querySelectorAll('*')].some((el) => {
        const style = getComputedStyle(el);
        return ['color', 'backgroundColor', 'borderColor', 'backgroundImage', 'boxShadow'].some((key) => banned.test(style[key]));
      });
    }), false);
    const composer = await chat.locator('.guta-chat-composer').boundingBox();
    assert.ok(composer.y > 600, 'Conversation composer must stay near the bottom');
    assert.equal(await chat.locator('.guta-chat-composer').evaluate((el) => getComputedStyle(el).borderRadius), '9999px');
    await chat.getByRole('button', { name: 'Quay lại Vận Hành (CRM)', exact: true }).click();
    // The store table is portal-mounted and API-backed: wait for it instead of
    // sampling visibility on the same tick as the tab switch.
    await page.getByRole('table').waitFor({ state: 'visible' });
    await page.waitForFunction(
      (expected) => document.querySelectorAll('table tbody tr[data-id]').length === expected,
      STORE_FIXTURE_ITEMS.length
    );
    assert.equal(await page.getByRole('table').isVisible(), true);
  });

  it('ChatPage: API hợp lệ, conversationId, spam Enter, Shift+Enter và escape HTML', async () => {
    const requests = [];
    let releaseFirstReply;
    let markFirstStarted;
    const firstReplyGate = new Promise((resolve) => { releaseFirstReply = resolve; });
    const firstStarted = new Promise((resolve) => { markFirstStarted = resolve; });
    const handler = async (route) => {
      if (route.request().method() === 'OPTIONS') {
        await route.fulfill({
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': route.request().headers().origin || `http://127.0.0.1:${server.address()?.port}`,
            'Access-Control-Allow-Credentials': 'true',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept, x-ai-service-key',
          },
        });
        return;
      }
      const data = route.request().postDataJSON();
      requests.push(data);
      // Exercise Enter while the first request is genuinely pending. An
      // immediate mock response can finish before the next keypress, making
      // that keypress a legitimate second message rather than a duplicate.
      if (requests.length === 1) { markFirstStarted(); await firstReplyGate; }
      const convId = '11111111-1111-4111-8111-111111111111';
      const clientMessageId = data.clientMessageId;
      const sseBody = [
        `event: accepted\ndata: ${JSON.stringify({ clientMessageId, messageId: clientMessageId, conversationId: convId, acceptedAt: new Date().toISOString() })}\n\n`,
        `event: done\ndata: ${JSON.stringify({
          conversationId: convId,
          turn: {
            id: clientMessageId,
            userMessage: data.message,
            createdAt: new Date().toISOString(),
            status: 'COMPLETED',
            reply: '<script>window.__chatInjected = true</script> Phản hồi kiểm thử API',
            replyHidden: false,
            citations: [{ document: 'Nguồn kiểm thử API', version: '1', article: 'Điều kiểm thử', score: 0.9 }],
            proposedAction: null,
            attachments: [],
          },
        })}\n\n`,
      ].join('');
      await route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Access-Control-Allow-Origin': route.request().headers().origin || `http://127.0.0.1:${server.address()?.port}`,
          'Access-Control-Allow-Credentials': 'true',
        },
        body: sseBody,
      });
    };
    await page.route('**/api/chat/stream', handler);
    try {
      await returnToCrm();
      await page.locator('nav a.crm-copilot').click();
      const chat = page.getByTestId('chat-page');
      const input = chat.getByRole('textbox', { name: 'Tin nhắn cho Guta AI' });
      const singleLineHeight = await input.evaluate((el) => el.getBoundingClientRect().height);
      await input.fill(Array(12).fill('Dòng kiểm thử').join('\n'));
      assert.equal(Math.round(await input.evaluate((el) => el.getBoundingClientRect().height)), 192);
      assert.equal(await input.evaluate((el) => el.scrollHeight > el.clientHeight), true);
      await input.fill('');
      assert.equal(Math.round(await input.evaluate((el) => el.getBoundingClientRect().height)), Math.round(singleLineHeight));
      await input.fill('<img src=x onerror="window.__chatInjected=true">');
      await input.press('Shift+Enter');
      assert.match(await input.inputValue(), /\n$/);
      assert.ok(await input.evaluate((el) => el.getBoundingClientRect().height) > singleLineHeight);
      await input.press('Enter');
      await firstStarted;
      await input.fill('Không gửi trùng');
      for (let i = 0; i < 3; i++) await input.press('Enter');
      assert.equal(requests.length, 1);
      releaseFirstReply();
      await chat.locator('[data-sender="assistant"]').getByText(/Phản hồi kiểm thử API/).waitFor();
      assert.equal(requests.length, 1);
      assert.equal(requests[0].message, '<img src=x onerror="window.__chatInjected=true">');
      assert.equal(requests[0].role, undefined, 'Client role is not an authorization input');
      assert.equal(requests[0].modelTier, undefined); // tier slider removed (2026-10-30)
      assert.equal(requests[0].userContext, undefined, 'Only server-resolved identity may reach the scoped gateway');
      assert.equal(await chat.locator('[data-sender="user"]').count(), 1);
      assert.equal(await chat.locator('details[aria-label="Trích dẫn"]').isVisible(), true);
      assert.equal(await chat.getByRole('button', { name: 'Xác nhận kế hoạch' }).count(), 0);
      assert.equal(await page.evaluate(() => window.__chatInjected), undefined);
      assert.equal(await chat.getByText(/Demo an toàn/).count(), 0);
      await input.fill('Câu hỏi tiếp theo');
      await input.press('Enter');
      await page.waitForFunction(() => document.querySelectorAll('[data-sender="assistant"]').length === 2);
      assert.equal(requests[1].conversationId, '11111111-1111-4111-8111-111111111111');
      assert.equal(requests.length, 2);
      await page.keyboard.press('Escape');
    } finally {
      releaseFirstReply();
      await page.unroute('**/api/chat/stream', handler);
    }
  });

  it('ChatPage: hủy fetch khi quay CRM, không nhận phản hồi cũ sau New Chat', async () => {
    let requestStarted;
    const started = new Promise((resolve) => { requestStarted = resolve; });
    let releaseResponse;
    let responseGate = new Promise((resolve) => { releaseResponse = resolve; });
    const handler = async (route) => {
      if (route.request().method() === 'OPTIONS') {
        await route.fulfill({
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': route.request().headers().origin || `http://127.0.0.1:${server.address()?.port}`,
            'Access-Control-Allow-Credentials': 'true',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept, x-ai-service-key',
          },
        });
        return;
      }
      requestStarted();
      await responseGate;
      const data = route.request().postDataJSON() || {};
      const clientMessageId = data.clientMessageId || '11111111-1111-4111-8111-111111111111';
      const convId = '11111111-1111-4111-8111-111111111111';
      const sseBody = [
        `event: accepted\ndata: ${JSON.stringify({ clientMessageId, messageId: clientMessageId, conversationId: convId, acceptedAt: new Date().toISOString() })}\n\n`,
        `event: done\ndata: ${JSON.stringify({
          conversationId: convId,
          turn: {
            id: clientMessageId,
            userMessage: data.message || 'test',
            createdAt: new Date().toISOString(),
            status: 'COMPLETED',
            reply: 'Phản hồi cũ không được hiển thị',
            replyHidden: false,
            citations: [],
            attachments: [],
            proposedAction: null,
          },
        })}\n\n`,
      ].join('');
      await route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Access-Control-Allow-Origin': route.request().headers().origin || `http://127.0.0.1:${server.address()?.port}`,
          'Access-Control-Allow-Credentials': 'true',
        },
        body: sseBody,
      }).catch(() => {});
    };
    await page.route('**/api/chat/stream', handler);
    await page.evaluate(() => {
      window.__chatAborts = 0;
      const originalFetch = window.fetch;
      window.fetch = function (url, options) {
        if (String(url).includes('/chat')) {
          options?.signal?.addEventListener('abort', () => { window.__chatAborts++; }, { once: true });
        }
        return originalFetch.call(this, url, options);
      };
      window.__restoreAbort = () => { window.fetch = originalFetch; };
    });
    try {
      await returnToCrm();
      await page.locator('nav a.crm-copilot').click();
      await page.getByRole('textbox', { name: 'Tin nhắn cho Guta AI' }).fill('Kiểm tra fetch');
      await page.keyboard.press('Enter');
      await started;
      await page.getByRole('button', { name: 'Hội thoại mới', exact: true }).click();
      assert.equal(await page.evaluate(() => window.__chatAborts), 1);
      releaseResponse();
      await page.waitForTimeout(100);
      assert.equal(await page.getByRole('log').count(), 0);
      assert.equal(await page.getByText('Phản hồi cũ không được hiển thị').count(), 0);
      const secondStarted = new Promise((resolve) => { requestStarted = resolve; });
      responseGate = new Promise((resolve) => { releaseResponse = resolve; });
      await page.getByRole('textbox', { name: 'Tin nhắn cho Guta AI' }).fill('Kiểm tra unmount');
      await page.keyboard.press('Enter');
      await secondStarted;
      await page.getByRole('button', { name: 'Quay lại CRM', exact: true }).click();
      assert.equal(await page.evaluate(() => window.__chatAborts), 2);
      releaseResponse();
      assert.equal(await page.getByTestId('chat-page').count(), 0);
    } finally {
      releaseResponse();
      await page.unroute('**/api/chat/stream', handler);
      await page.evaluate(() => window.__restoreAbort());
    }
    assert.deepEqual(consoleErrors, []);
  });
  it('ChatPage streaming: chunk đầu hiển thị khi upstream còn mở, sau đó hoàn tất done', async () => {
    const diagnosticEvents = [];
    const onReqFailed = (request) => {
      const url = new URL(request.url());
      if (url.pathname.includes('/chat')) {
        console.log(`[Diagnostic] requestfailed: ${request.method()} ${url.hostname}${url.pathname} error=${request.failure()?.errorText}`);
      }
    };
    const onResponse = (response) => {
      const url = new URL(response.url());
      if (url.pathname.includes('/chat')) {
        const ct = response.headers()['content-type'] || '';
        console.log(`[Diagnostic] response: ${response.request().method()} ${url.hostname}${url.pathname} status=${response.status()} content-type=${ct}`);
        diagnosticEvents.push({
          method: response.request().method(),
          path: `${url.hostname}${url.pathname}`,
          status: response.status(),
          contentType: ct,
        });
      }
    };
    page.on('requestfailed', onReqFailed);
    page.on('response', onResponse);

    let releaseStep1;
    const step1Promise = new Promise((resolve) => { releaseStep1 = resolve; });
    let releaseFinish;
    const finishPromise = new Promise((resolve) => { releaseFinish = resolve; });

    const convId = '55555555-5555-4555-8555-555555555555';

    streamRouteHandler = async (req, res) => {
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', async () => {
        const parsed = JSON.parse(body);
        const clientMessageId = parsed.clientMessageId;

        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': req.headers.origin || `http://127.0.0.1:${server.address()?.port}`,
          'Access-Control-Allow-Credentials': 'true',
        });

        res.write(`event: accepted\ndata: ${JSON.stringify({
          clientMessageId,
          messageId: clientMessageId,
          conversationId: convId,
          acceptedAt: new Date().toISOString(),
        })}\n\n`);

        res.write(`event: chunk\ndata: ${JSON.stringify({
          clientMessageId,
          messageId: clientMessageId,
          seq: 0,
          kind: 'text',
          delta: 'Đề xuất phân bổ ca sáng',
        })}\n\n`);

        releaseStep1();
        await finishPromise;

        res.write(`event: chunk\ndata: ${JSON.stringify({
          clientMessageId,
          messageId: clientMessageId,
          seq: 1,
          kind: 'text',
          delta: ' cho chi nhánh Tân Bình.',
        })}\n\n`);

        res.write(`event: done\ndata: ${JSON.stringify({
          conversationId: convId,
          turn: {
            id: clientMessageId,
            userMessage: parsed.message,
            createdAt: new Date().toISOString(),
            status: 'COMPLETED',
            reply: 'Đề xuất phân bổ ca sáng cho chi nhánh Tân Bình.',
            replyHidden: false,
            citations: [{ document: 'Quy chế phân ca 2026', version: 'v1', article: 'Điều 3', score: 0.92 }],
            attachments: [],
            proposedAction: null,
          },
        })}\n\n`);

        res.end();
      });
    };

    await routeChatStream();
    try {
      await returnToCrm();
      await page.locator('nav a.crm-copilot').click();
      const chat = page.getByTestId('chat-page');
      const input = chat.getByRole('textbox', { name: 'Tin nhắn cho Guta AI' });

      await input.fill('Kiểm tra stream thật mở');
      await input.press('Enter');

      await step1Promise;

      await chat.getByText('Đề xuất phân bổ ca sáng').waitFor();
      assert.equal(await chat.locator('[data-sender="assistant"]').count(), 1);
      assert.equal(await chat.getByText('cho chi nhánh Tân Bình.').count(), 0);

      releaseFinish();

      await chat.locator('[data-sender="assistant"]').getByText('Đề xuất phân bổ ca sáng cho chi nhánh Tân Bình.', { exact: true }).waitFor();
      assert.equal(await chat.locator('details[aria-label="Trích dẫn"]').isVisible(), true);
      assert.ok(diagnosticEvents.some((e) => e.path.endsWith('/api/chat/stream') && e.status === 200 && e.contentType.includes('text/event-stream')));
    } finally {
      page.off('requestfailed', onReqFailed);
      page.off('response', onResponse);
      releaseFinish();
      streamRouteHandler = null;
      await page.unroute('**/api/chat/stream');
    }
  });

  it('ChatPage streaming: chia cắt byte UTF-8 đa byte và event frame qua nhiều TCP chunk', async () => {
    let releaseDone;
    const donePromise = new Promise((resolve) => { releaseDone = resolve; });
    const convId = '66666666-6666-4666-8666-666666666666';

    streamRouteHandler = async (req, res) => {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', async () => {
        const parsed = JSON.parse(body);
        const clientMessageId = parsed.clientMessageId;

        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': req.headers.origin || `http://127.0.0.1:${server.address()?.port}`,
          'Access-Control-Allow-Credentials': 'true',
        });

        res.write(`event: accepted\ndata: ${JSON.stringify({
          clientMessageId,
          messageId: clientMessageId,
          conversationId: convId,
          acceptedAt: new Date().toISOString(),
        })}\n\n`);

        const textPayload = 'Điều phối ca trực ☕';
        const frame = `event: chunk\ndata: ${JSON.stringify({
          clientMessageId,
          messageId: clientMessageId,
          seq: 0,
          kind: 'text',
          delta: textPayload,
        })}\n\n`;

        const frameBuffer = Buffer.from(frame, 'utf-8');
        const splitIdx = frameBuffer.indexOf(Buffer.from('Điều', 'utf-8')) + 1;

        res.write(frameBuffer.subarray(0, splitIdx));
        await new Promise((r) => setTimeout(r, 40));
        res.write(frameBuffer.subarray(splitIdx));

        res.write(`event: done\ndata: ${JSON.stringify({
          conversationId: convId,
          turn: {
            id: clientMessageId,
            userMessage: parsed.message,
            createdAt: new Date().toISOString(),
            status: 'COMPLETED',
            reply: textPayload,
            replyHidden: false,
            citations: [],
            attachments: [],
            proposedAction: null,
          },
        })}\n\n`);

        res.end();
        releaseDone();
      });
    };

    await routeChatStream();

    try {
      await returnToCrm();
      await page.locator('nav a.crm-copilot').click();
      const chat = page.getByTestId('chat-page');
      const input = chat.getByRole('textbox', { name: 'Tin nhắn cho Guta AI' });

      await input.fill('Kiểm tra UTF-8 split');
      await input.press('Enter');

      await donePromise;

      await chat.locator('[data-sender="assistant"]').getByText('Điều phối ca trực ☕', { exact: true }).waitFor();
      const content = await chat.locator('[data-sender="assistant"]').textContent();
      assert.ok(!content.includes('\uFFFD'));
    } finally {
      streamRouteHandler = null;
      await page.unroute('**/api/chat/stream');
    }
  });

  it('ChatPage streaming: error sau partial text xóa nội dung chưa hoàn tất và hiển thị lỗi an toàn', async () => {
    let releaseStarted;
    const startedPromise = new Promise((resolve) => { releaseStarted = resolve; });
    const convId = '77777777-7777-4777-8777-777777777777';

    streamRouteHandler = async (req, res) => {
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', async () => {
        const parsed = JSON.parse(body);
        const clientMessageId = parsed.clientMessageId;

        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': req.headers.origin || `http://127.0.0.1:${server.address()?.port}`,
          'Access-Control-Allow-Credentials': 'true',
        });

        res.write(`event: accepted\ndata: ${JSON.stringify({
          clientMessageId,
          messageId: clientMessageId,
          conversationId: convId,
          acceptedAt: new Date().toISOString(),
        })}\n\n`);

        res.write(`event: chunk\ndata: ${JSON.stringify({
          clientMessageId,
          messageId: clientMessageId,
          seq: 0,
          kind: 'text',
          delta: 'Thông tin bảo mật chưa kiểm định',
        })}\n\n`);

        releaseStarted();
        await new Promise((r) => setTimeout(r, 60));

        res.write(`event: error\ndata: ${JSON.stringify({
          clientMessageId,
          messageId: clientMessageId,
          code: 'SAFETY_BLOCKED',
          message: 'Nội dung bị chặn theo quy định an toàn.',
          retryable: false,
        })}\n\n`);

        res.end();
      });
    };

    await routeChatStream();

    try {
      await returnToCrm();
      await page.locator('nav a.crm-copilot').click();
      const chat = page.getByTestId('chat-page');
      const input = chat.getByRole('textbox', { name: 'Tin nhắn cho Guta AI' });

      await input.fill('Kiểm tra safety error');
      await input.press('Enter');

      await startedPromise;

      await chat.locator('[data-sender="assistant"]').getByText(/Nội dung không thể hiển thị do vi phạm chính sách an toàn|Nội dung bị chặn theo quy định an toàn/).waitFor();
      assert.equal(await chat.getByText('Thông tin bảo mật chưa kiểm định').count(), 0);
    } finally {
      streamRouteHandler = null;
      await page.unroute('**/api/chat/stream');
    }
  });

  it('ChatPage streaming: New Chat hủy stream, không append chunk cũ', async () => {
    let releaseGate;
    const gatePromise = new Promise((resolve) => { releaseGate = resolve; });
    let reqReceived;
    const reqPromise = new Promise((resolve) => { reqReceived = resolve; });
    const convId = '88888888-8888-4888-8888-888888888888';

    streamRouteHandler = async (req, res) => {
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', async () => {
        const parsed = JSON.parse(body);
        const clientMessageId = parsed.clientMessageId;

        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': req.headers.origin || `http://127.0.0.1:${server.address()?.port}`,
          'Access-Control-Allow-Credentials': 'true',
        });

        res.write(`event: accepted\ndata: ${JSON.stringify({
          clientMessageId,
          messageId: clientMessageId,
          conversationId: convId,
          acceptedAt: new Date().toISOString(),
        })}\n\n`);

        res.write(`event: chunk\ndata: ${JSON.stringify({
          clientMessageId,
          messageId: clientMessageId,
          seq: 0,
          kind: 'text',
          delta: 'Đoạn tin cũ trước khi hủy',
        })}\n\n`);

        reqReceived();
        await gatePromise;

        res.write(`event: chunk\ndata: ${JSON.stringify({
          clientMessageId,
          messageId: clientMessageId,
          seq: 1,
          kind: 'text',
          delta: ' không được xuất hiện trong hội thoại mới.',
        })}\n\n`);

        res.write(`event: done\ndata: ${JSON.stringify({
          conversationId: convId,
          turn: {
            id: clientMessageId,
            userMessage: parsed.message,
            createdAt: new Date().toISOString(),
            status: 'COMPLETED',
            reply: 'Đoạn tin cũ trước khi hủy không được xuất hiện trong hội thoại mới.',
            replyHidden: false,
            citations: [],
            attachments: [],
            proposedAction: null,
          },
        })}\n\n`);

        res.end();
      });
    };

    await routeChatStream();

    try {
      await returnToCrm();
      await page.locator('nav a.crm-copilot').click();
      const chat = page.getByTestId('chat-page');
      const input = chat.getByRole('textbox', { name: 'Tin nhắn cho Guta AI' });

      await input.fill('Tin nhắn sắp bị hủy');
      await input.press('Enter');

      await reqPromise;
      await chat.getByText('Đoạn tin cũ trước khi hủy').waitFor();

      await chat.getByRole('button', { name: 'Hội thoại mới', exact: true }).click();

      releaseGate();
      await page.waitForTimeout(100);

      assert.equal(await chat.getByText('không được xuất hiện trong hội thoại mới.').count(), 0);
      assert.equal(await chat.locator('[data-sender="assistant"]').count(), 0);
    } finally {
      releaseGate();
      streamRouteHandler = null;
      await page.unroute('**/api/chat/stream');
    }
  });
  it('ChatPage streaming: logout thật khi đang stream hủy reader và không rò rỉ chunk sang phiên user khác', async () => {
    let releaseGate;
    const gatePromise = new Promise((resolve) => { releaseGate = resolve; });
    let reqReceived;
    const reqPromise = new Promise((resolve) => { reqReceived = resolve; });
    let resClosed = false;
    let clientDisconnected;
    const disconnectPromise = new Promise((resolve) => { clientDisconnected = resolve; });
    const convId = '88888888-8888-4888-8888-888888888888';

    streamRouteHandler = async (req, res) => {
      res.on('error', (err) => {
        if (!['ERR_STREAM_DESTROYED', 'EPIPE', 'ECONNRESET'].includes(err?.code)) {
          throw err;
        }
      });
      res.on('close', () => {
        resClosed = true;
        if (!res.writableEnded) {
          clientDisconnected?.();
        }
      });

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', async () => {
        const parsed = JSON.parse(body);
        const clientMessageId = parsed.clientMessageId;

        if (res.destroyed || res.writableEnded) return;

        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': req.headers.origin || `http://127.0.0.1:${server.address()?.port}`,
          'Access-Control-Allow-Credentials': 'true',
        });

        res.write(`event: accepted\ndata: ${JSON.stringify({
          clientMessageId,
          messageId: clientMessageId,
          conversationId: convId,
          acceptedAt: new Date().toISOString(),
        })}\n\n`);

        res.write(`event: chunk\ndata: ${JSON.stringify({
          clientMessageId,
          messageId: clientMessageId,
          seq: 0,
          kind: 'text',
          delta: 'Dữ liệu dở dang trước khi đăng xuất',
        })}\n\n`);

        reqReceived();
        await gatePromise;

        if (res.destroyed || res.writableEnded) return;

        res.write(`event: chunk\ndata: ${JSON.stringify({
          clientMessageId,
          messageId: clientMessageId,
          seq: 1,
          kind: 'text',
          delta: ' và phần đuôi không được lọt sang phiên mới.',
        })}\n\n`);

        res.write(`event: done\ndata: ${JSON.stringify({
          conversationId: convId,
          turn: {
            id: clientMessageId,
            userMessage: parsed.message,
            createdAt: new Date().toISOString(),
            status: 'COMPLETED',
            reply: 'Dữ liệu dở dang trước khi đăng xuất và phần đuôi không được lọt sang phiên mới.',
            replyHidden: false,
            citations: [],
            attachments: [],
            proposedAction: null,
          },
        })}\n\n`);

        res.end();
      });
    };

    await routeChatStream();

    try {
      const userAId = activeUser?.id;
      await returnToCrm();
      await page.locator('nav a.crm-copilot').click();
      const chat = page.getByTestId('chat-page');
      const input = chat.getByRole('textbox', { name: 'Tin nhắn cho Guta AI' });

      await input.fill('Tin nhắn sắp bị ngắt bởi đăng xuất');
      await input.press('Enter');

      await reqPromise;
      await chat.getByText('Dữ liệu dở dang trước khi đăng xuất').waitFor();

      assert.equal(resClosed, false, 'SSE stream connection must still be open before logout');
      await page.getByRole('button', { name: 'Đăng Xuất Phiên', exact: true }).click();
      await disconnectPromise;

      await page.getByRole('button', { name: /Get Started/i }).waitFor();
      assert.equal(await page.getByTestId('chat-page').count(), 0);

      releaseGate();
      await page.waitForTimeout(100);

      await page.getByRole('button', { name: /Get Started/i }).click();
      await page.getByLabel('Tên đăng nhập', { exact: true }).fill('employee2');
      await page.getByLabel('Mật khẩu', { exact: true }).fill('fixture-password');
      await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();

      await page.getByRole('table').waitFor({ state: 'visible' });

      const userBId = activeUser?.id;
      assert.ok(userAId, 'User A identity must be recorded in fixture before logout');
      assert.ok(userBId, 'User B identity must be recorded in fixture after second login');
      assert.notEqual(userAId, userBId, 'User A and User B must have distinct fixture identities');
      assert.equal(userAId, 'fixture-employee');
      assert.equal(userBId, 'fixture-employee2');

      await page.locator('nav a.crm-copilot').click();

      const newChatPage = page.getByTestId('chat-page');
      await newChatPage.waitFor({ state: 'visible' });

      assert.equal(await newChatPage.getByText('Dữ liệu dở dang trước khi đăng xuất').count(), 0);
      assert.equal(await newChatPage.getByText('phần đuôi không được lọt sang phiên mới.').count(), 0);
      assert.equal(await newChatPage.locator('[data-sender="assistant"]').count(), 0);

      await page.getByRole('button', { name: 'Đăng Xuất Phiên', exact: true }).click();
      await page.getByRole('button', { name: /Get Started/i }).waitFor();
      await page.getByRole('button', { name: /Get Started/i }).click();
      await page.getByLabel('Tên đăng nhập', { exact: true }).fill('employee');
      await page.getByLabel('Mật khẩu', { exact: true }).fill('fixture-password');
      await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
      await page.getByRole('table').waitFor({ state: 'visible' });
      assert.equal(activeUser?.id, 'fixture-employee');
    } finally {
      releaseGate();
      streamRouteHandler = null;
      await page.unroute('**/api/chat/stream');
      await page.route('**/api/chat/stream', (route) => route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: '' }));
      if (await page.getByRole('button', { name: /Get Started/i }).isVisible().catch(() => false)) {
        await signInAs('employee').catch(() => {});
      }
    }
  });

  it('ChatPage streaming: chặn spam Enter trong khi stream đang chạy', async () => {
    let requestsCount = 0;
    let releaseGate;
    const gatePromise = new Promise((resolve) => { releaseGate = resolve; });
    const convId = '99999999-9999-4999-8999-999999999999';

    streamRouteHandler = async (req, res) => {
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }
      requestsCount++;
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', async () => {
        const parsed = JSON.parse(body);
        const clientMessageId = parsed.clientMessageId;

        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': req.headers.origin || `http://127.0.0.1:${server.address()?.port}`,
          'Access-Control-Allow-Credentials': 'true',
        });

        res.write(`event: accepted\ndata: ${JSON.stringify({
          clientMessageId,
          messageId: clientMessageId,
          conversationId: convId,
          acceptedAt: new Date().toISOString(),
        })}\n\n`);

        res.write(`event: chunk\ndata: ${JSON.stringify({
          clientMessageId,
          messageId: clientMessageId,
          seq: 0,
          kind: 'text',
          delta: 'Phản hồi đơn lẻ duy nhất.',
        })}\n\n`);

        await gatePromise;

        res.write(`event: done\ndata: ${JSON.stringify({
          conversationId: convId,
          turn: {
            id: clientMessageId,
            userMessage: parsed.message,
            createdAt: new Date().toISOString(),
            status: 'COMPLETED',
            reply: 'Phản hồi đơn lẻ duy nhất.',
            replyHidden: false,
            citations: [],
            attachments: [],
            proposedAction: null,
          },
        })}\n\n`);

        res.end();
      });
    };

    await routeChatStream();

    try {
      await returnToCrm();
      await page.locator('nav a.crm-copilot').click();
      const chat = page.getByTestId('chat-page');
      const input = chat.getByRole('textbox', { name: 'Tin nhắn cho Guta AI' });

      await input.fill('Thử nghiệm spam Enter');
      await input.press('Enter');
      for (let i = 0; i < 3; i++) {
        await input.press('Enter');
      }

      releaseGate();
      await chat.locator('[data-sender="assistant"]').getByText('Phản hồi đơn lẻ duy nhất.', { exact: true }).waitFor();
      assert.equal(requestsCount, 1);
    } finally {
      releaseGate();
      streamRouteHandler = null;
      await page.unroute('**/api/chat/stream');
    }
  });
  it('ChatPage streaming: EOF sau nội dung done JSON nhưng trước delimiter không gọi onDone', async () => {
    let releaseStarted;
    const startedPromise = new Promise((resolve) => { releaseStarted = resolve; });
    const convId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

    streamRouteHandler = async (req, res) => {
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', async () => {
        const parsed = JSON.parse(body);
        const clientMessageId = parsed.clientMessageId;

        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': req.headers.origin || `http://127.0.0.1:${server.address()?.port}`,
          'Access-Control-Allow-Credentials': 'true',
        });

        res.write(`event: accepted\ndata: ${JSON.stringify({
          clientMessageId,
          messageId: clientMessageId,
          conversationId: convId,
          acceptedAt: new Date().toISOString(),
        })}\n\n`);

        res.write(`event: chunk\ndata: ${JSON.stringify({
          clientMessageId,
          messageId: clientMessageId,
          seq: 0,
          kind: 'text',
          delta: 'Đoạn chữ sắp bị ngắt cụt',
        })}\n\n`);

        releaseStarted();
        await new Promise((r) => setTimeout(r, 60));

        const incompleteDone = `event: done\ndata: ${JSON.stringify({
          conversationId: convId,
          turn: {
            id: clientMessageId,
            userMessage: parsed.message,
            createdAt: new Date().toISOString(),
            status: 'COMPLETED',
            reply: 'Đoạn chữ sắp bị ngắt cụt và hoàn tất giả mạo',
            replyHidden: false,
            citations: [],
            attachments: [],
            proposedAction: null,
          },
        })}`;

        res.write(incompleteDone);
        res.end();
      });
    };

    await routeChatStream();

    try {
      await returnToCrm();
      await page.locator('nav a.crm-copilot').click();
      const chat = page.getByTestId('chat-page');
      const input = chat.getByRole('textbox', { name: 'Tin nhắn cho Guta AI' });

      await input.fill('Kiểm tra ngắt cụt trước delimiter');
      await input.press('Enter');

      await startedPromise;

      await chat.locator('[data-sender="assistant"]').getByText(/Kết nối máy chủ bị ngắt trước khi nhận phản hồi hoàn chỉnh|Không thể kết nối đến máy chủ AI/).waitFor();
      assert.equal(await chat.getByText('Đoạn chữ sắp bị ngắt cụt').count(), 0);
      assert.equal(await chat.getByText('hoàn tất giả mạo').count(), 0);
    } finally {
      streamRouteHandler = null;
      await page.unroute('**/api/chat/stream');
    }
  });

  it('ChatPage streaming: error theo sau bởi done không tạo completion', async () => {
    let releaseDone;
    const donePromise = new Promise((resolve) => { releaseDone = resolve; });
    const convId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

    streamRouteHandler = async (req, res) => {
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', async () => {
        const parsed = JSON.parse(body);
        const clientMessageId = parsed.clientMessageId;

        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': req.headers.origin || `http://127.0.0.1:${server.address()?.port}`,
          'Access-Control-Allow-Credentials': 'true',
        });

        res.write(`event: accepted\ndata: ${JSON.stringify({
          clientMessageId,
          messageId: clientMessageId,
          conversationId: convId,
          acceptedAt: new Date().toISOString(),
        })}\n\n`);

        res.write(`event: error\ndata: ${JSON.stringify({
          clientMessageId,
          messageId: clientMessageId,
          code: 'SAFETY_BLOCKED',
          message: 'Nội dung bị chặn theo quy định.',
          retryable: false,
        })}\n\n`);

        await new Promise((r) => setTimeout(r, 40));

        res.write(`event: done\ndata: ${JSON.stringify({
          conversationId: convId,
          turn: {
            id: clientMessageId,
            userMessage: parsed.message,
            createdAt: new Date().toISOString(),
            status: 'COMPLETED',
            reply: 'Nội dung lẽ ra không được xuất hiện sau error',
            replyHidden: false,
            citations: [],
            attachments: [],
            proposedAction: null,
          },
        })}\n\n`);

        res.end();
        releaseDone();
      });
    };

    await routeChatStream();

    try {
      await returnToCrm();
      await page.locator('nav a.crm-copilot').click();
      const chat = page.getByTestId('chat-page');
      const input = chat.getByRole('textbox', { name: 'Tin nhắn cho Guta AI' });

      await input.fill('Kiểm tra error trước done');
      await input.press('Enter');

      await donePromise;

      await chat.locator('[data-sender="assistant"]').getByText(/Nội dung không thể hiển thị do vi phạm chính sách an toàn/).waitFor();
      assert.equal(await chat.getByText('Nội dung lẽ ra không được xuất hiện sau error').count(), 0);
    } finally {
      streamRouteHandler = null;
      await page.unroute('**/api/chat/stream');
    }
  });

  it('ChatPage streaming: HTTP 200 JSON reply bị từ chối, không giả COMPLETED', async () => {
    const fakeJsonHandler = async (route) => {
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        json: { reply: 'Giả lập completed không theo chuẩn SSE' },
      });
    };

    await page.route('**/api/chat/stream', fakeJsonHandler);

    try {
      await returnToCrm();
      await page.locator('nav a.crm-copilot').click();
      const chat = page.getByTestId('chat-page');
      const input = chat.getByRole('textbox', { name: 'Tin nhắn cho Guta AI' });

      await input.fill('Kiểm tra từ chối HTTP 200 JSON');
      await input.press('Enter');

      await chat.locator('[data-sender="assistant"]').getByText(/Không thể kết nối đến máy chủ AI/).waitFor();
      await chat.locator('[data-testid="chat-service-unavailable"]').waitFor();
      assert.equal(await chat.getByText('Giả lập completed không theo chuẩn SSE').count(), 0);
    } finally {
      await page.unroute('**/api/chat/stream', fakeJsonHandler);
    }
  });

  it('ChatPage streaming: sai turn id trong event done không được merge', async () => {
    let releaseDone;
    const donePromise = new Promise((resolve) => { releaseDone = resolve; });
    const convId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

    streamRouteHandler = async (req, res) => {
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', async () => {
        const parsed = JSON.parse(body);
        const clientMessageId = parsed.clientMessageId;

        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': req.headers.origin || `http://127.0.0.1:${server.address()?.port}`,
          'Access-Control-Allow-Credentials': 'true',
        });

        res.write(`event: accepted\ndata: ${JSON.stringify({
          clientMessageId,
          messageId: clientMessageId,
          conversationId: convId,
          acceptedAt: new Date().toISOString(),
        })}\n\n`);

        res.write(`event: done\ndata: ${JSON.stringify({
          conversationId: convId,
          turn: {
            id: '00000000-0000-0000-0000-000000000000',
            userMessage: parsed.message,
            createdAt: new Date().toISOString(),
            status: 'COMPLETED',
            reply: 'Câu trả lời có turn id sai lệch không được hiển thị',
            replyHidden: false,
            citations: [],
            attachments: [],
            proposedAction: null,
          },
        })}\n\n`);

        res.end();
        releaseDone();
      });
    };

    await routeChatStream();

    try {
      await returnToCrm();
      await page.locator('nav a.crm-copilot').click();
      const chat = page.getByTestId('chat-page');
      const input = chat.getByRole('textbox', { name: 'Tin nhắn cho Guta AI' });

      await input.fill('Kiểm tra sai turn id');
      await input.press('Enter');

      await donePromise;

      await chat.locator('[data-sender="assistant"]').getByText(/Không thể kết nối đến máy chủ AI|Mã tin nhắn của lượt hoàn tất không khớp/).waitFor();
      assert.equal(await chat.getByText('Câu trả lời có turn id sai lệch không được hiển thị').count(), 0);
    } finally {
      streamRouteHandler = null;
      await page.unroute('**/api/chat/stream');
    }
  });

  it('ChatPage streaming: frame quá lớn vượt giới hạn bộ đệm kích hoạt fail-closed', async () => {
    let releaseSent;
    const sentPromise = new Promise((resolve) => { releaseSent = resolve; });
    const convId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

    streamRouteHandler = async (req, res) => {
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', async () => {
        const parsed = JSON.parse(body);
        const clientMessageId = parsed.clientMessageId;

        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': req.headers.origin || `http://127.0.0.1:${server.address()?.port}`,
          'Access-Control-Allow-Credentials': 'true',
        });

        res.write(`event: accepted\ndata: ${JSON.stringify({
          clientMessageId,
          messageId: clientMessageId,
          conversationId: convId,
          acceptedAt: new Date().toISOString(),
        })}\n\n`);

        const hugeBuffer = Buffer.alloc(70 * 1024, 'a');
        res.write('data: ' + hugeBuffer.toString());

        releaseSent();
        res.end();
      });
    };

    await routeChatStream();

    try {
      await returnToCrm();
      await page.locator('nav a.crm-copilot').click();
      const chat = page.getByTestId('chat-page');
      const input = chat.getByRole('textbox', { name: 'Tin nhắn cho Guta AI' });

      await input.fill('Kiểm tra buffer overflow');
      await input.press('Enter');

      await sentPromise;

      await chat.locator('[data-sender="assistant"]').getByText(/Phản hồi vượt quá giới hạn bộ đệm cho phép|Không thể kết nối đến máy chủ AI/).waitFor();
    } finally {
      streamRouteHandler = null;
      await page.unroute('**/api/chat/stream');
    }
  });

  it('ChatPage streaming: sai error ID trong event error kích hoạt fail-closed', async () => {
    let releaseSent;
    const sentPromise = new Promise((resolve) => { releaseSent = resolve; });
    const convId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

    streamRouteHandler = async (req, res) => {
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', async () => {
        const parsed = JSON.parse(body);
        const clientMessageId = parsed.clientMessageId;

        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': req.headers.origin || `http://127.0.0.1:${server.address()?.port}`,
          'Access-Control-Allow-Credentials': 'true',
        });

        res.write(`event: accepted\ndata: ${JSON.stringify({
          clientMessageId,
          messageId: clientMessageId,
          conversationId: convId,
          acceptedAt: new Date().toISOString(),
        })}\n\n`);

        res.write(`event: chunk\ndata: ${JSON.stringify({
          clientMessageId,
          messageId: clientMessageId,
          seq: 0,
          kind: 'text',
          delta: 'Dữ liệu tạm thời không được giữ lại',
        })}\n\n`);

        await new Promise((r) => setTimeout(r, 40));

        res.write(`event: error\ndata: ${JSON.stringify({
          clientMessageId: 'mismatched-client-message-id',
          messageId: 'mismatched-client-message-id',
          code: 'AI_SERVICE_UNAVAILABLE',
          message: 'Lỗi với mã tin nhắn giả mạo',
          retryable: false,
        })}\n\n`);

        res.end();
        releaseSent();
      });
    };

    await routeChatStream();

    try {
      await returnToCrm();
      await page.locator('nav a.crm-copilot').click();
      const chat = page.getByTestId('chat-page');
      const input = chat.getByRole('textbox', { name: 'Tin nhắn cho Guta AI' });

      await input.fill('Kiểm tra sai error id');
      await input.press('Enter');

      await sentPromise;

      await chat.locator('[data-sender="assistant"]').getByText(/Mã tin nhắn trong thông báo lỗi không khớp|Không thể kết nối đến máy chủ AI|Dịch vụ AI hiện không khả dụng/).waitFor();
      assert.equal(await chat.getByText('Dữ liệu tạm thời không được giữ lại').count(), 0);
    } finally {
      streamRouteHandler = null;
      await page.unroute('**/api/chat/stream');
    }
  });

  it('ChatPage streaming: lifecycle race giữa 2 lượt liên tiếp bảo toàn timer và state', async () => {
    let turnCount = 0;
    const convId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

    streamRouteHandler = async (req, res) => {
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', async () => {
        turnCount++;
        const currentTurn = turnCount;
        const parsed = JSON.parse(body);
        const clientMessageId = parsed.clientMessageId;

        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': req.headers.origin || `http://127.0.0.1:${server.address()?.port}`,
          'Access-Control-Allow-Credentials': 'true',
        });

        res.write(`event: accepted\ndata: ${JSON.stringify({
          clientMessageId,
          messageId: clientMessageId,
          conversationId: convId,
          acceptedAt: new Date().toISOString(),
        })}\n\n`);

        res.write(`event: chunk\ndata: ${JSON.stringify({
          clientMessageId,
          messageId: clientMessageId,
          seq: 0,
          kind: 'text',
          delta: `Trả lời lượt ${currentTurn}`,
        })}\n\n`);

        res.write(`event: done\ndata: ${JSON.stringify({
          conversationId: convId,
          turn: {
            id: clientMessageId,
            userMessage: parsed.message,
            createdAt: new Date().toISOString(),
            status: 'COMPLETED',
            reply: `Trả lời lượt ${currentTurn}`,
            replyHidden: false,
            citations: [],
            attachments: [],
            proposedAction: null,
          },
        })}\n\n`);

        res.end();
      });
    };

    await routeChatStream();

    try {
      await returnToCrm();
      await page.locator('nav a.crm-copilot').click();
      const chat = page.getByTestId('chat-page');
      const input = chat.getByRole('textbox', { name: 'Tin nhắn cho Guta AI' });

      // Gửi lượt 1
      await input.fill('Tin nhắn lượt 1');
      await input.press('Enter');
      await chat.locator('[data-sender="assistant"]').getByText('Trả lời lượt 1', { exact: true }).waitFor();

      // Gửi ngay lượt 2 (kiểm tra turn cũ không xóa timeout turn mới)
      await input.fill('Tin nhắn lượt 2');
      await input.press('Enter');
      await chat.locator('[data-sender="assistant"]').getByText('Trả lời lượt 2', { exact: true }).waitFor();

      assert.equal(turnCount, 2);
      assert.equal(await chat.locator('[data-sender="assistant"]').getByText('Trả lời lượt 1', { exact: true }).count(), 1);
      assert.equal(await chat.locator('[data-sender="assistant"]').getByText('Trả lời lượt 2', { exact: true }).count(), 1);
    } finally {
      streamRouteHandler = null;
      await page.unroute('**/api/chat/stream');
    }
  });

  it('ChatPage streaming: chuyển hội thoại khi stream đang chạy hủy lượt cũ và tải đúng tin nhắn hội thoại mới', async () => {
    const convAId = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
    const convBId = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';

    const convList = {
      items: [
        { id: convAId, title: 'Hội thoại Alpha', updatedAt: '2026-11-01T10:00:00.000Z' },
        { id: convBId, title: 'Hội thoại Beta', updatedAt: '2026-11-01T09:00:00.000Z' },
      ],
      nextCursor: null,
    };

    const convAMessages = {
      conversation: convList.items[0],
      items: [],
      nextCursor: null,
    };

    const convBMessages = {
      conversation: convList.items[1],
      items: [
        {
          id: 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbb1',
          userMessage: 'Câu hỏi tại hội thoại Beta',
          createdAt: '2026-11-01T09:00:00.000Z',
          status: 'COMPLETED',
          reply: 'Phản hồi lưu trữ hội thoại Beta',
          replyHidden: false,
          citations: [],
          attachments: [],
          proposedAction: null,
        },
      ],
      nextCursor: null,
    };

    let streamStarted;
    const streamPromise = new Promise((resolve) => { streamStarted = resolve; });
    let releaseStream;
    const releasePromise = new Promise((resolve) => { releaseStream = resolve; });

    streamRouteHandler = async (req, res) => {
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', async () => {
        const parsed = JSON.parse(body);
        const clientMessageId = parsed.clientMessageId;

        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': req.headers.origin || `http://127.0.0.1:${server.address()?.port}`,
          'Access-Control-Allow-Credentials': 'true',
        });

        res.write(`event: accepted\ndata: ${JSON.stringify({
          clientMessageId,
          messageId: clientMessageId,
          conversationId: convAId,
          acceptedAt: new Date().toISOString(),
        })}\n\n`);

        res.write(`event: chunk\ndata: ${JSON.stringify({
          clientMessageId,
          messageId: clientMessageId,
          seq: 0,
          kind: 'text',
          delta: 'Dữ liệu dang stream tai hoi thoai Alpha',
        })}\n\n`);

        streamStarted();
        await releasePromise;

        res.write(`event: chunk\ndata: ${JSON.stringify({
          clientMessageId,
          messageId: clientMessageId,
          seq: 1,
          kind: 'text',
          delta: ' - phan tiep theo khong duoc ro ri',
        })}\n\n`);
        res.end();
      });
    };

    const listRoute = (route) => route.fulfill({ status: 200, json: convList });
    const msgARoute = (route) => route.fulfill({ status: 200, json: convAMessages });
    const msgBRoute = (route) => route.fulfill({ status: 200, json: convBMessages });

    await page.route(`**/api/chat/conversations/${convAId}/messages*`, msgARoute);
    await page.route(`**/api/chat/conversations/${convBId}/messages*`, msgBRoute);
    await page.route('**/api/chat/conversations?*', listRoute);
    await routeChatStream();

    try {
      await returnToCrm();
      await page.locator('nav a.crm-copilot').click();
      const chat = page.getByTestId('chat-page');

      const sidebarBtn = chat.getByRole('button', { name: 'Mở danh sách hội thoại' });
      if (await sidebarBtn.isVisible()) {
        await sidebarBtn.click();
      }

      await chat.getByRole('button', { name: 'Hội thoại Alpha', exact: true }).click();
      const input = chat.getByRole('textbox', { name: 'Tin nhắn cho Guta AI' });
      await input.fill('Gửi câu hỏi tại Alpha');
      await input.press('Enter');

      await streamPromise;
      await chat.getByText('Dữ liệu dang stream tai hoi thoai Alpha').waitFor();

      // Chuyển sang hội thoại Beta khi stream Alpha đang chạy
      if (await sidebarBtn.isVisible()) {
        await sidebarBtn.click();
      }
      await chat.getByRole('button', { name: 'Hội thoại Beta', exact: true }).click();

      // Kiểm tra hội thoại Beta đã mở và nạp tin nhắn của Beta
      await chat.locator('[data-sender="assistant"]').getByText('Phản hồi lưu trữ hội thoại Beta', { exact: true }).waitFor();
      assert.equal(await chat.locator('[data-sender="assistant"]').getByText('Dữ liệu dang stream tai hoi thoai Alpha').count(), 0);
      // Thả stream Alpha hoàn tất và xác nhận không rò rỉ sang Beta
      releaseStream();
      await new Promise((r) => setTimeout(r, 60));
      assert.equal(await chat.locator('[data-sender="assistant"]').getByText('phan tiep theo khong duoc ro ri').count(), 0);
    } finally {
      releaseStream?.();
      streamRouteHandler = null;
      await page.unroute(`**/api/chat/conversations/${convAId}/messages*`, msgARoute);
      await page.unroute(`**/api/chat/conversations/${convBId}/messages*`, msgBRoute);
      await page.unroute('**/api/chat/conversations?*', listRoute);
      await page.unroute('**/api/chat/stream');
    }
  });
  it('ChatPage: chuyển giữa 2 hội thoại, verify messages và gửi turn tiếp theo đúng conversationId', async () => {
    const conv1Id = '11111111-2222-4333-8444-555555555551';
    const conv2Id = '11111111-2222-4333-8444-555555555552';

    const convList = {
      items: [
        { id: conv1Id, title: 'Hội thoại Tân Bình', updatedAt: '2026-11-01T10:00:00.000Z' },
        { id: conv2Id, title: 'Hội thoại Quận 1', updatedAt: '2026-11-01T09:00:00.000Z' },
      ],
      nextCursor: null,
    };

    const conv1Messages = {
      conversation: convList.items[0],
      items: [
        {
          id: '11111111-2222-4333-8444-55555555555a',
          userMessage: 'Câu hỏi ở Tân Bình',
          createdAt: '2026-11-01T10:00:00.000Z',
          status: 'COMPLETED',
          reply: 'Phản hồi chi nhánh Tân Bình',
          replyHidden: false,
          citations: [],
          attachments: [],
          proposedAction: null,
        },
      ],
      nextCursor: null,
    };

    const conv2Messages = {
      conversation: convList.items[1],
      items: [
        {
          id: '11111111-2222-4333-8444-55555555555b',
          userMessage: 'Câu hỏi ở Quận 1',
          createdAt: '2026-11-01T09:00:00.000Z',
          status: 'COMPLETED',
          reply: 'Phản hồi chi nhánh Quận 1',
          replyHidden: false,
          citations: [],
          attachments: [],
          proposedAction: null,
        },
      ],
      nextCursor: null,
    };

    let sentRequest = null;
    const listRoute = (route) => route.fulfill({ status: 200, json: convList });
    const msg1Route = (route) => route.fulfill({ status: 200, json: conv1Messages });
    const msg2Route = (route) => route.fulfill({ status: 200, json: conv2Messages });

    const streamHandler = async (route) => {
      if (route.request().method() === 'OPTIONS') {
        await route.fulfill({
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': route.request().headers().origin || `http://127.0.0.1:${server.address()?.port}`,
            'Access-Control-Allow-Credentials': 'true',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept, x-ai-service-key',
          },
        });
        return;
      }
      const data = route.request().postDataJSON();
      sentRequest = data;
      const sseBody = [
        `event: accepted\ndata: ${JSON.stringify({ clientMessageId: data.clientMessageId, messageId: data.clientMessageId, conversationId: data.conversationId, acceptedAt: new Date().toISOString() })}\n\n`,
        `event: done\ndata: ${JSON.stringify({
          conversationId: data.conversationId,
          turn: {
            id: data.clientMessageId,
            userMessage: data.message,
            createdAt: new Date().toISOString(),
            status: 'COMPLETED',
            reply: 'Đã nhận câu hỏi tiếp theo trong hội thoại 2',
            replyHidden: false,
            citations: [],
            attachments: [],
            proposedAction: null,
          },
        })}\n\n`,
      ].join('');
      await route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Access-Control-Allow-Origin': route.request().headers().origin || `http://127.0.0.1:${server.address()?.port}`,
          'Access-Control-Allow-Credentials': 'true',
        },
        body: sseBody,
      });
    };

    await page.route(`**/api/chat/conversations/${conv1Id}/messages*`, msg1Route);
    await page.route(`**/api/chat/conversations/${conv2Id}/messages*`, msg2Route);
    await page.route('**/api/chat/conversations?*', listRoute);
    await page.route('**/api/chat/stream', streamHandler);

    try {
      await returnToCrm();
      await page.locator('nav a.crm-copilot').click();
      const chat = page.getByTestId('chat-page');

      const sidebarBtn = chat.getByRole('button', { name: 'Mở danh sách hội thoại' });
      if (await sidebarBtn.isVisible()) {
        await sidebarBtn.click();
      }

      await chat.getByRole('button', { name: 'Hội thoại Tân Bình', exact: true }).click();
      await chat.locator('[data-sender="assistant"]').getByText('Phản hồi chi nhánh Tân Bình', { exact: true }).waitFor();
      assert.equal(await chat.getByText('Câu hỏi ở Tân Bình').isVisible(), true);
      assert.equal(await chat.locator('[data-sender="assistant"]').getByText('Phản hồi chi nhánh Quận 1').count(), 0);

      if (await sidebarBtn.isVisible()) {
        await sidebarBtn.click();
      }
      await chat.getByRole('button', { name: 'Hội thoại Quận 1', exact: true }).click();
      await chat.locator('[data-sender="assistant"]').getByText('Phản hồi chi nhánh Quận 1', { exact: true }).waitFor();
      assert.equal(await chat.getByText('Câu hỏi ở Quận 1').isVisible(), true);
      assert.equal(await chat.locator('[data-sender="assistant"]').getByText('Phản hồi chi nhánh Tân Bình').count(), 0);

      const input = chat.getByRole('textbox', { name: 'Tin nhắn cho Guta AI' });
      await input.fill('Hỏi tiếp ca trực tối ở Quận 1');
      await input.press('Enter');

      await chat.locator('[data-sender="assistant"]').getByText('Đã nhận câu hỏi tiếp theo trong hội thoại 2', { exact: true }).waitFor();

      assert.ok(sentRequest);
      assert.equal(sentRequest.conversationId, conv2Id);
    } finally {
      await page.unroute(`**/api/chat/conversations/${conv1Id}/messages*`, msg1Route);
      await page.unroute(`**/api/chat/conversations/${conv2Id}/messages*`, msg2Route);
      await page.unroute('**/api/chat/conversations?*', listRoute);
      await page.unroute('**/api/chat/stream', streamHandler);
    }
  });

  const ACTION_FIXTURE_ID = 'a'.repeat(24);
  const ACTION_FIXTURE_MONTH = '2026-10';
  const ACTION_FIXTURE_TIME = '2026-10-01T00:00:00.000Z';
  const ACTION_FIXTURE_DIGEST = 'a'.repeat(64);

  const STRICT_ACTION_FIXTURES = {
    'revenue_kpi.open_period': {
      actionId: 'dbafcc4e-b2e3-4370-8354-40be02fd4c41',
      type: 'revenue_kpi.open_period',
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 600000).toISOString(),
      requiresConfirmation: true,
      executed: false,
      preview: {
        periodId: ACTION_FIXTURE_ID,
        period: ACTION_FIXTURE_MONTH,
        version: 1,
        status: 'DRAFT',
        planDigest: ACTION_FIXTURE_DIGEST,
        generatedAt: ACTION_FIXTURE_TIME,
        summary: { create: 0, skipped: 0, blocked: 0, total: 0 },
        items: [],
        executed: false,
      },
      result: null,
    },
    'revenue_kpi.mutate_assignment': {
      actionId: 'e2a5f78b-1111-4000-8000-000000000001',
      type: 'revenue_kpi.mutate_assignment',
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 600000).toISOString(),
      requiresConfirmation: true,
      executed: false,
      args: { assignmentId: ACTION_FIXTURE_ID, action: 'publish', expectedVersion: 1, planDigest: ACTION_FIXTURE_DIGEST },
      preview: {
        assignmentId: ACTION_FIXTURE_ID,
        period: ACTION_FIXTURE_MONTH,
        unitType: 'STORE',
        storeId: ACTION_FIXTURE_ID,
        areaKey: null,
        assigneeEmployeeId: ACTION_FIXTURE_ID,
        assigneeRole: 'SM',
        currentStatus: 'DRAFT',
        expectedVersion: 1,
        planDigest: ACTION_FIXTURE_DIGEST,
        summary: 'Giao KPI doanh thu',
        impacts: [],
        warnings: [],
        executed: false,
      },
      result: null,
    },
    'revenue_kpi.result_action': {
      actionId: 'e2a5f78b-1111-4000-8000-000000000002',
      type: 'revenue_kpi.result_action',
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 600000).toISOString(),
      requiresConfirmation: true,
      executed: false,
      args: { period: ACTION_FIXTURE_MONTH, expectedVersion: 1, planDigest: ACTION_FIXTURE_DIGEST },
      preview: {
        kind: 'compute',
        period: ACTION_FIXTURE_MONTH,
        targetId: ACTION_FIXTURE_MONTH,
        expectedVersion: 1,
        planDigest: ACTION_FIXTURE_DIGEST,
        summary: 'Tính kết quả KPI',
        requirements: [],
        expected: [],
        warnings: [],
        executed: false,
      },
      result: null,
    },
    'revenue_kpi.create_period': {
      actionId: 'e2a5f78b-1111-4000-8000-000000000003',
      type: 'revenue_kpi.create_period',
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 600000).toISOString(),
      requiresConfirmation: true,
      executed: false,
      args: {
        period: ACTION_FIXTURE_MONTH,
        policy: {
          defaultGrowthPercent: 3,
          growthBase: 'PREVIOUS_MONTH',
          underperformingRateThresholdPercent: 30,
          acceptanceWindowWorkingDays: 3,
          allowDemoData: false,
          aiProposalEnabled: true,
        },
        expectedVersion: 0,
        planDigest: ACTION_FIXTURE_DIGEST,
      },
      preview: {
        period: ACTION_FIXTURE_MONTH,
        policy: {
          defaultGrowthPercent: 3,
          growthBase: 'PREVIOUS_MONTH',
          underperformingRateThresholdPercent: 30,
          acceptanceWindowWorkingDays: 3,
          allowDemoData: false,
          aiProposalEnabled: true,
        },
        planDigest: ACTION_FIXTURE_DIGEST,
        summary: 'Tạo kỳ KPI doanh thu',
        warnings: [],
        executed: false,
      },
      result: null,
    },
    'revenue_kpi.save_assignment': {
      actionId: 'e2a5f78b-1111-4000-8000-000000000004',
      type: 'revenue_kpi.save_assignment',
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 600000).toISOString(),
      requiresConfirmation: true,
      executed: false,
      args: {
        period: ACTION_FIXTURE_MONTH,
        unitType: 'STORE',
        assigneeEmployeeId: null,
        storeId: ACTION_FIXTURE_ID,
        targetMode: 'ABSOLUTE_VND',
        targetVnd: 100000000,
        reason: 'Giao chỉ tiêu cửa hàng',
        expectedVersion: 0,
        planDigest: ACTION_FIXTURE_DIGEST,
        bulk: false,
      },
      preview: {
        period: ACTION_FIXTURE_MONTH,
        unitType: 'STORE',
        bulk: false,
        planDigest: ACTION_FIXTURE_DIGEST,
        summary: 'Xem trước lưu chỉ tiêu',
        willCreate: [],
        willSkip: [],
        blocked: [],
        warnings: [],
        executed: false,
      },
      result: null,
    },
    'performance_kpi.task_action': {
      actionId: 'e2a5f78b-1111-4000-8000-000000000005',
      type: 'performance_kpi.task_action',
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 600000).toISOString(),
      requiresConfirmation: true,
      executed: false,
      args: {
        expectedVersion: 0,
        clientRequestId: '11111111-1111-4111-8111-111111111111',
        kind: 'task.accept',
        taskId: ACTION_FIXTURE_ID,
        planDigest: ACTION_FIXTURE_DIGEST,
      },
      preview: {
        kind: 'task.accept',
        period: ACTION_FIXTURE_MONTH,
        policyId: ACTION_FIXTURE_ID,
        expectedVersion: 0,
        planDigest: ACTION_FIXTURE_DIGEST,
        summary: 'Chấp nhận nhiệm vụ',
        willCreate: [],
        willSkip: [],
        blocked: [],
        warnings: [],
        executed: false,
      },
      result: null,
    },
    'performance_kpi.evaluation_action': {
      actionId: 'e2a5f78b-1111-4000-8000-000000000006',
      type: 'performance_kpi.evaluation_action',
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 600000).toISOString(),
      requiresConfirmation: true,
      executed: false,
      args: {
        expectedVersion: 1,
        clientRequestId: '11111111-1111-4111-8111-111111111111',
        kind: 'evaluation.score',
        evaluationId: ACTION_FIXTURE_ID,
        planDigest: ACTION_FIXTURE_DIGEST,
      },
      preview: {
        kind: 'evaluation.score',
        evaluationId: ACTION_FIXTURE_ID,
        period: ACTION_FIXTURE_MONTH,
        currentStatus: 'OPEN',
        projectedStatus: 'MANAGER_REVIEW',
        expectedVersion: 1,
        planDigest: ACTION_FIXTURE_DIGEST,
        summary: 'Đánh giá KPI',
        disputedCriterionCodes: [],
        disputedTaskIds: [],
        deadlineAt: null,
        criteriaScores: [],
        taskGroupScore: null,
        projectedFinalScore: null,
        warnings: [],
        executed: false,
      },
      result: null,
    },
  };

  it('ChatPage renders dispatcher cards for all 7 valid strict action types via done.turn.proposedAction', async () => {
    await signInAs('employee');
    await returnToCrm();
    await page.locator('nav a.crm-copilot').click();
    const chat = page.getByTestId('chat-page');
    await chat.waitFor({ state: 'visible' });

    const expectedTexts = {
      'revenue_kpi.open_period': 'KPI doanh thu kỳ 10/2026',
      'revenue_kpi.mutate_assignment': 'Điều chỉnh chỉ tiêu KPI · Kỳ 2026-10',
      'revenue_kpi.result_action': 'Thao tác kết quả KPI (compute) · Kỳ 2026-10',
      'revenue_kpi.create_period': 'Tạo kỳ KPI mới · Kỳ 2026-10',
      'revenue_kpi.save_assignment': 'Giao chỉ tiêu KPI doanh thu',
      'performance_kpi.task_action': 'Nhiệm vụ KPI (task.accept) · Kỳ 2026-10',
      'performance_kpi.evaluation_action': 'Đánh giá KPI hiệu suất (evaluation.score) · Kỳ 2026-10',
    };
    const actionTypeByPrompt = {};
    for (const actionType of Object.keys(expectedTexts)) {
      actionTypeByPrompt[`Yêu cầu tạo hành động ${actionType}`] = actionType;
    }

    let currentActionType = 'revenue_kpi.open_period';
    const actionStreamHandler = async (route) => {
      if (route.request().method() === 'OPTIONS') {
        return route.fulfill({ status: 204 });
      }
      const data = route.request().postDataJSON();
      const clientMessageId = data?.clientMessageId || '11111111-1111-4111-8111-111111111111';
      const convId = '11111111-1111-4111-8111-111111111111';
      const matchedActionType = actionTypeByPrompt[data?.message] || currentActionType;
      const proposedAction = STRICT_ACTION_FIXTURES[matchedActionType];
      const sseBody = [
        `event: accepted\ndata: ${JSON.stringify({ clientMessageId, messageId: clientMessageId, conversationId: convId, acceptedAt: new Date().toISOString() })}\n\n`,
        `event: done\ndata: ${JSON.stringify({
          conversationId: convId,
          turn: {
            id: clientMessageId,
            userMessage: data?.message || '',
            createdAt: new Date().toISOString(),
            status: 'COMPLETED',
            reply: `Đề xuất hành động cho ${matchedActionType}`,
            replyHidden: false,
            citations: [],
            attachments: [],
            proposedAction,
          },
        })}\n\n`,
      ].join('');
      return route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
        body: sseBody,
      });
    };

    await page.route('**/api/chat/stream', actionStreamHandler);

    try {
      const input = chat.getByRole('textbox', { name: 'Tin nhắn cho Guta AI' });
      for (const [actionType, expectedSnippet] of Object.entries(expectedTexts)) {
        currentActionType = actionType;
        await chat.getByRole('button', { name: 'Hội thoại mới', exact: true }).click();
        await input.fill(`Yêu cầu tạo hành động ${actionType}`);
        await input.press('Enter');
        const card = actionType === 'revenue_kpi.open_period'
          ? chat.locator('section[aria-label="Kế hoạch mở kỳ KPI doanh thu"]').last()
          : chat.locator(`section[aria-label="Đề xuất thao tác KPI ${actionType}"]`).last();
        await card.getByText(expectedSnippet).waitFor({ state: 'visible', timeout: 5000 });
        const cardText = await card.textContent();
        assert.ok(
          cardText.includes(expectedSnippet),
          `Dispatcher must render meaningful text "${expectedSnippet}" for action type ${actionType}`
        );
      }
    } finally {
      await page.unroute('**/api/chat/stream', actionStreamHandler);
      await returnToCrm();
    }
  });

  it('ChatPage explicit open_period decision: asserts POST route exact body, EXECUTED status, hides terminal buttons', async () => {
    await signInAs('employee');
    await returnToCrm();
    await page.locator('nav a.crm-copilot').click();
    const chat = page.getByTestId('chat-page');
    await chat.waitFor({ state: 'visible' });

    const openProposal = {
      ...STRICT_ACTION_FIXTURES['revenue_kpi.open_period'],
      actionId: 'dbafcc4e-b2e3-4370-8354-40be02fd4c41',
      preview: {
        ...STRICT_ACTION_FIXTURES['revenue_kpi.open_period'].preview,
        version: 3,
        planDigest: 'c'.repeat(64),
        summary: { create: 1, skipped: 0, blocked: 0, total: 1 },
        items: [
          {
            unitType: 'STORE',
            storeId: ACTION_FIXTURE_ID,
            areaKey: null,
            storeIds: [ACTION_FIXTURE_ID],
            label: 'Guta Tân Bình',
            assigneeEmployeeId: ACTION_FIXTURE_ID,
            assigneeName: 'SM Nguyễn Văn A',
            assigneeRole: 'SM',
            assignmentId: null,
            targetMode: 'ABSOLUTE_VND',
            growthPercent: null,
            targetVnd: 50000000,
            code: null,
            message: null,
            retryable: false,
            fixHint: null,
            status: 'CREATE',
          },
        ],
      },
    };

    const streamHandler = async (route) => {
      if (route.request().method() === 'OPTIONS') {
        return route.fulfill({ status: 204 });
      }
      const data = route.request().postDataJSON();
      const clientMessageId = data?.clientMessageId || '11111111-1111-4111-8111-111111111111';
      const convId = '11111111-1111-4111-8111-111111111111';
      const sseBody = [
        `event: accepted\ndata: ${JSON.stringify({ clientMessageId, messageId: clientMessageId, conversationId: convId, acceptedAt: new Date().toISOString() })}\n\n`,
        `event: done\ndata: ${JSON.stringify({
          conversationId: convId,
          turn: {
            id: clientMessageId,
            userMessage: data?.message || '',
            createdAt: new Date().toISOString(),
            status: 'COMPLETED',
            reply: 'Đề xuất mở kỳ KPI',
            replyHidden: false,
            citations: [],
            attachments: [],
            proposedAction: openProposal,
          },
        })}\n\n`,
      ].join('');
      return route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: sseBody });
    };

    let receivedDecisionBody = null;
    const executedAction = {
      ...openProposal,
      status: 'EXECUTED',
      executed: true,
      requiresConfirmation: false,
      result: {
        period: {
          id: ACTION_FIXTURE_ID,
          period: ACTION_FIXTURE_MONTH,
          status: 'OPEN',
          policy: {
            defaultGrowthPercent: 3,
            growthBase: 'PREVIOUS_MONTH',
            underperformingRateThresholdPercent: 30,
            acceptanceWindowWorkingDays: 3,
            allowDemoData: false,
            aiProposalEnabled: true,
          },
          openedBy: ACTION_FIXTURE_ID,
          openedAt: ACTION_FIXTURE_TIME,
          closedBy: null,
          closedAt: null,
          version: 4,
          history: [],
          createdAt: ACTION_FIXTURE_TIME,
          updatedAt: ACTION_FIXTURE_TIME,
        },
        executed: true,
        outcome: 'FULL',
        created: [
          {
            unitType: 'STORE',
            storeId: ACTION_FIXTURE_ID,
            areaKey: null,
            storeIds: [ACTION_FIXTURE_ID],
            label: 'Guta Tân Bình',
            assigneeEmployeeId: ACTION_FIXTURE_ID,
            assigneeName: 'SM Nguyễn Văn A',
            assigneeRole: 'SM',
            assignmentId: ACTION_FIXTURE_ID,
            targetMode: 'ABSOLUTE_VND',
            growthPercent: null,
            targetVnd: 50000000,
            code: null,
            message: null,
            retryable: false,
            fixHint: null,
            status: 'CREATED',
          },
        ],
        skipped: [],
        blocked: [],
        failed: [],
        summary: { created: 1, skipped: 0, blocked: 0, failed: 0, total: 1 },
      },
    };

    const decisionHandler = async (route) => {
      receivedDecisionBody = route.request().postDataJSON();
      return route.fulfill({ status: 200, json: executedAction });
    };

    await page.route('**/api/chat/stream', streamHandler);
    await page.route(`**/api/chat/actions/${openProposal.actionId}/decision`, decisionHandler);

    try {
      await chat.getByRole('button', { name: 'Hội thoại mới', exact: true }).click();
      const input = chat.getByRole('textbox', { name: 'Tin nhắn cho Guta AI' });
      await input.fill('Mở kỳ KPI');
      await input.press('Enter');
      const card = chat.getByRole('region', { name: 'Kế hoạch mở kỳ KPI doanh thu' }).last();
      const confirmButton = card.getByRole('button', { name: 'Xác nhận kế hoạch', exact: true });
      await confirmButton.waitFor();
      await confirmButton.click();
      // Assert exact body matching RevenueKpiOpenConfirmSchema
      assert.ok(receivedDecisionBody, 'Decision POST request must be received');
      assert.equal(receivedDecisionBody.approve, true);
      assert.match(
        receivedDecisionBody.clientRequestId,
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
        'clientRequestId must be a valid UUID'
      );
      assert.equal(receivedDecisionBody.expectedVersion, openProposal.preview.version);
      assert.equal(receivedDecisionBody.planDigest, openProposal.preview.planDigest);
      assert.deepEqual(
        Object.keys(receivedDecisionBody).sort(),
        ['approve', 'clientRequestId', 'expectedVersion', 'planDigest'],
        'RevenueKpiOpenConfirmSchema exact body matching'
      );

      // Assert UI status updates
      await card.getByText(/Kỳ đang mở\. Đã tạo 1 · Bỏ qua 0 · Cần xử lý 0 · Lỗi 0\./).waitFor();

      // Assert terminal buttons are hidden
      assert.equal(await card.getByRole('button', { name: 'Xác nhận kế hoạch' }).count(), 0);
      assert.equal(await card.getByRole('button', { name: 'Hủy đề xuất' }).count(), 0);
    } finally {
      await page.unroute('**/api/chat/stream', streamHandler);
      await page.unroute(`**/api/chat/actions/${openProposal.actionId}/decision`, decisionHandler);
      await returnToCrm();
    }
  });

  it('ChatPage action card: expired hides buttons, PlanChanged 409 leaves safe error and disabled actions, 320px responsive', async () => {
    await signInAs('employee');
    await returnToCrm();
    await page.locator('nav a.crm-copilot').click();
    const chat = page.getByTestId('chat-page');
    await chat.waitFor({ state: 'visible' });

    // 1. Expired action hides buttons
    const expiredProposal = {
      ...STRICT_ACTION_FIXTURES['revenue_kpi.open_period'],
      actionId: 'dbafcc4e-b2e3-4370-8354-40be02fd4c99',
      status: 'EXPIRED',
      expiresAt: new Date(Date.now() - 3600000).toISOString(),
    };

    let currentTurn = null;
    const streamHandler = async (route) => {
      if (route.request().method() === 'OPTIONS') {
        return route.fulfill({ status: 204 });
      }
      const data = route.request().postDataJSON();
      const clientMessageId = data?.clientMessageId || '11111111-1111-4111-8111-111111111111';
      const convId = '11111111-1111-4111-8111-111111111111';
      const sseBody = [
        `event: accepted\ndata: ${JSON.stringify({ clientMessageId, messageId: clientMessageId, conversationId: convId, acceptedAt: new Date().toISOString() })}\n\n`,
        `event: done\ndata: ${JSON.stringify({
          conversationId: convId,
          turn: {
            id: clientMessageId,
            userMessage: data?.message || '',
            createdAt: new Date().toISOString(),
            status: 'COMPLETED',
            reply: 'Phản hồi kiểm thử trạng thái',
            replyHidden: false,
            citations: [],
            attachments: currentTurn?.attachments || [],
            proposedAction: currentTurn?.proposedAction || null,
          },
        })}\n\n`,
      ].join('');
      return route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: sseBody });
    };

    await page.route('**/api/chat/stream', streamHandler);

    const pendingProposal = {
      ...STRICT_ACTION_FIXTURES['revenue_kpi.open_period'],
      actionId: 'dbafcc4e-b2e3-4370-8354-40be02fd4c88',
    };

    const planChangedDecisionHandler = async (route) => {
      return route.fulfill({
        status: 409,
        json: {
          error: { code: 'REVENUE_KPI_PLAN_CHANGED', message: 'Kế hoạch đã thay đổi trên hệ thống.' },
          preview: {
            ...pendingProposal.preview,
            version: 2,
            planDigest: 'b'.repeat(64),
            summary: { create: 2, skipped: 0, blocked: 0, total: 2 },
          },
        },
      });
    };
    try {
      // 1. Test expired proposal hides buttons
      currentTurn = { proposedAction: expiredProposal, attachments: [] };
      await chat.getByRole('button', { name: 'Hội thoại mới', exact: true }).click();
      const input = chat.getByRole('textbox', { name: 'Tin nhắn cho Guta AI' });
      await input.fill('Kiểm tra hết hạn');
      await input.press('Enter');
      const card = chat.getByRole('region', { name: 'Kế hoạch mở kỳ KPI doanh thu' }).last();
      await card.getByText('Đề xuất đã hết hạn.').waitFor();
      assert.equal(await card.getByRole('button', { name: 'Xác nhận kế hoạch' }).count(), 0);
      assert.equal(await card.getByRole('button', { name: 'Hủy đề xuất' }).count(), 0);

      const consoleErrorsBeforePlanChange = consoleErrors.length;
      await page.route(`**/api/chat/actions/${pendingProposal.actionId}/decision`, planChangedDecisionHandler);

      currentTurn = { proposedAction: pendingProposal, attachments: [] };
      await chat.getByRole('button', { name: 'Hội thoại mới', exact: true }).click();
      await input.fill('Kiểm tra xung đột phiên bản');
      await input.press('Enter');
      const activeCard = chat.getByRole('region', { name: 'Kế hoạch mở kỳ KPI doanh thu' }).last();
      const confirmButton = activeCard.getByRole('button', { name: 'Xác nhận kế hoạch', exact: true });
      await confirmButton.waitFor();
      await confirmButton.click();
      await activeCard.getByText('Kế hoạch đã thay đổi trên hệ thống.').waitFor();
      // Button disabled against stale action
      assert.equal(await confirmButton.isDisabled(), true, 'Confirm button must be disabled after plan changed 409');
      assert.deepEqual(consoleErrors.slice(consoleErrorsBeforePlanChange), ['Failed to load resource: the server responded with a status of 409 (Conflict)']);
      consoleErrors.splice(consoleErrorsBeforePlanChange, 1);

      await page.unroute(`**/api/chat/actions/${pendingProposal.actionId}/decision`, planChangedDecisionHandler);
      // 4. Responsive 320px width: card does not overflow
      currentTurn = { proposedAction: pendingProposal, attachments: [] };
      await chat.getByRole('button', { name: 'Hội thoại mới', exact: true }).click();
      await input.fill('Kiểm tra giao diện 320px');
      await input.press('Enter');
      const responsiveCard = chat.getByRole('region', { name: 'Kế hoạch mở kỳ KPI doanh thu' }).last();
      await responsiveCard.waitFor();
      await page.setViewportSize({ width: 320, height: 740 });
      const cardBox = await responsiveCard.boundingBox();
      assert.ok(cardBox && cardBox.width <= 320, 'Chat card must fit within 320px viewport without overflow');
      await page.setViewportSize({ width: 1440, height: 900 });
    } finally {
      await page.unroute('**/api/chat/stream', streamHandler);
      await page.unroute(`**/api/chat/actions/${pendingProposal.actionId}/decision`, planChangedDecisionHandler);
      await returnToCrm();
    }
  });

  it('ChatPage: mobile 320/375px, landscape, keyboard, reduced motion và contrast', async (t) => {
    t.after(async () => {
      await page.evaluate(() => { document.documentElement.style.zoom = ''; });
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      if (await page.getByTestId('chat-page').count()) {
        await page.getByRole('button', { name: 'Quay lại Vận Hành (CRM)', exact: true }).click();
      }
      await page.getByRole('table').waitFor({ state: 'visible' });
    });
    await returnToCrm();
    await page.locator('nav a.crm-copilot').click();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const chat = page.getByTestId('chat-page');
    for (const viewport of [{ width: 320, height: 740 }, { width: 375, height: 812 }, { width: 812, height: 375 }]) {
      await page.setViewportSize(viewport);
      assert.equal(await chat.evaluate((el) => el.scrollWidth <= el.clientWidth), true);
      assert.equal(await chat.getByRole('textbox', { name: 'Tin nhắn cho Guta AI' }).isVisible(), true);
      const targets = await chat.getByRole('button').evaluateAll((buttons) => buttons.filter((button) => button.getClientRects().length).map((button) => ({ width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height })));
      assert.ok(targets.every(({ width, height }) => width >= 44 && height >= 44));
    }
    await page.setViewportSize({ width: 320, height: 740 });
    const menu = chat.getByRole('button', { name: 'Mở danh sách hội thoại' });
    await menu.focus();
    await page.keyboard.press('Enter');
    assert.equal(await menu.getAttribute('aria-expanded'), 'true');
    await page.keyboard.press('Escape');
    assert.equal(await menu.getAttribute('aria-expanded'), 'false');
    const focusOutline = await menu.evaluate((el) => getComputedStyle(el).outlineWidth);
    assert.ok(parseFloat(focusOutline) >= 2, 'Keyboard focus ring must remain visible');
    await page.evaluate(() => { document.documentElement.style.zoom = '1.5'; });
    assert.equal(await chat.evaluate((el) => el.scrollWidth <= el.clientWidth), true);
    await page.evaluate(() => { document.documentElement.style.zoom = ''; });
    await chat.getByRole('textbox', { name: 'Tin nhắn cho Guta AI' }).fill('Kiểm tra tương phản');
    await page.waitForFunction(() => !document.querySelector('.chat-send').disabled);
    await page.mouse.move(0, 0);
    const pairs = await chat.evaluate((root) => {
      const rgb = (value) => value.match(/[\d.]+/g).map(Number);
      const blend = (front, back) => front.slice(0, 3).map((value, i) => value * (front[3] ?? 1) + back[i] * (1 - (front[3] ?? 1)));
      const background = (element) => {
        const chain = [];
        for (let node = element; node; node = node.parentElement) chain.unshift(node);
        return chain.reduce((color, node) => blend(rgb(getComputedStyle(node).backgroundColor), color), [0, 0, 0]);
      };
      return [
        [root], [root.querySelector('.guta-chat-hero p')],
        [root.querySelector('textarea'), '::placeholder'], [root.querySelector('.chat-send')],
      ].map(([element, pseudo]) => {
        const bg = background(element);
        return [blend(rgb(getComputedStyle(element, pseudo).color), bg), bg];
      });
    });
    const contrast = (a, b) => {
      const luminance = (rgb) => rgb.map((value) => value / 255).map((v) => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, value, i) => sum + value * [.2126, .7152, .0722][i], 0);
      const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (values[0] + .05) / (values[1] + .05);
    };
    const ratios = pairs.map(([a, b]) => contrast(a, b));
    assert.ok(ratios.every((ratio) => ratio >= 4.5), `Computed contrast ratios: ${ratios.join(', ')}; color pairs: ${JSON.stringify(pairs)}`);
    console.log(`Chat text contrast ratios: ${ratios.map((ratio) => ratio.toFixed(2)).join(', ')}`);
    assert.deepEqual(consoleErrors, []);
  });

  it('ChatPage: Escape khi sidebar mở chỉ đóng sidebar; Escape khi focus composer điều hướng về CRM', async () => {
    await page.setViewportSize({ width: 1440, height: 900 });
    if (await page.getByRole('button', { name: /Get Started/i }).isVisible().catch(() => false)) {
      await page.getByRole('button', { name: /Get Started/i }).click();
      await page.getByLabel('Tên đăng nhập', { exact: true }).fill('employee');
      await page.getByLabel('Mật khẩu', { exact: true }).fill('fixture-password');
      await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
      await page.getByRole('table').waitFor({ state: 'visible' });
    }
    await returnToCrm();
    await routeChatStream();
    await page.locator('nav a.crm-copilot').click();
    const chat = page.getByTestId('chat-page');
    await chat.waitFor({ state: 'visible' });
    await page.setViewportSize({ width: 375, height: 812 });

    // 1. Mở sidebar: kiểm tra data-open="true" và aria-expanded="true"
    const menuBtn = chat.getByRole('button', { name: 'Mở danh sách hội thoại' });
    assert.equal(await menuBtn.count(), 1, `Chat menu button count; header: ${await chat.locator('.guta-chat-header').innerText().catch(() => 'missing')}`);
    assert.equal(await menuBtn.isVisible(), true, 'Chat menu button should be visible at desktop width');
    const sidebar = page.locator('#copilot-sidebar');
    await menuBtn.click();
    assert.equal(await sidebar.getAttribute('data-open'), 'true');
    assert.equal(await menuBtn.getAttribute('aria-expanded'), 'true');

    // Escape khi sidebar mở: chỉ đóng sidebar, Chat view vẫn mở (count = 1)
    await page.keyboard.press('Escape');
    assert.equal(await sidebar.getAttribute('data-open'), 'false', 'Sidebar must collapse on Escape');
    assert.equal(await menuBtn.getAttribute('aria-expanded'), 'false');
    assert.equal(await page.getByTestId('chat-page').count(), 1, 'Must remain in Chat after sidebar is dismissed by Escape');

    // Không bị keyboard trap sau khi đóng sidebar: phím Tab di chuyển focus tự do
    await page.keyboard.press('Tab');
    const hasFocus = await page.evaluate(() => document.activeElement !== null && document.activeElement !== document.body);
    assert.equal(hasFocus, true, 'Keyboard focus advances without trap');

    // 2. Escape khi focus composer (không có sidebar/dialog mở): điều hướng về CRM theo baseline
    await page.setViewportSize({ width: 1440, height: 900 });
    const input = chat.getByRole('textbox', { name: 'Tin nhắn cho Guta AI' });
    await input.focus();
    await input.fill('Nội dung tin nhắn nháp');
    await page.keyboard.press('Escape');
    assert.equal(await page.getByTestId('chat-page').count(), 0, 'Escape from composer navigates back to CRM');
    await page.getByRole('table').waitFor({ state: 'visible' });
    assert.deepEqual(consoleErrors, []);
  });

  it('CRM hides dormant scheduling actions; scoped district filter and empty-state reset still work', async () => {
    // A placeholder spinner is not a scheduling workflow or approved capability.
    const emergencyBtn = page.locator('button').filter({ hasText: /Tạo Ca Đột Xuất|Đang khởi tạo/i });
    assert.equal(await emergencyBtn.isVisible(), false);

    // 2. District Filter Cycle — the cycle walks the districts present in the
    //    loaded data, so the expectation is derived from the fixture, not from a
    //    hardcoded district list.
    await page.waitForFunction(
      (expected) => document.querySelectorAll('table tbody tr[data-id]').length === expected,
      STORE_FIXTURE_ITEMS.length
    );
    const firstDistrict = STORE_FIXTURE_ITEMS[0].district;
    const districtBtn = page.getByRole('button', { name: /Bộ lọc Quận/i });
    await districtBtn.click();
    const q1Btn = page.getByRole('button', { name: new RegExp(`Quận: ${firstDistrict}`, 'i') });
    await q1Btn.waitFor({ state: 'visible' });
    assert.equal(await q1Btn.isVisible(), true);
    await page.waitForFunction(
      (district) => {
        const rows = [...document.querySelectorAll('table tbody tr[data-id]')];
        return rows.length > 0 && rows.every((row) => row.getAttribute('data-district') === district);
      },
      firstDistrict
    );
    assert.deepEqual(
      await page.locator('table tbody tr[data-id]').evaluateAll((rows) => rows.map((row) => row.getAttribute('data-district'))),
      STORE_FIXTURE_ITEMS.filter((store) => store.district === firstDistrict).map((store) => store.district)
    );

    // 3. Illustrated Empty State and Reset CTA
    const search = page.getByPlaceholder(/Lọc theo tên, quận, mã.../i);
    await search.fill('KhongTheNaoCoChiNhanhNay999');
    await page.getByText('Không tìm thấy chi nhánh nào phù hợp với từ khóa tìm kiếm.').waitFor({ state: 'visible' });
    const resetBtn = page.getByRole('button', { name: /Đặt lại bộ lọc/i });
    assert.equal(await resetBtn.isVisible(), true);
    await resetBtn.click();
    assert.equal(await search.inputValue(), '');
    await page.waitForFunction(
      (expected) => document.querySelectorAll('table tbody tr[data-id]').length === expected,
      STORE_FIXTURE_ITEMS.length
    );
    assert.equal(await page.getByText(/581 Sư Vạn Hạnh/i).isVisible(), true);

    // 4. Chat composer trigger button state
    await page.locator('nav a.crm-copilot').click();
    const chatInput = page.getByPlaceholder('Hỏi AI về ca trực, nhân sự, tiền két...');
    const sendBtn = page.getByRole('button', { name: 'Gửi', exact: true });
    assert.equal(await sendBtn.isDisabled(), true);
    await chatInput.fill('Kiểm tra quy định');
    assert.equal(await sendBtn.isDisabled(), false);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    assert.equal(await page.getByTestId('chat-page').count(), 0);
    await page.getByRole('table').waitFor({ state: 'visible' });

    assert.deepEqual(consoleErrors, []);
  });

  it('CRM sidebar chuyển phân hệ khớp nhãn với nội dung thật', async () => {
    // The demo runs without a backend, so the employee endpoints are stubbed to keep
    // the console clean and the assertions deterministic.
    const employeesHandler = (route) => route.fulfill({ status: 200, json: {
      items: [{ employeeId: 'EMP-001', fullName: 'Trương Quốc Thái', level: 'Senior', department: 'Guta Quận 1', skills: ['Barista'], status: 'active' }],
      paging: { page: 1, limit: 20, totalItems: 1, totalPages: 1, hasNext: false, hasPrev: false },
    } });
    await page.route('**/api/employees**', employeesHandler);
    try {
      // 1. "Nhân sự" -> Danh Sách Nhân Sự Điểm Bán
      await page.locator('nav [data-section="employees"]').click();
      await page.getByRole('heading', { name: 'Danh Sách Nhân Sự Điểm Bán', exact: true }).waitFor({ state: 'visible' });
      const portal = page.locator('#crm-custom-view-portal');
      await portal.getByText('Trương Quốc Thái').waitFor({ state: 'visible' });
      assert.equal(await page.locator('nav [data-entrypoint="coming-soon"]').count(), 0);

      // V1: SM operational read does not grant the independent HR review queue.
      assert.equal(await page.locator('nav [data-section="schedules"]').isVisible(), false);
      assert.equal(await portal.getByRole('tab', { name: 'Hàng đợi duyệt' }).count(), 0);

      // 3. CRM includes the real work and report lifecycle (F2/F7).
      assert.equal(await page.locator('nav [data-section="projects"]').count(), 1);
      assert.equal(await page.getByText('Vòng Đời Đề Tài (F2)').count(), 0);

      // 4. "Cài đặt LLM" chỉ hiện với Admin
      assert.equal(await page.locator('nav [data-section="settings"]').isVisible(), false);

      // 5. Quay lại phân hệ Cửa hàng / Chi nhánh
      await page.locator('nav [data-section="stores"]').click();
      await page.getByRole('heading', { name: /Guta Workspace — Quản lý nhân sự & chi nhánh/i }).waitFor({ state: 'visible' });
      await page.waitForFunction(
        (expected) => document.querySelectorAll('table tbody tr[data-id]').length === expected,
        STORE_FIXTURE_ITEMS.length
      );
      assert.equal(await page.getByRole('table').getByText(STORE_FIXTURE_ITEMS[0].code).first().isVisible(), true);
    } finally {
      await page.unroute('**/api/employees**', employeesHandler);
    }

    // Xác nhận không có toast coming soon / lộ trình phát triển nào xuất hiện
    assert.equal(await page.locator('#zkteco-sync-toast').count(), 0);
    assert.equal(await page.getByText(/Coming Soon|Lộ trình phát triển/i).count(), 0);
  });

  it('CRM dữ liệu thiếu hiển thị — và không quảng bá thao tác cấu hình cửa hàng chưa được duyệt', async () => {
    await signInAs('employee'); // Explicit SM read capabilities, never a global-admin fixture.

    // --- KPI ribbon: value === null must render an em dash, never 0 ---
    const kpiValues = await page.locator('.crm-kpi-value').evaluateAll((nodes) => nodes.map((node) => node.textContent.trim()));
    assert.equal(kpiValues.length, 4);
    // revenue + onTimeRate are null in the fixture.
    assert.ok(kpiValues[2].includes('—'), `Doanh thu phải là dấu —, nhận: ${kpiValues[2]}`);
    assert.ok(!/^0\b/.test(kpiValues[2]), 'Không được hiển thị 0 thay cho null');
    assert.ok(kpiValues[3].includes('—'), `Tỷ lệ đúng giờ phải là dấu —, nhận: ${kpiValues[3]}`);
    assert.ok(!/^0\b/.test(kpiValues[3]), 'Không được hiển thị 0 thay cho null');

    // The reason must be reachable as a tooltip, not silently dropped.
    const revenueTitle = await page.locator('.crm-kpi-card').nth(2).locator('.crm-kpi-value').getAttribute('title');
    assert.equal(revenueTitle, DASHBOARD_OVERVIEW_FIXTURE.revenue.reason);
    const onTimeTitle = await page.locator('.crm-kpi-card').nth(3).locator('.crm-kpi-value').getAttribute('title');
    assert.equal(onTimeTitle, DASHBOARD_OVERVIEW_FIXTURE.onTimeRate.reason);

    // Sidebar badge + header chip come from overview.stores.outlets.
    assert.equal((await page.locator('#crm-nav-store-count').textContent()).trim(), String(DASHBOARD_OVERVIEW_FIXTURE.stores.outlets));
    assert.match(await page.locator('#crm-header-store-chip').textContent(), new RegExp(`${DASHBOARD_OVERVIEW_FIXTURE.stores.outlets} chi nhánh`));

    // Paging line is derived from the response, not a literal.
    assert.match(await page.getByText(/Hiển thị \d+ \/ \d+ Cửa hàng/).textContent(), new RegExp(`Hiển thị ${STORE_FIXTURE_ITEMS.length} / ${STORE_FIXTURE_ITEMS.length}`));

    // V1 owner approval did not approve stores.configure; no profile gets a
    // mutating control merely from its old Admin label.
    assert.equal(await page.getByRole('button', { name: 'Thêm cửa hàng' }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Sửa', exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Xoá', exact: true }).count(), 0);
  });

  it('Bước 7: Bấm nút "Đăng xuất", kiểm tra quay lại Landing Page an toàn', async () => {
    const logoutBtn = page.getByRole('button', { name: /Đăng Xuất Phiên/i });
    await logoutBtn.click();

    // Quay lại Landing Page
    const heroTitle = page.getByText(/Quản Trị Nhân Sự & Phân Ca Tự Động/i);
    await heroTitle.waitFor({ state: 'visible', timeout: 5000 });
    assert.equal(await heroTitle.isVisible(), true);
    assert.equal(await page.evaluate(() => sessionStorage.getItem('guta_user')), null);
    assert.equal(await page.evaluate(() => localStorage.getItem('guta_user')), null);
    for (const { username, name, isAdmin } of [
      { username: 'employee', name: 'employee', isAdmin: false },
      { username: 'admin', name: 'admin', isAdmin: true },
    ]) {
      await page.getByRole('button', { name: /Get Started/i }).click();
      await page.getByLabel('Tên đăng nhập', { exact: true }).fill(username);
      await page.getByLabel('Mật khẩu', { exact: true }).fill('fixture-password');
      await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
      await page.locator('.crm-sidebar').waitFor({ state: 'visible' });
      assert.equal(await page.evaluate(() => sessionStorage.getItem('guta_user')), null);
      assert.equal(await page.evaluate(() => localStorage.getItem('guta_user')), null);
      assert.equal(await page.locator('.crm-sidebar').getByText(name, { exact: true }).isVisible(), true);
      // Technical administration and operational reads are separate. Store
      // configuration remains PENDING for every profile, including system_admin.
      if (!isAdmin) await page.waitForFunction(
        (expected) => document.querySelectorAll('table tbody tr[data-id]').length === expected,
        STORE_FIXTURE_ITEMS.length
      );
      assert.equal(await page.locator('nav [data-section="stores"]').isVisible(), !isAdmin, 'Technical admin has no operational store-read grant');
      assert.equal(await page.getByRole('button', { name: 'Thêm cửa hàng' }).count(), 0);
      assert.equal(await page.getByRole('button', { name: 'Sửa', exact: true }).count(), 0);
      assert.equal(await page.getByRole('button', { name: 'Xoá', exact: true }).count(), 0);
      await logoutBtn.click();
      await heroTitle.waitFor({ state: 'visible' });
      assert.equal(await page.evaluate(() => sessionStorage.getItem('guta_user')), null);
      assert.equal(await page.evaluate(() => localStorage.getItem('guta_user')), null);
    }
    assert.deepEqual(consoleErrors, [], 'Demo flow must have zero console errors and uncaught exceptions');
    console.log(`Console errors / pageerrors: ${consoleErrors.length}`);
  });

  it('Chặn liên kết chết href="#" trên Landing Page và kiểm tra sạch ngữ cảnh học thuật', async () => {
    // The hero status line is a <p>, not a link; clicking it must not surface
    // an unavailable-feature toast.
    const heroStatus = page.locator('.hero-status').filter({ hasText: /F&B Workforce Intelligence/i });
    await heroStatus.click();
    assert.equal(await page.locator('#zkteco-sync-toast').count(), 0);
    // Current landing has a brand/home anchor, not the removed marketing badge.
    const badgeLink = page.getByRole('link', { name: 'Guta Workspace home', exact: true });
    await badgeLink.click();
    assert.equal(await page.locator('#zkteco-sync-toast').count(), 0);

    // Kiểm tra sạch các từ khóa học thuật/khóa luận
    const pageContent = await page.content();
    assert.doesNotMatch(pageContent, /KLCN133/i);
    assert.doesNotMatch(pageContent, /khóa luận/i);
    assert.doesNotMatch(pageContent, /F1–F7/i);
    assert.doesNotMatch(pageContent, /TODO|FIXME|Lorem ipsum/i);

    // Click nút preview trong thẻ CRM Landing Page kích hoạt AuthModal
    const previewBtn = page.locator('.crm-btn').first();
    if (await previewBtn.count() > 0) {
      await previewBtn.click();
      await page.getByRole('heading', { name: 'Đăng nhập Guta Workspace' }).waitFor({ state: 'visible', timeout: 3000 });
      assert.equal(await page.getByRole('heading', { name: 'Đăng nhập Guta Workspace' }).isVisible(), true);
    }
  });
});
