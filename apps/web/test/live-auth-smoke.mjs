// Explicit, non-destructive production smoke check. Never runs in the unit suite.
// Supply LIVE_AUTH_SMOKE=1, TEST_LOGIN_EMAILS (comma-separated), TEST_LOGIN_PASSWORD.
// Only login/refresh/logout sessions are written; HR and provider data are untouched.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

if (process.env.LIVE_AUTH_SMOKE !== '1') throw new Error('Set LIVE_AUTH_SMOKE=1 explicitly.');
const emails = (process.env.TEST_LOGIN_EMAILS || '').split(',').filter(Boolean);
const password = process.env.TEST_LOGIN_PASSWORD;
if (!emails.length || !password) throw new Error('Test credentials must be supplied through the environment.');
const web = process.env.LIVE_WEB_URL || 'https://hr-blockbot-web.onrender.com';
const api = process.env.LIVE_API_URL || 'https://hr-blockbot-api.onrender.com/api';
const { chromium } = createRequire(import.meta.url)('playwright');
const output = path.resolve('test-results');
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true });

try {
  for (const [index, email] of emails.entries()) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    try {
      const page = await context.newPage();
      page.setDefaultTimeout(30000);
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(web, { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: 'Get Started', exact: true }).click();
      assert.equal(await page.locator('#auth-modal svg, #auth-modal img').count(), 0);
      await page.getByLabel('Email', { exact: true }).fill(email);
      if (index === 0) {
        await page.getByLabel('Mật khẩu', { exact: true }).fill('intentionally-wrong-smoke-password');
        await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
        await page.getByRole('alert').filter({ hasText: 'Email hoặc mật khẩu không đúng.' }).waitFor();
      }
      await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
      const loginResponse = page.waitForResponse((response) => response.url() === `${api}/auth/login` && response.status() === 200);
      await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
      const login = await (await loginResponse).json();
      assert.ok(['Admin', 'Employee'].includes(login.user.role));
      await page.getByTestId('chat-page').waitFor();
      const cookie = (await context.cookies(api)).find((item) => item.name === 'refreshToken');
      assert.ok(cookie?.httpOnly && cookie.secure);
      assert.equal(cookie.sameSite, 'None');
      const me = await context.request.get(`${api}/auth/me`, { headers: { Authorization: `Bearer ${login.accessToken}` } });
      assert.equal(me.status(), 200);
      assert.equal((await me.json()).role, login.user.role);
      const storage = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
      assert.equal(storage.includes(login.accessToken), false);
      assert.equal(storage.includes('guta_user'), false);
      const refresh = page.waitForResponse((response) => response.url() === `${api}/auth/refresh` && response.status() === 200);
      await page.reload({ waitUntil: 'networkidle' });
      await refresh;
      await page.getByTestId('chat-page').waitFor();
      const chatResponse = page.waitForResponse((response) => response.url() === `${api}/chat`);
      await page.getByRole('textbox', { name: 'Tin nhắn cho Guta AI' }).fill('chào');
      await page.getByRole('button', { name: 'Gửi', exact: true }).click();
      const reply = await chatResponse;
      assert.equal(reply.status(), 200);
      const body = await reply.json();
      assert.equal(typeof body.reply, 'string');
      assert.ok(body.reply.trim());
      assert.notEqual(body.degraded, true);
      assert.notEqual(body.abstain, true);
      await page.getByRole('log').getByText(body.reply, { exact: true }).waitFor();
      if (index === 0) await page.screenshot({ path: path.join(output, 'live-auth-chat.png') });
      await page.getByRole('button', { name: 'Quay lại Vận Hành (CRM)', exact: true }).click();
      const label = login.user.role === 'Admin' ? 'Quản trị viên' : 'Nhân viên';
      await page.locator('.crm-sidebar').getByText(label, { exact: true }).waitFor();
      const loggedOut = page.waitForResponse((response) => response.url() === `${api}/auth/logout` && response.status() === 204);
      await page.getByRole('button', { name: 'Đăng Xuất Phiên', exact: true }).click();
      await loggedOut;
      await page.getByRole('button', { name: 'Get Started', exact: true }).waitFor();
      await page.reload({ waitUntil: 'networkidle' });
      await page.getByRole('button', { name: 'Get Started', exact: true }).waitFor();
      assert.equal(await page.getByTestId('chat-page').count(), 0);
      assert.deepEqual(errors, []);
      console.log(`PASS ${email}: ${login.user.role}, login, HttpOnly cookie, /me, reload, chat, CRM, logout`);
    } finally {
      // Also revoke this browser's session if an assertion failed mid-flow.
      await context.request.post(`${api}/auth/logout`, { headers: { Origin: web } }).catch(() => {});
      await context.close();
    }
  }
  const response = await fetch(`${api}/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'chào' }), signal: AbortSignal.timeout(15000),
  });
  assert.equal(response.status, 401);
  console.log('PASS unauthenticated chat is rejected with HTTP 401');
} finally {
  await browser.close();
}
