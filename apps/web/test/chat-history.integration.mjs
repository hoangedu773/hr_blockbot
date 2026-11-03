// Built Web -> real Node authorization/history -> owned MongoDB; mock AI transport only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { chromium } from './helpers/browser-deps.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..'), reqApi = createRequire(path.join(root, 'apps/api/package.json'));
const mongo = await reqApi('mongodb-memory-server').MongoMemoryServer.create();
process.env.NODE_ENV = 'test'; process.env.TEST_MONGODB_URI = mongo.getUri('test_chat_history_browser'); process.env.JWT_SECRET = 'owned-chat-history-browser-secret-over32';
delete process.env.ATLAS_URI; delete process.env.MONGODB_DB_NAME;
await import('../../api/test/require-isolated-db.mjs');
const { connectDB, disconnectDB } = await import('../../api/dist/db.js');
const { createApp } = await import('../../api/dist/app.js');
const { authorizationV1Fixture } = await import('../../api/test/helpers/authorization-v1-fixture.mjs');
const { ChatTurnModel: Turn } = await import('../../api/dist/models/ChatConversation.js');
const dist = path.join(root, 'apps/web/dist'), out = path.join(root, 'test-results/chat-history'); fs.mkdirSync(out, { recursive: true });
let api, web, provider, browser, context, origin, apiOrigin, f, pendingRelease, entered, providerCalls = 0;
const errors = [];
async function login(page, profile) {
  await page.getByRole('button', { name: 'Get Started', exact: true }).click();
  await page.locator('#login-username').fill('v1-' + profile); await page.locator('#login-password').fill(f.password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click(); await page.locator('.crm-sidebar').waitFor();
  await page.locator('.crm-sidebar .crm-copilot').click(); await page.getByTestId('chat-page').waitFor();
}
async function send(page, text) {
  await page.getByRole('textbox', { name: 'Tin nhắn cho Guta AI' }).fill(text);
  await page.getByRole('button', { name: 'Gửi', exact: true }).click();
}
const answer = page => page.locator('.guta-chat-message[data-sender="assistant"]').getByText('Synthetic saved browser answer', { exact: true }).waitFor();
const logout = page => page.getByRole('button', { name: 'Đăng Xuất Phiên', exact: true }).click();
try {
  await connectDB(); f = await authorizationV1Fixture();
  provider = http.createServer(async (req, res) => {
    let text = ''; for await (const chunk of req) text += chunk; const body = JSON.parse(text); providerCalls++;
    if (body.message.includes('hold')) { entered(); await new Promise(r => { pendingRelease = r; }); }
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ reply: 'Synthetic saved browser answer', citations: [], attachments: [], proposedAction: null, decisionSource: 'isolated-provider' }));
  });
  await new Promise(r => provider.listen(0, '127.0.0.1', r)); process.env.AI_SERVICE_URL = 'http://127.0.0.1:' + provider.address().port;
  process.env.AI_SERVICE_API_KEY = 'owned-browser-service-key'; process.env.AI_LLM_API_KEY = 'owned-browser-provider-key'; process.env.AI_LLM_BASE_URL = 'https://provider.invalid/v1';
  web = http.createServer((req, res) => {
    const p = new URL(req.url, 'http://127.0.0.1').pathname, file = path.resolve(dist, '.' + (p === '/' ? '/index.html' : p));
    if (!file.startsWith(dist + path.sep) || !fs.existsSync(file)) return res.writeHead(404).end();
    res.setHeader('Content-Type', { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }[path.extname(file)] || 'application/octet-stream'); fs.createReadStream(file).pipe(res);
  });
  await new Promise(r => web.listen(0, '127.0.0.1', r)); origin = 'http://127.0.0.1:' + web.address().port; process.env.FRONTEND_URL = origin;
  api = http.createServer(createApp()); await new Promise(r => api.listen(0, '127.0.0.1', r)); apiOrigin = 'http://127.0.0.1:' + api.address().port;
  browser = await chromium.launch({ headless: true }); context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.route('**/*', async route => {
    const u = new URL(route.request().url());
    if (u.pathname.startsWith('/api/')) { try { return await route.fulfill({ response: await route.fetch({ url: apiOrigin + u.pathname + u.search }) }); } catch { return route.abort().catch(() => {}); } }
    if (u.origin === origin) return route.continue(); return route.abort();
  });
  const page = await context.newPage(); page.setDefaultTimeout(15000); page.on('pageerror', e => errors.push(e.message));
  await page.goto(origin, { waitUntil: 'networkidle' }); await login(page, 'staff');
  const first = 'Synthetic browser conversation one'; await send(page, first); await answer(page);
  assert.equal(providerCalls, 1);
  await page.getByRole('button', { name: 'Quay lại CRM', exact: true }).click(); await page.locator('.crm-sidebar .crm-copilot').click(); await answer(page);
  assert.equal(providerCalls, 1, 'restoring never invokes AI');
  await page.reload({ waitUntil: 'networkidle' }); await page.locator('.crm-sidebar').waitFor(); await page.locator('.crm-sidebar .crm-copilot').click(); await answer(page);
  assert.equal(providerCalls, 1);
  await page.getByRole('button', { name: 'Hội thoại mới', exact: true }).click();
  await send(page, 'Synthetic second conversation'); await answer(page); assert.equal(providerCalls, 2);
  await page.getByRole('navigation', { name: 'Lịch sử hội thoại' }).getByRole('button', { name: first, exact: true }).click(); await answer(page);
  assert.equal(await page.locator('.guta-chat-message[data-sender="user"]').textContent(), 'Bạn' + first);
  assert.equal(providerCalls, 2);
  await logout(page); await login(page, 'staffB');
  await page.getByRole('heading', { name: 'Chào mừng đến HR BlockBot' }).waitFor();
  assert.equal(await page.getByRole('navigation', { name: 'Lịch sử hội thoại' }).getByRole('button', { name: first, exact: true }).count(), 0);
  assert.equal(await page.locator('.guta-chat-message').count(), 0);
  await logout(page); await login(page, 'staff'); await answer(page);
  await page.getByRole('button', { name: 'Hội thoại mới', exact: true }).click();
  const providerEntered = new Promise(r => { entered = r; }); await send(page, 'hold synthetic saved question'); await providerEntered;
  await page.getByRole('button', { name: 'Quay lại CRM', exact: true }).click();
  await page.locator('.crm-sidebar .crm-copilot').click();
  await page.locator('.guta-chat-message[data-sender="user"]').getByText('hold synthetic saved question', { exact: true }).waitFor();
  pendingRelease(); await answer(page); assert.equal(providerCalls, 3);
  assert.equal(await Turn.countDocuments({ status: 'COMPLETED', userId: f.actors.staff.user._id }), 3);
  await page.setViewportSize({ width: 390, height: 844 }); await page.getByRole('button', { name: 'Mở danh sách hội thoại' }).click();
  await page.getByRole('navigation', { name: 'Lịch sử hội thoại' }).getByRole('button', { name: first, exact: true }).click(); await answer(page);
  await page.screenshot({ path: path.join(out, 'mobile-history.png') });
  assert.equal(await page.evaluate(() => Object.values(localStorage).some(v => v.includes('Synthetic browser') || v.includes('Synthetic saved browser answer'))), false);
  assert.deepEqual(errors, []);
  console.log('PASS real Web/API/MongoDB history: return from HRM, reload with refreshed login, multiple conversations, same-browser account isolation, logout/login restore, interrupted navigation during provider reply, mobile history; no content in localStorage');
} catch(e) { await context?.pages()[0]?.screenshot({ path: path.join(out, 'failure.png'), fullPage: true }).catch(() => {}); throw e; }
finally { pendingRelease?.(); await context?.close(); await browser?.close(); for (const s of [api, web, provider]) if (s) { s.closeAllConnections(); await new Promise(r => s.close(r)); } await disconnectDB(); await mongo.stop(); }
