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
  const consoleErrors = [];

  before(async () => {
    // 1. Start static file server for dist/
    server = http.createServer((req, res) => {
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
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Isolated auth boundary; never use real accounts or contact Atlas in this suite.
    // P0 account-provisioning: login is by provisioned USERNAME (employee code), not email.
    let activeUser = null;
    await page.route('**/api/auth/login', (route) => {
      const { username, password } = route.request().postDataJSON();
      assert.equal(password, 'fixture-password');
      activeUser = {
        id: 'fixture-user',
        role: username.startsWith('admin') ? 'Admin' : 'Employee',
        username,
        mustChangePassword: false,
      };
      return route.fulfill({ status: 200, json: { accessToken: 'fixture-token', user: activeUser } });
    });
    await page.route('**/api/auth/refresh', (route) => route.fulfill({ status: 200, json: { accessToken: activeUser ? 'fixture-token' : null } }));
    await page.route('**/api/auth/me', (route) => route.fulfill({ status: 200, json: { userId: activeUser.id, role: activeUser.role, username: activeUser.username, mustChangePassword: false, skills: [] } }));
    await page.route('**/api/auth/logout', (route) => { activeUser = null; return route.fulfill({ status: 204 }); });
    await page.route('**/api/stores**', (route) => {
      const request = route.request();
      if (request.method() !== 'GET') {
        return route.fulfill({ status: 405, json: { error: { code: 'METHOD_NOT_ALLOWED', message: 'fixture read-only' } } });
      }
      return route.fulfill({ status: 200, json: buildStoreResponse(new URL(request.url())) });
    });
    await page.route('**/api/dashboard/overview', (route) => route.fulfill({ status: 200, json: DASHBOARD_OVERVIEW_FIXTURE }));
    // Invalid payload exercises the safe demo boundary without a live backend.
    await page.route('**/api/chat', (route) => route.fulfill({ status: 200, json: {} }));

    // Clear any previous state
    await page.goto(serverUrl, { waitUntil: 'networkidle' });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle' });
  });

  after(async () => {
    if (browser) await browser.close();
    if (server) server.close();
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

  // Re-establishes a known identity. Mutating-control tests must not inherit
  // whatever role the previous step happened to leave behind.
  const signInAs = async (username) => {
    const logoutBtn = page.getByRole('button', { name: /Đăng Xuất Phiên/i });
    if (await logoutBtn.count()) {
      await logoutBtn.click();
      await page.getByRole('button', { name: /Get Started/i }).waitFor({ state: 'visible' });
    }
    await page.getByRole('button', { name: /Get Started/i }).click();
    await page.getByLabel('Tên đăng nhập', { exact: true }).fill(username);
    await page.getByLabel('Mật khẩu', { exact: true }).fill('fixture-password');
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
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
    assert.equal(await page.locator('#d-district').textContent(), `Quận: ${target.district} • Cửa hàng trưởng: ${target.managerName}`);
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

    // Toast hiển thị thông báo thành công
    const toastMsg = page.getByText(/Đã gửi cảnh báo khẩn cấp tới Telegram Bot/i);
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
    await page.route('**/api/chat', pendingReply);
    try {
      await page.locator('nav a.crm-copilot').click();
      await page.getByPlaceholder('Hỏi AI về ca trực, nhân sự, tiền két...').fill('thiếu người');
      await page.keyboard.press('Enter');
      await requestStarted;
      assert.equal(await page.locator('.guta-chat-status').isVisible(), true);
      const aborted = page.waitForEvent('requestfailed', { predicate: (request) => request.url().endsWith('/api/chat') });
      await page.getByRole('button', { name: 'Đăng Xuất Phiên', exact: true }).click();
      await aborted;
      await page.getByRole('button', { name: /Get Started/i }).waitFor();
      assert.equal(await page.getByTestId('chat-page').count(), 0);
      assert.deepEqual(await page.evaluate(() => [typeof window.openDrawer, typeof window.closeDrawer]), ['undefined', 'undefined']);
      assert.deepEqual(consoleErrors, []);
    } finally {
      release();
      await page.unroute('**/api/chat', pendingReply);
    }
    await page.getByRole('button', { name: /Get Started/i }).click();
    await page.getByLabel('Tên đăng nhập', { exact: true }).fill('employee');
    await page.getByLabel('Mật khẩu', { exact: true }).fill('fixture-password');
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await page.getByRole('table').waitFor({ state: 'visible' });
  });

  it('ChatPage: desktop empty state, demo an toàn, citations và confirm không giả thực thi', async () => {
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
    await page.route('**/api/chat', offlineChat);
    await chat.getByRole('navigation', { name: 'Câu hỏi nhanh' }).getByRole('button', { name: 'Gợi ý điều động ca' }).click();
    assert.equal(await send.isDisabled(), true);
    await chat.getByText('Demo an toàn · Dịch vụ AI chưa khả dụng', { exact: true }).waitFor();
    assert.equal(await chat.getByRole('button', { name: 'Xác Nhận (Confirm)' }).count(), 0);
    await page.unroute('**/api/chat', offlineChat);
    // The intentional offline probe above makes Chromium log one
    // "Failed to load resource: net::ERR_CONNECTION_REFUSED" console error.
    // That is expected here — clear the suite-level collector so it does not
    // poison the zero-console-error assertions of the following tests.
    consoleErrors.length = 0;

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
        },
      },
      {
        match: 'doanh thu két sáng',
        json: {
          reply: 'Không có số doanh thu đã xác thực trong phiên demo.',
          citations: [{ document: 'Biểu mẫu đối soát két — không phải báo cáo thực tế', version: 'demo', article: 'Ghi chú', score: 0.7 }],
        },
      },
    ];
    const onlineChat = async (route) => {
      const request = route.request().postDataJSON();
      const reply = chatReplies.find((item) => request.message.includes(item.match)) ?? chatReplies[0];
      await route.fulfill({ status: 200, json: reply.json });
    };
    await page.route('**/api/chat', onlineChat);
    try {
      await chat.getByRole('button', { name: 'Hội thoại mới', exact: true }).click();
      await chat.getByRole('navigation', { name: 'Câu hỏi nhanh' }).getByRole('button', { name: 'Gợi ý điều động ca' }).click();
      await chat.getByText('Đề xuất điều động ca trực cho chi nhánh đang thiếu người.', { exact: true }).waitFor();
      const confirm = chat.getByRole('button', { name: 'Xác Nhận (Confirm)' });
      assert.deepEqual(await confirm.evaluate((el) => {
        const style = getComputedStyle(el);
        return [style.backgroundColor, style.color];
      }), ['rgb(255, 255, 255)', 'rgb(0, 0, 0)']);
      await confirm.click();
      assert.equal(await chat.getByText('Đã xác nhận đề xuất. Chưa thực thi.', { exact: true }).isVisible(), true);
      await chat.getByRole('button', { name: 'Hội thoại mới', exact: true }).click();
      await chat.getByRole('navigation', { name: 'Câu hỏi nhanh' }).getByRole('button', { name: 'Gợi ý điều động ca' }).click();
      await chat.getByRole('button', { name: 'Từ Chối', exact: true }).click();
      assert.equal(await chat.getByText('Đã từ chối hành động. Không có dữ liệu nào bị thay đổi.', { exact: true }).isVisible(), true);
      await chat.getByRole('button', { name: 'Hội thoại mới', exact: true }).click();
      await chat.getByRole('navigation', { name: 'Câu hỏi nhanh' }).getByRole('button', { name: 'Quy định kỷ luật' }).click();
      await chat.getByRole('region', { name: 'Trích dẫn' }).waitFor();
      assert.match(await chat.getByRole('log').textContent(), /không phải chính sách có hiệu lực/);
      await chat.getByRole('button', { name: 'Hội thoại mới', exact: true }).click();
      await chat.getByRole('navigation', { name: 'Câu hỏi nhanh' }).getByRole('button', { name: 'Báo cáo két ca' }).click();
      await chat.getByText(/Không có số doanh thu đã xác thực/).waitFor();
      assert.match(await chat.getByRole('region', { name: 'Trích dẫn' }).textContent(), /không phải báo cáo thực tế/);
    } finally {
      await page.unroute('**/api/chat', onlineChat);
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
    const handler = async (route) => {
      requests.push(route.request().postDataJSON());
      await route.fulfill({ status: 200, json: {
        reply: '<script>window.__chatInjected = true</script> Phản hồi kiểm thử API',
        conversationId: 'conversation-test-1',
        citations: [{ document: 'Nguồn kiểm thử API', version: '1', article: 'Điều kiểm thử', score: 0.9 }],
        proposedAction: { type: 'TEST_ACTION', preview: 'Đề xuất kiểm thử API' },
      } });
    };
    await page.route('**/api/chat', handler);
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
      await input.fill('Không gửi trùng');
      for (let i = 0; i < 3; i++) await input.press('Enter');
      await chat.getByText(/Phản hồi kiểm thử API/).waitFor();
      assert.equal(requests.length, 1);
      assert.equal(requests[0].message, '<img src=x onerror="window.__chatInjected=true">');
      assert.equal(requests[0].role, 'Employee');
      assert.equal(requests[0].modelTier, undefined); // tier slider removed (2026-10-30)
      assert.deepEqual(requests[0].userContext, { role: 'Employee' });
      assert.equal(await chat.locator('[data-sender="user"]').count(), 1);
      assert.equal(await chat.getByRole('region', { name: 'Trích dẫn' }).isVisible(), true);
      assert.equal(await chat.getByRole('button', { name: 'Xác Nhận (Confirm)' }).isVisible(), true);
      assert.equal(await page.evaluate(() => window.__chatInjected), undefined);
      assert.equal(await chat.getByText(/Demo an toàn/).count(), 0);
      await input.fill('Câu hỏi tiếp theo');
      await input.press('Enter');
      await page.waitForFunction(() => document.querySelectorAll('[data-sender="assistant"]').length === 2);
      assert.equal(requests[1].conversationId, 'conversation-test-1');
      assert.equal(requests.length, 2);
      await page.keyboard.press('Escape');
    } finally {
      await page.unroute('**/api/chat', handler);
    }
  });

  it('ChatPage: hủy fetch khi quay CRM, không nhận phản hồi cũ sau New Chat', async () => {
    let requestStarted;
    const started = new Promise((resolve) => { requestStarted = resolve; });
    let releaseResponse;
    let responseGate = new Promise((resolve) => { releaseResponse = resolve; });
    const handler = async (route) => {
      requestStarted();
      await responseGate;
      await route.fulfill({ status: 200, json: { reply: 'Phản hồi cũ không được hiển thị' } });
    };
    await page.route('**/api/chat', handler);
    await page.evaluate(() => {
      window.__chatAborts = 0;
      const originalFetch = window.fetch;
      window.fetch = function (url, options) {
        if (String(url).endsWith('/chat')) {
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
      await page.unroute('**/api/chat', handler);
      await page.evaluate(() => window.__restoreAbort());
    }
    assert.deepEqual(consoleErrors, []);
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

  it('Combo B UI/UX Anti-Slop: Trigger button spinners, illustrated empty state & filter reset', async () => {
    // 1. Trigger button: Tạo Ca Đột Xuất (disabled + spinner)
    const emergencyBtn = page.locator('button').filter({ hasText: /Tạo Ca Đột Xuất|Đang khởi tạo/i });
    assert.equal(await emergencyBtn.isVisible(), true);
    await emergencyBtn.click();
    assert.equal(await emergencyBtn.isDisabled(), true);
    assert.match(await emergencyBtn.textContent(), /Đang khởi tạo/);
    await page.waitForTimeout(800);
    assert.equal(await emergencyBtn.isDisabled(), false);
    assert.match(await emergencyBtn.textContent(), /Tạo Ca Đột Xuất/);

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

    // 4. ChatDrawer Trigger Button State
    await page.locator('nav a.crm-copilot').click();
    const chatInput = page.getByPlaceholder('Hỏi AI về ca trực, nhân sự, tiền két...');
    const sendBtn = page.getByRole('button', { name: 'Gửi', exact: true });
    assert.equal(await sendBtn.isDisabled(), true);
    await chatInput.fill('Kiểm tra quy định');
    assert.equal(await sendBtn.isDisabled(), false);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

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
      await page.getByRole('heading', { name: 'Danh Sách Nhân Sự Điểm Bán (Allowlist Only)' }).waitFor({ state: 'visible' });
      const portal = page.locator('#crm-custom-view-portal');
      await portal.getByText('Trương Quốc Thái').waitFor({ state: 'visible' });
      assert.equal(await page.locator('nav [data-entrypoint="coming-soon"]').count(), 0);

      // 2. "Hồ sơ nhân sự" -> đúng heading RosterView, không còn nhãn "Phân ca" lệch nội dung
      await page.locator('nav [data-section="schedules"]').click();
      await page.getByRole('heading', { name: 'Hồ Sơ Nhân Sự (F1)' }).waitFor({ state: 'visible' });
      await portal.getByText('Trương Quốc Thái').waitFor({ state: 'visible' });
      assert.equal(await portal.getByRole('tab', { name: 'Hàng đợi duyệt' }).count(), 1);

      // 3. Nghiệp vụ đề tài khóa luận không còn trong nav demo
      assert.equal(await page.locator('nav [data-section="projects"]').count(), 0);
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

  it('CRM real-data: KPI null hiển thị — (không phải 0) và xoá 409 báo nghiệp vụ', async () => {
    // The mutating controls are Admin-only; sign in explicitly instead of
    // inheriting the role the previous step left behind.
    await signInAs('admin');

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

    // --- Delete: 409 STORE_HAS_EMPLOYEES must surface a business message ---
    const target = STORE_FIXTURE_ITEMS[0];
    const conflictHandler = (route) => route.fulfill({
      status: 409,
      json: { error: { code: 'STORE_HAS_EMPLOYEES', message: 'STORE_HAS_EMPLOYEES' } },
    });
    await page.route('**/api/stores/*', conflictHandler);
    page.once('dialog', (dialog) => dialog.accept());
    try {
      await page.locator(`table tbody tr[data-id="${target.id}"]`).getByRole('button', { name: 'Xoá', exact: true }).click();
      const toast = page.getByText(new RegExp(`Cửa hàng còn ${target.employeeCount} nhân sự, không thể xoá`));
      await toast.waitFor({ state: 'visible', timeout: 3000 });
      assert.equal(await toast.isVisible(), true);
      // The raw code must never leak to the operator.
      assert.equal(await page.getByText(/STORE_HAS_EMPLOYEES/).count(), 0);
    } finally {
      await page.unroute('**/api/stores/*', conflictHandler);
    }
    // The deliberate 409 makes Chromium log
    // "Failed to load resource: ... 409 (Conflict)". That is the expected
    // network trace of this assertion, not a defect: clear it so the
    // zero-console-error assertions in the following steps stay meaningful.
    consoleErrors.length = 0;
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
      await page.getByRole('table').waitFor({ state: 'visible' });
      assert.equal(await page.evaluate(() => sessionStorage.getItem('guta_user')), null);
      assert.equal(await page.evaluate(() => localStorage.getItem('guta_user')), null);
      assert.equal(await page.locator('.crm-sidebar').getByText(name, { exact: true }).isVisible(), true);
      // RBAC on the directory: only Admin may see the mutating controls. The
      // server enforces this too; this guards against the UI advertising an
      // action that will 403.
      await page.waitForFunction(
        (expected) => document.querySelectorAll('table tbody tr[data-id]').length === expected,
        STORE_FIXTURE_ITEMS.length
      );
      assert.equal(await page.getByRole('button', { name: 'Thêm cửa hàng' }).count(), isAdmin ? 1 : 0);
      assert.equal(await page.getByRole('button', { name: 'Sửa', exact: true }).count(), isAdmin ? STORE_FIXTURE_ITEMS.length : 0);
      assert.equal(await page.getByRole('button', { name: 'Xoá', exact: true }).count(), isAdmin ? STORE_FIXTURE_ITEMS.length : 0);
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
