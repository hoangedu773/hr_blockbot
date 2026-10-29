# Re-check: audit cũ đã được fix chưa?

- **Thời điểm**: 2026-10-28 22:05 (+07)
- **HEAD**: `4b1d209` · branch `integration/full-delivery`
- **Chế độ**: READ-ONLY với source. Chỉ ghi report này + `test-results/e2e-audit-2026-10-28.log`.
- **Bổ sung 2026-10-28 23:20 (§8)**: 10 phát hiện từ đợt tích hợp Jev. 4 mục **đã fix trong đợt đó** nên source
  đã đổi ở `jev_gateway.py`, `loop.py`, `config.py`, `ai-client.service.ts`, `routes/chat.ts`, `socket.ts`;
  6 mục **còn mở** là danh sách cần fix. Mục 1-7 của file này vẫn mô tả trạng thái lúc 22:05.
- **Đối tượng đối chiếu**: 2 audit cũ
  1. `plans/reports/team-lead-261027-1758-audit-readonly-full-stack.md` — 38 claim (7 P0 / 17 P1 / 14 P2), chính thức hoá bằng `claims.json` + `scripts/verify-claims.mjs`.
  2. `reports/2026-10-23/pre-demo-readiness-audit.md` — audit UI/UX tiền demo (5 trục).

---

## 0. Verdict ngắn

| Audit cũ | Trạng thái fix | Bằng chứng |
|---|---|---|
| **27/10 — full-stack 38 claim** | **0/38 được fix** | HEAD vẫn đúng commit được audit; `git status` 0 file tracked bị sửa; `verify-claims` **38/38 VERIFIED**; 7/7 P0 + 3 P1 đọc lại code vẫn còn nguyên lỗi |
| **23/10 — pre-demo UI** | **~11/14 mục đã fix**, 2 mục chưa, 1 mục regression | Đọc code + chạy lại e2e suite |
| **Bộ test e2e** | **10/16 pass, 6 fail** (report 24/10 tuyên bố 12/12) | `node --test apps/web/test/e2e-revamp-flow.test.mjs` → exit 1 |
| **Đợt Jev (23:20, xem §8)** | 4 lỗi tích hợp **đã fix**, **6 lỗi mới còn mở** | Đọc code + 4 bộ test đã chạy; chi tiết §8 |

Nguyên nhân gốc của dòng đầu: **không có commit nào sau `4b1d209`**. Working tree chỉ có file untracked (`plans/`, `previews/`, `reports/`…), **không có một dòng source nào bị sửa**. Nói cách khác, audit 27/10 chưa được bắt đầu fix.

---

## 1. Audit 27/10 — kiểm chứng cơ học

```
$ node scripts/verify-claims.mjs
HEAD 4b1d209 · window ±3
Tổng: 38 claim · VERIFIED 38 · DRIFT 0 · FAIL 0
```

38/38 anchor vẫn nằm đúng dòng cũ. Đây là điều kiện **cần** để kết luận "chưa fix", không phải điều kiện đủ (một bug có thể bị vá trong khi anchor còn nguyên). Nên đã đọc lại code thật ở cả 7 P0.

## 2. Audit 27/10 — kiểm chứng ngữ nghĩa 7 P0 (đọc code, không tin report)

| ID | File:line hiện tại | Đọc được gì | Kết luận |
|---|---|---|---|
| P0-1 | `apps/ai-service/tests/test_live_db_chat.py:41`, `:88` | `api_key=os.getenv("AI_LLM_API_KEY", "sk-<REDACTED>")` — fallback là key thật, kèm `base_url` tunnel riêng. File đang được git track. | **CHƯA FIX** |
| P0-2 | `apps/api/src/services/auth.service.ts:15-18` | `const DEFAULT_JWT_SECRET = "hr-blockbot-super-secret-…"`; `JWT_SECRET` chốt ở top-level module. `dotenv.config()` trong `app.ts:16` chạy sau ⇒ giá trị dùng thật luôn là hằng hardcode. | **CHƯA FIX** |
| P0-3 | `apps/ai-service/app/main.py:78-81` | `_verify_service_key`: `if not expected: return` — fail-open khi thiếu key. `UserContext` vẫn dựng từ body request. | **CHƯA FIX** |
| P0-4 | `apps/ai-service/app/llm/chain.py:79-83` | `payload_version`: có `configVersion` thì trả `v{n}` và bỏ qua hash `baseUrl/model/apiKey` ⇒ cache key va chạm. | **CHƯA FIX** |
| P0-5 | `apps/api/src/routes/projects.ts:251-256` | Chỉ nhánh `targetStatus === "IN_PROGRESS"` mới kiểm tra role. Không có whitelist `(role, from→to)`; `transitionProject` vẫn chỉ so `_id + status + version`. Employee vẫn set `COMPLETED` được. | **CHƯA FIX** |
| P0-6 | `apps/web/src/services/api.ts:344` ↔ `apps/api/src/routes/reports.ts` | Web gọi `POST /projects/:id/reports`. Server chỉ mount `POST /reports`, `GET /reports/:id`, `POST /reports/:id/review` (`app.ts:46`). Không có route lồng. Comment trong `api.ts` còn khẳng định ngược lại sự thật ("Canonical report submit path"). | **CHƯA FIX** |
| P0-7 | `apps/web/src/components/AdminSettingsView.tsx:45-61`, `:139` | `persist()` vẫn dựng payload qua `toProviderInput(toFormState(provider))`; `toFormState` trả `apiKey: ''`. Key Admin gõ không bao giờ được gửi. | **CHƯA FIX** |

Spot-check thêm 3 P1:

| ID | Bằng chứng hiện tại | Kết luận |
|---|---|---|
| P1-3 | `routes/attachments.ts:58` — `router.get("/attachments/:category/:filename", (req,res) => …)` **không** có `authenticateToken` | CHƯA FIX |
| P1-11 | `apps/api/package.json:10` — script `test` chỉ liệt kê `db-guard.test.mjs` + `auth.test.mjs` (2/6) | CHƯA FIX |
| P1-17 | `grep -rn EmployeeProfileView apps/web/src` → chỉ có chính file khai báo, không có chỗ mount | CHƯA FIX |

**Kết luận mục 2**: 7/7 P0 và 3/3 P1 spot-check đều còn nguyên. Không có dấu hiệu vá một phần.

---

## 3. Audit 23/10 (UI tiền demo) — cái nào đã fix thật

| # | Hạng mục | Trạng thái | Bằng chứng |
|---|---|---|---|
| 1 | `closeDrawer is not defined` (CRITICAL) | **ĐÃ FIX** | `CrmDashboardView.tsx:640-665`: `openDrawer`/`closeDrawer` định nghĩa trong effect, gán `window`, gỡ `onclick` inline, bind `addEventListener` có `AbortController`; cleanup khôi phục `window.*` cũ |
| 2 | `openDrawer is not defined` khi click hàng | **ĐÃ FIX** | `grep "onclick=" CrmDashboardView.tsx` → **0 kết quả** trong `CRM_HTML`; hàng bảng bind qua `dataRows.forEach` (`:668-681`) |
| 3 | Nhân bản `emptyRow` / rò rỉ listener | **ĐÃ FIX** | `emptyRow` tạo 1 lần trong effect, `remove()` trong cleanup (`:917`) |
| 4 | Rò rỉ timer ChatDrawer | **ĐÃ FIX nhưng moot** | `ChatDrawer.tsx` có `replyTimer` + `clearTimeout` (`:791,806,826`) — nhưng **file này không còn được import ở đâu** (ChatPageView đã thay thế) |
| 5 | `ERR_CONNECTION_REFUSED` khi khởi động | **CHƯA FIX** | `AuthContext.tsx:43-56` vẫn gọi `refreshAccessToken()` vô điều kiện → `fetch` tới `http://localhost:3001/api/auth/refresh` (không có `.env` ⇒ `FALLBACK_API_BASE`). Chỉ `catch` để không văng promise, lỗi đỏ trong console vẫn còn — xem mục 4 |
| 6 | Trộn ngữ cảnh đề tài học thuật | **FIX MỘT PHẦN, còn lỗi mới** | Title đã đổi thành "Guta Workspace — Quản lý nhân sự & 45 chi nhánh" (`:584`) ✅. Nhưng nav `:71` vẫn là **"Đề tài / Báo cáo"** và nó **mở thật** `ProjectListView` — màn hình "Vòng Đời Đề Tài (F2)", "Tạo đề tài (DRAFT)", "Nộp báo cáo → PENDING_REVIEW". Người chấm bấm vào là thấy nguyên nghiệp vụ khóa luận trong demo chuỗi F&B |
| 7 | Skeleton loader module cũ | **ĐÃ FIX** | `EmployeeListView.tsx:74`, `RosterView.tsx:241-245,352-355,448-453` đều có skeleton |
| 8 | Nút chết "Bộ lọc Quận" / "Tạo Ca Đột Xuất" | **ĐÃ FIX** | `:799-836` — filter xoay vòng quận + spinner/disable 800ms, test 13 pass |
| 9 | Link `href="#"` giật trang | **ĐÃ FIX** | CRM chỉ còn 1 `href="#"` (Copilot) và đã `preventDefault` (`:879-887`); landing có `preventDeadLink` |
| 10 | Anchor `#guta-dashboard` / `#questions` không có đích | **ĐÃ FIX** | Mọi `href="#x"` trên landing đều có `id="x"` tương ứng (7/7: solution, product, guta-dashboard, features, about, questions, login) |
| 11 | WIP chưa gắn cờ trạng thái | **ĐÃ ĐỔI HƯỚNG, không còn cờ** | `grep "Coming Soon"` trong `apps/web/src` → **0 kết quả**. Thay vì gắn badge, commit `c71b84d` bật cả 5 phân hệ. Hệ quả: nav hiện có `Nhân sự / Phân ca / Đề tài / Cài đặt LLM` — **nhãn không khớp nội dung**: "Phân ca" render `RosterView` có heading "Hồ Sơ Nhân Sự (F1)" |
| 12 | Legacy component chưa bọc route | **ĐÃ FIX** | `App.tsx` chỉ lazy-load 3 view; `StaffDrawer` không được import ở đâu; `AdminSettingsView` gate `userRole === 'Admin'` |

---

## 4. Bộ test e2e hiện tại không còn xanh

```
$ node --test apps/web/test/e2e-revamp-flow.test.mjs
# tests 16 · pass 10 · fail 6 · exit 1
```

| # | Test | Fail vì | Bản chất |
|---|---|---|---|
| 9 | ChatPage desktop empty state / "Demo an toàn" | không tìm thấy text `Demo an toàn · Dịch vụ AI chưa khả dụng` | **Test cũ**: chuỗi này **không còn tồn tại** trong `apps/web/src` |
| 10 | ChatPage API hợp lệ / conversationId | `nav a` chứa "Copilot" không tìm thấy | **Test cũ**: phụ thuộc sidebar CRM trong khi app mặc định mở tab `chat` |
| 11 | ChatPage hủy fetch khi quay CRM | như trên | Test cũ |
| 12 | ChatPage mobile 320/375px | như trên | Test cũ |
| 14 | "CRM sidebar chuyển đủ 5 phân hệ" | chờ heading `Đội ngũ Barista & SM` | **Test cũ**: nav hiện chỉ có `stores/employees/schedules/projects/settings`; `data-section="attendance"` và `"cash"` **không tồn tại** trong source |
| 15 | Bước 7 đăng xuất + console sạch | `consoleErrors = ['Failed to load resource: net::ERR_CONNECTION_REFUSED']` | **LỖI THẬT**: đúng hạng mục #5 của audit 23/10 |

⇒ Tuyên bố "12/12 PASS · 0 console errors" trong `reports/2026-10-24/combo-c-containment.md` **không còn đúng ở HEAD**. 5 fail là test lỗi thời, 1 fail là lỗi sản phẩm thật.

Build thì vẫn sạch: `pnpm --filter web build` → `tsc` + `vite build` **PASS** (79 module, 15.07s). Lưu ý: lần build đầu bị chặn bởi safe-delete guard của môi trường (xoá `dist/assets` 91 file > ngưỡng 50), không phải lỗi code — đã build lại vào `dist` mới và test chạy trên bản mới.

---

## 5. Rủi ro demo mới (chưa có trong audit cũ)

1. **Tab mặc định là `chat`** (`App.tsx:29` `useState<'crm'|'chat'>('chat')`). Không có backend ⇒ màn hình đầu tiên sau đăng nhập là chat, và **không có thông điệp "dịch vụ AI chưa khả dụng"** nào trong code (test 9 chứng minh). Đây là thứ hội đồng thấy đầu tiên.
2. **Nhãn nav lệch nội dung**: "Phân ca" → "Hồ Sơ Nhân Sự (F1)"; "Đề tài / Báo cáo" → "Vòng Đời Đề Tài (F2)". Cả hai màn đều gọi API thật, offline sẽ ra trạng thái lỗi tải.
3. **`ProjectListView` (nghiệp vụ khóa luận) vẫn nằm trong luồng demo** — mâu thuẫn trực tiếp với mục tiêu "đồng bộ ngữ cảnh F&B" của audit 23/10.
4. **Console không sạch khi demo offline** — nếu mở DevTools trước mặt người chấm.

---

## 6. Chưa kiểm chứng (nói rõ để không hiểu sai report)

- **Không chạy** `apps/api` test suite, `apps/ai-service` pytest (thiếu Mongo/hạ tầng; `apps/ai-service/tests` cần `RUN_LIVE_TESTS=1`).
- **Không kiểm tra** `JWT_SECRET` / `AI_SERVICE_API_KEY` trên Render thật — nếu Render đã set đủ thì P0-2/P0-3 giảm mức khai thác, nhưng lỗi thiết kế (fail-open + hardcode fallback) vẫn nguyên.
- **Không quét** git history (`git log -p`) để xác nhận key P0-1 đã lan vào history — nhưng file đang được track nên mặc định coi là đã lộ.
- **Không xác nhận** dữ liệu Mongo thật (P2-5 chiều embedding, P2-6 `departmentIds`).
- Chưa đọc lại 17 P1 / 14 P2 bằng mắt — chỉ dựa vào `verify-claims` 38/38 VERIFIED + spot-check 3 P1.

---

## 7. Thứ tự đề xuất (giữ nguyên như audit 27/10, chưa mục nào xong)

1. Rotate key LLM + bỏ fallback hardcode (P0-1), bỏ `DEFAULT_JWT_SECRET` + đọc secret lazy fail-closed (P0-2).
2. Đóng lỗ hổng chiếm quyền: P0-3, P0-4, P0-5, P1-1, P1-2, P1-3, P1-12.
3. Sửa 2 luồng chết: P0-6 (nộp báo cáo 404), P0-7 (mất apiKey).
4. Trước demo: sửa `AuthContext` để không gọi refresh khi không có phiên (hết `ERR_CONNECTION_REFUSED`), và làm rõ nav "Phân ca"/"Đề tài" hoặc gỡ `projects` khỏi demo path.
5. Dọn test: 5 test e2e lỗi thời phải sửa hoặc xoá — đừng để suite đỏ giả tạo che lỗi thật.

---

## 8. Bổ sung 2026-10-28 23:20 — lỗi phát sinh từ đợt tích hợp Jev

Đợt này thêm `UseJevAI` (xoay 4 key trial) vào cổng quyết định. Khi rà lại cấu trúc để tích hợp, tìm được
10 vấn đề: **4 đã fix ngay trong đợt**, **6 còn mở** — 6 cái dưới đây là danh sách để fix một lần.

### 8.1 Đã fix trong đợt này (đừng fix lại, chỉ cần biết vùng code đã đổi)

| # | Vấn đề | Fix |
|---|---|---|
| F-1 | `TypedDecision` vứt bỏ `probabilities` Jev trả về ⇒ không thể tính Brier/ECE | thêm `intent_probabilities`, `intent_confidence`, `source` (`jev_gateway.py`) |
| F-2 | Response không cho biết quyết định đến từ đâu | `AgentTurn.decision_source` → `decisionSource` ở route + socket |
| F-3 | Cạn trial key ⇒ `decide()` raise ⇒ cả lượt chat 503 | `loop.py:380-387` bắt `LLMUnavailable`, rơi về rule/LLM với `degraded=True` |
| F-4 | `apps/api` dùng Zod object (strip unknown) ⇒ `decisionSource` bị bỏ ở biên | thêm vào `chatResultSchema` + `ChatResult` + `routes/chat.ts` + `socket.ts` |

### 8.2 CÒN MỞ — danh sách fix

| ID | Mức | File:line | Bằng chứng | Cách fix |
|---|---|---|---|---|
| **J-1** | **High** | `apps/api/src/services/ai-client.service.ts:212` ↔ `apps/ai-service/app/config.py:80,116` | API abort toàn bộ call ai-service sau **15.000ms**; riêng `decide()` trên đường pool đã có budget **15.000ms**, cộng thêm sinh văn bản phía sau. Hai budget 15s **nối tiếp** ⇒ API luôn abort trước khi kịp suy giảm, user nhận "Hệ thống AI Service đang bận", **token trial vẫn bị tiêu** | hạ `JEV_USEJEVAI_TIMEOUT_MS` xuống **≤ 6000**, hoặc cho `decide()` nhận budget từ `decision_timeout_ms` và trừ vào deadline của API |
| **J-2** | Medium | `config.py:74,113` + `jev_gateway.py:262` | `AI_DECISION_TIMEOUT_MS` chỉ được dùng ở `_system_one` (`_post`); đường `jev_usejevai` bỏ qua hoàn toàn ⇒ đặt biến này **không có tác dụng** khi dùng pool | một nguồn duy nhất: `decision_timeout_ms` là trần, `jev_usejevai_timeout_ms` chỉ được ≤ nó (validate lúc `load_settings`) |
| **J-3** | Medium | `apps/ai-service/app/agent/loop.py:367` vs `:503` | `QUERY_CACHE` TTL **300s** lưu cả turn `degraded=True`; lookup **đứng trước** gate ⇒ câu trả lời suy giảm được phát lại 5 phút dù Jev đã hồi phục, và gate không được gọi lại nên `decisionSource` cũng cũ | `if not turn.degraded: QUERY_CACHE.set(...)`; hoặc key cache thêm `decision_source` |
| **J-4** | Medium | `apps/ai-service/start.py:6-12` ↔ `render.yaml:106` | `.env` chỉ được nạp khi chạy `python start.py`; lệnh triển khai là `uvicorn app.main:app ...` ⇒ **không nạp** ⇒ thiếu `JEV_USEJEVAI_KEYS`, im lặng rơi về rule. Chạy local theo đúng lệnh deploy sẽ tái hiện | nạp dotenv trong `app/config.py` (trước `load_settings()`), hoặc thêm `--env-file apps/ai-service/.env` vào lệnh chạy local |
| **J-5** | Medium | `apps/api/src/services/ai-client.service.ts:4-14`, `:231-232` | `DEFAULT_GEMINI_PROVIDER` hardcode `baseUrl: "https://rbnvqls.abc-tunnel.us/v1"`, `apiKey: ""` trong file **được track**; `:232` còn dùng nó làm **fallback** khi thiếu `AI_LLM_BASE_URL` — cùng họ P0-1 nhưng ở code production: mất tunnel là demo chết, và lộ hạ tầng cá nhân vào repo | đọc từ env, không có env thì **fail-closed** thay vì trỏ tunnel lạ |
| **J-6** | Low | `apps/ai-service/app/agent/jev_gateway.py:71-87` | `_POOLS` cache theo chuỗi key, **không bao giờ evict**: đổi bộ key thì pool cũ (kèm trạng thái key chết) nằm lại vĩnh viễn; nhánh poll trả `401` cũng **chưa có test** | evict khi `settings.jev_usejevai_keys` đổi (giữ 1 entry), thêm 1 test cho poll-401 |

### 8.3 Chèn vào thứ tự §7

- **Trước bước 4 (trước demo):** J-1 (nếu không, demo trial sẽ trả "hệ thống bận" thay vì câu trả lời), J-4 (nếu không, chạy theo lệnh deploy sẽ không có key).
- **Sau bước 4:** J-2, J-3, J-5.
- **Bất kỳ lúc nào:** J-6.

### 8.4 Đã kiểm chứng sau khi fix 4 mục F-1..F-4

```
python -m unittest tests.test_jev_approval tests.test_jev_usejevai  → 21/21 OK
npx tsc --noEmit (apps/api)                                        → exit 0
node --test test/chat-gateway.test.mjs (apps/api)                  → 6/6 pass
node --test apps/web/test/landing-workflow.test.mjs                → 4/4 pass
```

Chưa kiểm chứng: J-1..J-6 **chưa fix** nên chưa có test nào cho chúng; J-1 cần đo lại end-to-end sau khi hạ
timeout.
