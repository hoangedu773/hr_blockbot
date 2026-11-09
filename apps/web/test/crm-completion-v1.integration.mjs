// Built React -> real Express -> owned Mongo. No production/service/provider access.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { chromium } from './helpers/browser-deps.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const requireApi = createRequire(path.join(root, 'apps/api/package.json'));
const { MongoMemoryServer } = requireApi('mongodb-memory-server');
const mongo = await MongoMemoryServer.create();
process.env.NODE_ENV = 'test'; process.env.TEST_MONGODB_URI = mongo.getUri('test_crm_completion_browser'); process.env.JWT_SECRET = 'owned-crm-completion-browser-secret-minimum32';
delete process.env.ATLAS_URI; delete process.env.MONGODB_DB_NAME;
for (const key of ['ASSIGNMENT_CHAIN_RPC_URL', 'ASSIGNMENT_CHAIN_ID', 'ASSIGNMENT_REGISTRY_ADDRESS']) delete process.env[key];
await import('../../api/test/require-isolated-db.mjs');
const { connectDB, disconnectDB } = await import('../../api/dist/db.js');
const { createApp } = await import('../../api/dist/app.js');
const { authorizationV1Fixture, testGrant, SELF_CAPS, MANAGEMENT_CAPS } = await import('../../api/test/helpers/authorization-v1-fixture.mjs');
const { EmployeeModel } = await import('../../api/dist/models/Employee.js');
const { UserModel } = await import('../../api/dist/models/User.js');
const { ProjectModel } = await import('../../api/dist/models/Project.js');
const { ManagementRelationModel } = await import('../../api/dist/models/AuthorizationMapping.js');
const { OnboardingRequestModel } = await import('../../api/dist/models/OnboardingRequest.js');
const { EmployeeLifecycleRequestModel } = await import('../../api/dist/models/EmployeeLifecycleRequest.js');
const { OnboardingReportingModel } = await import('../../api/dist/services/onboarding-reporting.service.js');
const { verifyProjectAudit } = await import('../../api/dist/services/project-audit.service.js');
const mongoose = requireApi('mongoose');
const output = path.join(root, 'test-results', 'crm-completion-v1'); fs.mkdirSync(output, { recursive: true });
let api, web, browser, fixture, origin, apiOrigin, failAt;
const contexts = [], errors = [], httpErrors = [], invitations = new Map();
let NEW_CODE;
const NEW_PASSWORD = 'CoreBrowserRecipient@2026', TITLE = 'Core browser transfer with real handover';
const NEW_PHONE = '0900000123';
const localDate = (date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
async function login(name, password = fixture.password) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); contexts.push(context);
  let token = '';
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/api/')) {
      token = route.request().headers().authorization?.replace(/^Bearer /, '') || token;
      const response = await route.fetch({ url: apiOrigin + url.pathname + url.search });
      if (response.status() >= 400) httpErrors.push({ path: url.pathname, status: response.status() });
      return route.fulfill({ response });
    }
    if (url.origin === origin) return route.continue();
    return route.fulfill({ status: 200, body: '' });
  });
  const page = await context.newPage(); page.setDefaultTimeout(15000); page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(origin, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Get Started', exact: true }).click();
  await page.getByLabel('Tên đăng nhập', { exact: true }).fill((name.startsWith('CORE-') || name.startsWith('GT-CH')) ? name.toLowerCase() : 'v1-' + name);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  // The integrated shell opens CRM directly for every authorized profile.
  await page.locator('.crm-sidebar').waitFor(); return { page, token: () => token };
}
async function call(session, route, body, method = body ? 'POST' : 'GET') {
  const response = await fetch(apiOrigin + '/api' + route, { method, headers: { Authorization: 'Bearer ' + session.token(), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, body: response.status === 204 ? null : await response.json() };
}
async function work(session) { await session.page.locator('nav [data-section="projects"]').click(); await session.page.getByRole('heading', { name: 'Công việc & nghiệm thu', exact: true }).waitFor(); }
async function assignmentDialog(session) {
  await work(session); await session.page.getByRole('button', { name: 'Làm mới', exact: true }).click();
  await session.page.getByRole('row').filter({ hasText: TITLE }).getByRole('button', { name: 'Tiếp nhận / Bàn giao', exact: true }).click();
  return session.page.getByRole('dialog', { name: 'Tiếp nhận & bàn giao nhiệm vụ', exact: true });
}
async function lifecycleDialog(session, employeeId) {
  await session.page.locator('nav [data-section="lifecycle"]').click(); await session.page.getByRole('button', { name: 'Làm mới workflow', exact: true }).click();
  await session.page.locator('article').filter({ hasText: employeeId }).getByRole('button', { name: 'Đối chiếu và xử lý', exact: true }).click();
  return session.page.getByRole('dialog', { name: 'Đối chiếu workflow nhân sự', exact: true });
}
try {
  await connectDB(); fixture = await authorizationV1Fixture(); await EmployeeLifecycleRequestModel.init();
  for (const actor of ['hr', 'hr2']) await UserModel.updateOne({ _id: fixture.actors[actor].user._id }, { $push: { 'authorization.grants.1.scope.storeIds': String(fixture.stores[1]._id) } });
  await UserModel.updateOne({ _id: fixture.actors.sm.user._id }, { $push: { 'authorization.grants.1.capabilities': 'onboarding.reporting_propose' } });
  await EmployeeModel.collection.updateOne({ _id: fixture.actors.sm.employee._id }, { $set: {
    job_title: 'SM', hrmProfileMappingV1: { identityMappingVerified: true, sourceTitleVerified: true, sourceJobTitle: 'SM' },
  } });
  await UserModel.updateOne({ _id: fixture.actors.am.user._id }, { $push: { 'authorization.grants.1.capabilities': 'onboarding.reporting_review' } });
  const destination = await EmployeeModel.create({ employeeCode: 'CORE-SM-B', fullName: 'Synthetic destination manager', status: 'active', storeId: fixture.stores[1]._id, storeMappingRef: 'owned-destination-mapping', departmentId: fixture.departmentId, level: 'Junior' });
  const destinationUser = await UserModel.create({ username: 'v1-smb', passwordHash: fixture.actors.sm.user.passwordHash, role: 'Employee', employeeId: destination._id, authorization: { schemaVersion: 1, profile: 'sm', grants: [testGrant('sm', { kind: 'self' }, SELF_CAPS, fixture.actors.om.user._id), testGrant('sm', { kind: 'organization', storeIds: [String(fixture.stores[1]._id)] }, MANAGEMENT_CAPS, fixture.actors.om.user._id)] } });
  destination.userId = destinationUser._id; await destination.save();
  await ManagementRelationModel.create({ managerEmployeeId: destination._id, employeeId: fixture.actors.staffB.employee._id, storeId: fixture.stores[1]._id, approvalRef: 'owned-destination-reporting', validFrom: new Date(Date.now() - 60000), version: 1 });
  await mongoose.connection.collection('evaluations').insertOne({ employeeId: fixture.actors.staff.employee._id, status: 'PUBLISHED', finalScore: 80, maxScore: 100 });
  const kpiBefore = JSON.stringify(await mongoose.connection.collection('evaluations').find({}).toArray());
  const dist = path.join(root, 'apps/web/dist');
  web = http.createServer((req, res) => { const pathname = new URL(req.url, 'http://localhost').pathname; const file = path.resolve(dist, '.' + (pathname === '/' ? '/index.html' : pathname)); if (!file.startsWith(dist + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); } res.setHeader('Content-Type', { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' }[path.extname(file)] || 'application/octet-stream'); fs.createReadStream(file).pipe(res); });
  await new Promise((resolve) => web.listen(0, '127.0.0.1', resolve)); origin = `http://127.0.0.1:${web.address().port}`; process.env.FRONTEND_URL = origin;
  api = http.createServer(createApp({ onboarding: { deliverActivation: async (invitation) => invitations.set(invitation.requestId, invitation.token), failpoint: (stage) => { if (stage === failAt) { failAt = null; throw new Error('OWNED_BROWSER_INTERRUPTION'); } } } }));
  await new Promise((resolve) => api.listen(0, '127.0.0.1', resolve)); apiOrigin = `http://127.0.0.1:${api.address().port}`;
  browser = await chromium.launch({ headless: true });
  const sm = await login('sm'), hr = await login('hr'), hr2 = await login('hr2'), am = await login('am');
  const ordinaryChatRequests = [];
  sm.page.on('request', request => {
    if (request.method() === 'POST' && /\/api\/chat(?:\/stream)?$/.test(request.url())) ordinaryChatRequests.push(request.url());
  });
  await sm.page.getByRole('link', { name: 'Chat', exact: true }).click();
  await sm.page.getByPlaceholder('Hỏi AI về ca trực, nhân sự, tiền két...').fill('tôi cần thêm nhân viên mới');
  await sm.page.getByRole('button', { name: 'Gửi', exact: true }).click();
  const intake = sm.page.getByRole('log', { name: 'Tiếp nhận nhân viên trong chat' });
  const answer = async (text) => {
    await sm.page.getByLabel('Tin nhắn cho Guta AI').fill(text);
    await sm.page.getByRole('button', { name: 'Gửi', exact: true }).click();
  };
  await intake.getByText(/Đã chọn .* làm quản lý trực tiếp/).waitFor();
  // This instant is already 31 October in Vietnam and still 30 October in UTC.
  await sm.page.clock.setFixedTime(new Date('2026-10-30T17:05:00Z'));
  assert.equal(await sm.page.getByRole('dialog').count(), 0);
  for (const [question, value] of [
    [/tên đầy đủ là gì/, 'Synthetic browser new hire'],
    [/Cho mình số điện thoại/, NEW_PHONE],
    [/email nào/, 'khong-phai-email'],
    [/Thông tin chưa hợp lệ.*email nào/, 'new-core@example.com'],
    [/vào làm ngày nào/, '31/11/2026'],
    [/Thông tin chưa hợp lệ.*vào làm ngày nào/, 'hôm nay'],
    [/lý do tiếp nhận/, 'Owned browser complete core flow'],
  ]) {
    await intake.getByText(question).first().waitFor();
    await answer(value);
  }
  await intake.getByText(/Xem trước hồ sơ/).waitFor();
  await intake.getByText('Mình ghi nhận ngày vào làm là 31/10/2026 theo giờ Việt Nam.', { exact: true }).waitFor();
  await answer('sửa ngày vào làm');
  await answer('ngày mai');
  await intake.getByText(/Xem trước hồ sơ.*Ngày vào làm: 01\/11\/2026/s).waitFor();
  await answer('sửa ngày vào làm');
  await answer('bắt đầu từ hôm nay');
  await intake.getByText(/Xem trước hồ sơ.*Ngày vào làm: 31\/10\/2026/s).last().waitFor();
  await sm.page.clock.setFixedTime(new Date());
  assert.equal(await OnboardingRequestModel.countDocuments(), 0);
  await answer('sửa email');
  await intake.getByText('Nhân viên dùng email nào để nhận link kích hoạt?', { exact: true }).last().waitFor();
  await answer('new-core-corrected@example.com');
  await intake.getByText(/Xem trước hồ sơ.*new-core-corrected@example.com/s).waitFor();
  assert.equal(await OnboardingRequestModel.countDocuments(), 0);
  await answer('xác nhận');
  await intake.getByText(/Đã gửi đề nghị cho HR duyệt/).waitFor();
  assert.equal(ordinaryChatRequests.length, 0);
  const onboard = await OnboardingRequestModel.findOne({ 'payload.fullName': 'Synthetic browser new hire' }).lean(); assert.ok(onboard);
  assert.equal(onboard.payload.email, 'new-core-corrected@example.com');
  assert.equal(onboard.payload.hiredAt, '2026-10-30T17:00:00.000Z');
  NEW_CODE = onboard.payload.employeeCode; assert.match(NEW_CODE, /^GT-CH2610\d{4}$/);
  assert.equal((await call(sm, '/onboarding/pending-review')).status, 403);
  assert.equal(await mongoose.connection.collection('notifications').countDocuments({ entityKind: 'onboarding', entityId: String(onboard._id), userId: fixture.actors.hr.user._id }), 1);
  assert.equal(await mongoose.connection.collection('notifications').countDocuments({ entityKind: 'onboarding', entityId: String(onboard._id), userId: fixture.actors.sm.user._id }), 0);
  await sm.page.getByRole('button', { name: 'Quay lại CRM', exact: true }).click();
  await sm.page.locator('nav [data-section="onboarding"]').click();
  assert.equal(await sm.page.locator('nav [data-section="initialReporting"]').count(), 0);
  await sm.page.getByRole('button', { name: 'Quản lý trực tiếp', exact: true }).click();
  const reporting = await OnboardingReportingModel.findOne({ onboardingId: onboard._id }).lean();
  assert.equal(String(reporting.managerEmployeeId), String(fixture.actors.sm.employee._id));
  assert.equal((await call(sm, `/initial-reporting/${reporting._id}/approve`, { expectedVersion: 1, reason: 'Self approval forbidden' })).status, 403);
  const notices = mongoose.connection.collection('notifications');
  const notice = (userId, title, severity, dedupeKey) => ({
    userId, title, severity, dedupeKey, type: 'system', body: 'Synthetic notice', channel: 'in_app', readAt: null, createdAt: new Date(),
  });
  await notices.insertMany([
    ...Array.from({ length: 101 }, (_, index) => notice(fixture.actors.hr.user._id, 'Thông báo tham khảo', 'INFO', 'browser-info-' + index)),
    { ...notice(fixture.actors.hr.user._id, 'Cập nhật nhiệm vụ', 'INFO', 'browser-legacy-action'), performanceType: 'task_refused', entityKind: 'task' },
    { ...notice(fixture.actors.hr.user._id, 'Cập nhật KPI hiệu suất', 'URGENT', 'browser-legacy-info'), performanceType: 'performance_kpi_finalized', entityKind: 'performance_kpi' },
    { ...notice(fixture.actors.hr.user._id, 'Sự kiện khẩn cấp', 'URGENT', 'browser-urgent'), createdAt: new Date('2026-01-01'), body: 'Chi tiết đầy đủ của sự kiện. '.repeat(10) + 'Chi tiết cuối thông báo.' },
    notice(fixture.actors.hr2.user._id, 'Thông báo riêng của HR khác', 'URGENT', 'browser-private'),
  ]);
  const actionPage = await call(hr, '/notifications/inbox?action=true&limit=1');
  assert.equal(actionPage.status, 200);
  const first = actionPage.body.items[0];
  assert.equal(first.title, 'Nhiệm vụ bị từ chối');
  const cursor = new URLSearchParams({ action: 'true', limit: '1', before: first.createdAt, beforeId: first.id, beforeSource: first.source });
  const second = (await call(hr, '/notifications/inbox?' + cursor)).body.items[0];
  assert.equal(second.title, 'Hồ sơ tiếp nhận chờ duyệt');
  const hrChatRequests = [];
  hr.page.on('request', request => {
    if (request.method() === 'POST' && /\/api\/chat(?:\/stream)?$/.test(request.url())) hrChatRequests.push(request.url());
  });
  await hr.page.getByRole('link', { name: 'Chat', exact: true }).click();
  async function askHrChat(text) {
    await hr.page.getByLabel('Tin nhắn cho Guta AI').fill(text);
    await hr.page.getByRole('button', { name: 'Gửi', exact: true }).click();
  }
  const chatNotices = hr.page.getByRole('log', { name: 'Thông báo và hồ sơ trong chat' });
  const replies = chatNotices.locator('[data-sender="assistant"] p');
  await askHrChat('tôi có thông báo gì cần xử lí k');
  await replies.filter({ hasText: 'Sự kiện khẩn cấp' }).waitFor();
  const list = await replies.last().textContent();
  assert.match(list, /Bạn có tổng cộng \d{3} thông báo/);
  assert.match(list, /Khẩn cấp \(1\)\s+1\. Sự kiện khẩn cấp/);
  assert.match(list, /Cần xử lý \(\d+\)[\s\S]+Nhiệm vụ bị từ chối/);
  assert.match(list, /Thông tin \(\d+\)[\s\S]+Đã công bố kết quả KPI/);
  assert.equal(list.match(/Thông báo tham khảo/g)?.length, 101);
  assert.doesNotMatch(list, /Thông báo riêng của HR khác|Chi tiết cuối thông báo/);
  await askHrChat('xem cái đầu tiên');
  await replies.filter({ hasText: 'Chi tiết cuối thông báo.' }).waitFor();
  await askHrChat('đánh dấu đã đọc');
  await replies.filter({ hasText: 'Đã đánh dấu đã đọc thông báo' }).waitFor();
  assert.ok((await notices.findOne({ dedupeKey: 'browser-urgent' })).readAt);
  const onboardingNumber = list.match(/(?:^|\n)(\d+)\. Hồ sơ tiếp nhận chờ duyệt/)[1];
  await askHrChat('đọc mục ' + onboardingNumber);
  await replies.filter({ hasText: 'Bạn có thể nhắn “duyệt hồ sơ này”' }).waitFor();
  await askHrChat('hồ sơ tiếp nhận cần duyệt');
  await replies.filter({ hasText: 'Bạn có 1 hồ sơ tiếp nhận chờ duyệt' }).waitFor();
  await askHrChat('đọc hồ sơ số 1');
  await replies.filter({ hasText: 'Bạn có thể nhắn “duyệt hồ sơ này”' }).last().waitFor();
  await askHrChat('duyệt hồ sơ này');
  await replies.filter({ hasText: 'Bạn cho mình biết lý do duyệt' }).waitFor();
  await askHrChat('Independent HR ordinary personnel review');
  await replies.filter({ hasText: 'Bạn sẽ duyệt hồ sơ' }).waitFor();
  await askHrChat('xác nhận từ chối');
  await replies.filter({ hasText: 'Quyết định đang chờ là duyệt' }).waitFor();
  assert.equal((await call(hr, '/onboarding/pending-review')).body.items.length, 1);
  await askHrChat('xác nhận');
  await replies.filter({ hasText: 'Đã duyệt hồ sơ' }).waitFor();
  assert.equal((await call(hr, '/onboarding/pending-review')).body.items.length, 0);
  assert.equal(hrChatRequests.length, 0);
  await hr.page.getByRole('button', { name: 'Quay lại CRM', exact: true }).click();
  await am.page.locator('nav [data-section="onboarding"]').click(); await am.page.getByRole('button', { name: 'Lịch sử quan hệ ban đầu', exact: true }).click();
  let dialog = am.page.getByRole('dialog', { name: 'Duyệt quan hệ quản lý ban đầu', exact: true }); await dialog.getByLabel('Lý do phê duyệt quan hệ', { exact: true }).fill('Actual independent upper manager verifies relation'); await dialog.getByRole('button', { name: 'Phê duyệt quan hệ ban đầu', exact: true }).click(); await dialog.waitFor({ state: 'hidden' });
  assert.equal(await ManagementRelationModel.countDocuments({ employeeId: onboard.employeeId, revokedAt: null }), 0);
  const activation = await browser.newPage(); contexts.push(activation.context()); await activation.route('**/api/**', async (route) => { const url = new URL(route.request().url()); return route.fulfill({ response: await route.fetch({ url: apiOrigin + url.pathname }) }); });
  await activation.goto(origin + '#activate=' + invitations.get(String(onboard._id))); await activation.getByLabel('Mật khẩu mới', { exact: true }).fill(NEW_PASSWORD); await activation.getByLabel('Nhập lại mật khẩu', { exact: true }).fill(NEW_PASSWORD); await activation.getByRole('button', { name: 'Thiết lập mật khẩu', exact: true }).click(); await activation.getByText('Đã thiết lập mật khẩu. Bạn có thể đăng nhập bằng mã nhân viên.').waitFor();
  await sm.page.getByRole('button', { name: 'Làm mới quan hệ ban đầu', exact: true }).click(); await sm.page.getByRole('button', { name: 'Áp dụng quan hệ đã duyệt', exact: true }).click();
  await sm.page.locator('article').getByText(/APPLIED/).waitFor();
  const employee = await login(NEW_CODE, NEW_PASSWORD); await work(sm);
  await sm.page.getByRole('button', { name: 'Tạo công việc', exact: true }).click(); dialog = sm.page.getByRole('dialog', { name: 'Tạo công việc', exact: true }); await dialog.getByLabel('Tiêu đề công việc', { exact: true }).fill(TITLE); await dialog.getByLabel('Hạn hoàn thành (giờ Việt Nam, cuối ngày)', { exact: true }).fill('2026-11-15'); await dialog.getByRole('button', { name: 'Lưu công việc', exact: true }).click();
  const row = sm.page.getByRole('row').filter({ hasText: TITLE }); await row.getByRole('button', { name: 'Giao việc', exact: true }).click(); dialog = sm.page.getByRole('dialog', { name: 'Giao việc', exact: true }); await dialog.getByRole('combobox', { name: 'Nhân sự đang hoạt động', exact: true }).click(); await dialog.getByRole('option', { name: 'Synthetic browser new hire · Junior', exact: true }).click(); await dialog.getByRole('button', { name: 'Xác nhận giao việc', exact: true }).click();
  dialog = await assignmentDialog(employee); await dialog.getByRole('button', { name: 'Xác nhận tiếp nhận', exact: true }).click(); await dialog.getByText(/Đã tiếp nhận, chưa bắt đầu · phiên bản/).waitFor(); await dialog.getByRole('button', { name: 'Đóng', exact: true }).click();
  const ownRow = employee.page.getByRole('row').filter({ hasText: TITLE }); await ownRow.getByRole('button', { name: 'Bắt đầu', exact: true }).click(); await ownRow.getByRole('button', { name: 'Tiến độ', exact: true }).click(); dialog = employee.page.getByRole('dialog', { name: 'Cập nhật tiến độ', exact: true }); await dialog.getByLabel('Tiến độ (%)', { exact: true }).fill('45'); await dialog.getByRole('button', { name: 'Lưu công việc', exact: true }).click(); await ownRow.getByText('45%', { exact: true }).waitFor();
  console.log('PASS browser/API/DB G07: SM proposal + explicit manager choice -> independent HR -> independent actual AM relation approval -> activation -> relation applied -> first assignment -> employee consent/start45%; no auto grants');

  await hr.page.locator('nav [data-section="lifecycle"]').click(); await hr.page.getByRole('button', { name: 'Lập yêu cầu nhân sự', exact: true }).click(); dialog = hr.page.getByRole('dialog', { name: 'Lập yêu cầu nhân sự', exact: true }); await dialog.getByLabel('Nghiệp vụ', { exact: true }).selectOption('TRANSFER'); await dialog.getByLabel('Nhân viên', { exact: true }).selectOption(String(onboard.employeeId)); await dialog.getByLabel('Cửa hàng đích', { exact: true }).selectOption(String(fixture.stores[1]._id)); await dialog.getByLabel('Ngày giờ hiệu lực', { exact: true }).fill(localDate(new Date(Date.now() - 60000))); await dialog.getByLabel('Lý do yêu cầu', { exact: true }).fill('Transfer must wait for the running CRM task'); await dialog.getByRole('button', { name: 'Gửi HR độc lập duyệt', exact: true }).click(); await dialog.waitFor({ state: 'hidden' });
  const lifecycle = await EmployeeLifecycleRequestModel.findOne({ employeeId: onboard.employeeId, kind: 'TRANSFER' }).lean();
  assert.equal((await call(hr, `/employee-lifecycle/${lifecycle._id}/review`, { decision: 'APPROVE', expectedVersion: 1, reason: 'No self approval' })).status, 403);
  dialog = await lifecycleDialog(hr2, String(onboard.employeeId)); await dialog.getByLabel('Lý do quyết định', { exact: true }).fill('Independent HR reviews transfer scope'); await dialog.getByRole('button', { name: 'HR phê duyệt', exact: true }).click(); await dialog.waitFor({ state: 'hidden' });
  const smB = await login('smb');
  for (const [manager, store] of [[sm, fixture.stores[0]], [smB, fixture.stores[1]]]) { dialog = await lifecycleDialog(manager, String(onboard.employeeId)); await dialog.getByLabel('Lý do quyết định', { exact: true }).fill('Independent manager confirms transfer prerequisite'); await dialog.getByRole('button', { name: 'Quản lý xác nhận ' + store.store_name, exact: true }).click(); await dialog.waitFor({ state: 'hidden' }); }
  dialog = await lifecycleDialog(hr2, String(onboard.employeeId)); await dialog.getByRole('button', { name: 'Kiểm tra điều kiện và tiếp tục xử lý', exact: true }).click(); await dialog.waitFor({ state: 'hidden' }); assert.equal((await EmployeeLifecycleRequestModel.findById(lifecycle._id)).status, 'PENDING_HANDOVER');
  assert.equal(String((await EmployeeModel.findById(onboard.employeeId)).storeId), String(fixture.stores[0]._id));
  dialog = await assignmentDialog(employee); await dialog.getByRole('button', { name: 'Xin chuyển giao', exact: true }).click(); await dialog.getByLabel('Lý do / nội dung xác nhận', { exact: true }).fill('Approved transfer needs actual handover of ongoing45%'); await dialog.getByRole('button', { name: 'Xác nhận lưu phản hồi', exact: true }).click(); await dialog.getByText(/Xin chuyển giao · Chờ quản lý xử lý/).waitFor(); await dialog.getByRole('button', { name: 'Đóng', exact: true }).click();
  dialog = await assignmentDialog(sm); await dialog.getByRole('button', { name: 'Xử lý yêu cầu', exact: true }).click(); await dialog.getByRole('combobox', { name: 'Quyết định', exact: true }).click(); await dialog.getByRole('option', { name: 'Phê duyệt người thay thế', exact: true }).click(); await dialog.getByRole('combobox', { name: 'Người thay thế', exact: true }).click(); await dialog.getByRole('option', { name: 'Isolated V1 ptch', exact: true }).click(); await dialog.getByLabel('Ghi chú bàn giao tại tiến độ 45%', { exact: true }).fill('45% completed, remaining checklist and evidence handed over'); await dialog.getByLabel('Lý do / nội dung xác nhận', { exact: true }).fill('Independent manager approves human handover'); await dialog.getByRole('button', { name: 'Xác nhận lưu phản hồi', exact: true }).click(); await dialog.getByText(/Chờ xác nhận bàn giao · phiên bản/).waitFor(); await dialog.getByRole('button', { name: 'Đóng', exact: true }).click();
  const recipient = await login('ptch');
  for (const party of [employee, recipient]) { dialog = await assignmentDialog(party); await dialog.getByRole('button', { name: 'Xác nhận bàn giao', exact: true }).click(); await dialog.getByLabel('Lý do / nội dung xác nhận', { exact: true }).fill('Actually verified and received handover evidence'); await dialog.getByRole('button', { name: 'Xác nhận lưu phản hồi', exact: true }).click(); await dialog.getByText(/Đã tiếp nhận, chưa bắt đầu|Đang thực hiện|Đã nhận|Đã xác nhận|Chờ xác nhận bàn giao/).first().waitFor(); await dialog.getByRole('button', { name: 'Đóng', exact: true }).click(); }
  const task = await ProjectModel.findOne({ title: TITLE }).lean(); assert.equal(String(task.assigneeId), String(fixture.actors.ptch.employee._id)); assert.equal(task.progress, 45); assert.equal(task.responsibilities[0].endAt, task.responsibilities[1].startAt); assert.equal(verifyProjectAudit(task), true);
  const taskBeforeTransfer = JSON.stringify(task);
  dialog = await lifecycleDialog(hr2, String(onboard.employeeId));
  for (const stage of ['lifecycle-after-fence', 'lifecycle-after-user', 'lifecycle-after-employee', 'lifecycle-after-decision']) {
    failAt = stage; await dialog.getByRole('button', { name: 'Kiểm tra điều kiện và tiếp tục xử lý', exact: true }).click(); await dialog.getByRole('alert').waitFor();
    const current = await EmployeeModel.findById(onboard.employeeId).lean(); const edited = await call(hr, `/employees/${onboard.employeeId}`, { fullName: 'Must not alter fenced snapshot', expectedVersion: current.profileRevision ?? 0 }, 'PATCH'); assert.equal(edited.status, 409); assert.equal(edited.body.error.code, 'CRM_EMPLOYEE_FENCED');
    console.log('PASS browser/API/DB interrupted transfer stage with HR edit denied:', stage);
  }
  await dialog.getByRole('button', { name: 'Kiểm tra điều kiện và tiếp tục xử lý', exact: true }).click(); await dialog.waitFor({ state: 'hidden' });
  const transferred = await EmployeeModel.findById(onboard.employeeId).lean(); assert.equal(String(transferred.storeId), String(fixture.stores[1]._id)); assert.equal(transferred.lifecyclePendingRequestId, undefined); assert.equal((await EmployeeLifecycleRequestModel.findById(lifecycle._id)).status, 'COMPLETED'); assert.equal(transferred.profileHistory.filter((event) => event.requestId === String(lifecycle._id)).length, 1);
  assert.equal(JSON.stringify(await ProjectModel.findById(task._id).lean()), taskBeforeTransfer, 'HR transfer never rewrites prior task/history/intervals');
  const newSession = await login(NEW_CODE, NEW_PASSWORD);
  const transferredDir = (await call(newSession, '/directory')).body;
  assert.ok(transferredDir.items.some((item) => item.fullName === 'Isolated V1 staffB'));
  assert.equal(transferredDir.items.some((item) => item.fullName === 'Isolated V1 staff'), false);
  assert.equal((await call(sm, '/employees?q=' + NEW_CODE)).body.paging.totalItems, 0); assert.equal((await call(newSession, `/projects/${task._id}/progress`, { progress: 99, expectedVersion: task.version })).status, 403);
  assert.equal((await call(newSession, `/projects/${task._id}/assignment/audit`)).body.valid, true, 'historical participant may still read their assignment audit');
  assert.equal(JSON.stringify(await mongoose.connection.collection('evaluations').find({}).toArray()), kpiBefore);
  console.log('PASS browser/API/DB full C chain: running task45% -> HR transfer -> source+destination approvals -> PENDING_HANDOVER -> approved two-party actual task handover -> interrupted/resumed lifecycle -> storeB scope/grants, same identity, old CRM document unchanged, KPI unchanged');

  // Volume/legacy UX is tested through actual controls, not inferred from API counts.
  const raw = await EmployeeModel.collection.insertOne({ employee_code: 'CORE-UI-UNKNOWN', full_name: 'Synthetic unknown UI row', storeId: fixture.stores[0]._id, storeMappingRef: 'owned-ui-legacy', departmentId: fixture.departmentId, level: 'Junior', skills: [] });
  await hr.page.locator('nav [data-section="employees"]').click(); await hr.page.getByPlaceholder('Tìm theo tên, mã NV...').fill('CORE-UI-UNKNOWN');
  await hr.page.getByRole('row').filter({ hasText: 'Synthetic unknown UI row' }).getByText('Chưa xác minh', { exact: true }).waitFor();
  assert.equal((await EmployeeModel.collection.findOne({ _id: raw.insertedId })).status, undefined);
  await hr.page.getByPlaceholder('Tìm theo tên, mã NV...').fill(NEW_CODE); await hr.page.getByRole('button', { name: 'Synthetic browser new hire', exact: true }).click();
  dialog = hr.page.getByRole('dialog', { name: 'Chi tiết nhân sự', exact: true }); await dialog.getByText(NEW_PHONE, { exact: true }).waitFor();
  await dialog.getByRole('button', { name: 'Chỉnh sửa thông tin thường', exact: true }).click();
  dialog = hr.page.getByRole('dialog', { name: 'Sửa thông tin thường', exact: true }); await dialog.getByLabel('Điện thoại', { exact: true }).fill('verified-core-phone'); await dialog.getByRole('button', { name: 'Lưu thông tin thường', exact: true }).click(); await dialog.waitFor({ state: 'hidden' });
  await hr.page.getByRole('button', { name: 'Synthetic browser new hire', exact: true }).click(); dialog = hr.page.getByRole('dialog', { name: 'Chi tiết nhân sự', exact: true });
  await dialog.getByText('verified-core-phone', { exact: true }).waitFor(); const history = dialog.getByRole('region', { name: 'Lịch sử thông tin thường', exact: true }); await history.getByText(/PROFILE_EDITED/).waitFor(); await history.getByText(/Sau:.*verified-core-phone/).waitFor(); await dialog.getByRole('button', { name: 'Đóng', exact: true }).click();
  for (let index = 0; index < 21; index++) {
    const person = await EmployeeModel.create({ employeeCode: 'CORE-BROWSER-QUEUE-' + index, fullName: 'Synthetic queue ' + index, status: 'active', level: 'Junior', storeId: fixture.stores[0]._id, storeMappingRef: 'owned-ui-queue', departmentId: fixture.departmentId });
    assert.equal((await call(hr, `/employees/${person._id}/change-requests`, { targetFields: { hiredAt: '2026-01-01T00:00:00Z' } })).status, 201);
  }
  const queue = hr.page.getByRole('region', { name: 'Duyệt thay đổi hồ sơ', exact: true }); await queue.getByRole('button', { name: 'Làm mới hàng đợi', exact: true }).click(); await queue.getByText('Trang 1 · 21 yêu cầu', { exact: true }).waitFor(); assert.equal(await queue.locator('article').count(), 20);
  await queue.getByRole('navigation', { name: 'Phân trang duyệt hồ sơ', exact: true }).getByRole('button', { name: 'Trang sau', exact: true }).click(); await queue.getByText('Trang 2 · 21 yêu cầu', { exact: true }).waitFor(); await hr.page.waitForFunction(() => document.querySelector('[aria-label="Duyệt thay đổi hồ sơ"]')?.querySelectorAll('article').length === 1); assert.equal(await queue.locator('article').count(), 1);
  const historical = Array.from({ length: 125 }, (_, index) => ({ id: 'browser-old-notice-' + index, at: new Date(Date.now() - 100000 + index).toISOString(), message: 'Browser legacy notice ' + index, recipients: ['employee:' + fixture.actors.ptch.employee._id] }));
  const legacy = await ProjectModel.create({ title: 'Browser old inbox fixture', storeId: fixture.stores[0]._id, storeMappingRef: 'owned-old-inbox', departmentId: fixture.departmentId, createdBy: fixture.actors.sm.user._id, assigneeId: fixture.actors.ptch.employee._id, status: 'ASSIGNED', version: 1, assignmentNotices: historical });
  await work(recipient); await recipient.page.getByRole('button', { name: 'Làm mới', exact: true }).click(); const inbox = recipient.page.locator('.crm-assignment-inbox'); await inbox.locator('summary').click();
  const inboxPages = inbox.getByRole('navigation', { name: 'Phân trang thông báo phân công', exact: true });
  await recipient.page.waitForFunction(() => document.querySelector('.crm-assignment-inbox')?.getAttribute('aria-busy') === 'false');
  for (let count = 0; count < 10 && !await inboxPages.getByRole('button', { name: 'Trang sau', exact: true }).isDisabled(); count++) { const prior = await inboxPages.locator('span').innerText(); await inboxPages.getByRole('button', { name: 'Trang sau', exact: true }).click(); await recipient.page.waitForFunction(({ previous }) => document.querySelector('.crm-assignment-inbox')?.getAttribute('aria-busy') === 'false' && document.querySelector('[aria-label="Phân trang thông báo phân công"] span')?.textContent !== previous, { previous: prior }); }
  await inbox.getByText('Browser legacy notice 0', { exact: true }).waitFor(); assert.equal((await ProjectModel.findById(legacy._id)).assignmentNotices.length, 125);
  await recipient.page.getByRole('region', { name: 'Dashboard công việc', exact: true }).getByRole('definition').first().waitFor();
  console.log('PASS real UI P1/P2: UNKNOWN code search without normalization -> HR ordinary detail/edit/history -> pending queue21 across2pages -> recipient inbox125 beyond100 -> work dashboard');

  for (const profile of ['aom', 'ptch', 'staff', 'system_admin']) { const session = await login(profile); if (['aom', 'ptch'].includes(profile)) { await session.page.getByText('Danh mục cửa hàng trong phạm vi được cấp. Tài khoản chưa được cấp xem tổng quan nhân sự.', { exact: true }).waitFor(); } assert.doesNotMatch(await session.page.locator('#crm-header-store-chip').innerText(), /Đang tải/); }
  assert.equal(httpErrors.some((item) => ['/api/dashboard/overview', '/api/departments'].includes(item.path) && item.status === 403), false, 'UI no longer calls forbidden metadata/overview');
  // CRM scrolls inside its viewport, so fullPage captures blank space below the
  // app shell rather than meaningful screen content. Capture actual viewports.
  await hr.page.setViewportSize({ width: 390, height: 844 }); await hr.page.screenshot({ path: path.join(output, 'employee-list-mobile.png'), fullPage: false });
  await inbox.locator('summary').click();
  await recipient.page.getByRole('region', { name: 'Dashboard công việc', exact: true }).scrollIntoViewIfNeeded();
  await recipient.page.screenshot({ path: path.join(output, 'work-dashboard-desktop.png'), fullPage: false });
  await recipient.page.setViewportSize({ width: 390, height: 844 });
  await recipient.page.getByRole('heading', { name: 'Tổng quan công việc', exact: true }).scrollIntoViewIfNeeded();
  const dashboard = await recipient.page.getByRole('region', { name: 'Dashboard công việc', exact: true }).boundingBox();
  assert.ok(dashboard.x >= 0 && dashboard.x + dashboard.width <= 390, 'mobile dashboard stays inside actual viewport');
  await recipient.page.screenshot({ path: path.join(output, 'work-dashboard-mobile.png'), fullPage: false });
  await newSession.page.screenshot({ path: path.join(output, 'transferred-directory.png'), fullPage: false });
  assert.deepEqual(errors, []);
  console.log('PASS capability-aware overview/metadata, staff/system_admin header, zero browser runtime exceptions; no real delivery/Atlas/provider');
} catch (error) {
  if (browser) for (const context of contexts) for (const page of context.pages()) if (!page.isClosed()) await page.screenshot({ path: path.join(output, 'failure-' + contexts.indexOf(context) + '-' + context.pages().indexOf(page) + '.png'), fullPage: true }).catch(() => {});
  throw error;
} finally {
  for (const context of contexts) { await context.unrouteAll({ behavior: 'wait' }); await context.close(); }
  if (browser) await browser.close();
  for (const server of [api, web]) if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
  await disconnectDB(); await mongo.stop();
}
