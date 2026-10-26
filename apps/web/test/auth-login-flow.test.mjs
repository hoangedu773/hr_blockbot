import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
const credentials = { email: 'employee@guta.test', password: 'test-only-password' };
const user = { id: 'test-employee', role: 'Employee' };
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

describe('Account login and session lifecycle (isolated browser fixtures)', () => {
  let server;
  let origin;
  let browser;
  const contexts = [];

  before(async () => {
    server = http.createServer((req, res) => {
      const pathname = new URL(req.url, 'http://localhost').pathname;
      const file = path.join(dist, pathname === '/' ? 'index.html' : pathname);
      if (!file.startsWith(dist + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        res.writeHead(404); res.end(); return;
      }
      const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' };
      res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ headless: true });
  });

  after(async () => {
    await Promise.all(contexts.map((context) => context.close()));
    await browser?.close();
    if (server) await new Promise((resolve) => server.close(resolve));
  });

  async function fixture(options = {}) {
    const context = await browser.newContext({ viewport: options.mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 } });
    contexts.push(context);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const state = { active: !!options.active, loginCount: 0, refreshCount: 0, logoutCount: 0, chatCount: 0, refreshed: false };
    // Block every external request; tests never contact Render, Atlas, or a model provider.
    await context.route('**/*', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (!url.pathname.startsWith('/api/')) {
        if (url.origin === origin) return route.continue();
        return route.fulfill({ status: 200, body: '' });
      }
      if (url.pathname === '/api/auth/login') {
        state.loginCount += 1;
        assert.deepEqual(request.postDataJSON(), credentials);
        if (options.networkError) return route.abort('connectionrefused');
        if (options.rejectLogin) return route.fulfill({ status: 401, json: { error: { message: 'Invalid email or password' } } });
        if (options.malformedLogin) return route.fulfill({ status: 200, json: { accessToken: 'invalid', user: { id: user.id, role: 'SM' } } });
        state.active = true;
        state.refreshed = false;
        return route.fulfill({ status: 200, json: { accessToken: 'test-login-token', user } });
      }
      if (url.pathname === '/api/auth/refresh') {
        state.refreshCount += 1;
        if (options.pauseRefresh) {
          options.pauseRefresh.started.resolve();
          await options.pauseRefresh.release.promise;
        }
        // Return an empty session for a signed-out browser without a network error.
        if (!state.active) return route.fulfill({ status: 200, json: { accessToken: null } });
        state.refreshed = true;
        return route.fulfill({ status: 200, json: { accessToken: 'test-refreshed-token' } });
      }
      if (url.pathname === '/api/auth/me') {
        assert.equal(request.headers().authorization, 'Bearer test-refreshed-token');
        return route.fulfill(options.rejectMe
          ? { status: 503, json: { error: { message: 'Unavailable' } } }
          : { status: 200, json: { userId: user.id, role: user.role, skills: [] } });
      }
      if (url.pathname === '/api/auth/logout') {
        state.active = false;
        state.logoutCount += 1;
        return route.fulfill({ status: 204 });
      }
      if (url.pathname === '/api/chat') {
        state.chatCount += 1;
        assert.equal(request.headers().authorization, state.refreshed ? 'Bearer test-refreshed-token' : 'Bearer test-login-token');
        if (options.expireChat && !state.refreshed) return route.fulfill({ status: 401, json: { error: { code: 'UNAUTHENTICATED' } } });
        return route.fulfill({ status: 200, json: { reply: 'Phản hồi từ API theo phiên đăng nhập.', citations: [] } });
      }
      return route.fulfill({ status: 404, json: {} });
    });
    await page.goto(origin, { waitUntil: 'networkidle' });
    return { page, state, errors };
  }

  async function openForm(page) {
    if (!await page.getByRole('button', { name: 'Get Started' }).isVisible()) {
      await page.getByRole('button', { name: 'Open Menu' }).click();
    }
    await page.getByRole('button', { name: 'Get Started' }).click();
    await page.getByRole('heading', { name: 'Đăng nhập Guta Workspace' }).waitFor();
    await page.getByLabel('Email', { exact: true }).fill(credentials.email);
    await page.getByLabel('Mật khẩu', { exact: true }).fill(credentials.password);
  }

  async function signIn(page) {
    await openForm(page);
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await page.getByRole('button', { name: 'Đăng Xuất Phiên' }).waitFor();
  }

  async function openChat(page) {
    if (!await page.locator('.guta-chat').count()) {
      await page.locator('nav a').filter({ hasText: /Copilot/i }).click();
    }
    await page.getByPlaceholder('Hỏi AI về ca trực, nhân sự, tiền két...').waitFor();
  }

  it('sai mật khẩu giữ nguyên form, hiển thị lỗi và cho phép thử lại', async () => {
    const { page, state, errors } = await fixture({ rejectLogin: true });
    await openForm(page);
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Email hoặc mật khẩu không đúng.' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Đăng nhập', exact: true }).isEnabled(), true);
    assert.equal(await page.locator('#detail-drawer').count(), 0);
    assert.equal(state.loginCount, 1);
    assert.deepEqual(errors, []);
  });

  it('đăng nhập theo quyền server và gửi Bearer token khi hỏi chatbot', async () => {
    const { page, state, errors } = await fixture();
    await signIn(page);
    await page.getByRole('button', { name: 'Quay lại Vận Hành (CRM)', exact: true }).click();
    assert.equal(await page.getByText('Nhân viên', { exact: true }).count(), 1);
    const saved = await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } }));
    assert.equal(JSON.stringify(saved).includes('test-login-token'), false);
    assert.equal(JSON.stringify(saved).includes('guta_user'), false);
    await openChat(page);
    await page.getByPlaceholder('Hỏi AI về ca trực, nhân sự, tiền két...').fill('Hồ sơ của tôi');
    await page.getByRole('button', { name: 'Gửi', exact: true }).click();
    await page.getByText('Phản hồi từ API theo phiên đăng nhập.', { exact: true }).waitFor();
    assert.equal(state.chatCount, 1);
    assert.deepEqual(errors, []);
  });

  it('F5 khôi phục cả token và danh tính; đăng xuất rồi F5 không đăng nhập lại', async () => {
    const { page, state, errors } = await fixture();
    await signIn(page);
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Đăng Xuất Phiên' }).waitFor();
    assert.equal(state.refreshed, true);
    const logoutFinished = page.waitForResponse((response) => response.url().endsWith('/api/auth/logout'));
    await page.getByRole('button', { name: 'Đăng Xuất Phiên' }).click();
    await page.getByRole('button', { name: 'Get Started' }).waitFor();
    await logoutFinished;
    assert.equal(state.logoutCount, 1);
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.getByRole('button', { name: 'Đăng Xuất Phiên' }).count(), 0);
    assert.deepEqual(errors, []);
  });

  it('token hết hạn được refresh, truy vấn lại bằng token mới', async () => {
    const { page, state, errors } = await fixture({ expireChat: true });
    await signIn(page);
    await openChat(page);
    await page.getByPlaceholder('Hỏi AI về ca trực, nhân sự, tiền két...').fill('Hồ sơ của tôi');
    await page.getByRole('button', { name: 'Gửi', exact: true }).click();
    await page.getByText('Phản hồi từ API theo phiên đăng nhập.', { exact: true }).waitFor();
    assert.equal(state.chatCount, 2);
    assert.equal(state.refreshCount, 2); // startup + one retry
    assert.deepEqual(errors, []);
  });

  it('đăng xuất trong lúc refresh không làm hồi sinh phiên cũ', async () => {
    const pause = { started: deferred(), release: deferred() };
    const { page, state, errors } = await fixture({ expireChat: true });
    await signIn(page);
    // Pause only the refresh caused by the next expired request.
    await page.route('**/api/auth/refresh', async (route) => {
      pause.started.resolve();
      await pause.release.promise;
      state.refreshed = true;
      return route.fulfill({ status: 200, json: { accessToken: 'test-refreshed-token' } });
    });
    await openChat(page);
    await page.getByPlaceholder('Hỏi AI về ca trực, nhân sự, tiền két...').fill('Hồ sơ của tôi');
    await page.getByRole('button', { name: 'Gửi', exact: true }).click();
    await pause.started.promise;
    await page.keyboard.press('Escape');
    const logoutFinished = page.waitForResponse((response) => response.url().endsWith('/api/auth/logout'));
    await page.getByRole('button', { name: 'Đăng Xuất Phiên' }).click();
    await page.getByRole('button', { name: 'Get Started' }).waitFor();
    pause.release.resolve();
    await logoutFinished;
    await page.unroute('**/api/auth/refresh');
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(state.active, false);
    assert.equal(await page.getByRole('button', { name: 'Đăng Xuất Phiên' }).count(), 0);
    assert.deepEqual(errors, []);
  });

  it('không nhận phiên khi /me không xác nhận được danh tính', async () => {
    const { page, errors } = await fixture({ active: true, rejectMe: true });
    assert.equal(await page.getByRole('button', { name: 'Đăng Xuất Phiên' }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Get Started' }).isVisible(), true);
    assert.deepEqual(errors, []);
  });

  it('vai trò tự lưu trong trình duyệt không mở được dashboard', async () => {
    const { page, errors } = await fixture();
    await page.evaluate(() => {
      const forged = JSON.stringify({ role: 'Admin', name: 'Forged' });
      sessionStorage.setItem('guta_user', forged);
      localStorage.setItem('guta_user', forged);
    });
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.getByRole('button', { name: 'Đăng Xuất Phiên' }).count(), 0);
    assert.deepEqual(errors, []);
  });

  it('form di động vừa màn hình, hiện/ẩn mật khẩu và báo lỗi mạng rõ ràng', async () => {
    const { page, errors } = await fixture({ mobile: true, networkError: true });
    await openForm(page);
    assert.equal(await page.locator('#auth-modal svg, #auth-modal img, #auth-modal [data-lucide]').count(), 0);
    assert.doesNotMatch(await page.locator('#auth-modal').innerText(), /demo|1-click|SM|AOM/i);
    await page.getByRole('button', { name: 'Hiện mật khẩu' }).click();
    assert.equal(await page.getByLabel('Mật khẩu', { exact: true }).getAttribute('type'), 'text');
    await page.getByRole('button', { name: 'Ẩn mật khẩu' }).click();
    assert.equal(await page.getByLabel('Mật khẩu', { exact: true }).getAttribute('type'), 'password');
    const bounds = await page.locator('#auth-modal > div').boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390);
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Không thể kết nối máy chủ.' }).waitFor();
    const outputDir = path.resolve(dist, '../../../test-results');
    fs.mkdirSync(outputDir, { recursive: true });
    await page.screenshot({ path: path.join(outputDir, 'auth-login-mobile.png') });
    assert.deepEqual(errors, []);
  });

  it('không chấp nhận vai trò ngoài hợp đồng do server trả về', async () => {
    const { page, errors } = await fixture({ malformedLogin: true });
    await openForm(page);
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Phản hồi đăng nhập không hợp lệ.' }).waitFor();
    assert.equal(await page.locator('#detail-drawer').count(), 0);
    assert.deepEqual(errors, []);
  });

  it('form desktop tối giản, giữ focus và đóng bằng Escape', async () => {
    const { page, errors } = await fixture();
    await openForm(page);
    assert.equal(await page.locator('#auth-modal svg, #auth-modal img').count(), 0);
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.getByRole('button', { name: 'Đóng đăng nhập' }).evaluate((el) => el === document.activeElement), true);
    await page.screenshot({ path: path.join(dist, '../../../test-results/auth-login-desktop.png') });
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#auth-modal').count(), 0);
    assert.equal(await page.evaluate(() => document.body.style.overflow), '');
    assert.deepEqual(errors, []);
  });
});
