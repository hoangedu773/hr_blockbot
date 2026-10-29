# Audit tổng thể read-only — hr-blockbot

- **HEAD**: `4b1d209` · **Branch**: `integration/full-delivery`
- **Ngày**: 2026-10-27 17:58 (+07)
- **Chế độ**: READ-ONLY. Không sửa một dòng source nào. Không commit, không build ra `dist/`.
- **Điều phối**: Lead + 4 subagent song song, partition không chồng lấn.
- **Phạm vi**: `apps/api` (33 file TS), `apps/web` (44 file TS/TSX), `apps/ai-service` (23 file PY), `packages/contracts` (1 file), cấu hình build/CI.

## Bằng chứng toàn vẹn (không sửa source)

| Kiểm tra | Kết quả |
|---|---|
| `git status --porcelain \| wc -l` trước fan-out | 85 |
| Sau fan-out | **85** (không đổi) |
| File tracked bị `M` | **không có** |

## Bằng chứng kiểm chứng độc lập (Lead tự chạy)

| Lệnh | Kết quả | Ý nghĩa |
|---|---|---|
| `tsc --noEmit -p packages/contracts` | exit 0 | compile sạch |
| `tsc --noEmit -p apps/api` | exit 0 | 33 file, compile sạch |
| `tsc --noEmit -p apps/web` | exit 0 | 44 file, compile sạch |
| `node --test packages/contracts/test/contracts.test.mjs` | **38/38 pass** | contract test xanh |
| `node --test apps/api/test/db-guard.test.mjs` | **3/3 pass** | guard test xanh |
| `pnpm lint` | **không tồn tại** | không package nào có script `lint` |
| `node scripts/verify-claims.mjs` | **38/38 VERIFIED** | mọi claim đối chiếu được với code thật (xem `claims.json`) |

**Kết luận quan trọng**: code **compile được và test hiện có đều xanh**. Toàn bộ bug dưới đây nằm ở tầng **logic, phân quyền và hợp đồng** — loại mà typecheck và test hiện tại không bắt được. Đừng dùng "build xanh" làm bằng chứng chất lượng.

---

# P0 — phải sửa trước khi demo/nộp (7 lỗi)

### P0-1 · API key LLM thật hardcode trong file được git track
`apps/ai-service/tests/test_live_db_chat.py:41` và `:88`

```python
api_key=os.getenv("AI_LLM_API_KEY", "sk-<REDACTED>"),   # fallback ~35 ký tự, prefix "sk-"
```

Giá trị fallback là key thật (kèm `base_url` tunnel riêng `https://rbnvqls.abc-tunnel.us/v1`), không phải placeholder. Nằm trong git history ⇒ coi như đã lộ; ai clone repo đều tiêu được quota.
**Sửa**: rotate key ngay; bỏ fallback, dùng `os.environ["AI_LLM_API_KEY"]` + skip test nếu thiếu; cân nhắc purge history.

### P0-2 · JWT secret fallback hardcode, không fail-closed
`apps/api/src/services/auth.service.ts:15`

```ts
const DEFAULT_JWT_SECRET = "hr-blockbot-super-secret-jwt-key-minimum-32-chars-long";
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || DEFAULT_JWT_SECRET);
```

Hai lỗi chồng nhau: (a) secret nằm trong repo; (b) `JWT_SECRET` được chốt lúc import module, nhưng `dotenv.config()` chạy sau đó trong `app.ts:16` ⇒ nếu secret chỉ có trong `.env`, giá trị dùng thật **luôn là hằng hardcode**. Ai đọc source cũng ký được token `role: "Admin"`.
**Sửa**: nạp env trước mọi import; đọc secret lazy trong hàm sign/verify; `throw` nếu thiếu khi `NODE_ENV=production`.

### P0-3 · ai-service xác thực fail-open, `userContext` do client tự khai
`apps/ai-service/app/main.py:80`

```python
def _verify_service_key(x_ai_service_key: Optional[str]) -> None:
    expected = settings.ai_service_api_key
    if not expected:
        return          # ← không có key thì cho qua
```

`.env.example` ship `AI_SERVICE_API_KEY=` rỗng ⇒ mặc định không chặn gì. `/api/v1/chat` lại dựng `UserContext` trực tiếp từ body (`main.py:253`). Chỉ cần POST `{"userContext":{"role":"Admin","departmentId":"..."}}` là đọc được `get_department_kpi` của mọi phòng ban.
**Sửa**: fail-closed khi key rỗng (503/401); không tin `userContext` từ body — ký hoặc suy ra từ token nội bộ.

### P0-4 · Cache provider chỉ key theo `configVersion` → đầu độc chain, lộ hội thoại
`apps/ai-service/app/llm/chain.py:80`

```python
if isinstance(payload, dict) and payload.get("configVersion") is not None:
    return f"v{payload['configVersion']}"
```

`apps/api` gửi `configVersion` **giống nhau cho mọi user và mọi lần xoay key**. Kẻ tấn công POST cùng `configVersion` với `providers[0].baseUrl` của mình sẽ ghi đè entry cache 60s; các request hợp lệ sau đó gửi nguyên prompt/PII sang host kẻ tấn công.
**Sửa**: key cache = hash toàn bộ payload (baseUrl + model + apiKey), không chỉ version.

### P0-5 · Employee tự đóng đề tài, bỏ qua bước Admin duyệt
`apps/api/src/routes/projects.ts:251`

```ts
// Role checks
if (parsed.data.targetStatus === "IN_PROGRESS" && user.role === "Employee") {
  if (project.assigneeId && project.assigneeId.toString() !== user.employeeId) {
```

Chỉ nhánh `IN_PROGRESS` mới bị kiểm tra quyền. Employee gọi `targetStatus: "COMPLETED"` với `expectedVersion` đúng là đóng được đề tài **của phòng ban khác** mà không cần Admin phê duyệt.

Kiểm sâu hơn: `transitionProject` (`apps/api/src/models/Project.ts`) **không hề có whitelist chuyển trạng thái** — nó chỉ `findOneAndUpdate({_id, status, version}, {$set:{status:newStatus}})`. `ProjectTransitionSchema` cho `targetStatus` là bất kỳ `ProjectStatus`. Nên "F2 State Machine" trong comment là khẩu hiệu: **không tồn tại state machine nào ở server**, và `expectedStatus` lấy từ DB nên điều kiện luôn thoả khi version đúng.

**Sửa**: whitelist cặp `(role, from → to)` **trong `transitionProject`** (không chỉ ở route); chỉ Admin được set `COMPLETED`/`PENDING_REVIEW`; Employee chỉ thao tác trên project của mình.

### P0-6 · Luồng nộp báo cáo chết 404 (frontend gọi endpoint không tồn tại)
`apps/web/src/services/api.ts:345` ↔ `apps/api/src/routes/reports.ts:14`

```ts
return requestJson<SubmitReportResult>(
  `/projects/${encodeURIComponent(projectId)}/reports`,   // ← không tồn tại
```

Server chỉ có `router.post("/reports", ...)` và `ReportSubmitSchema` bắt buộc `projectId` trong body. Employee luôn nhận 404, đề tài không bao giờ sang `PENDING_REVIEW`. Kể cả sửa path thì body vẫn thiếu `projectId` → 400.
**Sửa**: web gọi `POST /reports` với `{ projectId, content, attachments, expectedVersion }`.

### P0-7 · Admin lưu provider làm mất `apiKey` vừa nhập
`apps/web/src/components/AdminSettingsView.tsx:139` (nguồn: `:58`)

`persist()` dựng lại payload qua `toProviderInput(toFormState(provider), provider)` — `toFormState` luôn trả `apiKey: ''` (dòng 58, kèm comment "Key is write-only"), và `toProviderInput` chỉ set key khi `form.apiKey` khác rỗng (dòng 95-96). `optimistic` (dòng 172-186) là `LLMProvider` — không mang `apiKey`. Nên key Admin gõ **không bao giờ được gửi**; UI vẫn báo "Đã cập nhật provider".
**Sửa**: truyền thẳng `input` (đã có `apiKey`) vào `persist`, hoặc giữ map `id → apiKey` tạm.

---

# P1 — sai hành vi / lỗ hổng hạn chế (17 lỗi)

| ID | Vị trí | Vấn đề |
|---|---|---|
| P1-1 | `apps/api/src/routes/reports.ts:79` | **IDOR**: mọi user đăng nhập đọc được report của phòng ban khác, chỉ cần đoán ObjectId; trả nguyên document |
| P1-2 | `apps/api/src/routes/projects.ts:159` | **IDOR**: list có scope theo department, detail thì không → Employee đọc đề tài phòng khác |
| P1-3 | `apps/api/src/routes/attachments.ts:58` | `/attachments/:category/:filename` **không có** `authenticateToken` + `Cache-Control: public` → tải tài liệu nội bộ không cần đăng nhập |
| P1-4 | `apps/api/src/routes/auth.ts:38` | Login không rate limit; nhánh "user không tồn tại" trả ngay còn nhánh có user chạy Argon2 → **timing enumeration** email |
| P1-5 | `apps/api/src/routes/reports.ts:37` | Tạo report rồi mới transition project, không transaction → 409 sinh **report mồ côi**; nhánh review thì ngược lại |
| P1-6 | `apps/api/src/socket.ts:144` | `chat:confirm` emit "đã thực thi an toàn" nhưng **không gọi service nào** — deceptive success |
| P1-7 | `apps/api/src/socket.ts:79` | `userContext` thiếu `employeeId`/`departmentId` → mọi tool scoped (`get_my_*`, `get_department_kpi`) **luôn SCOPE_DENIED** trên kênh chat realtime |
| P1-8 | `apps/web/src/services/api.ts:218` | 4 endpoint không tồn tại: `PATCH /employees/:id`, `POST /employees/:id/change-requests`, `GET /change-requests`, `POST /conversations` → tab "Hàng đợi duyệt" và sửa hồ sơ luôn 404 |
| P1-9 | `apps/api/src/socket.ts:89` | `chat:done` phát field `reply` **ngoài** `ChatDonePayloadSchema`, và không bao giờ emit `chat:chunk` → bubble assistant rỗng |
| P1-10 | `packages/contracts/test/contracts.test.mjs:47` | Test import `../dist/index.js`, nhưng `dist/` bị gitignore và không script nào build trước → **clean clone fail** `ERR_MODULE_NOT_FOUND` (máy này pass vì đã có `dist/`) |
| P1-11 | `apps/api/package.json:10` | Script `test` chỉ liệt kê **2/6** file test; 4 bộ test bảo mật (`attachments-security`, `chat-gateway`, `gemini-key-pool`, `auth-cookie`) **không bao giờ chạy**. Không có `.github/workflows` nào |
| P1-12 | `apps/ai-service/app/llm/openai_compatible.py:37` | `baseUrl` lấy thẳng từ request → **SSRF** tới `169.254.169.254`/host nội bộ (kết hợp P0-3) |
| P1-13 | `apps/ai-service/app/main.py:49` | CORS `allow_origins=["*"]` + `allow_credentials=True` — cấu hình sai chuẩn |
| P1-14 | `apps/ai-service/app/agent/loop.py:456` | "Typed decision gate" tự xác nhận vòng tròn: `intent` và `proposedAction` **cùng do LLM sinh** → prompt injection đi qua; `needs_manager_approval` tính ra nhưng không dùng để chặn |
| P1-15 | `apps/ai-service/app/llm/fake.py:191` | Module "fake" **monkey-patch `AgentLoop.run`** lúc import, bọc trong `except Exception: pass`; `chain.py:33` import nó nên patch chạy cả trong production |
| P1-16 | `apps/web/src/components/ProjectListView.tsx:108` | `load` phụ thuộc `onNotify` không `useMemo` → lỗi 403/500 sinh **vòng refetch vô hạn** + spam toast |
| P1-17 | `apps/web/src/components/CrmDashboardView.tsx:961` | `EmployeeProfileView` không được mount ở đâu; nhân viên **không có trang hồ sơ**. Cùng nhóm dead code: `ChatPanel`, `ChatDrawer`, `LoginModal`, `StaffDrawer` |

---

# P2 — fragility, UX, chất lượng test (14 lỗi)

| ID | Vị trí | Vấn đề |
|---|---|---|
| P2-1 | `apps/api/src/routes/reports.ts:115` | Admin duyệt report ngoài department scope (không `assertInScope`) |
| P2-2 | `apps/api/src/routes/projects.ts:299` | Update progress read-then-write, không `expectedVersion` → lost update; ObjectId sai → 500 thay vì 400 |
| P2-3 | `apps/api/test/auth.test.mjs:411` | **Deceptive test**: `assert.ok(statuses.includes(200) \|\| statuses.every(s => s === 401))` — đúng với mọi tổ hợp, kể cả race thật |
| P2-4 | `apps/ai-service/app/agent/tools.py:579` | Timeout tool vô hiệu: `with ThreadPoolExecutor` gọi `shutdown(wait=True)` → `AI_TOOL_TIMEOUT_MS` không cắt được latency |
| P2-5 | `apps/ai-service/app/main.py:136` | Fallback hashing embedder 384 chiều so với vector DB 768/1536; `_cosine` dùng `zip` → **cắt ngắn lặng lẽ**, similarity rác |
| P2-6 | `apps/ai-service/app/rag/retrieval.py:89` | Chunk không có `department_ids` được coi là công khai (default-allow); `scope` lấy từ body |
| P2-7 | `apps/ai-service/app/agent/loop.py:484` | `except` bắt cả `ValueError`/`KeyError` → lỗi policy bị báo thành `LLM_UNAVAILABLE`, che mất sự cố thật |
| P2-8 | `apps/ai-service/requirements.txt:1` | Không pin version (`>=`) → build không tái lập được |
| P2-9 | `apps/web/src/services/chatSocket.ts:25` | Khai lại toàn bộ payload WS thay vì import contracts, và **đã lệch** (thiếu `messageId`, `text` bắt buộc thay vì optional) |
| P2-10 | `apps/api/src/routes/chat.ts:7` | Schema request chat khai 2 lần trong API, lệch hẳn `RagQueryRequestSchema` (`message` vs `question`) |
| P2-11 | `apps/web/src/components/EmployeeListView.tsx:27` | Search không debounce, không abort → gõ "an" rồi "anh", response cũ về sau ghi đè |
| P2-12 | `apps/web/src/components/RosterView.tsx:104` | Click hồ sơ A rồi B: response chậm của A ghi đè chi tiết B |
| P2-13 | `apps/web/src/components/chat/ChatPageView.tsx:135` | `url` từ server đưa thẳng vào `href`/`src`, chỉ check `typeof === 'string'` → `javascript:` XSS |
| P2-14 | `apps/web/test/web-integration.test.mjs:109` | Test "integration" chỉ `grep` chuỗi trong source, và đang kiểm tra `ChatPanel` — component không được mount ở đâu |

---

# Chủ đề cắt ngang: contract không phải nguồn sự thật

Đây là gốc rễ của ít nhất 5 lỗi P0/P1. `packages/contracts` được khai là nguồn sự thật, nhưng:

- **Server không implement** những gì contract đã export: `EmployeeUpdateSchema`, `CreateProfileChangeRequestSchema`, `ReviewProfileChangeRequestSchema`, `ConversationSchema` có schema nhưng **không có route** → frontend typecheck xanh mà runtime 404.
- **Client tự khai lại kiểu**: `chatSocket.ts` (10 event), `api.ts:382` (`LLMProvidersResponse`), `auth.middleware.ts:6` (`AuthenticatedUser`), `chat.ts:8` (`chatRequestSchema` khai 2 lần).
- **Output không được validate**: `safeParse` chỉ dùng cho input. `chat:done` phát `reply` ngoài schema mà không ai bắt.
- **Test import `dist/`** trong khi `dist/` bị gitignore và không có bước build trước.

Muốn chặn tái diễn: validate **response** bằng contract ở biên, và thêm một test khẳng định "mọi schema export đều có route tương ứng".

---

# Chưa kiểm chứng (nói rõ để không hiểu sai report)

- **Không chạy** `pnpm build` / `vite build` / `pnpm -r test` đầy đủ (ràng buộc read-only + `web` cần `playwright` không được khai ở package.json nào). Chỉ chạy `tsc --noEmit` và 2 suite test rời.
- **Không xác nhận** `AI_SERVICE_API_KEY` / `JWT_SECRET` trên môi trường deploy thật có rỗng hay không — chỉ đọc `.env.example` và code. Nếu Render đã set đủ thì P0-2/P0-3 giảm mức, nhưng lỗi fail-open vẫn là lỗi thiết kế.
- **Không kiểm tra** dữ liệu Mongo thật: chunk RAG có `departmentIds` không (P2-6), chiều embedding thật (P2-5).
- **Không quét** secret trong git history (`git log -p`) hay `pnpm-lock.yaml`; chỉ quét tracked files hiện tại. P0-1 chắc chắn nằm trong history vì file đang được track.
- **P1-10 không tái hiện được trên máy này** vì `packages/contracts/dist/` đã tồn tại; kết luận dựa trên `.gitignore` + `git ls-files`.
- Chưa audit: `apps/api/src/models/*` (7 file), các route bị chặn 503 (`stores`, `cash`, `schedules`, `corrections`), `render.yaml` (file tự ghi "CHƯA kiểm chứng").

---

# Thứ tự sửa đề xuất

1. **Rotate secret** (P0-1, P0-2) — làm ngay, không cần code review.
2. **Đóng lỗ hổng chiếm quyền** (P0-3, P0-4, P0-5, P1-1, P1-2, P1-3, P1-12).
3. **Sửa 2 luồng nghiệp vụ chết** (P0-6, P0-7) — đây là thứ giảng viên/hội đồng sẽ bấm thử đầu tiên.
4. **Hợp nhất contract** + validate response + bổ sung route còn thiếu (P1-8, P1-9, P2-9, P2-10).
5. **Dựng CI tối thiểu** chạy đủ 6 test file API + contracts (P1-11), và sửa deceptive test (P2-3).
