import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, "..");

/**
 * P2-14 (fix-all-bugs phase 01): the old name `web-integration.test.mjs` was a
 * lie — every check below only greps strings inside source files, it never
 * mounts a component or calls the API. Renamed to `*.source-shape.test.mjs` so
 * nobody can cite it as integration evidence (a always-green "integration" test
 * is more dangerous than no test: it fabricates proof).
 *
 * Real integration coverage lives in:
 *   - `apps/api/test/*.test.mjs` (HTTP + DB, memory-mongo harness)
 *   - `apps/web/test/e2e-revamp-flow.test.mjs` (Playwright E2E)
 *   - `apps/web/test/landing-workflow.test.mjs` (Playwright workflow)
 */
describe("Web Source-Shape Checks (NOT integration — P2-14 renamed honestly)", () => {
  it("apps/web/src/services/api.ts không chứa bất kỳ SEED_* hay fallback nuốt lỗi nào", () => {
    const apiFile = fs.readFileSync(path.join(webRoot, "src/services/api.ts"), "utf-8");

    // Tuyệt đối không chứa seed constants
    assert.equal(apiFile.includes("SEED_STORES"), false, "api.ts không được chứa SEED_STORES");
    assert.equal(apiFile.includes("SEED_EMPLOYEES"), false, "api.ts không được chứa SEED_EMPLOYEES");
    assert.equal(apiFile.includes("SEED_SCHEDULES"), false, "api.ts không được chứa SEED_SCHEDULES");
    assert.equal(apiFile.includes("SEED_CORRECTIONS"), false, "api.ts không được chứa SEED_CORRECTIONS");
    assert.equal(apiFile.includes("SEED_CASH_COUNTS"), false, "api.ts không được chứa SEED_CASH_COUNTS");

    // Tuyệt đối không nuốt lỗi bằng cách return SEED_* hay return true
    assert.equal(apiFile.includes("return SEED_"), false, "api.ts không được return SEED_*");
    assert.equal(apiFile.includes("catch { return true }"), false, "api.ts không được catch { return true }");
    assert.equal(apiFile.includes("catch {\n    return true"), false, "api.ts không được nuốt lỗi");
  });

  it("apps/web/src/services/auth.ts chỉ lưu token trong in-memory state, TUYỆT ĐỐI KHÔNG dùng localStorage/sessionStorage", () => {
    const authFile = fs.readFileSync(path.join(webRoot, "src/services/auth.ts"), "utf-8");

    assert.equal(/localStorage\.(getItem|setItem|removeItem|clear)/.test(authFile), false, "auth.ts không được gọi API localStorage");
    assert.equal(/sessionStorage\.(getItem|setItem|removeItem|clear)/.test(authFile), false, "auth.ts không được gọi API sessionStorage");
    assert.equal(/window\.localStorage/.test(authFile), false, "auth.ts không được truy cập window.localStorage");
    assert.equal(/window\.sessionStorage/.test(authFile), false, "auth.ts không được truy cập window.sessionStorage");
    assert.equal(authFile.includes("credentials: 'include'"), true, "auth.ts phải truyền credentials: include");
    assert.equal(authFile.includes("inMemoryAccessToken"), true, "auth.ts phải dùng in-memory access token");
  });

  it("apps/web/src/App.tsx không còn các metric fallbacks cố định (45/12/1745000) và fake actions", () => {
    const appFile = fs.readFileSync(path.join(webRoot, "src/App.tsx"), "utf-8");

    // Kiểm tra không còn fallback cố định 45, 12, 1745000
    assert.equal(appFile.includes(": 45;"), false, "App.tsx không được fallback 45 nhân viên giả");
    assert.equal(appFile.includes(": 12}"), false, "App.tsx không được fallback 12 ca trực giả");
    assert.equal(appFile.includes(": 1745000;"), false, "App.tsx không được fallback 1745000 két tiền giả");
  });

  it("apps/web/previews/index.html tồn tại và định nghĩa đầy đủ 6 trạng thái UI", () => {
    const previewFile = fs.readFileSync(path.join(webRoot, "previews/index.html"), "utf-8");

    assert.equal(previewFile.includes("panel-ideal"), true, "Preview phải có Ideal Admin State");
    assert.equal(previewFile.includes("panel-employee"), true, "Preview phải có Employee Own State");
    assert.equal(previewFile.includes("panel-empty"), true, "Preview phải có Empty State");
    assert.equal(previewFile.includes("panel-loading"), true, "Preview phải có Loading / Skeleton State");
    assert.equal(previewFile.includes("panel-error"), true, "Preview phải có Error State");
    assert.equal(previewFile.includes("panel-auth"), true, "Preview phải có Auth / Login State");
  });
});

describe("Phase 3: dead-endpoint debt removal (task 1)", () => {
  const srcRoot = path.join(webRoot, "src");
  const read = (relativePath) => fs.readFileSync(path.join(srcRoot, relativePath), "utf-8");

  const walk = (dir) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    return entries.flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
    });
  };

  it("không còn lời gọi 4 endpoint legacy 503 trong toàn bộ src", () => {
    const forbidden = ["fetchStores", "fetchSchedules", "fetchCashCounts", "fetchCorrections"];
    const offenders = [];
    for (const file of walk(srcRoot)) {
      const content = fs.readFileSync(file, "utf-8");
      for (const name of forbidden) {
        if (content.includes(name)) offenders.push(`${path.relative(srcRoot, file)}:${name}`);
      }
    }
    assert.deepEqual(offenders, [], "Không được còn cache 4 fetcher legacy 503");
  });

  it("api.ts không còn path legacy /stores /schedules /corrections /cash", () => {
    const apiFile = read("services/api.ts");
    for (const endpoint of ["/stores", "/schedules", "/corrections", "/cash"]) {
      assert.equal(apiFile.includes(endpoint), false, `api.ts không được gọi endpoint ${endpoint}`);
    }
    assert.equal(/\.catch\(\s*\(\s*\)\s*=>\s*\[\]\s*\)/.test(apiFile), false, "api.ts không được nuốt lỗi bằng catch(() => [])");
  });

  it("auth.ts đọc API base từ biến môi trường, không hardcode duy nhất localhost", () => {
    const authFile = read("services/auth.ts");
    assert.equal(authFile.includes("import.meta.env.VITE_API_BASE"), true, "auth.ts phải override được API base khi deploy");
  });

  it("App.tsx không còn import các view ca kíp legacy", () => {
    const appFile = read("App.tsx");
    for (const legacy of ["AddShiftModal", "VisualTimeline", "TwoColumnGrid", "AiCopilotModal", "StaffDrawer"]) {
      assert.equal(appFile.includes(legacy), false, `App.tsx không được nối ${legacy} vào luồng chính`);
    }
  });
});

describe("Phase 3: chat panel contract + admin provider safety", () => {
  const srcRoot = path.join(webRoot, "src");
  const read = (relativePath) => fs.readFileSync(path.join(srcRoot, relativePath), "utf-8");

  it("ChatPanel khai báo đủ 6 trạng thái bắt buộc", () => {
    const panel = read("components/ChatPanel.tsx");
    for (const state of ["idle", "sending", "streaming", "abstain", "error", "degraded"]) {
      assert.equal(panel.includes(`'${state}'`), true, `ChatPanel thiếu trạng thái ${state}`);
    }
    assert.equal(panel.includes(".emit("), false, "ChatPanel phải gửi event qua ChatSocketClient, không emit tay");
  });

  it("ChatSocketClient emit đúng event đóng của docs/06 §4.2 (chat:send, chat:confirm)", () => {
    const socketFile = read("services/chatSocket.ts");
    assert.equal(socketFile.includes("'chat:send'"), true, "thiếu chat:send");
    assert.equal(socketFile.includes("'chat:confirm'"), true, "thiếu chat:confirm");
    for (const event of ["chat:accepted", "chat:chunk", "chat:done", "chat:error"]) {
      assert.equal(socketFile.includes(`'${event}'`), true, `thiếu listener ${event}`);
    }
    assert.equal(socketFile.includes("clientMessageId"), true, "mọi message phải mang clientMessageId");
  });

  it("AdminSettingsView chỉ hiển thị keyHint, không bao giờ render key/keyCipher", () => {
    const adminView = read("components/AdminSettingsView.tsx");
    assert.equal(adminView.includes("keyHint"), true, "Admin UI phải hiển thị keyHint");
    assert.equal(adminView.includes("keyCipher"), false, "Admin UI không được tham chiếu keyCipher");
    assert.equal(adminView.includes('type="password"'), true, "ô API key phải là password");
    assert.equal(adminView.includes("403"), true, "Employee mở route Admin phải thấy 403");
  });

  it("không file nào trong src tham chiếu keyCipher (server-only field)", () => {
    const walk = (dir) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      return entries.flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return walk(full);
        return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
      });
    };
    const offenders = walk(srcRoot).filter((file) => fs.readFileSync(file, "utf-8").includes("keyCipher"));
    assert.deepEqual(offenders, [], "keyCipher là field server-only, client không được tham chiếu");
  });

  it("preview tĩnh có đủ 6 trạng thái chat + màn Admin provider", () => {
    const previewFile = fs.readFileSync(path.join(webRoot, "previews/index.html"), "utf-8");
    for (const id of [
      "panel-chat-idle",
      "panel-chat-sending",
      "panel-chat-streaming",
      "panel-chat-abstain",
      "panel-chat-error",
      "panel-chat-degraded",
      "panel-admin",
      "panel-f1f2",
    ]) {
      assert.equal(previewFile.includes(`id="${id}"`), true, `preview thiếu ${id}`);
    }
    assert.equal(previewFile.includes("keyCipher"), true, "preview phải ghi rõ KHÔNG render keyCipher (mô tả)");
  });
});
