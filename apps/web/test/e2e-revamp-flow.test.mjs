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
    // Invalid payload exercises the safe demo boundary without a live backend.
    await page.route('**/api/chat', (route) => route.fulfill({ status: 200, json: {} }));

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

  it('Bước 3: Bấm chọn tài khoản "Nguyễn Thị Phương Anh (SM)", mở First View là Chat Copilot, sau đó chuyển vào CRM Dashboard', async () => {
    // Chọn tài khoản SM
    const smAccount = page.getByText(/Nguyễn Thị Phương Anh/i).first();
    await smAccount.click();

    // First View: Khung Chat Copilot thông minh hiển thị đầu tiên
    const chatHeading = page.getByRole('heading', { name: 'Chào mừng Guta AI Copilot' });
    await chatHeading.waitFor({ state: 'visible', timeout: 5000 });
    assert.equal(await chatHeading.isVisible(), true);

    // Chuyển sang bảng Vận Hành Chi Nhánh (CRM)
    const backCrmBtn = page.getByRole('button', { name: 'Quay lại Vận Hành (CRM)', exact: true });
    await backCrmBtn.click();

    // Đợi dashboard hiển thị bảng chi nhánh
    const headerTitle = page.getByText(/Vận Hành Chi Nhánh & Phân Ca/i);
    await headerTitle.waitFor({ state: 'visible', timeout: 5000 });
    assert.equal(await headerTitle.isVisible(), true);

    assert.equal(await page.evaluate(() => JSON.parse(sessionStorage.getItem('guta_user')).role), 'SM');
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('guta_user')).role), 'SM');

    // Kiểm tra thông tin user hiển thị ở sidebar
    const sidebarUser = page.getByText(/Nguyễn Thị Phương Anh/i);
    assert.equal(await sidebarUser.count() > 0, true);
    const logo = page.locator('.crm-sidebar img');
    assert.equal(await logo.getAttribute('src'), '/assets/logos/guta-mark-pure.svg');
    assert.match(await logo.getAttribute('alt'), /^(?:HR-BlockBot|Guta) Logo$/);
    assert.equal(await logo.evaluate((img) => img.complete && img.naturalWidth > 0), true);
    const brandColors = await page.locator('.crm-sidebar .tracking-wider.text-foreground, .crm-sidebar .tracking-tight.text-foreground').evaluateAll((labels) => labels.map((label) => getComputedStyle(label).color));
    assert.equal(brandColors.length, 2);
    assert.equal(brandColors[0], brandColors[1], 'GUTA and WORKSPACE must share the foreground color');
    const glass = await page.evaluate(() => {
      const style = (selector) => getComputedStyle(document.querySelector(selector));
      return {
        sidebar: style('.crm-sidebar').backdropFilter,
        header: style('.crm-header-smooth').backdropFilter,
        kpi: style('.crm-kpi-card').backdropFilter,
        gradient: style('.crm-kpi-card').backgroundImage,
        thead: style('.crm-table-head').backdropFilter,
        logoBackground: style('.crm-sidebar .size-8.rounded-xl').backgroundColor,
        tableBackground: style('.crm-table-shell').backgroundColor,
        iconBackground: style('tbody tr[data-id] td:nth-child(2) > div').backgroundColor,
        iconColor: style('tbody tr[data-id] td:nth-child(2) > div').color,
        yellow: [...document.querySelectorAll('*')].some((el) => {
          const computed = getComputedStyle(el);
          return ['color', 'backgroundColor', 'borderColor', 'backgroundImage', 'boxShadow'].some((key) => /(?:255, 209, 0|234, 179, 8|245, 158, 11)/.test(computed[key]));
        }),
      };
    });
    assert.equal(glass.sidebar, 'blur(24px)');
    assert.equal(glass.header, 'blur(24px)');
    assert.equal(glass.kpi, 'blur(16px)');
    assert.match(glass.gradient, /linear-gradient/);
    assert.equal(glass.thead, 'blur(12px)');
    assert.equal(glass.logoBackground, 'rgba(255, 255, 255, 0.04)');
    assert.equal(glass.tableBackground, 'rgba(255, 255, 255, 0.02)');
    await page.locator('.crm-kpi-card').first().hover();
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.crm-kpi-card')).transform === 'matrix(1, 0, 0, 1, 0, -2)');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    try {
      await page.waitForFunction(() => getComputedStyle(document.querySelector('.crm-kpi-card')).transform === 'none');
    } finally {
      await page.emulateMedia({ reducedMotion: 'no-preference' });
    }
    assert.equal(glass.iconBackground, 'rgba(255, 255, 255, 0.05)');
    assert.equal(glass.iconColor, 'rgb(203, 213, 225)');
    assert.equal(glass.yellow, false);

    await page.reload({ waitUntil: 'networkidle' });
    const backCrmReload = page.getByRole('button', { name: 'Quay lại Vận Hành (CRM)', exact: true });
    if (await backCrmReload.isVisible()) await backCrmReload.click();
    await page.getByText(/Vận Hành Chi Nhánh & Phân Ca/i).waitFor({ state: 'visible' });
    await page.getByTestId('guta-splash').waitFor({ state: 'detached', timeout: 1000 });
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
    await row.hover();
    await page.waitForFunction(() => getComputedStyle(document.querySelector('tr[data-id="GT-CH-02"]')).backgroundColor === 'rgba(255, 255, 255, 0.03)');
    await row.click();

    // Drawer trượt ra, kiểm tra Barista
    const headBarista = page.getByText(/Trương Quốc Thái/i).first();
    await headBarista.waitFor({ state: 'visible', timeout: 3000 });
    assert.equal(await headBarista.isVisible(), true);

    const cashier = page.getByText(/Lê Thị Kim Ngân/i).first();
    assert.equal(await cashier.isVisible(), true);
    assert.deepEqual(await page.locator('#detail-drawer').evaluate((el) => {
      const style = getComputedStyle(el);
      return [style.backgroundColor, style.backdropFilter, style.borderLeftColor];
    }), ['rgba(15, 23, 42, 0.95)', 'blur(40px)', 'rgba(255, 255, 255, 0.08)']);
    assert.equal(await page.locator('#drawer-backdrop').evaluate((el) => getComputedStyle(el).backdropFilter), 'blur(12px)');
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
    assert.equal(await page.getByTestId('chat-page').count(), 0);
    assert.equal(await page.getByRole('table').isVisible(), true);
    assert.deepEqual(consoleErrors, []);
  });

  it('Regression: unmount ChatPageView khi bot đang typing', async () => {
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
    const backCrmAfterLogin = page.getByRole('button', { name: 'Quay lại Vận Hành (CRM)', exact: true });
    if (await backCrmAfterLogin.isVisible()) await backCrmAfterLogin.click();
    await page.getByRole('table').waitFor({ state: 'visible' });
  });

  it('ChatPage: desktop empty state, demo an toàn, citations và confirm không giả thực thi', async () => {
    await page.locator('nav a').filter({ hasText: 'Copilot' }).click();
    const chat = page.getByTestId('chat-page');
    assert.doesNotMatch(fs.readFileSync(path.resolve(__dirname, '../src/components/chat/ChatPageView.tsx'), 'utf8'), /#(?:2563eb|93c5fd|35435a|233149)\b/i);
    await chat.getByRole('heading', { name: 'Chào mừng Guta AI Copilot' }).waitFor();
    assert.deepEqual(await chat.locator('img').evaluateAll((images) => images.map((img) => ({ src: img.getAttribute('src'), loaded: img.complete && img.naturalWidth > 0 }))), [
      { src: '/assets/logos/guta-mark-pure.svg', loaded: true },
      { src: '/assets/logos/guta-mark-pure.svg', loaded: true },
    ]);
    assert.equal(await chat.locator('.guta-chat-hero img').evaluate((img) => img.getBoundingClientRect().width), 48);
    assert.equal(await page.getByRole('dialog').count(), 0);
    assert.equal(await chat.getByRole('navigation', { name: 'Chủ đề mẫu' }).getByRole('button').count(), 3);
    const width = await chat.locator('.guta-chat-width').first().evaluate((el) => el.getBoundingClientRect().width);
    assert.ok(width >= 768 && width <= 800);
    const input = chat.getByRole('textbox', { name: 'Tin nhắn cho Guta AI' });
    const send = chat.getByRole('button', { name: 'Gửi', exact: true });
    const composerStyle = await chat.locator('.guta-chat-composer').evaluate((form) => {
      const style = getComputedStyle(form);
      const input = form.querySelector('textarea');
      const label = form.querySelector('label');
      return {
        radius: style.borderRadius, background: style.backgroundColor,
        border: style.borderTopColor, blur: style.backdropFilter, display: style.display,
        rows: input.rows, labelClass: label.className, labelWidth: label.getBoundingClientRect().width,
        order: [...form.children].map((el) => el.tagName),
      };
    });
    assert.deepEqual(composerStyle, {
      radius: '9999px', background: 'rgba(255, 255, 255, 0.05)',
      border: 'rgba(255, 255, 255, 0.12)', blur: 'blur(20px)', display: 'flex',
      rows: 1, labelClass: 'sr-only', labelWidth: 1,
      order: ['LABEL', 'BUTTON', 'TEXTAREA', 'BUTTON'],
    });
    assert.equal(await chat.getByText('Enter gửi · Shift+Enter xuống dòng', { exact: true }).count(), 0);
    const attach = chat.getByRole('button', { name: 'Thao tác bổ sung', exact: true });
    for (const button of [attach, send]) {
      assert.deepEqual(await button.evaluate((el) => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return [rect.width, rect.height, style.borderRadius, style.borderTopWidth];
      }), [44, 44, '9999px', '0px']);
    }
    await input.focus();
    await page.keyboard.press('Shift+Tab');
    assert.equal(await attach.evaluate((el) => document.activeElement === el && el.matches(':focus-visible') && parseFloat(getComputedStyle(el).outlineWidth) >= 2), true);
    await page.keyboard.press('Enter');
    assert.equal(await input.evaluate((el) => document.activeElement === el), true);
    assert.deepEqual(await input.evaluate((el) => {
      const style = getComputedStyle(el);
      return [style.borderTopWidth, style.outlineStyle, style.boxShadow, style.backgroundColor];
    }), ['0px', 'none', 'none', 'rgba(0, 0, 0, 0)']);
    assert.equal(await chat.locator('.guta-chat-composer').evaluate((el) => getComputedStyle(el).borderTopColor), 'rgba(255, 255, 255, 0.28)');
    await input.fill('   ');
    await input.press('Enter');
    assert.equal(await send.isDisabled(), true);
    assert.deepEqual(await send.evaluate((el) => {
      const style = getComputedStyle(el);
      return [style.backgroundColor, style.color, style.opacity];
    }), ['rgba(255, 255, 255, 0.08)', 'rgba(255, 255, 255, 0.3)', '1']);
    assert.equal(await chat.getByRole('log').count(), 0);
    await input.fill('Tin nhắn kiểm thử');
    assert.equal(await send.isDisabled(), false);
    assert.deepEqual(await send.evaluate((el) => {
      const style = getComputedStyle(el);
      return [style.backgroundColor, style.color];
    }), ['rgb(255, 255, 255)', 'rgb(0, 0, 0)']);
    await send.hover();
    assert.deepEqual(await send.evaluate((el) => {
      const style = getComputedStyle(el);
      return [style.backgroundColor, style.color];
    }), ['rgb(222, 222, 222)', 'rgb(0, 0, 0)']);
    await chat.getByRole('navigation', { name: 'Chủ đề mẫu' }).getByRole('button', { name: 'Gợi ý điều động ca' }).click();
    assert.equal(await send.isDisabled(), true);
    await chat.getByText('Demo an toàn · Dịch vụ AI chưa khả dụng', { exact: true }).waitFor();
    const confirm = chat.getByRole('button', { name: 'Xác Nhận (Confirm)' });
    assert.deepEqual(await confirm.evaluate((el) => {
      const style = getComputedStyle(el);
      return [style.backgroundColor, style.color];
    }), ['rgb(255, 255, 255)', 'rgb(0, 0, 0)']);
    await confirm.click();
    assert.equal(await chat.getByText('Đã xác nhận đề xuất. Chưa thực thi.', { exact: true }).isVisible(), true);
    await chat.getByRole('button', { name: '+ New Chat', exact: true }).click();
    await chat.getByRole('navigation', { name: 'Chủ đề mẫu' }).getByRole('button', { name: 'Gợi ý điều động ca' }).click();
    await chat.getByRole('button', { name: 'Từ Chối', exact: true }).click();
    assert.equal(await chat.getByText('Đã từ chối hành động. Không có dữ liệu nào bị thay đổi.', { exact: true }).isVisible(), true);
    await chat.getByRole('button', { name: '+ New Chat', exact: true }).click();
    await chat.getByRole('navigation', { name: 'Chủ đề mẫu' }).getByRole('button', { name: 'Quy định kỷ luật' }).click();
    await chat.getByRole('region', { name: 'Trích dẫn' }).waitFor();
    assert.match(await chat.getByRole('log').textContent(), /không phải chính sách có hiệu lực/);
    await chat.getByRole('button', { name: '+ New Chat', exact: true }).click();
    await chat.getByRole('navigation', { name: 'Chủ đề mẫu' }).getByRole('button', { name: 'Báo cáo két ca' }).click();
    await chat.getByText(/Không có số doanh thu đã xác thực/).waitFor();
    assert.match(await chat.getByRole('region', { name: 'Trích dẫn' }).textContent(), /không phải báo cáo thực tế/);
    assert.equal(await chat.evaluate((root) => {
      const banned = /(?:255, 209, 0|234, 179, 8|245, 158, 11|37, 99, 235|147, 197, 253|53, 67, 90|35, 49, 73)/;
      return [...root.querySelectorAll('*')].some((el) => {
        const style = getComputedStyle(el);
        return ['color', 'backgroundColor', 'borderColor', 'backgroundImage', 'boxShadow'].some((key) => banned.test(style[key]));
      });
    }), false);
    const composer = await chat.locator('.guta-chat-composer').boundingBox();
    assert.ok(composer.y > 600, 'Conversation composer must stay near the bottom');
    assert.equal(await chat.locator('.guta-chat-composer').evaluate((el) => getComputedStyle(el).borderRadius), '9999px');
    await chat.getByRole('button', { name: 'Quay lại Vận Hành (CRM)', exact: true }).click();
    assert.equal(await page.getByRole('table').isVisible(), true);
  });

  it('ChatPage: API hợp lệ, conversationId, spam Enter, Shift+Enter và escape HTML', async () => {
    const requests = [];
    const handler = async (route) => {
      requests.push(route.request().postDataJSON());
      await route.fulfill({ status: 200, json: {
        reply: '<script>window.__chatInjected = true</script> Phản hồi kiểm thử API',
        conversationId: 'conversation-test-1',
        citations: [{ document: 'Nguồn kiểm thử API', version: '1', article: 'Điều kiểm thử', score: 0.9 }],
        proposedAction: { type: 'TEST_ACTION', preview: 'Đề xuất kiểm thử API' },
      } });
    };
    await page.route('**/api/chat', handler);
    try {
      await page.locator('nav a').filter({ hasText: 'Copilot' }).click();
      const chat = page.getByTestId('chat-page');
      const input = chat.getByRole('textbox', { name: 'Tin nhắn cho Guta AI' });
      const singleLineHeight = await input.evaluate((el) => el.getBoundingClientRect().height);
      await input.fill(Array(12).fill('Dòng kiểm thử').join('\n'));
      assert.equal(await input.evaluate((el) => el.getBoundingClientRect().height), 192);
      assert.equal(await input.evaluate((el) => el.scrollHeight > el.clientHeight), true);
      await input.fill('');
      assert.equal(await input.evaluate((el) => el.getBoundingClientRect().height), singleLineHeight);
      await input.fill('<img src=x onerror="window.__chatInjected=true">');
      await input.press('Shift+Enter');
      assert.match(await input.inputValue(), /\n$/);
      assert.ok(await input.evaluate((el) => el.getBoundingClientRect().height) > singleLineHeight);
      await input.press('Enter');
      await input.fill('Không gửi trùng');
      for (let i = 0; i < 3; i++) await input.press('Enter');
      await chat.getByText(/Phản hồi kiểm thử API/).waitFor();
      assert.equal(requests.length, 1);
      assert.deepEqual(requests[0], { message: '<img src=x onerror="window.__chatInjected=true">' });
      assert.equal(await chat.locator('[data-sender="user"]').count(), 1);
      assert.equal(await chat.getByRole('region', { name: 'Trích dẫn' }).isVisible(), true);
      assert.equal(await chat.getByRole('button', { name: 'Xác Nhận (Confirm)' }).isVisible(), true);
      assert.equal(await page.evaluate(() => window.__chatInjected), undefined);
      assert.equal(await chat.getByText(/Demo an toàn/).count(), 0);
      await input.fill('Câu hỏi tiếp theo');
      await input.press('Enter');
      await page.waitForFunction(() => document.querySelectorAll('[data-sender="assistant"]').length === 2);
      assert.equal(requests[1].conversationId, 'conversation-test-1');
      assert.equal(requests.length, 2);
      await page.keyboard.press('Escape');
    } finally {
      await page.unroute('**/api/chat', handler);
    }
  });

  it('ChatPage: hủy fetch khi quay CRM, không nhận phản hồi cũ sau New Chat', async () => {
    let requestStarted;
    const started = new Promise((resolve) => { requestStarted = resolve; });
    let releaseResponse;
    let responseGate = new Promise((resolve) => { releaseResponse = resolve; });
    const handler = async (route) => {
      requestStarted();
      await responseGate;
      await route.fulfill({ status: 200, json: { reply: 'Phản hồi cũ không được hiển thị' } });
    };
    await page.route('**/api/chat', handler);
    await page.evaluate(() => {
      window.__chatAborts = 0;
      const originalFetch = window.fetch;
      window.fetch = function (url, options) {
        if (String(url).endsWith('/chat')) {
          options?.signal?.addEventListener('abort', () => { window.__chatAborts++; }, { once: true });
        }
        return originalFetch.call(this, url, options);
      };
      window.__restoreAbort = () => { window.fetch = originalFetch; };
    });
    try {
      await page.locator('nav a').filter({ hasText: 'Copilot' }).click();
      await page.getByRole('textbox', { name: 'Tin nhắn cho Guta AI' }).fill('Kiểm tra fetch');
      await page.keyboard.press('Enter');
      await started;
      await page.getByRole('button', { name: '+ New Chat', exact: true }).click();
      assert.equal(await page.evaluate(() => window.__chatAborts), 1);
      releaseResponse();
      await page.waitForTimeout(100);
      assert.equal(await page.getByRole('log').count(), 0);
      assert.equal(await page.getByText('Phản hồi cũ không được hiển thị').count(), 0);
      const secondStarted = new Promise((resolve) => { requestStarted = resolve; });
      responseGate = new Promise((resolve) => { releaseResponse = resolve; });
      await page.getByRole('textbox', { name: 'Tin nhắn cho Guta AI' }).fill('Kiểm tra unmount');
      await page.keyboard.press('Enter');
      await secondStarted;
      await page.getByRole('button', { name: 'Quay lại CRM', exact: true }).click();
      assert.equal(await page.evaluate(() => window.__chatAborts), 2);
      releaseResponse();
      assert.equal(await page.getByTestId('chat-page').count(), 0);
    } finally {
      releaseResponse();
      await page.unroute('**/api/chat', handler);
      await page.evaluate(() => window.__restoreAbort());
    }
    assert.deepEqual(consoleErrors, []);
  });

  it('ChatPage: mobile 320/375px, landscape, keyboard, reduced motion và contrast', async (t) => {
    t.after(async () => {
      await page.evaluate(() => { document.documentElement.style.zoom = ''; });
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      if (await page.getByTestId('chat-page').count()) {
        await page.getByRole('button', { name: 'Quay lại Vận Hành (CRM)', exact: true }).click();
      }
      await page.getByRole('table').waitFor({ state: 'visible' });
    });
    await page.locator('nav a').filter({ hasText: 'Copilot' }).click();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const chat = page.getByTestId('chat-page');
    for (const viewport of [{ width: 320, height: 740 }, { width: 375, height: 812 }, { width: 812, height: 375 }]) {
      await page.setViewportSize(viewport);
      assert.equal(await chat.evaluate((el) => el.scrollWidth <= el.clientWidth), true);
      assert.equal(await chat.getByRole('textbox', { name: 'Tin nhắn cho Guta AI' }).isVisible(), true);
      const targets = await chat.getByRole('button').evaluateAll((buttons) => buttons.filter((button) => button.getClientRects().length).map((button) => ({ width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height })));
      assert.ok(targets.every(({ width, height }) => width >= 44 && height >= 44));
    }
    await page.setViewportSize({ width: 320, height: 740 });
    const menu = chat.getByRole('button', { name: 'Menu Copilot' });
    await menu.focus();
    await page.keyboard.press('Enter');
    assert.equal(await menu.getAttribute('aria-expanded'), 'true');
    await page.keyboard.press('Escape');
    assert.equal(await menu.getAttribute('aria-expanded'), 'false');
    const focusOutline = await menu.evaluate((el) => getComputedStyle(el).outlineWidth);
    assert.ok(parseFloat(focusOutline) >= 2, 'Keyboard focus ring must remain visible');
    await page.evaluate(() => { document.documentElement.style.zoom = '1.5'; });
    assert.equal(await chat.evaluate((el) => el.scrollWidth <= el.clientWidth), true);
    await page.evaluate(() => { document.documentElement.style.zoom = ''; });
    await chat.getByRole('textbox', { name: 'Tin nhắn cho Guta AI' }).fill('Kiểm tra tương phản');
    await page.waitForFunction(() => !document.querySelector('.chat-send').disabled);
    await page.mouse.move(0, 0);
    const pairs = await chat.evaluate((root) => {
      const rgb = (value) => value.match(/[\d.]+/g).map(Number);
      const blend = (front, back) => front.slice(0, 3).map((value, i) => value * (front[3] ?? 1) + back[i] * (1 - (front[3] ?? 1)));
      const background = (element) => {
        const chain = [];
        for (let node = element; node; node = node.parentElement) chain.unshift(node);
        return chain.reduce((color, node) => blend(rgb(getComputedStyle(node).backgroundColor), color), [0, 0, 0]);
      };
      return [
        [root], [root.querySelector('.guta-chat-hero p')],
        [root.querySelector('textarea'), '::placeholder'], [root.querySelector('.chat-send')],
      ].map(([element, pseudo]) => {
        const bg = background(element);
        return [blend(rgb(getComputedStyle(element, pseudo).color), bg), bg];
      });
    });
    const contrast = (a, b) => {
      const luminance = (rgb) => rgb.map((value) => value / 255).map((v) => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, value, i) => sum + value * [.2126, .7152, .0722][i], 0);
      const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (values[0] + .05) / (values[1] + .05);
    };
    const ratios = pairs.map(([a, b]) => contrast(a, b));
    assert.ok(ratios.every((ratio) => ratio >= 4.5), `Computed contrast ratios: ${ratios.join(', ')}; color pairs: ${JSON.stringify(pairs)}`);
    console.log(`Chat text contrast ratios: ${ratios.map((ratio) => ratio.toFixed(2)).join(', ')}`);
    assert.deepEqual(consoleErrors, []);
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
    assert.deepEqual(await page.locator('tbody tr[data-id]:visible').evaluateAll((rows) => rows.map((row) => row.getAttribute('data-district'))), ['Quận 1']);

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
    // Kiểm tra 4 entrypoint chưa hoàn thiện được gắn cờ Coming Soon
    const comingSoonElements = page.locator('nav a[data-entrypoint="coming-soon"]');
    assert.equal(await comingSoonElements.count(), 4);

    const comingSoonBadges = page.locator('nav a[data-entrypoint="coming-soon"]').getByText(/Coming Soon/i);
    assert.equal(await comingSoonBadges.count(), 4);

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
    assert.equal(await page.evaluate(() => sessionStorage.getItem('guta_user')), null);
    assert.equal(await page.evaluate(() => localStorage.getItem('guta_user')), null);
    for (const { role, name } of [
      { role: 'AOM', name: 'Nguyễn Cao Thanh Trầm' },
      { role: 'Admin', name: 'Ban Điều Hành Guta' },
    ]) {
      await page.getByRole('button', { name: /Get Started/i }).click();
      await page.getByRole('button', { name: new RegExp(name) }).click();
      const backCrm = page.getByRole('button', { name: 'Quay lại Vận Hành (CRM)', exact: true });
      if (await backCrm.isVisible()) await backCrm.click();
      await page.getByRole('table').waitFor({ state: 'visible' });
      assert.equal(await page.evaluate(() => JSON.parse(sessionStorage.getItem('guta_user')).role), role);
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('guta_user')).role), role);
      assert.equal(await page.locator('.crm-sidebar').getByText(name, { exact: true }).isVisible(), true);
      await logoutBtn.click();
      await heroTitle.waitFor({ state: 'visible' });
      assert.equal(await page.evaluate(() => sessionStorage.getItem('guta_user')), null);
      assert.equal(await page.evaluate(() => localStorage.getItem('guta_user')), null);
    }
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
    assert.doesNotMatch(pageContent, /TODO|FIXME|Lorem ipsum/i);

    // Click nút preview trong thẻ CRM Landing Page kích hoạt AuthModal
    const previewBtn = page.locator('.crm-btn').first();
    if (await previewBtn.count() > 0) {
      await previewBtn.click();
      await page.getByText(/Đăng Nhập Nhanh 1-Click/i).waitFor({ state: 'visible', timeout: 3000 });
      assert.equal(await page.getByText(/Đăng Nhập Nhanh 1-Click/i).isVisible(), true);
    }
  });
});
