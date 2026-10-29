// TEMPORARY debug script. Deleted after use.
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, '../dist-verify');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };

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
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (error) => console.log('[pageerror]', error.message));
await page.route('**/api/auth/login', (route) => route.fulfill({ status: 200, json: { accessToken: 't', user: { id: 'u', role: 'Employee' } } }));
await page.route('**/api/employees**', (route) => route.fulfill({ status: 200, json: {
  items: [{ employeeId: 'EMP-001', fullName: 'Trương Quốc Thái', level: 'Senior', department: 'Guta Quận 1', skills: ['Barista'], status: 'active' }],
  paging: { page: 1, limit: 20, totalItems: 1, totalPages: 1, hasNext: false, hasPrev: false },
} }));
await page.route('**/api/chat', (route) => route.fulfill({ status: 200, json: { reply: 'ok', citations: [] } }));
await page.goto(baseUrl, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: /Get Started/i }).click();
await page.getByLabel('Email', { exact: true }).fill('employee@guta.test');
await page.getByLabel('Mật khẩu', { exact: true }).fill('fixture-password');
await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
await page.getByRole('button', { name: 'Quay lại Vận Hành (CRM)', exact: true }).click();
await page.getByRole('table').waitFor({ state: 'visible' });
await page.locator('nav a').filter({ hasText: 'Copilot' }).click();
await page.getByPlaceholder('Hỏi AI về ca trực, nhân sự, tiền két...').fill('Kiểm tra quy định');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
await page.locator('nav [data-section="employees"]').click();
await page.waitForTimeout(1500);
const info = await page.evaluate(() => {
  const portals = [...document.querySelectorAll('#crm-custom-view-portal')];
  return {
    portalCount: portals.length,
    mains: document.querySelectorAll('main').length,
    details: portals.map((portal) => {
      const chain = [];
      for (let node = portal; node && node !== document.documentElement; node = node.parentElement) {
        const style = getComputedStyle(node);
        chain.push([node.tagName + (node.id ? `#${node.id}` : '') + (node.className ? `.${String(node.className).slice(0, 40)}` : ''), style.display, style.visibility, style.height, Math.round(node.getBoundingClientRect().height)]);
      }
      return { text: portal.innerText.slice(0, 60), chain };
    }),
  };
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
server.close();
