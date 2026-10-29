import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "./helpers/browser-deps.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const previewHtmlPath = path.resolve(__dirname, "../previews/index.html");
const previewUrl = pathToFileURL(previewHtmlPath).href;

describe("Web E2E & Visual Testing (Playwright / Chromium)", () => {
  let browser;
  let page;
  const consoleErrors = [];
  const pageErrors = [];

  before(async () => {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
    });

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    page.on("pageerror", (err) => {
      pageErrors.push(err.message);
    });

    await page.goto(previewUrl, { waitUntil: "load" });
  });

  after(async () => {
    if (browser) {
      await browser.close();
    }
  });

  it("1. Khởi tạo Preview Gate: Tiêu đề chuẩn, không có lỗi console khởi động", async () => {
    const title = await page.title();
    assert.match(title, /HR BlockBot/i);
    assert.match(title, /Preview Gate/i);
    assert.equal(pageErrors.length, 0, `Page errors: ${pageErrors.join("; ")}`);
    assert.equal(consoleErrors.length, 0, `Console errors: ${consoleErrors.join("; ")}`);
  });

  it("2. Điều hướng 9 trạng thái giao diện (State Panels Navigation)", async () => {
    const states = [
      { id: "ideal", panel: "#panel-ideal" },
      { id: "employee", panel: "#panel-employee" },
      { id: "empty", panel: "#panel-empty" },
      { id: "loading", panel: "#panel-loading" },
      { id: "error", panel: "#panel-error" },
      { id: "auth", panel: "#panel-auth" },
      { id: "f1f2", panel: "#panel-f1f2" },
      { id: "chat", panel: "#panel-chat" },
      { id: "admin", panel: "#panel-admin" },
    ];

    for (const state of states) {
      // Gọi hàm chuyển state trong preview DOM
      await page.evaluate((s) => window.switchState(s), state.id);

      // Xác nhận panel tương ứng nhận class 'active'
      const isActive = await page.locator(state.panel).evaluate((el) => el.classList.contains("active"));
      assert.equal(isActive, true, `Panel ${state.panel} phải có class 'active' khi chọn state ${state.id}`);

      // Xác nhận các panel khác không active
      const otherActiveCount = await page.evaluate((currId) => {
        const panels = Array.from(document.querySelectorAll(".state-panel.active"));
        return panels.filter((p) => p.id !== `panel-${currId}`).length;
      }, state.id);
      assert.equal(otherActiveCount, 0, `Chỉ duy nhất 1 panel được active tại thời điểm state=${state.id}`);
    }
  });

  it("3. ChatPanel — Kiểm thử chi tiết đầy đủ 6 trạng thái bắt buộc", async () => {
    await page.evaluate(() => window.switchState("chat"));

    // 1. Idle state
    const idleLocator = page.locator("#panel-chat-idle");
    assert.equal(await idleLocator.count(), 1);
    const idleText = await idleLocator.innerText();
    assert.match(idleText, /Chưa có câu hỏi nào/);
    assert.match(idleText, /Chính sách nghỉ phép/);

    // 2. Sending state
    const sendingLocator = page.locator("#panel-chat-sending");
    assert.equal(await sendingLocator.count(), 1);
    const sendingText = await sendingLocator.innerText();
    assert.match(sendingText, /Đang gửi/i);
    assert.match(sendingText, /chat:send/);

    // 3. Streaming state
    const streamingLocator = page.locator("#panel-chat-streaming");
    assert.equal(await streamingLocator.count(), 1);
    const streamingText = await streamingLocator.innerText();
    assert.match(streamingText, /Đang nhận câu trả lời/i);
    assert.match(streamingText, /Điều 12/);
    assert.match(streamingText, /Quy chế nhân sự/);

    // 4. Abstain state (từ chối khi ngoài phạm vi, không bịa nguồn)
    const abstainLocator = page.locator("#panel-chat-abstain");
    assert.equal(await abstainLocator.count(), 1);
    const abstainText = await abstainLocator.innerText();
    assert.match(abstainText, /Chưa có trong tài liệu chính sách/);
    assert.match(abstainText, /Không đủ bằng chứng/i);

    // 5. Error state (báo lỗi có mã lỗi + nút thử lại)
    const errorLocator = page.locator("#panel-chat-error");
    assert.equal(await errorLocator.count(), 1);
    const errorText = await errorLocator.innerText();
    assert.match(errorText, /AI_SERVICE_TIMEOUT/i);
    assert.match(errorText, /Thử lại/);

    // 6. Degraded state (chế độ không có LLM)
    const degradedLocator = page.locator("#panel-chat-degraded");
    assert.equal(await degradedLocator.count(), 1);
    const degradedText = await degradedLocator.innerText();
    assert.match(degradedText, /LLM_UNAVAILABLE/i);
    assert.match(degradedText, /Không có LLM/i);
  });

  it("4. Admin LLM Provider Settings — Bảo mật khóa bí mật & Zero-leak invariant", async () => {
    await page.evaluate(() => window.switchState("admin"));

    const adminPanel = page.locator("#panel-admin");
    const tableHtml = await adminPanel.locator(".preview-table").innerHTML();

    // Invariant an ninh: keyCipher tuyệt đối không xuất hiện trong bảng dữ liệu
    assert.equal(tableHtml.includes("keyCipher"), false, "Table data không bao giờ được chứa thuộc tính keyCipher");

    // Invariant an ninh: không lộ key thô (dạng sk-...)
    const rawKeyMatch = tableHtml.match(/sk-[a-zA-Z0-9]{16,}/);
    assert.equal(rawKeyMatch, null, "Không được lộ API key thô trong bảng dữ liệu");

    // Kiểm tra render keyHint an toàn dạng masked bullet ••••
    assert.match(tableHtml, /••••/, "Phải hiển thị key dạng masked ••••xxxx");
    const fullText = await adminPanel.innerText();
    assert.match(fullText, /configVersion/i, "Phải hiển thị configVersion");
  });

  it("5. F1 & F2 Command Center — Hàng đợi phê duyệt & State Machine đề tài", async () => {
    await page.evaluate(() => window.switchState("f1f2"));

    const f1f2Panel = page.locator("#panel-f1f2");
    const text = await f1f2Panel.innerText();

    // F1 Profile change request queue
    assert.match(text, /F1/i);
    assert.match(text, /Phê duyệt/i);
    assert.match(text, /Lý do/i);

    // F2 Project lifecycle state machine
    assert.match(text, /F2/i);
    assert.match(text, /DRAFT/);
    assert.match(text, /ASSIGNED/);
    assert.match(text, /IN_PROGRESS/);
    assert.match(text, /PENDING_REVIEW/);
    assert.match(text, /COMPLETED/);
  });

  it("6. Zero uncaught errors & capture visual regression screenshot", async () => {
    // Chụp screenshot minh chứng visual quality
    const screenshotPath = path.resolve(__dirname, "../previews/screenshots/playwright-e2e-verified.png");
    await page.screenshot({ path: screenshotPath, fullPage: true });

    assert.equal(pageErrors.length, 0, `Không được có lỗi JavaScript nào trong toàn bộ runtime: ${pageErrors.join(", ")}`);
    assert.equal(consoleErrors.length, 0, `Không được có console.error nào: ${consoleErrors.join(", ")}`);
  });
});
