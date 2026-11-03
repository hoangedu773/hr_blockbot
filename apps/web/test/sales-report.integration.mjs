// Built Web -> real API -> exclusively owned MongoDB, no cloud writes/provider calls.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { chromium } from './helpers/browser-deps.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..'), requireApi = createRequire(root + '/apps/api/package.json');
const mongo = await requireApi('mongodb-memory-server').MongoMemoryServer.create();
process.env.NODE_ENV = 'test'; process.env.TEST_MONGODB_URI = mongo.getUri('test_sales_report_browser');
process.env.JWT_SECRET = 'owned-sales-browser-secret-minimum32'; delete process.env.ATLAS_URI; delete process.env.MONGODB_DB_NAME;
await import('../../api/test/require-isolated-db.mjs');
const { connectDB, disconnectDB } = await import('../../api/dist/db.js');
const { createApp } = await import('../../api/dist/app.js');
const { authorizationV1Fixture } = await import('../../api/test/helpers/authorization-v1-fixture.mjs');
const { UserModel } = await import('../../api/dist/models/User.js');
const { PosOrderModel } = await import('../../api/dist/models/PosOrder.js');
let api, web, browser, origin, apiOrigin; const contexts = [], errors = [];
const output = path.join(root, 'test-results/sales-report'); fs.mkdirSync(output, { recursive: true });
const compact = s => s.replace(/\s/g, ''), money = n => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n);
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
const day = n => new Date(Date.parse(today + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
try {
  await connectDB(); const fixture = await authorizationV1Fixture();
  await UserModel.updateOne({ _id: fixture.actors.am.user._id }, { $push: { 'authorization.grants.1.scope.storeIds': String(fixture.stores[1]._id) } });
  const amounts = [111000, 222000];
  const make = (id, storeId, orderedAt, value, extra = {}) => ({ orderId: id, storeId, orderedAt, source: 'demo', ledgerVersion: 1,
    channel: 'IN_STORE', paymentMethod: 'CASH', status: 'COMPLETED', subtotalVnd: value, discountVnd: 0, refundVnd: 0, netRevenueVnd: value,
    items: [{ productId: 'OWNED', productName: 'Cà phê kiểm thử', quantity: 1, unitPriceVnd: value, lineTotalVnd: value }], ...extra });
  for (let i = 0; i < 2; i++) await PosOrderModel.create([
    make('TODAY-' + i, fixture.stores[i]._id, new Date(), amounts[i]),
    ...['06:30', '08:15', '09:45', '13:00'].map((t, j) => make(`YESTERDAY-${i}-${j}`, fixture.stores[i]._id, new Date(day(-1) + 'T' + t + ':00+07:00'), amounts[i],
      j === 1 ? { channel: 'APP', paymentMethod: 'MOMO' } : j === 2 ? { status: 'CANCELLED', netRevenueVnd: 0 } : j === 3 ? { status: 'REFUNDED', refundVnd: amounts[i], netRevenueVnd: 0, channel: 'PARTNER' } : {})),
    make('PREVIOUS-' + i, fixture.stores[i]._id, new Date(day(-2) + 'T06:30:00+07:00'), amounts[i]),
  ]);
  const dist = path.join(root, 'apps/web/dist'); web = http.createServer((req, res) => {
    const name = new URL(req.url, 'http://127.0.0.1').pathname, file = path.resolve(dist, '.' + (name === '/' ? '/index.html' : name));
    if (!file.startsWith(dist + path.sep) || !fs.existsSync(file)) return res.writeHead(404).end();
    res.setHeader('Content-Type', { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }[path.extname(file)] || 'application/octet-stream'); fs.createReadStream(file).pipe(res);
  });
  await new Promise(r => web.listen(0, '127.0.0.1', r)); origin = 'http://127.0.0.1:' + web.address().port; process.env.FRONTEND_URL = origin;
  api = http.createServer(createApp()); await new Promise(r => api.listen(0, '127.0.0.1', r)); apiOrigin = 'http://127.0.0.1:' + api.address().port;
  browser = await chromium.launch({ headless: true });
  for (const profile of ['sm', 'am', 'staff']) {
    const context = await browser.newContext({ viewport: { width: 1536, height: 1150 } }); contexts.push(context);
    await context.route('**/*', async route => { const u = new URL(route.request().url()); if (u.pathname.startsWith('/api/')) return route.fulfill({ response: await route.fetch({ url: apiOrigin + u.pathname + u.search }) });
      return u.origin === origin ? route.continue() : route.fulfill({ status: 200, body: '' }); });
    const page = await context.newPage(); page.setDefaultTimeout(15000); page.on('pageerror', e => errors.push(e.message));
    await page.goto(origin, { waitUntil: 'networkidle' }); await page.getByRole('button', { name: 'Get Started', exact: true }).click();
    await page.locator('#login-username').fill('v1-' + profile); await page.locator('#login-password').fill(fixture.password);
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click(); await page.locator('.crm-sidebar').waitFor();
    const nav = page.locator('[data-section="sales"]');
    if (profile === 'staff') { assert.equal(await nav.isVisible(), false); continue; }
    await nav.click(); const report = page.locator('.sales-report'); await report.getByRole('heading', { name: 'Báo cáo bán hàng', exact: true }).waitFor();
    const revenue = report.getByTestId('sales-revenueVnd'); await revenue.waitFor();
    assert.equal(compact(await revenue.innerText()), compact(money(profile === 'sm' ? 111000 : 333000)));
    await report.getByRole('button', { name: 'Hôm qua', exact: true }).click();
    await page.waitForFunction(expected => document.querySelector('[data-testid="sales-totalOrders"]')?.textContent === expected, profile === 'sm' ? '4' : '8');
    assert.equal(compact(await revenue.innerText()), compact(money(profile === 'sm' ? 222000 : 666000)));
    assert.equal(await report.locator('svg[role="img"]').count(), 2);
    if (profile === 'am') {
      await report.getByLabel('Cửa hàng báo cáo', { exact: true }).selectOption(String(fixture.stores[1]._id));
      await page.waitForFunction(() => document.querySelector('[data-testid="sales-totalOrders"]')?.textContent === '4');
      assert.equal(compact(await revenue.innerText()), compact(money(444000)));
      await report.getByLabel('Cửa hàng báo cáo', { exact: true }).selectOption('');
      await page.waitForFunction(() => document.querySelector('[data-testid="sales-totalOrders"]')?.textContent === '8');
    }
    await report.getByLabel('Lọc kênh bán', { exact: true }).selectOption('APP');
    await page.waitForFunction(expected => document.querySelector('[data-testid="sales-totalOrders"]')?.textContent === expected, profile === 'sm' ? '1' : '2');
    assert.equal(compact(await revenue.innerText()), compact(money(profile === 'sm' ? 111000 : 333000)));
    await report.getByRole('button', { name: 'Bỏ lọc đơn hàng', exact: true }).click();
    await page.waitForFunction(expected => document.querySelector('[data-testid="sales-totalOrders"]')?.textContent === expected, profile === 'sm' ? '4' : '8');
    await report.locator('.sales-order-link').first().click(); await page.locator('.sales-order-dialog[open]').waitFor();
    assert.match(await page.locator('.sales-order-dialog').innerText(), /Cà phê kiểm thử/);
    await page.keyboard.press('Escape'); assert.equal(await page.locator('.sales-order-dialog').isVisible(), false);
    await page.getByRole('button', { name: 'Chế độ sáng', exact: true }).click();
    await report.locator('.sales-heading').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, profile + '-light-desktop.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'No document-level horizontal overflow');
    await report.locator('.sales-order-link').first().click(); await page.locator('.sales-order-dialog[open]').waitFor();
    const box = await page.locator('.sales-order-dialog').boundingBox(); assert.ok(box.x >= 10 && box.x + box.width <= 380);
    await page.screenshot({ path: path.join(output, profile + '-mobile-order.png') });
    await page.getByRole('button', { name: 'Đóng chi tiết đơn hàng', exact: true }).click();
    await report.getByLabel('Từ ngày', { exact: true }).fill(day(-10)); await report.getByLabel('Đến ngày', { exact: true }).fill(day(-10));
    await report.getByRole('button', { name: 'Áp dụng', exact: true }).click(); await report.getByText('Chưa có số liệu báo cáo', { exact: true }).waitFor();
    assert.equal(await report.locator('.sales-card').count(), 0);
    await report.getByRole('button', { name: 'Hôm nay', exact: true }).click(); await revenue.waitFor();
    await page.evaluate(() => { document.documentElement.classList.remove('light'); document.documentElement.classList.add('dark'); });
    await page.screenshot({ path: path.join(output, profile + '-dark-mobile.png') });
  }
  assert.deepEqual(errors, []);
  console.log('PASS sales report real browser/API/owned DB: SM/AM scope, Vietnam presets, filters, chart totals, order detail/Escape, empty date, staff hidden, mobile/light/dark; no external delivery');
} finally {
  for (const c of contexts) await c.close().catch(() => {}); await browser?.close();
  for (const s of [api, web]) if (s) { s.closeAllConnections(); await new Promise(r => s.close(r)); }
  await disconnectDB(); await mongo.stop();
}
