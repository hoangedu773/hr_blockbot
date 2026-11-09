// Browser -> real API -> exclusively owned memory Mongo. No Atlas/provider or real account.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
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
process.env.NODE_ENV = 'test'; process.env.TEST_MONGODB_URI = mongo.getUri('test_authorization_v1_browser'); process.env.JWT_SECRET = 'isolated-v1-browser-secret-minimum-32-characters';
delete process.env.ATLAS_URI; delete process.env.MONGODB_DB_NAME;
await import('../../api/test/require-isolated-db.mjs');
const { connectDB, disconnectDB } = await import('../../api/dist/db.js');
const { createApp } = await import('../../api/dist/app.js');
const { authorizationV1Fixture, testGrant, SELF_CAPS, MANAGEMENT_CAPS } = await import('../../api/test/helpers/authorization-v1-fixture.mjs');
const { ManagementRelationModel } = await import('../../api/dist/models/AuthorizationMapping.js');
const { signAccessToken } = await import('../../api/dist/services/auth.service.js');
const { UserModel } = await import('../../api/dist/models/User.js');
const { EmployeeModel } = await import('../../api/dist/models/Employee.js');
const { OnboardingRequestModel } = await import('../../api/dist/models/OnboardingRequest.js');
const { AuthorizationDelegationModel } = await import('../../api/dist/models/AuthorizationDelegation.js');
const { EmployeeLifecycleRequestModel } = await import('../../api/dist/models/EmployeeLifecycleRequest.js');
const dist = path.join(root, 'apps/web/dist'), output = path.join(root, 'test-results');
fs.mkdirSync(output, { recursive: true });
let api, web, browser, origin, apiOrigin, fixture;
const contexts = [], errors = [], invitations = new Map(), recoveryInvitations = new Map();
async function login(profile, password) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); contexts.push(context);
  let token = '';
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/api/')) {
      token = route.request().headers().authorization?.replace(/^Bearer /, '') || token;
      return route.fulfill({ response: await route.fetch({ url: apiOrigin + url.pathname + url.search }) });
    }
    if (url.origin === origin) return route.continue();
    return route.fulfill({ status: 200, body: '' });
  });
  const page = await context.newPage(); page.setDefaultTimeout(15000); page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(origin, { waitUntil: 'networkidle' }); await page.getByRole('button', { name: 'Get Started', exact: true }).click();
  await page.getByLabel('Tên đăng nhập', { exact: true }).fill((profile.startsWith('browser-') || profile.startsWith('gt-ch')) ? profile : `v1-${profile}`);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password || ((profile.startsWith('browser-') || profile.startsWith('gt-ch')) ? 'BrowserRecipient@2026' : fixture.password));
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  // The integrated shell opens CRM directly for every authorized profile.
  await page.locator('.crm-sidebar').waitFor();
  return { page, token: () => token };
}
try {
  await connectDB(); fixture = await authorizationV1Fixture();
  for (const profile of ['hr', 'hr2']) await UserModel.updateOne({ _id: fixture.actors[profile].user._id }, { $push: { 'authorization.grants.1.scope.storeIds': String(fixture.stores[1]._id) } });
  // Pre-approved canonical destination management mapping, not a new authority
  // inferred from a job title. This fixture is private to the owned database.
  const destinationEmployee = await EmployeeModel.create({ employeeCode: 'BROWSER-SM-B', fullName: 'Isolated destination manager', status: 'active', level: 'Junior', storeId: fixture.stores[1]._id, storeMappingRef: 'reviewed-browser-mapping', departmentId: fixture.departmentId });
  const destinationUser = await UserModel.create({ username: 'v1-smb', passwordHash: fixture.actors.sm.user.passwordHash, role: 'Employee', employeeId: destinationEmployee._id, authorization: { schemaVersion: 1, profile: 'sm', grants: [testGrant('sm', { kind: 'self' }, SELF_CAPS, fixture.actors.om.user._id), testGrant('sm', { kind: 'organization', storeIds: [String(fixture.stores[1]._id)] }, MANAGEMENT_CAPS, fixture.actors.om.user._id)] } });
  await EmployeeModel.updateOne({ _id: destinationEmployee._id }, { $set: { userId: destinationUser._id } });
  await ManagementRelationModel.create({ managerEmployeeId: destinationEmployee._id, employeeId: fixture.actors.staffB.employee._id, storeId: fixture.stores[1]._id, approvalRef: 'reviewed-browser-mapping', validFrom: new Date(Date.now() - 60000), validUntil: null, version: 1 });
  // Technical authority must not depend on the retired Admin/Employee label.
  await UserModel.updateOne({ _id: fixture.actors.system_admin.user._id }, { $set: { role: 'Employee' } });
  web = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost'), file = path.resolve(dist, '.' + (url.pathname === '/' ? '/index.html' : url.pathname));
    if (!file.startsWith(dist + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
    res.setHeader('Content-Type', { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' }[path.extname(file)] || 'application/octet-stream'); fs.createReadStream(file).pipe(res);
  });
  await new Promise((resolve) => web.listen(0, '127.0.0.1', resolve)); origin = `http://127.0.0.1:${web.address().port}`; process.env.FRONTEND_URL = origin;
  const otpMessages = [];
  api = http.createServer(createApp({ accountMail: async message => { otpMessages.push(message); }, onboarding: { deliverActivation: async (invitation) => { invitations.set(invitation.requestId, invitation.token); } }, recovery: { deliverRecovery: async (invitation) => { recoveryInvitations.set(invitation.userId, invitation.token); } } }));
  await new Promise((resolve) => api.listen(0, '127.0.0.1', resolve)); apiOrigin = `http://127.0.0.1:${api.address().port}`;
  browser = await chromium.launch({ headless: true });
  let sm;
  for (const profile of ['system_admin', 'hr', 'om', 'aom', 'sam', 'am', 'sm', 'ptch', 'staff']) {
    const current = await login(profile), page = current.page;
    const visible = async (view) => page.locator(`nav [data-section="${view}"]`).isVisible();
    assert.equal(await page.getByRole('button', { name: 'Tạo Ca Đột Xuất', exact: true }).count(), 0, profile + ' dormant scheduling is not advertised');
    assert.equal(await visible('accounts'), profile === 'system_admin', profile + ' account boundary');
    assert.equal(await visible('settings'), profile === 'system_admin', profile + ' provider boundary');
    if (profile === 'system_admin') {
      await page.locator('nav [data-section="settings"]').click();
      await page.getByRole('heading', { name: 'Cấu Hình LLM Provider', exact: true }).waitFor();
      assert.equal(await page.getByText('403 — RBAC_DENIED', { exact: true }).count(), 0, 'Capability works even when the retired role label is Employee');
    }
    assert.equal(await visible('onboarding'), ['hr', 'sm'].includes(profile), profile + ' onboarding boundary');
    assert.equal(await visible('employees'), ['hr', 'om', 'sam', 'am', 'sm'].includes(profile), profile + ' HR/operational boundary');
    assert.equal(await page.locator('nav [data-section="authorization"]').count(), 0, profile + ' account permission screen is removed');
    assert.equal(await page.locator('nav [data-section="directory"]').count(), 0, profile + ' redundant work directory screen is removed');
    assert.equal(await page.getByRole('region', { name: 'Thông tin cấp quyền', exact: true }).count(), 0, profile + ' no permission panel is rendered');
    if (profile !== 'system_admin') {
      await page.locator('nav [data-section="projects"]').click();
      await page.getByRole('heading', { name: 'Công việc & nghiệm thu', exact: true }).waitFor();
      await page.locator('section[aria-label="Công việc và nghiệm thu"][aria-busy="false"]').waitFor();
      assert.equal(await page.getByRole('button', { name: 'Tạo công việc', exact: true }).count(), ['om', 'sam', 'am', 'sm'].includes(profile) ? 1 : 0, profile + ' task creation');
    }
    if (profile === 'staff') {
      assert.equal(await visible('stores'), false);
    }
    if (profile === 'sm') {
      const status = await page.evaluate(async ({ base, token, id }) => (await fetch(base + '/api/employees/' + id, { headers: { Authorization: 'Bearer ' + token } })).status, { base: apiOrigin, token: current.token(), id: String(fixture.actors.staffB.employee._id) }); assert.equal(status, 404);
      sm = current;
    }
    console.log(`PASS browser/database V1 profile ${profile}: capability menus and operational separation`);
  }
  const page = sm.page;
  await page.locator('nav [data-section="onboarding"]').click(); await page.getByRole('button', { name: 'Tạo đề nghị nhân viên', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Đề nghị tiếp nhận nhân viên', exact: true });
  await dialog.getByLabel('Cửa hàng', { exact: true }).selectOption(String(fixture.stores[0]._id));
  assert.equal(await dialog.getByLabel('Mã nhân viên', { exact: true }).isEditable(), false); await dialog.getByLabel('Họ tên', { exact: true }).fill('Isolated browser onboarding');
  await dialog.getByLabel('Thông tin điện thoại', { exact: true }).fill('isolated-contact'); await dialog.getByLabel('Email nhận link kích hoạt', { exact: true }).fill('new-employee@example.com'); await dialog.getByLabel('Ngày vào làm', { exact: true }).fill('2026-10-31');
  await dialog.getByLabel('Lý do đề nghị', { exact: true }).fill('Owned browser workflow test'); await dialog.getByRole('button', { name: 'Lưu đề nghị', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  const autoCreated = await OnboardingRequestModel.findOne({ 'payload.fullName': 'Isolated browser onboarding' }).lean();
  const onboardingCode = autoCreated.payload.employeeCode; assert.match(onboardingCode, /^GT-CH2610\d{4}$/);
  assert.equal(autoCreated.payload.email, 'new-employee@example.com');
  await page.getByRole('heading', { name: `Isolated browser onboarding · ${onboardingCode}`, exact: true }).waitFor();
  assert.equal(await UserModel.countDocuments({ username: onboardingCode.toLowerCase() }), 0);
  const hr = await login('hr'); await hr.page.locator('nav [data-section="onboarding"]').click();
  const card = hr.page.locator('article').filter({ has: hr.page.getByRole('heading', { name: `Isolated browser onboarding · ${onboardingCode}`, exact: true }) });
  await card.getByRole('button', { name: 'Đối chiếu và lịch sử', exact: true }).click();
  const review = hr.page.getByRole('dialog', { name: 'Đối chiếu đề nghị tiếp nhận', exact: true });
  await review.getByLabel('Lý do quyết định', { exact: true }).fill('Verify corrected contact before approval'); await review.getByRole('button', { name: 'Từ chối đề nghị', exact: true }).click(); await review.waitFor({ state: 'hidden' });
  const originalRequest = await OnboardingRequestModel.findOne({ employeeKey: onboardingCode.toLowerCase() }).lean();
  await page.getByRole('button', { name: 'Làm mới yêu cầu', exact: true }).click(); await page.getByRole('button', { name: 'Chỉnh sửa và gửi lại', exact: true }).click();
  assert.equal(await dialog.getByLabel('Mã nhân viên', { exact: true }).isEditable(), false); assert.equal(await dialog.getByLabel('Cửa hàng', { exact: true }).isDisabled(), true);
  await dialog.getByLabel('Thông tin điện thoại', { exact: true }).fill('corrected-browser-contact'); await dialog.getByLabel('Lý do đề nghị', { exact: true }).fill('Verified correction on the original identity');
  await dialog.getByRole('button', { name: 'Gửi lại đề nghị đã chỉnh sửa', exact: true }).click(); await dialog.waitFor({ state: 'hidden' });
  const amended = await OnboardingRequestModel.findById(originalRequest._id).lean(); assert.equal(String(amended.userId), String(originalRequest.userId)); assert.equal(String(amended.employeeId), String(originalRequest.employeeId)); assert.equal(amended.history[1].type, 'HR_REJECTED'); assert.equal(amended.history[2].type, 'AMENDED_AND_RESUBMITTED');
  await hr.page.getByRole('button', { name: 'Làm mới yêu cầu', exact: true }).click(); await card.getByRole('button', { name: 'Đối chiếu và lịch sử', exact: true }).click();
  await review.getByText('corrected-browser-contact', { exact: true }).waitFor();
  await review.getByLabel('Lý do quyết định', { exact: true }).fill('Independent HR verified canonical identity/store'); await review.getByRole('button', { name: 'Phê duyệt tiếp nhận', exact: true }).click();
  await card.getByText(/Chờ nhân viên kích hoạt/).waitFor();
  const request = await OnboardingRequestModel.findOne({ employeeKey: onboardingCode.toLowerCase() }).lean();
  assert.equal(await UserModel.countDocuments({ username: onboardingCode.toLowerCase(), status: 'pending_activation' }), 1);
  const activation = await browser.newPage(); contexts.push(activation.context());
  await activation.route('**/api/**', async (route) => { const url = new URL(route.request().url()); return route.fulfill({ response: await route.fetch({ url: apiOrigin + url.pathname }) }); });
  await activation.goto(origin + '#activate=' + invitations.get(String(request._id)));
  await activation.getByLabel('Mật khẩu mới', { exact: true }).fill('BrowserRecipient@2026'); await activation.getByLabel('Nhập lại mật khẩu', { exact: true }).fill('BrowserRecipient@2026');
  assert.equal(new URL(activation.url()).hash, '');
  await activation.getByRole('button', { name: 'Thiết lập mật khẩu', exact: true }).click(); await activation.getByText('Đã thiết lập mật khẩu. Bạn có thể đăng nhập bằng mã nhân viên.').waitFor();
  assert.equal((await UserModel.findById(request.userId)).status, 'active'); assert.equal((await EmployeeModel.findById(request.employeeId)).status, 'active');
  assert.ok((await UserModel.findById(request.userId)).emailVerifiedAt);
  await ManagementRelationModel.create({ managerEmployeeId: fixture.actors.sm.employee._id, employeeId: request.employeeId, storeId: fixture.stores[0]._id, approvalRef: 'reviewed-browser-subject-mapping', validFrom: new Date(Date.now() - 60000), validUntil: null, version: 1 });
  const newEmployee = await login(onboardingCode.toLowerCase());
  await newEmployee.page.locator('nav [data-section="profile"]').click();
  await newEmployee.page.getByRole('button', { name: 'Đổi mật khẩu', exact: true }).click();
  const passwordDialog = newEmployee.page.getByRole('dialog', { name: 'Đổi mật khẩu', exact: true });
  await passwordDialog.getByLabel('Mật khẩu hiện tại').fill('BrowserRecipient@2026');
  await passwordDialog.getByRole('button', { name: 'Gửi mã qua email' }).click();
  await passwordDialog.getByRole('status').getByText(/n\*\*\*@example\.com/).waitFor();
  assert.equal(otpMessages[0].to, 'new-employee@example.com');
  await passwordDialog.getByLabel('Mã xác nhận').fill(otpMessages[0].body.match(/\b\d{6}\b/)[0]);
  await passwordDialog.getByLabel('Mật khẩu mới (tối thiểu 12 ký tự)', { exact: true }).fill('BrowserChanged@2026');
  await passwordDialog.getByLabel('Nhập lại mật khẩu mới', { exact: true }).fill('BrowserChanged@2026');
  await passwordDialog.getByRole('button', { name: 'Xác nhận và đổi mật khẩu' }).click();
  await newEmployee.page.getByText('Đã đổi mật khẩu. Hãy đăng nhập lại bằng mật khẩu mới.').waitFor();
  assert.equal((await UserModel.findById(request.userId)).securityVersion, 2);
  await page.screenshot({ path: path.join(output, 'authorization-v1-onboarding-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: path.join(output, 'authorization-v1-onboarding-mobile.png'), fullPage: true });
  assert.deepEqual(errors, []);
  console.log('PASS browser/database V1 onboarding: SM submit -> independent HR review -> exactly one pending staff -> safe activation -> same login; no real delivery');

  // Actual forms and independent sessions, not mocked authorization summaries.
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('nav [data-section="delegations"]').click();
  await page.getByRole('button', { name: 'Đề nghị ủy quyền', exact: true }).click();
  const delegationForm = page.getByRole('dialog', { name: 'Đề nghị ủy quyền có thời hạn', exact: true });
  await delegationForm.getByRole('combobox', { name: /^Cửa hàng/ }).selectOption(String(fixture.stores[0]._id));
  await delegationForm.getByRole('combobox', { name: /^Người nhận đủ điều kiện/ }).selectOption(String(fixture.actors.ptch.user._id));
  for (const capability of ['projects.create', 'projects.assign', 'reports.review']) await delegationForm.getByLabel(capability, { exact: true }).check();
  const localDate = (date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  await delegationForm.getByLabel('Hết hạn (không quá 14 ngày)', { exact: true }).fill(localDate(new Date(Date.now() + 86400000)));
  await delegationForm.getByLabel('Lý do', { exact: true }).fill('Owned browser bounded delegation');
  await delegationForm.getByRole('button', { name: 'Gửi đề nghị ủy quyền', exact: true }).click();
  await delegationForm.waitFor({ state: 'hidden' });
  const delegation = await AuthorizationDelegationModel.findOne({ delegatorUserId: fixture.actors.sm.user._id }).lean();
  assert.equal(delegation.status, 'PENDING');
  const am = await login('am'); await am.page.locator('nav [data-section="delegations"]').click();
  await am.page.getByRole('button', { name: 'Chi tiết và xử lý', exact: true }).click();
  const delegationReview = am.page.getByRole('dialog', { name: 'Chi tiết và lịch sử ủy quyền', exact: true });
  await delegationReview.getByLabel('Lý do quyết định', { exact: true }).fill('Independent direct AM approves limited delegation');
  await delegationReview.getByRole('button', { name: 'Duyệt ủy quyền', exact: true }).click();
  await delegationReview.waitFor({ state: 'hidden' });
  assert.equal((await AuthorizationDelegationModel.findById(delegation._id)).status, 'APPROVED');
  const delegated = await login('ptch'); await delegated.page.locator('nav [data-section="projects"]').click();
  await delegated.page.getByRole('button', { name: 'Tạo công việc', exact: true }).waitFor();
  await delegated.page.screenshot({ path: path.join(output, 'authorization-v1-delegation-desktop.png'), fullPage: true });
  await page.getByRole('button', { name: 'Làm mới ủy quyền', exact: true }).click();
  await page.getByRole('button', { name: 'Chi tiết và xử lý', exact: true }).click();
  const revokeDelegation = page.getByRole('dialog', { name: 'Chi tiết và lịch sử ủy quyền', exact: true });
  await revokeDelegation.getByLabel('Lý do quyết định', { exact: true }).fill('Source revocation after browser verification');
  await revokeDelegation.getByRole('button', { name: 'Thu hồi ủy quyền', exact: true }).click();
  await revokeDelegation.waitFor({ state: 'hidden' });
  const revokedRecipient = await login('ptch'); await revokedRecipient.page.locator('nav [data-section="projects"]').click();
  await revokedRecipient.page.locator('section[aria-label="Công việc và nghiệm thu"][aria-busy="false"]').waitFor();
  assert.equal(await revokedRecipient.page.getByRole('button', { name: 'Tạo công việc', exact: true }).count(), 0);
  await revokedRecipient.page.locator('nav [data-section="delegations"]').click();
  await revokedRecipient.page.getByRole('button', { name: 'Chi tiết và xử lý', exact: true }).click();
  await revokedRecipient.page.getByRole('dialog').getByText(/REVOKED/).waitFor();
  console.log('PASS browser/database V1 delegation: scoped SM request -> direct independent AM approval -> PTCH management action -> source revoke removes action');

  await hr.page.locator('nav [data-section="lifecycle"]').click();
  await hr.page.getByRole('button', { name: 'Lập yêu cầu nhân sự', exact: true }).click();
  const lifecycleForm = hr.page.getByRole('dialog', { name: 'Lập yêu cầu nhân sự', exact: true });
  await lifecycleForm.getByLabel('Nhân viên', { exact: true }).selectOption(String(request.employeeId));
  await lifecycleForm.getByLabel('Ngày giờ hiệu lực', { exact: true }).fill(localDate(new Date(Date.now() - 60000)));
  await lifecycleForm.getByLabel('Lý do yêu cầu', { exact: true }).fill('Owned browser HR lifecycle request');
  await lifecycleForm.getByRole('button', { name: 'Gửi HR độc lập duyệt', exact: true }).click();
  await lifecycleForm.waitFor({ state: 'hidden' });
  assert.equal((await EmployeeModel.findById(request.employeeId)).status, 'active');
  const hr2 = await login('hr2'); await hr2.page.locator('nav [data-section="lifecycle"]').click();
  await hr2.page.getByRole('button', { name: 'Đối chiếu và xử lý', exact: true }).click();
  const lifecycleReview = hr2.page.getByRole('dialog', { name: 'Đối chiếu workflow nhân sự', exact: true });
  await lifecycleReview.getByLabel('Lý do quyết định', { exact: true }).fill('Different HR independently verifies exit');
  await lifecycleReview.getByRole('button', { name: 'HR phê duyệt', exact: true }).click();
  await lifecycleReview.waitFor({ state: 'hidden' });
  assert.equal((await EmployeeLifecycleRequestModel.findOne({ employeeId: request.employeeId })).status, 'COMPLETED');
  assert.equal((await EmployeeModel.findById(request.employeeId)).status, 'inactive');
  assert.equal((await UserModel.findById(request.userId)).status, 'disabled');
  await hr2.page.screenshot({ path: path.join(output, 'authorization-v1-lifecycle-desktop.png'), fullPage: true });
  console.log('PASS browser/database V1 lifecycle: HR request leaves active -> independent HR approval -> inactive employee and disabled account with persisted history');

  // Reactivation uses actual HR forms and recipient one-time setup. No technical
  // status toggle can bypass the inactive employment state.
  await hr.page.getByRole('button', { name: 'Làm mới workflow', exact: true }).click();
  await hr.page.getByRole('button', { name: 'Lập yêu cầu nhân sự', exact: true }).click();
  await lifecycleForm.getByLabel('Nghiệp vụ', { exact: true }).selectOption('REACTIVATE');
  await lifecycleForm.getByLabel('Nhân viên', { exact: true }).selectOption(String(request.employeeId));
  await lifecycleForm.getByLabel('Ngày giờ hiệu lực', { exact: true }).fill(localDate(new Date(Date.now() - 60000)));
  await lifecycleForm.getByLabel('Lý do yêu cầu', { exact: true }).fill('Independent reactivation review requested');
  await lifecycleForm.getByRole('button', { name: 'Gửi HR độc lập duyệt', exact: true }).click(); await lifecycleForm.waitFor({ state: 'hidden' });
  await hr2.page.getByRole('button', { name: 'Làm mới workflow', exact: true }).click();
  const lifecycleCard = (session, kind) => session.page.locator('article.crm-report-card').filter({ has: session.page.getByRole('heading', { name: kind + ' · ' + request.employeeId, exact: true }) });
  await lifecycleCard(hr2, 'Tái kích hoạt').getByRole('button', { name: 'Đối chiếu và xử lý', exact: true }).click();
  await lifecycleReview.getByLabel('Lý do quyết định', { exact: true }).fill('Independent reactivation approval');
  await lifecycleReview.getByRole('button', { name: 'HR phê duyệt', exact: true }).click(); await lifecycleReview.waitFor({ state: 'hidden' });
  const reactivation = await EmployeeLifecycleRequestModel.findOne({ employeeId: request.employeeId, kind: 'REACTIVATE' }).lean(); assert.equal(reactivation.status, 'PENDING_ACTIVATION');
  assert.equal((await UserModel.findById(request.userId)).status, 'disabled');
  const setupPassword = async (fragment, password) => {
    const setup = await browser.newPage(); contexts.push(setup.context());
    await setup.route('**/api/**', async (route) => { const url = new URL(route.request().url()); return route.fulfill({ response: await route.fetch({ url: apiOrigin + url.pathname }) }); });
    await setup.goto(origin + fragment); await setup.getByLabel('Mật khẩu mới', { exact: true }).fill(password); await setup.getByLabel('Nhập lại mật khẩu', { exact: true }).fill(password);
    assert.equal(new URL(setup.url()).hash, ''); await setup.getByRole('button', { name: 'Thiết lập mật khẩu', exact: true }).click(); await setup.getByText('Đã thiết lập mật khẩu. Bạn có thể đăng nhập bằng mã nhân viên.').waitFor();
  };
  await setupPassword('#reactivate=' + invitations.get(String(reactivation._id)), 'BrowserReactivated@2026');
  await login(onboardingCode.toLowerCase(), 'BrowserReactivated@2026');
  assert.equal((await EmployeeLifecycleRequestModel.findById(reactivation._id)).status, 'COMPLETED');
  console.log('PASS browser/database reactivation: independent HR -> disabled until new-password consent -> same identity/login, no restored managerial grants');

  await hr.page.getByRole('button', { name: 'Làm mới workflow', exact: true }).click();
  await hr.page.getByRole('button', { name: 'Lập yêu cầu nhân sự', exact: true }).click();
  await lifecycleForm.getByLabel('Nghiệp vụ', { exact: true }).selectOption('TRANSFER');
  await lifecycleForm.getByLabel('Nhân viên', { exact: true }).selectOption(String(request.employeeId));
  await lifecycleForm.getByLabel('Cửa hàng đích', { exact: true }).selectOption(String(fixture.stores[1]._id));
  await lifecycleForm.getByLabel('Ngày giờ hiệu lực', { exact: true }).fill(localDate(new Date(Date.now() - 60000)));
  await lifecycleForm.getByLabel('Lý do yêu cầu', { exact: true }).fill('Reviewed transfer between canonical stores');
  await lifecycleForm.getByRole('button', { name: 'Gửi HR độc lập duyệt', exact: true }).click(); await lifecycleForm.waitFor({ state: 'hidden' });
  await hr2.page.getByRole('button', { name: 'Làm mới workflow', exact: true }).click();
  await lifecycleCard(hr2, 'Điều chuyển cửa hàng').getByRole('button', { name: 'Đối chiếu và xử lý', exact: true }).click();
  await lifecycleReview.getByLabel('Lý do quyết định', { exact: true }).fill('Independent HR approves both scoped stores'); await lifecycleReview.getByRole('button', { name: 'HR phê duyệt', exact: true }).click(); await lifecycleReview.waitFor({ state: 'hidden' });
  assert.equal(String((await EmployeeModel.findById(request.employeeId)).storeId), String(fixture.stores[0]._id));
  const destination = await login('smb');
  for (const [manager, store] of [[sm, fixture.stores[0]], [destination, fixture.stores[1]]]) {
    await manager.page.locator('nav [data-section="lifecycle"]').click(); await lifecycleCard(manager, 'Điều chuyển cửa hàng').getByRole('button', { name: 'Đối chiếu và xử lý', exact: true }).click();
    const confirm = manager.page.getByRole('dialog', { name: 'Đối chiếu workflow nhân sự', exact: true }); await confirm.getByLabel('Lý do quyết định', { exact: true }).fill('Manager independently confirms handover readiness');
    await confirm.getByRole('button', { name: 'Quản lý xác nhận ' + store.store_name, exact: true }).click(); await confirm.waitFor({ state: 'hidden' });
  }
  await hr2.page.getByRole('button', { name: 'Làm mới workflow', exact: true }).click(); await lifecycleCard(hr2, 'Điều chuyển cửa hàng').getByRole('button', { name: 'Đối chiếu và xử lý', exact: true }).click();
  await lifecycleReview.getByRole('button', { name: 'Kiểm tra điều kiện và tiếp tục xử lý', exact: true }).click(); await lifecycleReview.waitFor({ state: 'hidden' });
  assert.equal(String((await EmployeeModel.findById(request.employeeId)).storeId), String(fixture.stores[1]._id));
  assert.equal((await EmployeeLifecycleRequestModel.findOne({ employeeId: request.employeeId, kind: 'TRANSFER' })).status, 'COMPLETED');
  const transferred = await login(onboardingCode.toLowerCase(), 'BrowserReactivated@2026');
  const transferredDir = await transferred.page.evaluate(async ({ base, token }) => (await fetch(base + '/api/directory', { headers: { Authorization: 'Bearer ' + token } })).json(), { base: apiOrigin, token: transferred.token() });
  assert.ok(transferredDir.items.some((item) => item.fullName === 'Isolated V1 staffB'));
  assert.equal(transferredDir.items.some((item) => item.fullName === 'Isolated V1 staff'), false);
  console.log('PASS browser/database transfer: HR approval + two independent store managers -> resume -> canonical B directory only; original identity and CRM history preserved');

  const technical = await login('system_admin'); await technical.page.locator('nav [data-section="accounts"]').click();
  const accountCard = technical.page.locator('article').filter({ has: technical.page.getByRole('heading', { name: 'v1-am', exact: true }) });
  await accountCard.getByRole('button', { name: 'Phạm vi và capability', exact: true }).click();
  const grantDialog = technical.page.getByRole('dialog', { name: 'Quyền được cấp tường minh', exact: true });
  await grantDialog.getByLabel('Lý do bắt buộc', { exact: true }).fill('Owned browser explicit region and reporting intersection');
  await grantDialog.getByRole('combobox', { name: /^Loại phạm vi/ }).selectOption('organization');
  await grantDialog.getByLabel(new RegExp('^Khu vực ' + fixture.regions[0]._id)).check();
  await grantDialog.getByLabel('Nhân viên ' + fixture.actors.staff.employee._id, { exact: true }).check();
  await grantDialog.getByLabel('projects.assign', { exact: true }).check();
  await grantDialog.getByRole('button', { name: 'Cấp grant theo chính sách V1', exact: true }).click();
  await grantDialog.waitFor({ state: 'hidden' });
  const changedAm = await UserModel.findById(fixture.actors.am.user._id).lean();
  assert.equal(changedAm.securityVersion, 1);
  assert.deepEqual(changedAm.authorization.grants.at(-1).scope.regionIds, [String(fixture.regions[0]._id)]);
  assert.deepEqual(changedAm.authorization.grants.at(-1).scope.reportingEmployeeIds, [String(fixture.actors.staff.employee._id)]);
  assert.equal(changedAm.securityAudit.length, 1);
  await accountCard.getByRole('button', { name: 'Security audit đã che thông tin', exact: true }).click();
  const auditDialog = technical.page.getByRole('dialog', { name: 'Security audit', exact: true });
  await auditDialog.getByText('Phần hash-chain kiểm chứng hợp lệ', { exact: true }).waitFor();
  assert.doesNotMatch(await auditDialog.innerText(), /fixture-contact|NEVER_SEND_BANK|passwordHash/);
  await technical.page.screenshot({ path: path.join(output, 'authorization-v1-grants-desktop.png'), fullPage: true });
  assert.deepEqual(errors, []);
  console.log('PASS browser/database V1 technical grant UI: region + reporting intersection, version/audit persisted, no HR fields');
  await auditDialog.getByRole('button', { name: 'Đóng', exact: true }).click();
  await accountCard.getByRole('button', { name: 'Phạm vi và capability', exact: true }).click();
  await grantDialog.getByLabel('Lý do bắt buộc', { exact: true }).fill('Revoke only the additional browser grant');
  // All grants may share an approval label; select the exact capability/scope
  // using its persisted grant ordering in this isolated fixture.
  await grantDialog.getByRole('button', { name: 'Chọn thu hồi grant', exact: true }).last().click();
  await grantDialog.getByRole('button', { name: 'Xác nhận thu hồi và vô hiệu token cũ', exact: true }).click(); await grantDialog.waitFor({ state: 'hidden' });
  assert.equal((await UserModel.findById(changedAm._id)).securityVersion, 2); assert.ok((await UserModel.findById(changedAm._id)).authorization.grants.at(-1).revokedAt);
  const oldAmStatus = await fetch(apiOrigin + '/api/auth/me', { headers: { Authorization: 'Bearer ' + am.token() } }); assert.equal(oldAmStatus.status, 401);
  await accountCard.getByRole('button', { name: 'Khóa tài khoản', exact: true }).click();
  const statusDialog = technical.page.getByRole('dialog'); await statusDialog.getByLabel('Lý do bắt buộc', { exact: true }).fill('Owned browser disable'); await statusDialog.getByRole('button', { name: 'Xác nhận khóa', exact: true }).click(); await statusDialog.waitFor({ state: 'hidden' });
  assert.equal((await UserModel.findById(changedAm._id)).status, 'disabled');
  await accountCard.getByRole('button', { name: 'Mở khóa có kiểm soát', exact: true }).click(); await statusDialog.getByLabel('Lý do bắt buộc', { exact: true }).fill('Owned browser unlock existing active employment'); await statusDialog.getByRole('button', { name: 'Xác nhận mở khóa', exact: true }).click(); await statusDialog.waitFor({ state: 'hidden' });
  assert.equal((await UserModel.findById(changedAm._id)).status, 'active'); assert.equal((await UserModel.findById(changedAm._id)).securityVersion, 4);
  await accountCard.getByRole('button', { name: 'Gửi liên kết khôi phục mật khẩu', exact: true }).click(); await statusDialog.getByLabel('Lý do bắt buộc', { exact: true }).fill('Verified synthetic recipient channel'); await statusDialog.getByRole('button', { name: 'Xác nhận gửi liên kết an toàn', exact: true }).click(); await statusDialog.waitFor({ state: 'hidden' });
  const recoveryToken = recoveryInvitations.get(String(changedAm._id)); assert.ok(recoveryToken); assert.doesNotMatch(await technical.page.innerText('body'), new RegExp(recoveryToken));
  await setupPassword('#recover=' + recoveryToken, 'BrowserRecoveredAM@2026'); await login('am', 'BrowserRecoveredAM@2026');
  assert.equal((await UserModel.findById(changedAm._id)).passwordRecovery.state, 'CONSUMED');
  console.log('PASS browser/database grant revoke, token invalidation, audited disable/unlock and technical one-time recovery via in-memory adapter only');
  await technical.page.getByRole('button', { name: 'Làm mới tài khoản', exact: true }).click();
  await accountCard.getByText(/CONSUMED/).waitFor();
  await technical.page.screenshot({ path: path.join(output, 'authorization-v1-followup-recovery-desktop.png'), fullPage: true });
  // Real service-created backlog, not fabricated UI paging metadata. The old
  // onboarding request must remain retrievable by page and by immutable ID.
  for (let index = 0; index < 21; index++) {
    const created = await fetch(apiOrigin + '/api/onboarding', { method: 'POST', headers: { Authorization: 'Bearer ' + sm.token(), 'Content-Type': 'application/json' }, body: JSON.stringify({ clientRequestId: randomUUID(), fullName: 'Synthetic backlog ' + index, phone: 'synthetic-only', storeId: String(fixture.stores[0]._id), hiredAt: new Date().toISOString(), reason: 'Owned browser pagination fixture' }) });
    assert.equal(created.status, 201);
  }
  await page.locator('nav [data-section="onboarding"]').click();
  const pagination = page.getByRole('navigation', { name: 'Phân trang onboarding', exact: true });
  await pagination.getByRole('button', { name: 'Trang sau', exact: true }).click();
  await page.getByRole('heading', { name: `Isolated browser onboarding · ${onboardingCode}`, exact: true }).waitFor();
  await page.getByLabel('Tra cứu lịch sử bằng mã yêu cầu', { exact: true }).fill(String(originalRequest._id)); await page.getByRole('button', { name: 'Xem lịch sử theo mã', exact: true }).click();
  const historical = page.getByRole('dialog', { name: 'Đối chiếu đề nghị tiếp nhận', exact: true });
  await historical.getByText('Hash-chain local khớp. Đây không phải bằng chứng neo Blockchain công khai.', { exact: true }).waitFor();
  await historical.getByText(/Verify corrected contact before approval/).waitFor();
  await page.setViewportSize({ width: 320, height: 844 }); const historyBounds = await historical.boundingBox(); assert.ok(historyBounds.x >= 0 && historyBounds.x + historyBounds.width <= 320);
  await page.screenshot({ path: path.join(output, 'authorization-v1-followup-history-mobile320.png'), fullPage: true });
  console.log('PASS browser/database onboarding rejection -> amendment on same identity -> independent review; real history pagination and ID lookup, local audit verified at320px');
  assert.deepEqual(errors, []);
} catch (failure) {
  const latest = contexts.at(-1)?.pages().at(-1);
  if (latest) await latest.screenshot({ path: path.join(output, 'authorization-v1-followup-failure.png'), fullPage: true }).catch(() => {});
  console.error('Browser runtime diagnostics:', errors);
  throw failure;
} finally {
  for (const context of contexts) await context.close().catch(() => {});
  await browser?.close(); for (const server of [api, web]) if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
  await disconnectDB(); await mongo.stop();
}
