// Real UI/API/Mongo transaction test, synthetic actors only, no external providers.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { chromium } from './helpers/browser-deps.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const requireApi = createRequire(root + '/apps/api/package.json');
const { MongoMemoryReplSet } = requireApi('mongodb-memory-server');
const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
process.env.NODE_ENV = 'test'; process.env.TEST_MONGODB_URI = mongo.getUri('test_published_demo_browser');
process.env.JWT_SECRET = 'owned-demo-browser-test-secret-minimum32'; delete process.env.ATLAS_URI; delete process.env.MONGODB_DB_NAME;
await import('../../api/test/require-isolated-db.mjs');
const mongoose = requireApi('mongoose'); mongoose.set('transactionAsyncLocalStorage', true);
const { connectDB, disconnectDB } = await import('../../api/dist/db.js');
const { createApp } = await import('../../api/dist/app.js');
const { authorizationV1Fixture } = await import('../../api/test/helpers/authorization-v1-fixture.mjs');
const { UserModel } = await import('../../api/dist/models/User.js');
const { resolvePrincipal } = await import('../../api/dist/services/principal.service.js');
const { schedulingGrantPlan } = await import('../../api/scripts/enable-scheduling-grants.mjs');
const { planPublishedDemo, applyPublishedDemo, readInputs } = await import('../../api/scripts/seed-published-schedule-demo.mjs');
const contexts = [], errors = [], output = path.join(root, 'test-results/published-demo'); fs.mkdirSync(output, { recursive: true });
let browser, api, web, fixture, apiOrigin, origin;
try {
  await connectDB(); fixture = await authorizationV1Fixture();
  for (const name of ['sm', 'staff']) {
    const user = await UserModel.findById(fixture.actors[name].user._id).lean(), plan = schedulingGrantPlan(user, String(fixture.actors.system_admin.user._id));
    await UserModel.updateOne({ _id: user._id }, { $set: { authorization: plan.authorization } });
  }
  const actor = await resolvePrincipal({ sub: String(fixture.actors.system_admin.user._id), role: 'Admin', securityVersion: 0 });
  const input = await readInputs(); await applyPublishedDemo(actor, input, planPublishedDemo(input));
  const dist = path.join(root, 'apps/web/dist');
  web = http.createServer((req, res) => {
    const name = new URL(req.url, 'http://127.0.0.1').pathname, file = path.resolve(dist, '.' + (name === '/' ? '/index.html' : name));
    if (!file.startsWith(dist + path.sep) || !fs.existsSync(file)) return res.writeHead(404).end();
    res.setHeader('Content-Type', { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }[path.extname(file)] || 'application/octet-stream'); fs.createReadStream(file).pipe(res);
  });
  await new Promise(r => web.listen(0, '127.0.0.1', r)); origin = 'http://127.0.0.1:' + web.address().port; process.env.FRONTEND_URL = origin;
  api = http.createServer(createApp()); await new Promise(r => api.listen(0, '127.0.0.1', r)); apiOrigin = 'http://127.0.0.1:' + api.address().port;
  browser = await chromium.launch({ headless: true });
  for (const name of ['sm', 'staff']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } }); contexts.push(context);
    await context.route('**/*', async route => { const url = new URL(route.request().url());
      if (url.pathname.startsWith('/api/')) return route.fulfill({ response: await route.fetch({ url: apiOrigin + url.pathname + url.search }) });
      if (url.origin === origin) return route.continue(); return route.fulfill({ status: 200, body: '' });
    });
    const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message)); page.setDefaultTimeout(15000);
    await page.goto(origin, { waitUntil: 'networkidle' }); await page.getByRole('button', { name: 'Get Started', exact: true }).click();
    await page.locator('#login-username').fill('v1-' + name); await page.locator('#login-password').fill(fixture.password);
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click(); await page.locator('.crm-sidebar').waitFor();
    await page.locator('.crm-sidebar [data-section="schedules"]').click();
    await page.getByLabel('Tuần bắt đầu', { exact: true }).fill('2026-11-16');
    if (name === 'sm') {
      await page.locator('.schedule-grid .schedule-cell').first().waitFor();
      assert.doesNotMatch(await page.locator('.schedule-workspace').innerText(), /Lịch mẫu ngẫu nhiên|Có dữ liệu lịch mẫu/);
      assert.ok(await page.locator('.schedule-grid .schedule-cell').count() > 0);
      await page.screenshot({ path: path.join(output, 'manager.png') });
    } else {
      await page.locator('.schedule-personal .schedule-request').first().waitFor();
      assert.doesNotMatch(await page.locator('.schedule-workspace').innerText(), /Lịch mẫu ngẫu nhiên|Có dữ liệu lịch mẫu/);
      assert.ok(await page.locator('.schedule-personal .schedule-request').count() > 0);
      assert.doesNotMatch(await page.locator('.schedule-personal').innerText(), /V1-staffB|V1-sm/);
      await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: path.join(output, 'personal-mobile.png') });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    }
  }

  const staff = contexts[1].pages()[0], sm = contexts[0].pages()[0];
  const future = new Date(Math.max(Date.now() + 28 * 86400000, Date.parse("2026-12-07"))).toISOString().slice(0, 10);
  const monday = new Date(Date.parse(future) - ((new Date(future).getUTCDay() + 6) % 7) * 86400000).toISOString().slice(0, 10);
  const thursday = new Date(Date.parse(monday) + 3 * 86400000).toISOString().slice(0, 10);
  await staff.getByLabel('Tuần bắt đầu', { exact: true }).fill(monday);
  await sm.getByLabel('Tuần bắt đầu', { exact: true }).fill(monday);
  const requests = staff.getByRole('region', { name: 'Đăng ký ca của tôi' });
  await requests.getByRole('button', { name: 'Đăng ký ca làm', exact: true }).click();
  let dialog = staff.getByRole('dialog');
  const shift = await dialog.getByLabel('Ca làm', { exact: true }).locator('option').nth(1).getAttribute('value');
  assert.ok(shift);
  await dialog.getByLabel('Ca làm', { exact: true }).selectOption(shift);
  await dialog.getByRole('button', { name: 'Gửi quản lý', exact: true }).click();
  await requests.getByText('Chờ quản lý duyệt', { exact: true }).waitFor();
  assert.equal(await staff.locator('.schedule-personal .schedule-request').count(), 0);
  const review = sm.getByRole('region', { name: 'Duyệt đăng ký ca' });
  await review.locator('summary').click();
  await review.getByRole('button', { name: 'Tải yêu cầu mới nhất', exact: true }).click();
  await review.getByRole('button', { name: 'Đề xuất ca khác', exact: true }).click();
  dialog = sm.getByRole('dialog');
  await dialog.getByLabel('Ngày làm', { exact: true }).selectOption(thursday);
  await dialog.getByLabel('Ca làm', { exact: true }).selectOption(shift);
  await dialog.getByLabel('Lý do', { exact: true }).fill('Cửa hàng cần người vào thứ Năm');
  await dialog.getByRole('button', { name: 'Đề xuất ca khác', exact: true }).click();
  await review.getByText('Chờ nhân viên phản hồi', { exact: true }).waitFor();
  await requests.getByRole('button', { name: 'Tải yêu cầu mới nhất', exact: true }).click();
  await requests.getByRole('button', { name: 'Đồng ý ca đề xuất', exact: true }).click();
  await staff.getByRole('dialog').getByRole('button', { name: 'Đồng ý ca đề xuất', exact: true }).click();
  await requests.getByText('Đã duyệt · Chờ công bố lịch', { exact: true }).waitFor();
  assert.equal(await staff.locator('.schedule-personal .schedule-request').count(), 0);
  await sm.getByRole('button', { name: 'Tải lại lịch', exact: true }).click();
  await sm.getByLabel('Ghi chú lần lưu / công bố').fill('Công bố ca đăng ký đã xác nhận');
  await sm.getByRole('button', { name: 'Công bố lịch', exact: true }).click();
  await sm.getByText('Đã công bố lịch và lưu thông báo cho nhân viên.', { exact: true }).waitFor();
  await staff.getByRole('button', { name: 'Tải lại lịch', exact: true }).click();
  await staff.locator('.schedule-personal .schedule-request').getByText(new RegExp(thursday)).waitFor();
  await requests.getByRole('button', { name: 'Tải yêu cầu mới nhất', exact: true }).click();
  await requests.getByText('Đã duyệt · Đã công bố', { exact: true }).waitFor();
  console.log('PASS registration: staff -> SM proposes another day -> staff consents -> draft -> publish -> personal calendar');
  assert.deepEqual(errors, []); console.log('PASS published schedules: transaction -> populated manager grid -> populated personal schedule -> mobile; no random/demo source labels or external provider');
} finally {
  for (const c of contexts) await c.close().catch(() => {}); await browser?.close();
  for (const s of [api, web]) if (s) { s.closeAllConnections(); await new Promise(r => s.close(r)); }
  await disconnectDB(); await mongo.stop();
}
