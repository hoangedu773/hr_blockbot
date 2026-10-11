import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, "..");

describe("Web Integration: Acceptance & Zero-Mock Verification", () => {
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
