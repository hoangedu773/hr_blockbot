// TEMPORARY evidence script for Wave 2-C (5.1 / 5.3 / 5.4). Deleted after the run.
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, '../dist-verify');

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };

const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/' || reqPath === '') reqPath = '/index.html';
  const filePath = path.join(distDir, reqPath);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    res.writeHead(200, { 'Content-Type': mime[path.extname(filePath)] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    fs.createReadStream(path.join(distDir, 'index.html')).pipe(res);
  }
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });

const login = async (page) => {
  await page.getByRole('button', { name: /Get Started/i }).click();
  await page.getByLabel('Email', { exact: true }).fill('employee@guta.test');
  await page.getByLabel('Mật khẩu', { exact: true }).fill('fixture-password');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.getByRole('heading', { name: 'Chào mừng HR-BlockBot AI Copilot' }).waitFor({ timeout: 10000 });
};

const stubLogin = (page) => page.route('**/api/auth/login', (route) => route.fulfill({
  status: 200,
  json: { accessToken: 'fixture-token', user: { id: 'fixture-user', role: 'Employee' } },
}));

try {
  // (a) anonymous cold load with the API offline: no /auth/refresh request at all
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const apiRequests = [];
    const consoleErrors = [];
    page.on('request', (request) => { if (request.url().includes('/api/')) apiRequests.push(request.url()); });
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /Get Started/i }).waitFor();
    await page.waitForTimeout(1500);
    console.log('[a] API requests on anonymous load:', JSON.stringify(apiRequests));
    console.log('[a] console errors:', JSON.stringify(consoleErrors));
    await context.close();
  }

  // (a2) returning session (hint present) still refreshes
  {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.addInitScript(() => window.localStorage.setItem('guta_session_hint', '1'));
    const refreshCalls = [];
    page.on('request', (request) => { if (request.url().includes('/auth/refresh')) refreshCalls.push(request.url()); });
    await page.route('**/api/auth/refresh', (route) => route.fulfill({ status: 200, json: { accessToken: null } }));
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    console.log('[a2] refresh calls with a session hint:', refreshCalls.length);
    await context.close();
  }

  // (b) offline chat: static banner appears, and clears after a successful reply
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await stubLogin(page);
    await page.route('**/api/chat', (route) => route.abort('failed'));
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await login(page);
    await page.getByRole('textbox', { name: 'Tin nhắn cho Guta AI' }).fill('Chi nhánh nào đang thiếu người?');
    await page.keyboard.press('Enter');
    await page.getByText('Demo an toàn · Dịch vụ AI chưa khả dụng', { exact: true }).waitFor({ timeout: 15000 });
    console.log('[b] banner occurrences:', await page.getByTestId('chat-service-unavailable').count());
    console.log('[b] banner text:', JSON.stringify(await page.getByTestId('chat-service-unavailable').innerText()));

    await page.unroute('**/api/chat');
    await page.route('**/api/chat', (route) => route.fulfill({ status: 200, json: { reply: 'Đã kết nối lại.', citations: [] } }));
    await page.getByRole('textbox', { name: 'Tin nhắn cho Guta AI' }).fill('Thử lại');
    await page.keyboard.press('Enter');
    await page.getByText('Đã kết nối lại.').waitFor({ timeout: 15000 });
    console.log('[b] banner occurrences after a successful reply:', await page.getByTestId('chat-service-unavailable').count());
    await context.close();
  }

  // (c) server-provided javascript: URLs never reach href/src
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await stubLogin(page);
    await page.route('**/api/chat', (route) => route.fulfill({ status: 200, json: {
      reply: 'Tài liệu đính kèm',
      attachments: [
        { title: 'Độc hại', type: 'image', url: 'javascript:alert(1)' },
        { title: 'PDF chuẩn', type: 'pdf', url: 'https://example.com/a.pdf' },
        { title: 'PDF nội bộ', type: 'pdf', url: '/assets/a.pdf' },
        { title: 'Data URI', type: 'image', url: 'data:text/html,<script>alert(1)</script>' },
      ],
    } }));
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await login(page);
    await page.getByRole('textbox', { name: 'Tin nhắn cho Guta AI' }).fill('Cho tôi biểu mẫu');
    await page.keyboard.press('Enter');
    await page.getByText('Tài liệu đính kèm', { exact: true }).waitFor({ timeout: 15000 });
    const chat = page.getByTestId('chat-page');
    const hrefs = await chat.locator('a').evaluateAll((links) => links.map((link) => link.getAttribute('href')));
    const srcs = await chat.locator('img').evaluateAll((images) => images.map((image) => image.getAttribute('src')));
    console.log('[c] href values:', JSON.stringify(hrefs));
    console.log('[c] src values:', JSON.stringify(srcs));
    console.log('[c] attachment titles rendered:', JSON.stringify(await chat.getByText(/^(Độc hại|PDF chuẩn|PDF nội bộ|Data URI)$/).allInnerTexts()));
    console.log('[c] empty href/src count:', await chat.locator('a[href=""], img[src=""]').count());
    console.log('[c] "javascript:" occurrences in page.content():', ((await page.content()).match(/javascript:/g) || []).length);
    await context.close();
  }
} finally {
  await browser.close();
  server.close();
}
