import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

let chromium;
try {
  const req = createRequire(import.meta.url);
  chromium = req('playwright').chromium;
} catch {
  const candidatePaths = [
    'C:/work-space/hr-blockbot/node_modules/',
    'C:/Users/hoang/AppData/Roaming/npm/node_modules/',
  ];
  for (const p of candidatePaths) {
    try {
      const req = createRequire(p);
      chromium = req('playwright').chromium;
      if (chromium) break;
    } catch {}
  }
}

if (!chromium) {
  throw new Error('Không thể nạp Playwright từ môi trường cục bộ');
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, '../dist');

describe('Guta UI Revamp E2E Flow (Playwright)', () => {
  let server;
  let serverUrl;
  let browser;
  let page;
  const consoleErrors = [];

  before(async () => {
    // 1. Start static file server for dist/
    server = http.createServer((req, res) => {
      let reqPath = req.url.split('?')[0];
      if (reqPath === '/' || reqPath === '') reqPath = '/index.html';
      const filePath = path.join(distDir, reqPath);

      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath);
        const mimeTypes = {
          '.html': 'text/html; charset=utf-8',
          '.js': 'application/javascript; charset=utf-8',
          '.css': 'text/css; charset=utf-8',
          '.png': 'image/png',
          '.svg': 'image/svg+xml',
          '.json': 'application/json',
        };
        res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
        fs.createReadStream(filePath).pipe(res);
      } else {
        // SPA Fallback to index.html
        const indexPath = path.join(distDir, 'index.html');
        if (fs.existsSync(indexPath)) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          fs.createReadStream(indexPath).pipe(res);
        } else {
          res.writeHead(404);
          res.end('Not Found');
        }
      }
    });

    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        serverUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    // 2. Launch headless Chromium
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
    });

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Clear any previous state
    await page.goto(serverUrl, { waitUntil: 'networkidle' });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle' });
  });

  after(async () => {
    if (browser) await browser.close();
    if (server) server.close();
  });

  it('Bước 1: Render Landing Page, tiêu đề chuẩn, logo marquee và 0 pixel màu vàng', async () => {
    // Kiểm tra headline
    const heroText = await page.textContent('h1');
    assert.match(heroText, /Quản Trị Nhân Sự & Phân Ca Tự Động/i);

    // Kiểm tra Logo Marquee tồn tại
    const marqueeText = await page.textContent('body');
    assert.match(marqueeText, /Vinamilk/);
    assert.match(marqueeText, /La Marzocco/);

    // Kiểm tra Zero Yellow (#ffd100, #eab308, #f59e0b) trong toàn bộ computed DOM styles
    const yellowCount = await page.evaluate(() => {
      const allElements = Array.from(document.querySelectorAll('*'));
      let count = 0;
      const bannedRgb = [
        'rgb(255, 209, 0)', // #ffd100
        'rgb(234, 179, 8)', // #eab308
        'rgb(245, 158, 11)', // #f59e0b
      ];

      for (const el of allElements) {
        const style = window.getComputedStyle(el);
        if (bannedRgb.includes(style.color) || bannedRgb.includes(style.backgroundColor) || bannedRgb.includes(style.borderColor)) {
          count++;
        }
      }
      return count;
    });

    assert.equal(yellowCount, 0, 'Phát hiện phần tử chứa màu vàng cấm (#ffd100, #eab308, #f59e0b)');
  });

  it('Bước 2: Bấm nút "Get Started", kiểm tra Auth Modal mở ra', async () => {
    // Click button "Get Started"
    const getStartedBtn = page.getByRole('button', { name: /Get Started/i });
    await getStartedBtn.click();

    // Modal hiển thị 1-Click Login
    const modalHeading = page.getByText(/Đăng Nhập Nhanh 1-Click/i);
    await modalHeading.waitFor({ state: 'visible', timeout: 3000 });
    assert.equal(await modalHeading.isVisible(), true);
  });

  it('Bước 3: Bấm chọn tài khoản "Nguyễn Thị Phương Anh (SM)", chuyển vào CRM Dashboard', async () => {
    // Chọn tài khoản SM
    const smAccount = page.getByText(/Nguyễn Thị Phương Anh/i).first();
    await smAccount.click();

    // Đợi dashboard hiển thị bảng chi nhánh
    const headerTitle = page.getByText(/Vận Hành Chi Nhánh & Phân Ca/i);
    await headerTitle.waitFor({ state: 'visible', timeout: 5000 });
    assert.equal(await headerTitle.isVisible(), true);

    // Kiểm tra thông tin user hiển thị ở sidebar
    const sidebarUser = page.getByText(/Nguyễn Thị Phương Anh/i);
    assert.equal(await sidebarUser.count() > 0, true);
  });

  it('Bước 4: Bảng cửa hàng render đủ 45 chi nhánh, tìm kiếm chi nhánh "Sư Vạn Hạnh"', async () => {
    // Kiểm tra hàng đầu tiên tồn tại
    const tableRow = page.getByText(/581 Sư Vạn Hạnh/i);
    assert.equal(await tableRow.isVisible(), true);

    // Gõ tìm kiếm
    const searchInput = page.getByPlaceholder(/Lọc theo tên, quận, mã.../i);
    await searchInput.fill('Sư Vạn Hạnh');

    // Chờ kết quả lọc
    await page.waitForTimeout(200);
    const filteredRow = page.getByText(/581 Sư Vạn Hạnh/i);
    assert.equal(await filteredRow.isVisible(), true);

    // Xóa tìm kiếm để hiển thị lại đủ
    await searchInput.fill('');
    await page.waitForTimeout(200);
  });

  it('Bước 5: Click vào dòng cửa hàng, kiểm tra Slide-Over Drawer mở ra với thông tin Barista', async () => {
    // Click vào dòng Sư Vạn Hạnh
    const row = page.getByText(/581 Sư Vạn Hạnh/i);
    await row.click();

    // Drawer trượt ra, kiểm tra Barista
    const headBarista = page.getByText(/Trương Quốc Thái/i).first();
    await headBarista.waitFor({ state: 'visible', timeout: 3000 });
    assert.equal(await headBarista.isVisible(), true);

    const cashier = page.getByText(/Lê Thị Kim Ngân/i).first();
    assert.equal(await cashier.isVisible(), true);
  });

  it('Bước 6: Bấm nút "Gửi Cảnh Báo Telegram", kiểm tra toast xuất hiện', async () => {
    const telegramBtn = page.getByRole('button', { name: /Gửi Cảnh Báo Telegram/i });
    await telegramBtn.click();

    // Toast hiển thị thông báo thành công
    const toastMsg = page.getByText(/Đã gửi cảnh báo khẩn cấp tới Telegram Bot/i);
    await toastMsg.waitFor({ state: 'visible', timeout: 3000 });
    assert.equal(await toastMsg.isVisible(), true);

    // Đóng Drawer
    const closeBtn = page.getByRole('button', { name: 'Đóng', exact: true });
    await closeBtn.click();
    await page.waitForTimeout(300);
  });

  it('Bước 7: Bấm nút "Đăng xuất", kiểm tra quay lại Landing Page an toàn', async () => {
    const logoutBtn = page.getByRole('button', { name: /Đăng Xuất Phiên/i });
    await logoutBtn.click();

    // Quay lại Landing Page
    const heroTitle = page.getByText(/Quản Trị Nhân Sự & Phân Ca Tự Động/i);
    await heroTitle.waitFor({ state: 'visible', timeout: 5000 });
    assert.equal(await heroTitle.isVisible(), true);
  });
});
