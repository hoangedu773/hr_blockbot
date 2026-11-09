import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { chromium } from './helpers/browser-deps.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const requireApi = createRequire(path.join(root, 'apps/api/package.json'));
const { MongoMemoryServer } = requireApi('mongodb-memory-server');
const mongo = await MongoMemoryServer.create();
process.env.NODE_ENV = 'test';
process.env.TEST_MONGODB_URI = mongo.getUri('test_lifecycle_role_flow_browser');
process.env.JWT_SECRET = 'owned-lifecycle-role-flow-browser-secret-min32';
delete process.env.ATLAS_URI;
delete process.env.MONGODB_DB_NAME;

await import('../../api/test/require-isolated-db.mjs');
const { connectDB, disconnectDB } = await import('../../api/dist/db.js');
const { createApp } = await import('../../api/dist/app.js');
const { authorizationV1Fixture, testGrant, SELF_CAPS, MANAGEMENT_CAPS } = await import('../../api/test/helpers/authorization-v1-fixture.mjs');
const { EmployeeModel } = await import('../../api/dist/models/Employee.js');
const { UserModel } = await import('../../api/dist/models/User.js');
const { ManagementRelationModel } = await import('../../api/dist/models/AuthorizationMapping.js');
const { EmployeeLifecycleRequestModel } = await import('../../api/dist/models/EmployeeLifecycleRequest.js');
const { StaffingRequestModel } = await import('../../api/dist/models/StaffingRequest.js');

let api, web, browser, fixture, origin, apiOrigin;
const contexts = [], errors = [];
const localDate = (date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

async function login(name, password = fixture.password) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  contexts.push(context);
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/api/')) {
      const response = await route.fetch({ url: apiOrigin + url.pathname + url.search });
      return route.fulfill({ response });
    }
    if (url.origin === origin) return route.continue();
    return route.fulfill({ status: 200, body: '' });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(origin, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Get Started', exact: true }).click();
  await page.getByLabel('Tên đăng nhập', { exact: true }).fill(name.startsWith('v1-') ? name : 'v1-' + name);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.locator('.crm-sidebar').waitFor();
  return { page };
}

try {
  await connectDB();
  fixture = await authorizationV1Fixture();
  await Promise.all([EmployeeLifecycleRequestModel.init(), StaffingRequestModel.init()]);
  for (const actor of ['hr', 'hr2']) {
    await UserModel.updateOne({ _id: fixture.actors[actor].user._id }, { $push: { 'authorization.grants.1.scope.storeIds': String(fixture.stores[1]._id) } });
  }
  await UserModel.updateOne({ _id: fixture.actors.sm.user._id }, { $addToSet: { 'authorization.grants.1.capabilities': 'employees.lifecycle_request' } });
  await UserModel.updateOne({ _id: fixture.actors.am.user._id }, {
    $addToSet: {
      'authorization.grants.1.capabilities': { $each: ['employees.lifecycle_request', 'employees.transfer'] },
      'authorization.grants.1.scope.storeIds': String(fixture.stores[1]._id),
    },
  });
  const smBEmployee = await EmployeeModel.create({
    employeeCode: 'FLOW-SM-B', fullName: 'Cửa hàng trưởng Chi nhánh B', status: 'active',
    storeId: fixture.stores[1]._id, storeMappingRef: 'fixture-store-b', departmentId: fixture.departmentId, level: 'Junior',
  });
  const smBUser = await UserModel.create({
    username: 'v1-smb', passwordHash: fixture.actors.sm.user.passwordHash, role: 'Employee', employeeId: smBEmployee._id,
    authorization: {
      schemaVersion: 1, profile: 'sm',
      grants: [
        testGrant('sm', { kind: 'self' }, SELF_CAPS, fixture.actors.om.user._id),
        testGrant('sm', { kind: 'organization', storeIds: [String(fixture.stores[1]._id)] }, [...MANAGEMENT_CAPS, 'employees.lifecycle_request', 'onboarding.propose'], fixture.actors.om.user._id),
      ],
    },
  });
  smBEmployee.userId = smBUser._id;
  await smBEmployee.save();
  await ManagementRelationModel.create({
    managerEmployeeId: smBEmployee._id, employeeId: fixture.actors.staffB.employee._id, storeId: fixture.stores[1]._id,
    approvalRef: 'fixture-smb-relation', validFrom: new Date(Date.now() - 60000), version: 1,
  });

  const dist = path.join(root, 'apps/web/dist');
  web = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const file = path.resolve(dist, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(dist + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
    res.setHeader('Content-Type', { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((resolve) => web.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${web.address().port}`;
  process.env.FRONTEND_URL = origin;
  api = http.createServer(createApp());
  await new Promise((resolve) => api.listen(0, '127.0.0.1', resolve));
  apiOrigin = `http://127.0.0.1:${api.address().port}`;
  browser = await chromium.launch({ headless: true });

  const smA = await login('sm');
  const smB = await login('smb');
  const am = await login('am');
  const hr = await login('hr');

  // 1. SM B opens lifecycle view, sees SM role badge & submits staffing request to AM
  await smB.page.locator('nav [data-section="lifecycle"]').click();
  await smB.page.getByText('Giao diện Cửa hàng trưởng (SM)', { exact: true }).waitFor();
  await smB.page.getByRole('button', { name: 'Xin bổ sung nhân sự (gửi AM)', exact: true }).click();
  const staffDialog = smB.page.getByRole('dialog', { name: 'Xin bổ sung nhân sự gửi AM', exact: true });
  await staffDialog.getByLabel('Số lượng nhân viên cần', { exact: true }).fill('1');
  await staffDialog.getByLabel('Vị trí cần', { exact: true }).fill('Pha chế');
  await staffDialog.getByLabel('Ngày giờ cần nhân sự', { exact: true }).fill(localDate(new Date(Date.now() + 3600000)));
  await staffDialog.getByLabel('Lý do đề xuất bổ sung', { exact: true }).fill('Thiếu 1 pha chế ca tối tại cửa hàng B');
  await staffDialog.getByRole('button', { name: 'Gửi AM điều phối', exact: true }).click();
  await staffDialog.waitFor({ state: 'hidden' });

  // 2. AM opens lifecycle view, sees AM role badge + SM's staffing request, clicks "Lập điều chuyển đáp ứng"
  await am.page.locator('nav [data-section="lifecycle"]').click();
  await am.page.getByText('Giao diện Quản lý khu vực (AM)', { exact: true }).waitFor();
  await am.page.getByRole('button', { name: 'Lập điều chuyển đáp ứng (0/1)', exact: true }).click();
  const transferDialog = am.page.getByRole('dialog', { name: 'Lập yêu cầu nhân sự', exact: true });
  await transferDialog.getByLabel('Nhân viên', { exact: true }).selectOption(String(fixture.actors.ptch.employee._id));
  await transferDialog.getByLabel('Ngày giờ hiệu lực', { exact: true }).fill(localDate(new Date(Date.now() - 60000)));
  await transferDialog.getByRole('button', { name: 'Gửi HR độc lập duyệt', exact: true }).click();
  await transferDialog.waitFor({ state: 'hidden' });

  // 3. HR opens lifecycle view, sees HR role badge, approves the transfer
  await hr.page.locator('nav [data-section="lifecycle"]').click();
  await hr.page.getByText('Giao diện Nhân sự (HR)', { exact: true }).waitFor();
  await hr.page.locator('article.crm-report-card').filter({ hasText: String(fixture.actors.ptch.employee._id) }).getByRole('button', { name: 'Đối chiếu và xử lý', exact: true }).click();
  const hrReview = hr.page.getByRole('dialog', { name: 'Đối chiếu workflow nhân sự', exact: true });
  await hrReview.getByLabel('Lý do quyết định', { exact: true }).fill('HR duyệt điều chuyển từ cửa hàng A sang B');
  await hrReview.getByRole('button', { name: 'HR phê duyệt', exact: true }).click();
  await hrReview.waitFor({ state: 'hidden' });

  // 4. Both store managers (SM A and SM B) confirm -> transfer automatically completes & staffing request becomes FULFILLED
  for (const [manager, store] of [[smA, fixture.stores[0]], [smB, fixture.stores[1]]]) {
    await manager.page.locator('nav [data-section="lifecycle"]').click();
    await manager.page.getByRole('button', { name: 'Làm mới workflow', exact: true }).click();
    await manager.page.locator('article.crm-report-card').filter({ hasText: String(fixture.actors.ptch.employee._id) }).getByRole('button', { name: 'Đối chiếu và xử lý', exact: true }).click();
    const confirmDialog = manager.page.getByRole('dialog', { name: 'Đối chiếu workflow nhân sự', exact: true });
    await confirmDialog.getByLabel('Lý do quyết định', { exact: true }).fill('SM đồng ý điều chuyển nhân sự');
    await confirmDialog.getByRole('button', { name: 'Quản lý xác nhận ' + store.store_name, exact: true }).click();
    await confirmDialog.waitFor({ state: 'hidden' });
  }

  assert.equal(String((await EmployeeModel.findById(fixture.actors.ptch.employee._id)).storeId), String(fixture.stores[1]._id));
  assert.equal((await EmployeeLifecycleRequestModel.findOne({ employeeId: fixture.actors.ptch.employee._id, kind: 'TRANSFER' })).status, 'COMPLETED');
  assert.equal((await StaffingRequestModel.findOne({ storeId: fixture.stores[1]._id })).status, 'FULFILLED');

  // 5. Chatbot Natural Language E2E: SM B requests staffing in Chat -> AM views in Chat
  await smB.page.locator('.crm-copilot').click();
  await smB.page.getByRole('button', { name: 'Xin bổ sung nhân sự', exact: true }).click();
  const chatInputSmB = smB.page.getByLabel('Tin nhắn cho Guta AI', { exact: true });
  await chatInputSmB.fill('2');
  await chatInputSmB.press('Enter');
  await smB.page.getByText('Vị trí / chức danh cần bổ sung').waitFor();
  await chatInputSmB.fill('Thu ngân');
  await chatInputSmB.press('Enter');
  await smB.page.getByText('Ngày giờ cần nhân sự có mặt').waitFor();
  await chatInputSmB.fill('ngày mai');
  await chatInputSmB.press('Enter');
  await smB.page.getByText('Lý do bạn đề xuất xin bổ sung').waitFor();
  await chatInputSmB.fill('Bổ sung ca sáng cuối tuần qua Chatbot');
  await chatInputSmB.press('Enter');
  await smB.page.getByText('Xem trước yêu cầu bổ sung nhân sự').waitFor();
  await chatInputSmB.fill('xác nhận');
  await chatInputSmB.press('Enter');
  await smB.page.getByText('Đã gửi yêu cầu bổ sung 2 nhân sự cho AM khu vực thành công').waitFor();

  // AM views SM staffing request via natural language in Chat
  await am.page.locator('.crm-copilot').click();
  await am.page.getByRole('button', { name: 'Xem yêu cầu bổ sung nhân sự từ SM', exact: true }).click();
  await am.page.getByText('Bổ sung ca sáng cuối tuần qua Chatbot').waitFor();

  assert.equal(errors.length, 0, 'Page errors: ' + errors.join('; '));
  console.log('PASS browser E2E: CRM & Chatbot natural language flow for SM -> AM -> HR -> 2 SMs confirm');
} finally {
  await Promise.all(contexts.map((c) => c.close().catch(() => {})));
  await browser?.close().catch(() => {});
  api?.closeAllConnections?.(); web?.closeAllConnections?.();
  await disconnectDB().catch(() => {});
  await mongo.stop().catch(() => {});
}
