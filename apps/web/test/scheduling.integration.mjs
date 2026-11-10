// Built Web -> real API -> exclusively owned MongoDB. No Render/provider access.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { chromium } from './helpers/browser-deps.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const requireApi = createRequire(path.join(root, 'apps/api/package.json'));
const mongo = await requireApi('mongodb-memory-server').MongoMemoryServer.create();
process.env.NODE_ENV = 'test'; process.env.TEST_MONGODB_URI = mongo.getUri('test_scheduling_browser');
process.env.JWT_SECRET = 'owned-scheduling-browser-secret-minimum32'; delete process.env.ATLAS_URI; delete process.env.MONGODB_DB_NAME;
await import('../../api/test/require-isolated-db.mjs');
const { connectDB, disconnectDB } = await import('../../api/dist/db.js');
const { createApp } = await import('../../api/dist/app.js');
const { authorizationV1Fixture } = await import('../../api/test/helpers/authorization-v1-fixture.mjs');
const { UserModel } = await import('../../api/dist/models/User.js');
const { NotificationModel } = await import('../../api/dist/models/Notification.js');
const { OperationalWeekModel, OperationalShiftModel } = await import('../../api/dist/models/OperationalSchedule.js');
const { schedulingGrantPlan } = await import('../../api/scripts/enable-scheduling-grants.mjs');
const { datePlus, verifySchedule } = await import('../../api/dist/services/scheduling.service.js');
const dist = path.join(root, 'apps/web/dist'), output = path.join(root, 'test-results/scheduling'); fs.mkdirSync(output, { recursive: true });
let browser, api, web, origin, apiOrigin, fixture;
const contexts = [], errors = [];
const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
const weekStart = datePlus(day, 14 - (new Date(day + 'T00:00:00Z').getUTCDay() + 6) % 7);
async function login(profile) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); contexts.push(context);
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/api/')) return route.fulfill({ response: await route.fetch({ url: apiOrigin + url.pathname + url.search }) });
    if (url.origin === origin) return route.continue(); return route.fulfill({ status: 200, body: '' });
  });
  const page = await context.newPage(); page.setDefaultTimeout(12000); page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(origin, { waitUntil: 'networkidle' }); await page.getByRole('button', { name: 'Get Started', exact: true }).click();
  await page.locator('#login-username').fill('v1-' + profile); await page.locator('#login-password').fill(fixture.password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click(); await page.locator('.crm-sidebar').waitFor();
  await page.locator('.crm-sidebar [data-section="schedules"]').click();
  await page.getByRole('heading', { name: 'Lịch làm & phân ca', exact: true }).waitFor();
  return page;
}
async function selectWeek(page) { await page.getByLabel('Tuần bắt đầu', { exact: true }).fill(weekStart); await page.getByText('Đang tải lịch…', { exact: true }).waitFor({ state: 'hidden' }); }
async function addShift(page, code, start, end, night = false) {
  await page.getByRole('button', { name: 'Thêm mã ca', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Thêm mã ca', exact: true });
  await dialog.getByLabel('Mã ca', { exact: true }).fill(code); await dialog.getByLabel('Tên ca', { exact: true }).fill('Synthetic ' + code);
  await dialog.getByLabel('Bắt đầu khoảng 1', { exact: true }).fill(start); await dialog.getByLabel('Kết thúc khoảng 1', { exact: true }).fill(end);
  if (night) await dialog.getByRole('combobox', { name: 'Ngày kết thúc khoảng 1', exact: true }).selectOption('1');
  await dialog.getByRole('button', { name: 'Lưu mã ca', exact: true }).click(); await dialog.waitFor({ state: 'hidden' });
  return OperationalShiftModel.findOne({ code }).lean();
}
async function assign(page, profile, date, shiftId) {
  await page.getByRole('button', { name: `Xếp ca V1-${profile} ${date}`, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Xếp ca làm', exact: true });
  await dialog.getByLabel('Mã ca', { exact: true }).selectOption(String(shiftId));
  await dialog.getByRole('button', { name: 'Áp dụng vào bản nháp', exact: true }).click(); await dialog.waitFor({ state: 'hidden' });
}
async function respond(page, button, reason, targetId) {
  await page.getByRole('button', { name: button, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Xác nhận xử lý đổi ca', exact: true });
  if (targetId) await dialog.getByLabel('Ca của bạn để đổi lại', { exact: true }).selectOption(targetId);
  await dialog.getByLabel('Lý do / phản hồi', { exact: true }).fill(reason);
  await dialog.getByRole('button', { name: 'Xác nhận phản hồi', exact: true }).click(); await dialog.waitFor({ state: 'hidden' });
}
async function chat(page, prompt, expectation) {
  const replies = page.locator('.guta-chat-message[data-sender="assistant"]');
  const n = await replies.count();
  await page.getByRole('textbox', { name: 'Tin nhắn cho Guta AI' }).fill(prompt);
  await page.getByRole('button', { name: 'Gửi', exact: true }).click();
  const reply = replies.nth(n);
  await reply.waitFor();
  const text = await reply.innerText();
  assert.match(text, expectation, `Chat reply to "${prompt}"`);
  return text;
}
try {
  await connectDB(); fixture = await authorizationV1Fixture(); await NotificationModel.init();
  for (const profile of ['sm', 'am', 'staff', 'ptch']) {
    const row = await UserModel.findById(fixture.actors[profile].user._id).lean();
    const plan = schedulingGrantPlan(row, String(fixture.actors.system_admin.user._id));
    await UserModel.updateOne({ _id: row._id }, { $set: { authorization: plan.authorization } });
  }
  web = http.createServer((req, res) => {
    const name = new URL(req.url, 'http://127.0.0.1').pathname, file = path.resolve(dist, '.' + (name === '/' ? '/index.html' : name));
    if (!file.startsWith(dist + path.sep) || !fs.existsSync(file)) return res.writeHead(404).end();
    res.setHeader('Content-Type', { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }[path.extname(file)] || 'application/octet-stream'); fs.createReadStream(file).pipe(res);
  });
  await new Promise((r) => web.listen(0, '127.0.0.1', r)); origin = 'http://127.0.0.1:' + web.address().port;
  process.env.FRONTEND_URL = origin;
  api = http.createServer(createApp()); await new Promise((r) => api.listen(0, '127.0.0.1', r)); apiOrigin = 'http://127.0.0.1:' + api.address().port;
  browser = await chromium.launch({ headless: true });
  const manager = await login('sm');
  await manager.getByRole('tab', { name: 'Danh mục ca', exact: true }).click();
  const a1 = await addShift(manager, 'SYNTH-A', '08:00', '12:00');
  const night = await addShift(manager, 'SYNTH-NIGHT', '22:00', '02:00', true); assert.equal(night.intervals[0].endMinute, 1560);
  await manager.screenshot({ path: path.join(output, 'configured-shifts.png') });
  await manager.getByRole('tab', { name: 'Lịch tuần cửa hàng', exact: true }).click(); await selectWeek(manager);
  await manager.getByRole('button', { name: 'Tạo lịch tuần', exact: true }).click();
  await assign(manager, 'staff', weekStart, a1._id); await assign(manager, 'ptch', datePlus(weekStart, 1), night._id);
  await manager.getByLabel('Ghi chú lần lưu / công bố', { exact: true }).fill('Owned weekly scheduling verification');
  await manager.getByRole('button', { name: 'Lưu nháp', exact: true }).click();
  await manager.getByText('Đã lưu nháp; nhân viên vẫn xem lịch công bố trước đó.', { exact: true }).waitFor();
  let board = await OperationalWeekModel.findOne({ weekStart }).lean(); assert.equal(board.draft.length, 2); assert.equal(board.published.length, 0);
  const employee = await login('staff'); await selectWeek(employee);
  await employee.getByRole('heading', { name: 'Chưa có ca đã công bố trong tuần này', exact: true }).waitFor();
  await manager.getByRole('button', { name: 'Công bố lịch', exact: true }).click();
  await manager.getByText('Đã công bố lịch và lưu thông báo cho nhân viên.', { exact: true }).waitFor();
  board = await OperationalWeekModel.findOne({ weekStart }).lean(); assert.equal(board.published.length, 2); verifySchedule(board);
  await manager.screenshot({ path: path.join(output, 'published-week.png') });
  await employee.getByRole('button', { name: 'Tải lại lịch', exact: true }).click();
  await employee.getByRole('button', { name: 'Xin đổi / nhận ca thay', exact: true }).click();
  const dialog = employee.getByRole('dialog', { name: 'Đề nghị đổi ca', exact: true });
  await dialog.getByLabel('Hình thức', { exact: true }).selectOption('SWAP');
  await dialog.getByLabel('Đồng nghiệp', { exact: true }).selectOption(String(fixture.actors.ptch.employee._id));
  await dialog.getByLabel('Ca muốn nhận lại', { exact: true }).selectOption(board.published.find((a) => a.employeeId === String(fixture.actors.ptch.employee._id)).id);
  await dialog.getByLabel('Lý do / phản hồi', { exact: true }).fill('Owned employee swap request');
  await dialog.getByRole('button', { name: 'Gửi đề nghị đổi ca', exact: true }).click(); await dialog.waitFor({ state: 'hidden' });
  const receiver = await login('ptch'); await selectWeek(receiver);
  await respond(receiver, 'Đồng ý nhận / đổi ca', 'Owned recipient agrees');
  await employee.getByRole('button', { name: 'Tải lại lịch', exact: true }).click();
  await manager.getByRole('button', { name: 'Tải lại lịch', exact: true }).click();
  assert.equal(await manager.getByRole('button', { name: 'Duyệt đổi ca', exact: true }).count(), 0);
  board = await OperationalWeekModel.findOne({ weekStart }).lean(); verifySchedule(board); assert.equal(board.requests[0].status, 'APPROVED');
  assert.equal(board.published.find((a) => a.shiftCode === 'SYNTH-NIGHT').employeeId, String(fixture.actors.staff.employee._id));
  await employee.getByRole('button', { name: 'Tải lại lịch', exact: true }).click();
  await employee.locator('.schedule-personal').getByText(/SYNTH-NIGHT/).waitFor();
  assert.doesNotMatch(await employee.locator('.schedule-personal').innerText(), /SYNTH-A/);
  // Second route: no receiver yet -> independent manager selects -> recipient declines -> reselect -> consent.
  await employee.getByRole('button', { name: 'Xin đổi / nhận ca thay', exact: true }).click();
  const requestForm = employee.getByRole('dialog', { name: 'Đề nghị đổi ca', exact: true });
  await requestForm.getByLabel('Cách xử lý', { exact: true }).selectOption('MANAGER');
  await requestForm.getByLabel('Lý do / phản hồi', { exact: true }).fill('Owned no replacement yet request');
  await requestForm.getByRole('button', { name: 'Gửi đề nghị đổi ca', exact: true }).click(); await requestForm.waitFor({ state: 'hidden' });
  const choose = async () => {
    await manager.getByRole('button', { name: 'Tải lại lịch', exact: true }).click();
    await manager.getByRole('button', { name: 'Chọn người thay ca', exact: true }).click();
    const form = manager.getByRole('dialog', { name: 'Xác nhận xử lý đổi ca', exact: true });
    await form.getByLabel('Người nhận ca thay', { exact: true }).selectOption(String(fixture.actors.ptch.employee._id));
    await form.getByLabel('Lý do / phản hồi', { exact: true }).fill('Owned independent manager selection');
    await form.getByRole('button', { name: 'Xác nhận phản hồi', exact: true }).click(); await form.waitFor({ state: 'hidden' });
  };
  await choose(); await receiver.getByRole('button', { name: 'Tải lại lịch', exact: true }).click();
  await respond(receiver, 'Từ chối', 'Owned receiver cannot take this shift yet');
  board = await OperationalWeekModel.findOne({ weekStart }).lean(); assert.equal(board.requests[1].status, 'PENDING_MANAGER');
  await choose(); await receiver.getByRole('button', { name: 'Tải lại lịch', exact: true }).click();
  await respond(receiver, 'Đồng ý nhận / đổi ca', 'Owned receiver now accepts selected shift');
  board = await OperationalWeekModel.findOne({ weekStart }).lean(); verifySchedule(board);
  assert.equal(board.requests[1].completionMode, 'MANAGER'); assert.equal(board.requests[1].selectionHistory.length, 2);
  await manager.evaluate(() => window.dispatchEvent(new Event('focus')));
  await manager.locator('summary', { hasText: 'Thông báo lịch làm' }).click();
  await manager.getByText(/Đã đổi ca: Isolated V1 staff/).waitFor();
  await manager.screenshot({ path: path.join(output, 'consent-and-manager-notices.png') });
  // Same real UI/API, now drive the entire registration and two consent paths from chat.
  const next = datePlus(weekStart, 7), tue = datePlus(next, 1), wed = datePlus(next, 2);
  for (const page of [manager, employee, receiver]) await page.locator('nav a.crm-copilot').click();
  await chat(manager, `Tạo lịch tuần ${next}`, /Khởi tạo bản nháp/);
  await chat(manager, 'Xác nhận', /Đã khởi tạo bản nháp/);
  for (const [page, shift, date] of [[employee, 'SYNTH-A', next], [receiver, 'SYNTH-NIGHT', tue], [employee, 'SYNTH-A', wed], [receiver, 'SYNTH-A', wed]]) {
    await chat(page, `Đăng ký ca ${shift} ngày ${date}`, /Bản xem trước đăng ký ca/);
    await chat(page, 'Xác nhận', /Đã gửi đăng ký ca/);
  }
  for (const page of [employee, receiver]) {
    const listed = await chat(page, `Bảng đăng ký ca tuần ${next}`, /Đang mở đăng ký/);
    assert.match(listed, /Isolated V1 staff/);
    assert.match(listed, /Isolated V1 ptch/);
  }
  await chat(manager, `Duyệt đăng ký ca tuần ${next}`, /chọn một đăng ký/);
  await chat(manager, `Duyệt tất cả đăng ký ca tuần ${next}`, /Số lượng duyệt: 4/);
  await chat(manager, 'Xác nhận', /Đã duyệt thành công 4/);
  await chat(manager, `Công bố lịch tuần ${next}`, /Bản xem trước công bố/);
  await chat(manager, 'Xác nhận', /Đã công bố chính thức/);
  const options = await chat(employee, `Đổi ca SYNTH-A ngày ${next} với Isolated V1 ptch`, /Bạn muốn nhận lại ca nào/);
  assert.match(options, /SYNTH-NIGHT/);
  assert.doesNotMatch(options, /SYNTH-A/); // Taking B's Wednesday ca would overlap A's Wednesday ca.
  await chat(employee, '1', /Nhập lý do/);
  const preview = await chat(employee, 'Mình có việc gia đình', /Ca bạn nhận lại.*SYNTH-NIGHT/);
  assert.match(preview, /Ca của bạn.*SYNTH-A/);
  const query = () => OperationalWeekModel.findOne({ weekStart: next }).lean();
  assert.equal((await query()).requests.length, 0);
  await chat(employee, 'Xác nhận gửi', /Chờ người nhận/i);
  // A recipient can open a fresh conversation without knowing the date of the new request.
  await receiver.getByRole('button', { name: 'Hội thoại mới', exact: true }).click();
  await chat(receiver, 'Đồng ý đổi ca', /Ca đổi lại.*SYNTH-NIGHT/);
  await chat(receiver, 'Xác nhận', /Đã áp dụng vào lịch công bố/);
  await chat(employee, `Lịch làm của tôi tuần ${next}`, /SYNTH-NIGHT/);
  await chat(receiver, `Lịch làm của tôi tuần ${next}`, /SYNTH-A/);
  assert.ok(await NotificationModel.exists({ userId: fixture.actors.sm.user._id, entityId: String((await query())._id), body: /Đã đổi ca/ }));
  await chat(employee, `Nhờ SM tìm người nhận ca thay SYNTH-NIGHT ngày ${tue} vì có lịch cá nhân`, /Nhờ quản lý tìm người nhận thay/);
  await chat(employee, 'Xác nhận', /Chờ quản lý/i);
  await chat(manager, `Điều phối yêu cầu đổi ca tuần ${next}`, /Chọn người nhận ca thay/);
  await chat(manager, 'Isolated V1 ptch', /Người nhận: Isolated V1 ptch/);
  await chat(manager, 'Xác nhận', /Chờ người nhận/i);
  await chat(receiver, 'Đồng ý nhận ca', /Ca làm.*SYNTH-NIGHT/);
  await chat(receiver, 'Xác nhận', /Đã áp dụng vào lịch công bố/);
  const final = await query();
  verifySchedule(final);
  assert.deepEqual(final.requests.map(r => r.completionMode), ['CONSENT', 'MANAGER']);
  assert.equal(final.published.find(a => a.shiftCode === 'SYNTH-NIGHT').employeeId, String(fixture.actors.ptch.employee._id));
  console.log('PASS chatbot registration, batch approval, publication, conflict filtering, direct swap and manager cover');
  await employee.setViewportSize({ width: 390, height: 844 }); await employee.screenshot({ path: path.join(output, 'personal-mobile.png') });
  assert.ok(await employee.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  assert.deepEqual(errors, []);
  console.log('PASS real browser/API/owned DB: configured overnight shifts -> publication -> A chooses both shifts -> B consent applies without manager review -> unchanged hour snapshots -> mobile; no external delivery');
} catch (error) {
  const page = contexts.at(-1)?.pages().at(-1); if (page) await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }).catch(() => {});
  throw error;
} finally {
  for (const context of contexts) await context.close().catch(() => {}); await browser?.close();
  for (const server of [api, web]) if (server) { server.closeAllConnections(); await new Promise((r) => server.close(r)); }
  await disconnectDB(); await mongo.stop();
}
