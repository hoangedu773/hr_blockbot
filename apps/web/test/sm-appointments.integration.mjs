// Real built Web -> real API -> owned synthetic local DB. No Atlas/provider calls.
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
process.env.NODE_ENV = 'test'; process.env.TEST_MONGODB_URI = mongo.getUri('test_sm_appointment_browser');
process.env.JWT_SECRET = 'owned-sm-position-browser-secret-minimum32'; delete process.env.ATLAS_URI; delete process.env.MONGODB_DB_NAME;
await import('../../api/test/require-isolated-db.mjs');
const { connectDB, disconnectDB } = await import('../../api/dist/db.js');
const { createApp } = await import('../../api/dist/app.js');
const { authorizationV1Fixture } = await import('../../api/test/helpers/authorization-v1-fixture.mjs');
const { EmployeeModel } = await import('../../api/dist/models/Employee.js');
const { UserModel } = await import('../../api/dist/models/User.js');
const { ManagementRelationModel } = await import('../../api/dist/models/AuthorizationMapping.js');
const { SmAppointmentModel } = await import('../../api/dist/models/SmAppointment.js');
const dist = path.join(root, 'apps/web/dist'), output = path.join(root, 'test-results/sm-appointments'); fs.mkdirSync(output, { recursive: true });
let browser, api, web, origin, apiOrigin, fixture;
const contexts = [], errors = [];
async function snapshot() { return JSON.stringify({ users: await UserModel.find({}).select('authorization employeeId status securityVersion role').sort({ _id: 1 }).lean(), employees: await EmployeeModel.find({}).sort({ _id: 1 }).lean(), relations: await ManagementRelationModel.find({}).sort({ _id: 1 }).lean() }); }
async function login(profile) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); contexts.push(context);
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/api/')) return route.fulfill({ response: await route.fetch({ url: apiOrigin + url.pathname + url.search }) });
    if (url.origin === origin) return route.continue(); return route.fulfill({ status: 200, body: '' });
  });
  const page = await context.newPage(); page.setDefaultTimeout(12000); page.on('pageerror', e => errors.push(e.message));
  await page.goto(origin, { waitUntil: 'networkidle' }); await page.getByRole('button', { name: 'Get Started', exact: true }).click();
  await page.locator('#login-username').fill('v1-' + profile); await page.locator('#login-password').fill(fixture.password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click(); await page.locator('.crm-sidebar').waitFor();
  return page;
}
async function detail(page) {
  await page.locator('.crm-sidebar [data-section="employees"]').click();
  await page.getByRole('button', { name: 'Isolated V1 sm', exact: true }).click();
  const section = page.getByRole('region', { name: 'Hồ sơ phân công SM', exact: true }); await section.waitFor(); return section;
}
try {
  await connectDB(); fixture = await authorizationV1Fixture();
  await EmployeeModel.collection.updateOne({ _id: fixture.actors.sm.employee._id }, { $set: { job_title: 'SM', hrmProfileMappingV1: { identityMappingVerified: true, sourceTitleVerified: true, sourceJobTitle: 'SM' } } });
  const original = await snapshot();
  web = http.createServer((req, res) => {
    const name = new URL(req.url, 'http://127.0.0.1').pathname, file = path.resolve(dist, '.' + (name === '/' ? '/index.html' : name));
    if (!file.startsWith(dist + path.sep) || !fs.existsSync(file)) return res.writeHead(404).end();
    res.setHeader('Content-Type', { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }[path.extname(file)] || 'application/octet-stream'); fs.createReadStream(file).pipe(res);
  });
  await new Promise(r => web.listen(0, '127.0.0.1', r)); origin = 'http://127.0.0.1:' + web.address().port;
  process.env.FRONTEND_URL = origin;
  api = http.createServer(createApp()); await new Promise(r => api.listen(0, '127.0.0.1', r)); apiOrigin = 'http://127.0.0.1:' + api.address().port;
  browser = await chromium.launch({ headless: true });
  const proposer = await login('hr'), form = await detail(proposer);
  await form.getByText('Chưa có hồ sơ phân công được ghi nhận.', { exact: false }).waitFor();
  await form.locator('summary', { hasText: 'Đề nghị ghi nhận phân công SM' }).click();
  await form.getByLabel('Loại phân công', { exact: true }).selectOption('SUPERVISORY');
  await form.getByLabel('Cửa hàng được phân công', { exact: true }).selectOption(String(fixture.stores[0]._id));
  await form.getByLabel('Hiệu lực từ', { exact: true }).fill(new Date(Date.now() - 3600000).toISOString().slice(0, 16));
  await form.getByLabel('Hiệu lực đến', { exact: true }).fill(new Date(Date.now() + 86400000).toISOString().slice(0, 16));
  await form.getByLabel('Mã / tham chiếu quyết định', { exact: true }).fill('SYNTHETIC-SUPERVISORY-DECISION');
  await form.getByLabel('Lý do phân công', { exact: true }).fill('Synthetic independently reviewed simulated appointment');
  await form.getByRole('button', { name: 'Gửi HR độc lập xác nhận', exact: true }).click();
  await form.getByText('Đã lưu hồ sơ phân công.', { exact: false }).waitFor();
  assert.equal(await form.getByRole('button', { name: 'Xác nhận phân công', exact: true }).count(), 0);
  let row = await SmAppointmentModel.findOne({ evidenceRef: 'SYNTHETIC-SUPERVISORY-DECISION' }).lean(); assert.equal(row.status, 'PENDING');
  const reviewer = await login('hr2'), review = await detail(reviewer);
  await review.getByRole('button', { name: 'Căn cứ và lịch sử phân công', exact: true }).click();
  await review.getByLabel('Lý do quyết định', { exact: true }).fill('Independent HR verifies synthetic assignment evidence');
  await review.getByRole('button', { name: 'Xác nhận phân công', exact: true }).click();
  await review.getByRole('button', { name: 'Thu hồi phân công', exact: true }).waitFor();
  row = await SmAppointmentModel.findById(row._id).lean(); assert.equal(row.status, 'APPROVED'); assert.equal(row.history.length, 2);
  const employee = await login('sm'); await employee.locator('.crm-sidebar [data-section="profile"]').click();
  await employee.locator('.employee-profile-secondary > summary', { hasText: 'Phân công cửa hàng' }).click();
  const self = employee.getByRole('region', { name: 'Hồ sơ phân công SM', exact: true });
  await self.getByRole('heading', { name: 'SM giám sát', exact: true }).waitFor();
  assert.equal(await self.locator('form').count(), 0); assert.match(await self.innerText(), /Đang hiệu lực/);
  await employee.setViewportSize({ width: 390, height: 844 }); await employee.screenshot({ path: path.join(output, 'self-mobile.png') });
  await reviewer.screenshot({ path: path.join(output, 'independent-review.png') });
  await review.getByLabel('Lý do quyết định', { exact: true }).fill('End of synthetic appointment evidence');
  await review.getByLabel('Căn cứ bàn giao / thu hồi', { exact: true }).fill('SYNTHETIC-HANDOVER-REFERENCE');
  await review.getByRole('button', { name: 'Thu hồi phân công', exact: true }).click();
  await review.getByRole('heading', { name: 'SM giám sát · Đã thu hồi', exact: true }).waitFor();
  row = await SmAppointmentModel.findById(row._id).lean(); assert.equal(row.status, 'REVOKED'); assert.equal(row.history.length, 3);
  assert.equal(await snapshot(), original); assert.deepEqual(errors, []);
  console.log('PASS real browser/API/owned MongoDB: HR proposal -> independent HR approval -> SM self position -> mobile -> audited revoke; profile/grade/grants/graph unchanged');
} catch (error) { await contexts.at(-1)?.pages()[0]?.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {}); throw error; }
finally { for (const c of contexts) await c.close().catch(() => {}); await browser?.close(); for (const s of [api, web]) if (s) { s.closeAllConnections(); await new Promise(r => s.close(r)); } await disconnectDB(); await mongo.stop(); }
