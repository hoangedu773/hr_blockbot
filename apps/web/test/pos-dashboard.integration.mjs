// Built UI -> real API -> exclusively owned MongoDB. No Render/provider calls.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { chromium } from './helpers/browser-deps.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..'), requireApi = createRequire(root + '/apps/api/package.json');
const mongo = await requireApi('mongodb-memory-server').MongoMemoryServer.create();
process.env.NODE_ENV = 'test'; process.env.TEST_MONGODB_URI = mongo.getUri('test_pos_dashboard_browser');
process.env.JWT_SECRET = 'owned-pos-browser-secret-minimum32'; delete process.env.ATLAS_URI; delete process.env.MONGODB_DB_NAME;
await import('../../api/test/require-isolated-db.mjs');
const { connectDB, disconnectDB } = await import('../../api/dist/db.js');
const { createApp } = await import('../../api/dist/app.js');
const { authorizationV1Fixture } = await import('../../api/test/helpers/authorization-v1-fixture.mjs');
const { UserModel } = await import('../../api/dist/models/User.js');
const { PosOrderModel } = await import('../../api/dist/models/PosOrder.js');
const { currentMonthPeriod } = await import('../../api/dist/services/pos-reporting.service.js');
let fixture, api, web, browser, origin, apiOrigin; const contexts = [], errors = [];
const output = path.join(root, 'test-results/pos-dashboard'); fs.mkdirSync(output, { recursive: true });
const compact = s => s.replace(/\s/g, ''), money = n => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n);
try {
  await connectDB(); fixture = await authorizationV1Fixture();
  await UserModel.updateOne({ _id: fixture.actors.am.user._id }, { $push: { 'authorization.grants.1.scope.storeIds': String(fixture.stores[1]._id) } });
  const time = new Date(), amounts = [111000, 222000];
  for (let i = 0; i < 2; i++) await PosOrderModel.create({ orderId: 'OWNED-' + i, storeId: fixture.stores[i]._id, orderedAt: time, source: 'demo', ledgerVersion: 1,
    channel: 'IN_STORE', paymentMethod: 'CASH', status: 'COMPLETED', subtotalVnd: amounts[i], discountVnd: 0, refundVnd: 0, netRevenueVnd: amounts[i],
    items: [{ productId: 'OWNED', productName: 'Owned synthetic sale', quantity: 1, unitPriceVnd: amounts[i], lineTotalVnd: amounts[i] }] });
  const dist = path.join(root, 'apps/web/dist'); web = http.createServer((req, res) => {
    const name = new URL(req.url, 'http://127.0.0.1').pathname, file = path.resolve(dist, '.' + (name === '/' ? '/index.html' : name));
    if (!file.startsWith(dist + path.sep) || !fs.existsSync(file)) return res.writeHead(404).end();
    res.setHeader('Content-Type', { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }[path.extname(file)] || 'application/octet-stream'); fs.createReadStream(file).pipe(res);
  });
  await new Promise(r => web.listen(0, '127.0.0.1', r)); origin = 'http://127.0.0.1:' + web.address().port; process.env.FRONTEND_URL = origin;
  api = http.createServer(createApp()); await new Promise(r => api.listen(0, '127.0.0.1', r)); apiOrigin = 'http://127.0.0.1:' + api.address().port;
  browser = await chromium.launch({ headless: true });
  for (const profile of ['sm', 'am']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); contexts.push(context);
    await context.route('**/*', async route => { const u = new URL(route.request().url()); if (u.pathname.startsWith('/api/')) return route.fulfill({ response: await route.fetch({ url: apiOrigin + u.pathname + u.search }) });
      return u.origin === origin ? route.continue() : route.fulfill({ status: 200, body: '' }); });
    const page = await context.newPage(); page.setDefaultTimeout(15000); page.on('pageerror', e => errors.push(e.message));
    await page.goto(origin, { waitUntil: 'networkidle' }); await page.getByRole('button', { name: 'Get Started', exact: true }).click();
    await page.locator('#login-username').fill('v1-' + profile); await page.locator('#login-password').fill(fixture.password);
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click(); await page.locator('.crm-sidebar').waitFor();
    const card = page.locator('.crm-kpi-card').filter({ has: page.getByText('Doanh thu tháng này', { exact: true }) });
    await card.locator('.crm-kpi-value').getByText(profile === 'sm' ? '111.000 ₫' : '333.000 ₫', { exact: false }).waitFor();
    assert.equal(compact(await card.locator('.crm-kpi-value').innerText()), compact(money(profile === 'sm' ? 111000 : 333000)));
    assert.equal(await page.locator('tr[data-id]').count(), profile === 'sm' ? 1 : 2);
    await page.locator(`tr[data-id="${fixture.stores[0]._id}"]`).click();
    const detail = page.getByRole('region', { name: 'Doanh thu cửa hàng', exact: true });
    await detail.getByTestId('store-revenue-value').getByText('111.000', { exact: false }).waitFor();
    assert.equal(compact(await detail.getByTestId('store-revenue-value').innerText()), compact(money(111000)));
    if (profile === 'am') {
      await page.getByRole('button', { name: 'Đóng chi tiết', exact: true }).click(); await page.locator(`tr[data-id="${fixture.stores[1]._id}"]`).click();
      await detail.getByTestId('store-revenue-value').getByText('222.000', { exact: false }).waitFor();
    }
    await page.screenshot({ path: path.join(output, profile + '.png') });
    await page.getByRole('button', { name: 'Đóng chi tiết', exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: path.join(output, profile + '-mobile.png') });
  }
  assert.deepEqual(errors, []); console.log('PASS POS real browser/API/owned DB: SM own store -> AM scope sum -> independent per-store drawer -> mobile; no external delivery');
} finally {
  for (const c of contexts) await c.close().catch(() => {}); await browser?.close();
  for (const s of [api, web]) if (s) { s.closeAllConnections(); await new Promise(r => s.close(r)); }
  await disconnectDB(); await mongo.stop();
}
