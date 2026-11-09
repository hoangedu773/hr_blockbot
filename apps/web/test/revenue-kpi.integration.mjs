import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { chromium } from './helpers/browser-deps.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..'), requireApi = createRequire(root + '/apps/api/package.json');
const mongo = await requireApi('mongodb-memory-server').MongoMemoryServer.create();
process.env.NODE_ENV = 'test'; process.env.TEST_MONGODB_URI = mongo.getUri('test_revenue_kpi_browser'); process.env.REVENUE_KPI_ENABLED = 'true';
process.env.JWT_SECRET = 'owned-revenue-browser-secret-minimum32'; delete process.env.ATLAS_URI; delete process.env.MONGODB_DB_NAME; delete process.env.AI_SERVICE_URL; delete process.env.AI_SERVICE_API_KEY;
await import('../../api/test/require-isolated-db.mjs');
const { connectDB, disconnectDB } = await import('../../api/dist/db.js');
const { createApp } = await import('../../api/dist/app.js');
const { revenueFixture } = await import('../../api/test/helpers/revenue-kpi-fixture.mjs');
const { RevenueKpiAssignmentModel: Assignment } = await import('../../api/dist/models/RevenueKpiAssignment.js');
const { RevenueKpiResultModel: Result } = await import('../../api/dist/models/RevenueKpiResult.js');
const { PosOrderModel } = await import('../../api/dist/models/PosOrder.js');
let web, api, browser, origin, apiOrigin; const contexts = [], errors = [], actors = {};
const output = path.join(root, 'test-results/revenue-kpi'); fs.mkdirSync(output, { recursive: true });
async function settle(page) { await page.waitForFunction(() => document.querySelector('.revenue-kpi')?.getAttribute('aria-busy') === 'false'); }
async function confirm(page) { await page.locator('.rk-dialog[open]').getByRole('button', { name: 'Xác nhận', exact: true }).click(); await page.locator('.rk-dialog[open]').waitFor({ state: 'hidden' }); await settle(page); }
async function action(page, button, reason) { await button.click(); if (reason) await page.getByLabel('Lý do KPI doanh thu', { exact: true }).fill(reason); await confirm(page); }
try {
  await connectDB(); const f = await revenueFixture();
  const dist = path.join(root, 'apps/web/dist'); web = http.createServer((req, res) => {
    const name = new URL(req.url, 'http://127.0.0.1').pathname, file = path.resolve(dist, '.' + (name === '/' ? '/index.html' : name));
    if (!file.startsWith(dist + path.sep) || !fs.existsSync(file)) return res.writeHead(404).end();
    res.setHeader('Content-Type', { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }[path.extname(file)] || 'application/octet-stream'); fs.createReadStream(file).pipe(res);
  });
  await new Promise(r => web.listen(0, '127.0.0.1', r)); origin = 'http://127.0.0.1:' + web.address().port; process.env.FRONTEND_URL = origin;
  api = http.createServer(createApp()); await new Promise(r => api.listen(0, '127.0.0.1', r)); apiOrigin = 'http://127.0.0.1:' + api.address().port;
  browser = await chromium.launch({ headless: true });
  for (const profile of ['hr', 'sm', 'am', 'staff']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } }); contexts.push(context);
    await context.route('**/*', async route => { const u = new URL(route.request().url()); if (u.pathname.startsWith('/api/')) return route.fulfill({ response: await route.fetch({ url: apiOrigin + u.pathname + u.search, maxRetries: 1 }) }); return u.origin === origin ? route.continue() : route.fulfill({ status: 200, body: '' }); });
    const page = await context.newPage(); actors[profile] = page; page.setDefaultTimeout(15000); page.on('pageerror', e => errors.push(e.message));
    await page.goto(origin, { waitUntil: 'networkidle' }); await page.getByRole('button', { name: 'Get Started', exact: true }).click();
    await page.locator('#login-username').fill('v1-' + profile); await page.locator('#login-password').fill(f.password); await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click(); await page.locator('.crm-sidebar').waitFor();
    if (profile === 'staff') { assert.equal(await page.locator('[data-section="revenueKpi"]').isVisible(), false); continue; }
    await page.locator('[data-section="revenueKpi"]').click(); await page.getByLabel('Kỳ KPI doanh thu', { exact: true }).fill('2026-10'); await settle(page);
  }
  const hr = actors.hr, sm = actors.sm, am = actors.am;
  await hr.getByRole('button', { name: 'Tạo kỳ KPI', exact: true }).click(); await hr.getByLabel('Cho phép dữ liệu POS demo trong kỳ này').check(); await confirm(hr);
  await hr.getByRole('button', { name: 'Xem trước mở kỳ', exact: true }).click();
  const openCard = hr.getByRole('region', { name: 'Kế hoạch mở kỳ KPI doanh thu' });
  await openCard.getByText('Dự kiến tạo 2 · Đã có 0 · Cần xử lý 0.').waitFor();
  assert.equal(await Assignment.countDocuments(), 0);
  await openCard.getByRole('button', { name: 'Xác nhận kế hoạch' }).click();
  await openCard.getByText(/Kỳ đang mở. Đã tạo 2/).waitFor();
  await settle(hr);
  const storeCard = page => page.locator('.rk-assignment').filter({ has: page.getByText('CỬA HÀNG · SM', { exact: true }) });
  const areaCard = page => page.locator('.rk-assignment').filter({ has: page.getByText('KHU VỰC · AM', { exact: true }) });
  await action(hr, storeCard(hr).getByRole('button', { name: 'Đề xuất AI', exact: true })); assert.match(await storeCard(hr).innerText(), /Đang dùng phân tích dự phòng/);
  const storeDraft = await Assignment.findOne({ unitType: 'STORE' }).lean();
  const areaDraft = await Assignment.findOne({ unitType: 'AREA' }).lean();
  const applyProposal = storeCard(hr).getByRole('button', { name: 'Áp dụng đề xuất', exact: true });
  await applyProposal.click();
  await hr.getByRole('dialog', { name: 'Áp dụng đề xuất cho cửa hàng' }).getByRole('button', { name: 'Hủy', exact: true }).click();
  assert.equal((await Assignment.findById(storeDraft._id).lean()).version, storeDraft.version);
  await action(hr, applyProposal);
  await storeCard(hr).getByText('Mục tiêu nháp đã khớp mức đề xuất.').waitFor();
  const updatedDraft = await Assignment.findById(storeDraft._id).lean();
  assert.equal(updatedDraft.status, 'DRAFT');
  assert.equal(updatedDraft.growthPercent, storeDraft.aiProposal.suggestedGrowthPercent);
  assert.notEqual(updatedDraft.targetVnd, storeDraft.targetVnd);
  assert.equal((await Assignment.findById(areaDraft._id).lean()).version, areaDraft.version);
  await storeCard(hr).getByRole('button', { name: 'Sửa mục tiêu', exact: true }).click();
  await hr.getByLabel('Mức tăng KPI').fill('2');
  await hr.getByLabel('Lý do KPI doanh thu').fill('HR điều chỉnh mục tiêu sau khi xem đề xuất.');
  await confirm(hr);
  await action(hr, hr.getByRole('button', { name: 'Phát hành bản nháp', exact: true }));
  assert.equal((await Assignment.findById(areaDraft._id).lean()).targetVnd, 102000);
  for (const p of [sm, am]) { await p.reload({ waitUntil: 'networkidle' }); await p.locator('[data-section="revenueKpi"]').click(); await p.getByLabel('Kỳ KPI doanh thu', { exact: true }).fill('2026-10'); await settle(p); }
  await sm.getByRole('button', { name: 'Từ chối', exact: true }).click(); await sm.getByLabel('Lý do KPI doanh thu').fill('a'); await sm.locator('.rk-dialog').getByRole('button', { name: 'Xác nhận', exact: true }).click(); assert.equal(await sm.locator('.rk-dialog[open]').count(), 1);
  await sm.getByLabel('Lý do KPI doanh thu').fill('Cần xem xét mục tiêu do sửa chữa.'); await confirm(sm);
  // Refresh by switching HR period away and back, exercising persisted data.
  const refresh = async p => { await p.getByLabel('Kỳ KPI doanh thu', { exact: true }).fill('2026-09'); await settle(p); await p.getByLabel('Kỳ KPI doanh thu', { exact: true }).fill('2026-10'); await settle(p); };
  await refresh(hr); await storeCard(hr).getByRole('button', { name: 'HR xử lý', exact: true }).click(); await hr.getByLabel('Cách giao mục tiêu').selectOption('ABSOLUTE_VND'); await hr.getByLabel('Mục tiêu VND', { exact: true }).fill('110000'); await hr.getByLabel('Lý do KPI doanh thu').fill('HR điều chỉnh sau trao đổi độc lập.'); await confirm(hr);
  await refresh(sm); await action(sm, sm.getByRole('button', { name: 'Chấp nhận', exact: true }));
  await sm.getByRole('button', { name: 'Xin điều chỉnh', exact: true }).click(); await sm.getByLabel('Bằng chứng điều chỉnh').fill('Biên bản sửa chữa mô phỏng số 01.'); await sm.getByLabel('Lý do KPI doanh thu').fill('Cửa hàng sửa chữa cần điều chỉnh.'); await confirm(sm);
  await refresh(am); await action(am, storeCard(am).getByRole('button', { name: 'AM xác minh', exact: true }), 'AM đã đối chiếu tài liệu sửa chữa.');
  await refresh(hr); await storeCard(hr).getByRole('button', { name: 'HR quyết định', exact: true }).click(); await hr.getByLabel('Cách giao mục tiêu').selectOption('ABSOLUTE_VND'); await hr.getByLabel('Mục tiêu VND', { exact: true }).fill('105000'); await hr.getByLabel('Lý do KPI doanh thu').fill('HR duyệt giảm mục tiêu theo bằng chứng.'); await confirm(hr);
  await refresh(sm); await action(sm, sm.getByRole('button', { name: 'Chấp nhận', exact: true })); await refresh(am); await action(am, areaCard(am).getByRole('button', { name: 'Chấp nhận', exact: true }));
  await refresh(hr); await action(hr, hr.getByRole('button', { name: 'Tính kết quả', exact: true }));
  for (const [role, page] of [['sm', sm], ['am', am]]) { await refresh(page); const card = role === 'sm' ? storeCard(page) : areaCard(page); await action(page, card.getByRole('button', { name: 'Gửi giải trình', exact: true }), 'Do sửa chữa nên kết quả chưa đạt mục tiêu.'); await page.getByRole('button', { name: 'Chế độ sáng', exact: true }).click(); await page.locator('#rk-title').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(output, role + '-desktop.png') }); await page.setViewportSize({ width: 390, height: 844 }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); await page.screenshot({ path: path.join(output, role + '-mobile.png') }); }
  await refresh(hr);
  for (const card of [storeCard(hr), areaCard(hr)]) { await action(hr, card.getByRole('button', { name: 'Xem xét giải trình', exact: true }), 'HR đã xem xét lý do và số liệu.'); await action(hr, card.getByRole('button', { name: 'Xác nhận kết quả', exact: true })); }
  await action(hr, hr.getByRole('button', { name: 'Chốt kỳ', exact: true })); await hr.getByRole('button', { name: 'Chế độ sáng', exact: true }).click(); await hr.locator('#rk-title').scrollIntoViewIfNeeded(); await hr.screenshot({ path: path.join(output, 'hr-desktop.png') });
  await hr.setViewportSize({ width: 390, height: 844 }); await hr.screenshot({ path: path.join(output, 'hr-mobile.png') });
  assert.doesNotMatch(await hr.locator('.revenue-kpi').innerText(), /[a-f0-9]{24}|expectedVersion|hash-chain|allowlist|DTO/);
  const assignment = await Assignment.findOne({ unitType: 'STORE' }).lean(); assert.equal(assignment.status, 'CLOSED'); assert.ok(await Result.countDocuments({ assignmentId: assignment._id }) >= 4);
  const chatRequests = [];
  for (const page of [hr, sm, am, actors.staff]) {
    await page.setViewportSize({ width: 1440, height: 1050 });
    page.on('request', request => {
      if (request.method() === 'POST' && /\/api\/chat(?:\/stream)?$/.test(request.url())) chatRequests.push(request.url());
    });
    await page.getByRole('link', { name: 'Chat', exact: true }).click();
  }
  async function ask(page, message, reply) {
    const input = page.getByLabel('Tin nhắn cho Guta AI');
    const responses = page.getByRole('log', { name: 'Hội thoại', exact: true }).locator('[data-sender="assistant"] p');
    const previous = await responses.count();
    await input.fill(message);
    await page.getByRole('button', { name: 'Gửi', exact: true }).click();
    const result = responses.nth(previous);
    await result.waitFor();
    assert.match(await result.textContent(), reply);
  }
  const period = '2026-09';
  const { _id: seedId, ...seedOrder } = await PosOrderModel.findOne({ orderId: 'KPI-2026-07' }).lean();
  assert.ok(seedId);
  await PosOrderModel.create({ ...seedOrder, orderId: 'KPI-2026-06', orderedAt: new Date('2026-06-10T06:30:00+07:00') });
  const currentStore = () => Assignment.findOne({ period, unitType: 'STORE' }).lean();
  const currentArea = () => Assignment.findOne({ period, unitType: 'AREA' }).lean();
  await ask(hr, 'Tạo kỳ KPI doanh thu tháng 9/2026', /Dùng cấu hình mặc định/);
  await ask(hr, 'tăng 3%, dùng dữ liệu demo', /Tạo kỳ nháp 2026-09/);
  await ask(hr, 'xác nhận', /Đã tạo kỳ nháp/);
  await ask(hr, 'Mở kỳ', /2 bản nháp dự kiến tạo/);
  assert.equal(await Assignment.countDocuments({ period }), 0);
  await ask(hr, 'xác nhận', /2 bản nháp tạo mới/);
  await ask(hr, 'Đề xuất AI hàng loạt', /Lấy đề xuất AI cho 1 mục/);
  await ask(hr, 'xác nhận', /1\/1 thành công/);
  await ask(hr, 'Áp dụng đề xuất AI hàng loạt', /Áp dụng đề xuất vào bản nháp/);
  await ask(hr, 'xác nhận', /1\/1 thành công/);
  await ask(hr, 'Sửa mục tiêu cửa hàng thành 120.000 đồng', /lý do giao hoặc sửa/);
  await ask(hr, 'Đặt mục tiêu mới sau khi rà soát.', /120.000/);
  await ask(hr, 'xác nhận', /Đã lưu/);
  await ask(hr, 'Phát hành tất cả bản nháp', /Phát hành cho 2 mục/);
  await ask(hr, 'xác nhận', /2\/2 thành công/);
  assert.equal((await currentArea()).targetVnd, 120000);
  await ask(actors.staff, 'KPI doanh thu của tôi', /chưa có quyền/);
  await ask(sm, 'Chốt kỳ KPI doanh thu tháng 9/2026', /chưa có quyền thực hiện/);
  await ask(sm, 'Tôi cần làm gì cho KPI doanh thu tháng 9?', /Chờ bạn nhận KPI/);
  await ask(sm, 'Xem mục 1', /Phụ trách/);
  await ask(sm, 'Chấp nhận', /Chấp nhận KPI/);
  assert.equal((await currentStore()).status, 'PENDING_ACCEPTANCE');
  await ask(sm, 'xác nhận', /Đã chấp nhận KPI/);
  await ask(am, 'KPI doanh thu khu vực tháng 9 của tôi', /1 KPI/);
  await ask(am, 'Chấp nhận KPI này', /Chấp nhận KPI/);
  await ask(am, 'xác nhận', /Đã chấp nhận KPI/);
  await ask(sm, 'Xin điều chỉnh mục tiêu', /lý do/);
  await ask(sm, 'Cửa hàng sửa chữa ảnh hưởng doanh thu.', /bằng chứng/);
  await ask(sm, 'Biên bản sửa chữa tại cửa hàng.', /Gửi yêu cầu điều chỉnh/);
  await ask(sm, 'xác nhận', /Đã lưu/);
  await ask(am, 'Xác minh yêu cầu điều chỉnh của cửa hàng', /lý do/);
  await ask(am, 'Đã kiểm tra biên bản sửa chữa.', /AM xác minh/);
  await ask(am, 'xác nhận', /Đã lưu/);
  assert.equal((await currentStore()).adjustment.status, 'VERIFIED');
  await ask(hr, 'Duyệt điều chỉnh của cửa hàng thành 110.000 đồng', /lý do/);
  await ask(hr, 'Chấp thuận theo hồ sơ của AM.', /110.000/);
  await ask(hr, 'xác nhận', /Đã lưu/);
  await ask(sm, 'Chấp nhận', /Chấp nhận KPI/);
  await ask(sm, 'xác nhận', /Đã chấp nhận KPI/);
  await ask(hr, 'Tính kết quả', /Tính kết quả kỳ 2026-09/);
  await ask(hr, 'xác nhận', /Đã tính kết quả/);
  await ask(hr, 'Kỳ tháng 9 còn vướng gì trước khi chốt?', /còn 2 mục chặn chốt/);
  for (const page of [sm, am]) {
    await ask(page, 'Gửi giải trình', /vì sao KPI chưa đạt/);
    await ask(page, 'Do cửa hàng sửa chữa, lưu lượng khách giảm.', /Giải trình/);
    await ask(page, 'xác nhận', /Đã gửi giải trình/);
  }
  for (const unit of ['cửa hàng', 'khu vực']) {
    await ask(hr, 'Ghi nhận giải trình của ' + unit, /lý do hoặc ghi chú/);
    await ask(hr, 'HR đã kiểm tra số liệu và giải trình.', /Ghi nhận giải trình/);
    await ask(hr, 'xác nhận', /Đã lưu/);
  }
  await ask(hr, 'Xác nhận kết quả hàng loạt', /Xác nhận kết quả cho 2 mục/);
  await ask(hr, 'xác nhận', /2\/2 thành công/);
  await ask(hr, 'Kiểm tra trước khi chốt kỳ', /đã đủ điều kiện/);
  await ask(hr, 'Chốt kỳ', /Chốt kỳ 2026-09 và khóa 2/);
  assert.equal((await currentStore()).status, 'ACTIVE');
  await ask(hr, 'xác nhận', /Đã chốt kỳ 2026-09/);
  assert.equal((await currentStore()).status, 'CLOSED');
  assert.equal((await currentArea()).status, 'CLOSED');
  await ask(hr, 'Điều chỉnh kết quả sau chốt của cửa hàng', /lý do/);
  await ask(hr, 'Đối soát lại doanh thu theo biên bản.', /Điều chỉnh kết quả sau chốt/);
  await ask(hr, 'xác nhận', /Đã lưu/);
  const corrected = await currentStore();
  assert.equal((await Result.findOne({ assignmentId: corrected._id }).sort({ version: -1 }).lean()).status, 'CORRECTED');
  await ask(hr, 'Xem lịch sử', /Lịch sử xử lý/);
  const download = hr.waitForEvent('download');
  await ask(hr, 'Xuất báo cáo KPI doanh thu tháng 9', /Đã xuất báo cáo/);
  assert.match((await download).suggestedFilename(), /2026-09\.csv$/);
  await ask(hr, 'Tạo kỳ KPI doanh thu tháng 6/2026', /Dùng cấu hình mặc định/);
  await ask(hr, 'mặc định', /Tạo kỳ nháp 2026-06/);
  await ask(hr, 'xác nhận', /Đã tạo kỳ nháp/);
  await ask(hr, 'Mở kỳ', /0 bản nháp dự kiến tạo/);
  await ask(hr, 'xác nhận', /Đã xử lý kỳ 2026-06/);
  await ask(hr, 'Giao mục tiêu cửa hàng mức 150.000 đồng, lý do: Giao thủ công theo kế hoạch.', /Tạo bản nháp 2026-06.*150.000/);
  await ask(hr, 'xác nhận', /Đã lưu/);
  await ask(hr, 'Phát hành KPI cửa hàng', /Phát hành KPI/);
  await ask(hr, 'xác nhận', /Đã phát hành/);
  await ask(sm, 'KPI doanh thu tháng 6/2026 của tôi', /Chờ nhận/);
  await ask(sm, 'Từ chối nhận KPI này, lý do: Cần điều chỉnh mục tiêu theo ca thực tế.', /Từ chối nhận KPI/);
  await ask(sm, 'xác nhận', /Đã lưu/);
  await ask(hr, 'Điều chỉnh mục tiêu sau từ chối thành 135.000 đồng, lý do: HR đã rà soát lại.', /135.000/);
  await ask(hr, 'xác nhận', /Đã lưu/);
  const juneStore = await Assignment.findOne({ period: '2026-06', unitType: 'STORE' }).lean();
  assert.equal(juneStore.targetVnd, 135000);
  assert.equal(juneStore.status, 'PENDING_ACCEPTANCE');
  assert.equal(chatRequests.length, 0);
  console.log('PASS conversational revenue KPI for HR, AM, SM: natural follow-ups, confirmation, no provider call, scoped denial, lifecycle and CSV');
  assert.deepEqual(errors, []); console.log('PASS revenue KPI real browser/API/owned Mongo: HR create/open/AI/publish, SM refuse/reconfirm/adjust, AM verify/own accept, compute/reasons/review/confirm/close, preserved result versions, staff denied, mobile/keyboard; no external provider');
} catch (e) { for (const [role, page] of Object.entries(actors)) { await page.screenshot({ path: path.join(output, role + '-failure.png') }).catch(() => {}); console.error(role + ': ' + (await page.locator('.revenue-kpi, .guta-chat-body').first().innerText({ timeout: 1000 }).catch(() => '')).slice(-1800)); } throw e; }
finally { for (const c of contexts) await c.close().catch(() => {}); await browser?.close(); for (const s of [api, web]) if (s) { s.closeAllConnections(); await new Promise(r => s.close(r)); } await disconnectDB(); await mongo.stop(); }
