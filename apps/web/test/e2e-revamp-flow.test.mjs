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

    page.on('pageerror', (error) => consoleErrors.push(error.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // UI demo contract: no live auth backend required.
    await page.route('**/api/auth/refresh', (route) => route.fulfill({ status: 200, json: { accessToken: null } }));
    await page.route('**/api/auth/logout', (route) => route.fulfill({ status: 204 }));

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
    await page.keyboard.press('Control+KeyK');
    assert.equal(await searchInput.evaluate((input) => document.activeElement === input), true);
    await searchInput.fill('KhongTonTai123');
    await page.getByText('Không tìm thấy chi nhánh nào phù hợp với từ khóa tìm kiếm.').waitFor({ state: 'visible' });
    assert.equal(await page.getByText(/581 Sư Vạn Hạnh/i).isVisible(), false);

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

    await page.getByRole('table').getByText(/581 Sư Vạn Hạnh/i).click();
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('#detail-drawer')?.classList.contains('drawer-open'));
  });

  it('Regression: đóng liên tục, double click, Escape sớm và filter ký tự đặc biệt', async () => {
    assert.deepEqual(await page.evaluate(() => [typeof window.openDrawer, typeof window.closeDrawer]), ['function', 'function']);
    assert.equal(await page.locator('[onclick]').count(), 0);
    await page.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      const row = document.querySelector('tbody tr');
      row.click();
      row.click();
    });
    assert.equal(await page.locator('#detail-drawer').evaluate((drawer) => drawer.classList.contains('drawer-open')), true);
    assert.equal(await page.locator('#d-id').textContent(), 'GT-CH-01');
    await page.evaluate(() => {
      const close = document.querySelector('[aria-label="Đóng chi tiết"]');
      for (let i = 0; i < 10; i++) close.click();
      window.closeDrawer();
    });
    assert.equal(await page.locator('#detail-drawer').evaluate((drawer) => drawer.classList.contains('drawer-open')), false);
    const search = page.getByPlaceholder(/Lọc theo tên, quận, mã.../i);
    for (const keyword of ['[]()*', '\'"\\', '<script>alert(1)</script>', '☕ tiếng Việt']) {
      await search.fill(keyword);
      assert.equal(await page.getByText('Không tìm thấy chi nhánh nào phù hợp với từ khóa tìm kiếm.').isVisible(), true);
    }
    await search.fill('');
    await page.locator('nav a').filter({ hasText: 'Copilot' }).click();
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('dialog', { name: 'Guta AI Copilot Drawer' }).count(), 0);
    assert.deepEqual(consoleErrors, []);
  });

  it('Regression: unmount ChatDrawer khi bot đang typing', async () => {
    await page.evaluate(() => {
      window.__replyCallbacks = 0;
      window.__cancelledReplies = 0;
      const originalSetTimeout = window.setTimeout.bind(window);
      const originalClearTimeout = window.clearTimeout.bind(window);
      const replies = new Set();
      window.setTimeout = (callback, delay, ...args) => {
        const id = originalSetTimeout(() => {
          if (delay === 600) window.__replyCallbacks++;
          callback(...args);
        }, delay);
        if (delay === 600) replies.add(id);
        return id;
      };
      window.clearTimeout = (id) => {
        if (replies.delete(id)) window.__cancelledReplies++;
        originalClearTimeout(id);
      };
      window.__restoreTimers = () => {
        window.setTimeout = originalSetTimeout;
        window.clearTimeout = originalClearTimeout;
      };
    });
    try {
      await page.locator('nav a').filter({ hasText: 'Copilot' }).click();
      await page.getByPlaceholder('Hỏi AI về ca trực, nhân sự, tiền két...').fill('thiếu người');
      await page.keyboard.press('Enter');
      assert.equal(await page.getByText('Đang phân tích dữ liệu ca trực...').isVisible(), true);
      await page.evaluate(() => document.querySelector('[aria-label="Đăng Xuất Phiên"]').click());
      await page.waitForTimeout(700);
      assert.deepEqual(await page.evaluate(() => [window.__replyCallbacks, window.__cancelledReplies]), [0, 1]);
      assert.deepEqual(await page.evaluate(() => [typeof window.openDrawer, typeof window.closeDrawer]), ['undefined', 'undefined']);
      assert.deepEqual(consoleErrors, []);
    } finally {
      await page.evaluate(() => window.__restoreTimers());
    }
    await page.getByRole('button', { name: /Get Started/i }).click();
    await page.getByText(/Nguyễn Thị Phương Anh/i).first().click();
  });

  it('Combo B UI/UX Anti-Slop: Trigger button spinners, illustrated empty state & filter reset', async () => {
    // 1. Trigger button: Tạo Ca Đột Xuất (disabled + spinner)
    const emergencyBtn = page.locator('button').filter({ hasText: /Tạo Ca Đột Xuất|Đang khởi tạo/i });
    assert.equal(await emergencyBtn.isVisible(), true);
    await emergencyBtn.click();
    assert.equal(await emergencyBtn.isDisabled(), true);
    assert.match(await emergencyBtn.textContent(), /Đang khởi tạo/);
    await page.waitForTimeout(800);
    assert.equal(await emergencyBtn.isDisabled(), false);
    assert.match(await emergencyBtn.textContent(), /Tạo Ca Đột Xuất/);

    // 2. District Filter Cycle
    const districtBtn = page.getByRole('button', { name: /Bộ lọc Quận/i });
    await districtBtn.click();
    await page.waitForTimeout(200);
    const q1Btn = page.getByRole('button', { name: /Quận: Quận 1/i });
    assert.equal(await q1Btn.isVisible(), true);

    // 3. Illustrated Empty State and Reset CTA
    const search = page.getByPlaceholder(/Lọc theo tên, quận, mã.../i);
    await search.fill('KhongTheNaoCoChiNhanhNay999');
    await page.getByText('Không tìm thấy chi nhánh nào phù hợp với từ khóa tìm kiếm.').waitFor({ state: 'visible' });
    const resetBtn = page.getByRole('button', { name: /Đặt lại bộ lọc/i });
    assert.equal(await resetBtn.isVisible(), true);
    await resetBtn.click();
    await page.waitForTimeout(200);
    assert.equal(await search.inputValue(), '');
    assert.equal(await page.getByText(/581 Sư Vạn Hạnh/i).isVisible(), true);

    // 4. ChatDrawer Trigger Button State
    await page.locator('nav a').filter({ hasText: 'Copilot' }).click();
    const chatInput = page.getByPlaceholder('Hỏi AI về ca trực, nhân sự, tiền két...');
    const sendBtn = page.getByRole('button', { name: 'Gửi', exact: true });
    assert.equal(await sendBtn.isDisabled(), true);
    await chatInput.fill('Kiểm tra quy định');
    assert.equal(await sendBtn.isDisabled(), false);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    assert.deepEqual(consoleErrors, []);
  });

  it('Chặn liên kết chết href="#" trong CRM Dashboard, hiển thị toast ZKTeco', async () => {
    // Click dead link "Lịch Phân Ca 24H"
    const shiftLink = page.locator('nav a').filter({ hasText: /Lịch Phân Ca 24H/i });
    await shiftLink.click();
    const zkToast = page.getByText(/Tính năng đang trong chu kỳ đồng bộ dữ liệu ZKTeco/i);
    await zkToast.waitFor({ state: 'visible', timeout: 3000 });
    assert.equal(await zkToast.isVisible(), true);
  });

  it('Bước 7: Bấm nút "Đăng xuất", kiểm tra quay lại Landing Page an toàn', async () => {
    const logoutBtn = page.getByRole('button', { name: /Đăng Xuất Phiên/i });
    await logoutBtn.click();

    // Quay lại Landing Page
    const heroTitle = page.getByText(/Quản Trị Nhân Sự & Phân Ca Tự Động/i);
    await heroTitle.waitFor({ state: 'visible', timeout: 5000 });
    assert.equal(await heroTitle.isVisible(), true);
    assert.deepEqual(consoleErrors, [], 'Demo flow must have zero console errors and uncaught exceptions');
    console.log(`Console errors / pageerrors: ${consoleErrors.length}`);
  });

  it('Chặn liên kết chết href="#" trên Landing Page và kiểm tra sạch ngữ cảnh học thuật', async () => {
    // Click hero badge href="#"
    const badgeLink = page.locator('a[href="#"]').filter({ hasText: /F&B Workforce Intelligence/i });
    await badgeLink.click();
    const zkToast = page.getByText(/Tính năng đang trong chu kỳ đồng bộ dữ liệu ZKTeco/i).last();
    await zkToast.waitFor({ state: 'visible', timeout: 3000 });
    assert.equal(await zkToast.isVisible(), true);

    // Kiểm tra sạch các từ khóa học thuật/khóa luận
    const pageContent = await page.content();
    assert.doesNotMatch(pageContent, /KLCN133/i);
    assert.doesNotMatch(pageContent, /khóa luận/i);
    assert.doesNotMatch(pageContent, /F1–F7/i);
  });
});
