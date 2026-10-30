# Trạng thái fix — 2026-10-29 09:45 (trên `main`)

> ## Cập nhật 16:30 — lượt fix cuối: 6 claim còn lại + gate #4 e2e (16/16)
>
> **Đã fix + kiểm chứng (lệnh thật, không suy luận):**
>
> | Mục | Fix | Bằng chứng |
> |---|---|---|
> | **P2-10** | `ChatRequestSchema` vào `packages/contracts`; `apps/api/src/routes/chat.ts` bỏ schema khai local | contracts **40/40** (2 test mới) · `api tsc` 0 |
> | **P2-9** | `chatSocket.ts` import type từ contracts (hết tái khai); `ChatPanel.toProposal` trả `ActionProposalData` đầy đủ | `web build` (tsc+vite) exit 0 |
> | **P2-11** | `EmployeeListView`: debounce 300ms cho keystroke + latest-wins guard (query rỗng chạy ngay) | build 0 · e2e pass |
> | **P2-14** | `web-integration.test.mjs` → **`web-integration.source-shape.test.mjs`** (đổi tên trung thực + header) | 13/13 pass |
> | **P1-15** | Xoá `_patch_agent_loop_hardening` khỏi `fake.py` (hết monkey-patch import-time); 2 behavior chuyển thành code thường trong `loop.py`: (a) extractive degraded fallback khi chain rỗng, (b) abstain khi `answer.intent == policy_query` mà 0 citations | `grep "monkey\|AgentLoop.run ="` = 0 · pytest **47/47** · `test_jev*` 21/21 |
> | **P2-8** | `requirements.txt` pin `==` theo runtime thật (py 3.14, freeze 2026-10-29) | 7/7 dòng `==` |
> | **Gate #4** | e2e `e2e-revamp-flow`: sửa mock login username (P0 provisioning), sidebar expect username, match prompt thật, clear `consoleErrors` sau offline probe → **16/16** | chạy 2 lần liền |
>
> **Bug thật phát hiện nhờ e2e (đã sửa trong product code):** `CrmDashboardView` — portal `#crm-custom-view-portal` nằm **bên trong** `#crm-stores-container`, mà toggle cũ set `stores: none` khi rời section "Chi nhánh" ⇒ **mọi section khác (Nhân sự/Hồ sơ/Roster/Settings) invisible**. Sửa: ẩn từng con của stores-container trừ portal (nesting-agnostic). Đây là loại bug `tsc` không thấy được — chỉ e2e bắt được.
>
> **Test env-hoá determinant:** `test_loop.py` thêm fixture neutralize Jev keys (`.env` thật làm `steps=2`); `test_degraded_mode`/`test_agent_loop_fallback_attachments_on_degraded` inject `ProviderChain([])` thay vì `None` (tránh `default_chain()` gọi LLM thật).
>
> **Sự cố 16:08:** cơ chế "Checkout-checkpoint" tự động commit working tree thành `7c20c99` (main) rồi **switch sang `integration/full-delivery`** ⇒ file tạm "quay về cũ". Đã `git checkout main` — không mất gì; toàn bộ work nằm trong `7c20c99`. Cảnh báo: cơ chế này có thể switch branch giữa chừng lần nữa.
>
> **Còn lại (lọc lại, chuẩn logic mới):**
> 1. `apps/api/test_api.py` 7/12 fail **pre-existing** (env harness, fail y hệt trước khi sửa) — tách task riêng.
> 2. `python -m app.agent.loop` self-check fail pre-existing (protocol giả định jev_configured; đã vá `jev_usejevai_keys=""` để không gọi ra ngoài, phần protocol cần viết lại).
> 3. Feature clarify C1→C5 — plan sẵn `plans/261029-0930-agent-clarify/`, chưa viết code.
> 4. Corpus RAG: nạp 145 docs crawl (chờ duyệt), tài liệu két/quỹ, đồng bộ 40 nhãn eval.
> 5. Hậu cấp phát: quên mật khẩu, nâng role OD/OM, key Jev trả phí.
> 6. Phase 08 close-verdict: chưa đóng (cần `jev_gateway_live_check` + quyết định DEFERRED list).
> —Các mục dưới đây là trạng thái 09:45, giữ làm lịch sử—

## VECTOR: ĐÃ XONG — tìm theo nghĩa chạy thật trên dữ liệu Atlas

| Bước | Kết quả |
|---|---|
| Đẩy 62 tài liệu / 84 điều lên Atlas | xong, `policies` = 67 |
| Sinh vector bằng key Google của bạn (xoay 10 key, `x-goog-api-key`) | **116/116 đoạn**, model `gemini-embedding-001`, chiều 3072 |
| Chuyển định dạng `articles` → `chunks` cho 62 tài liệu mới (nếu không, vector không bao giờ được đọc lại) | xong |
| Sửa `default_chain()`: đọc cả **`AI_LLM_API_KEYS`** (pool 10 key, mỗi key 1 provider, key hỏng thì rơi xuống key sau) | `api tsc` 0 · 21/21 test |
| Sửa `_embedding_chain()`: embed dùng model riêng `gemini-embedding-001` (trước đây dùng model text ⇒ 400) | xong |
| **Chạy thử trên dữ liệu thật** | xem dưới |

```
Q: đi làm muộn bị xử phạt thế nào        ← hỏi bằng cách diễn đạt KHÁC văn bản
   → Quy chế GUTA — Giờ làm việc & chấm công / Điều 3   (ev=0.976)
Q: làm thêm giờ có được tính lương không
   → Bộ luật Lao động 2019 / Điều 107                   (ev=1.000)
```

Câu đầu là kiểm tra "diễn đạt khác văn bản" — tìm theo từ khoá hôm qua trả kết quả yếu, tìm theo vector trả
**đúng điều khoản bị phạt đi muộn** với độ tin cậy 0.976. Đây chính là giá trị của vector.

Tự động hoá để chạy lại bất cứ lúc nào:
```bash
python scripts/seed/07-generate-embeddings.py --apply --force   # tạo lại toàn bộ vector
python scripts/seed/06-policies-to-atlas.py --apply             # đẩy tài liệu mới/cập nhật
```
Cả hai idempotent, không in key, xoay key khi gặp 401/403/429.

---

## Đã đẩy dữ liệu lên Atlas + đo lại: chất lượng nhảy từ 0 lên 0.90

Không cần `mongocli` — kết nối dùng chính thư viện của dịch vụ (`pymongo`) và `ATLAS_URI`. Việc thiếu chỉ là
**nội dung nằm trong code mà chưa được đẩy lên database**. Giờ đã tự động hoá:

```bash
python scripts/seed/06-policies-to-atlas.py            # xem trước, không ghi
python scripts/seed/06-policies-to-atlas.py --apply    # đẩy 62 tài liệu + 84 điều lên Atlas
python scripts/seed/06-policies-to-atlas.py --delete   # gỡ đúng những gì script này viết (reversible)
```

Chạy thật: **tạo mới 62 tài liệu** (84 điều), tổng `policies` = **67** tài liệu. Chạy lại lần 2 không đổi gì
(idempotent, khoá theo tên + phiên bản). Muốn gỡ: `--delete`.

### Đo lại ngay trên dữ liệu thật

| Chỉ số | Trước khi đẩy | Sau khi đẩy |
|---|---|---|
| recall@1 | 0.00 | **0.90** |
| recall@3 | 0.00 | **1.00** |
| recall@5 | 0.00 | **1.00** |
| trích dẫn đúng tài liệu | 0.00 | **1.00** |
| bỏ trống câu hỏi hợp lệ | 0.43 | **0.00** |
| thời gian (p95) | 0.3 ms | 0.9 ms |

(Lưu ý trung thực: phần trả lời câu hỏi vẫn là mock khi chưa có key LLM; con số này chứng minh **tìm kiếm
trích dẫn đúng tài liệu**, chưa chứng minh câu trả lời tự nhiên đúng.)

**Điểm còn yếu đo được:** 10 câu hỏi ngoài phạm vi thì **50% vẫn được trả lời** (nên trả lời "ngoài phạm vi").
Đó là việc tinh chỉnh ngưỡng từ chối — làm tiếp được.

## Đánh giá: tài liệu trong Atlas đã đủ chưa? → **CHƯA ĐỦ**

Đo trực tiếp trên `hr_bot.policies`:

| Tài liệu | Đoạn | Ký tự |
|---|---|---|
| Nghị định 145/2020/NĐ-CP | 5 | 1.120 |
| Bộ luật Lao động 2019 | 9 | 2.628 |
| Quy chế GUTA — Giờ làm việc & chấm công | 6 | 1.120 |
| Quy chế GUTA — Nghỉ phép & ngày lễ | 6 | 1.104 |
| Quy chế GUTA — Đề tài, báo cáo & KPI | 6 | 1.142 |
| **Tổng** | **32** | **7.114** |

7.114 ký tự cho toàn bộ quy chế của chuỗi 144 cửa hàng — khoảng 1,5 trang A4. Ba khoảng trống đo được:

1. **Không có một chữ nào về két/quỹ.** Đếm từ khoá trên 32 đoạn: `két/quỹ` = **0**. Nhưng hệ thống có
   intent `cash_audit` và bộ đo có 6 câu hỏi về két tiền ⇒ nhánh này **không thể** trả lời đúng.
2. **Không có thử việc / đào tạo / đồng phục / an toàn** (đều = 0 đoạn). Đây là các câu HR phổ biến nhất.
3. **Bộ đo và dữ liệu lệch nhau hoàn toàn**: 30/30 câu hỏi trỏ vào 4 tài liệu *không tồn tại* trong Atlas
   (9 + 9 + 6 + 6 câu). Không phải "tìm kém" — nhãn trỏ vào tài liệu không có.

**Kết luận:** đủ để demo luồng tra cứu chấm công / nghỉ phép / kỷ luật, **không đủ** để bảo vệ phần đánh giá
chất lượng, và **thiếu hẳn** nghiệp vụ két tiền. Cần bổ sung tối thiểu tài liệu két/quỹ + chốt hướng đồng bộ
nhãn (gán lại 30 nhãn theo 5 tài liệu thật, hoặc nạp 4 tài liệu kia + tạo vector).

Ngoài ra: cả 32 đoạn **không có vector** ⇒ nhánh tìm theo nghĩa (dense) hiện không chạy được; muốn dùng phải
có công cụ tạo vector thật rồi sinh lại vector cho 32 đoạn.

## Việc còn giang dở

| Việc | Trạng thái |
|---|---|
| **Agent hỏi lại (clarify)** | **Đã có plan**: `plans/261029-0930-agent-clarify/plan.md` — 5 phase C1..C5, chưa viết code |
| Bổ sung tài liệu két/quỹ vào Atlas | Chưa — cần nội dung từ bạn (quy chế thật của chuỗi) |
| Đồng bộ nhãn bộ đo 40 câu | Chưa — chờ bạn chọn hướng (gán lại / nạp thêm tài liệu) |
| Sinh vector cho 32 đoạn | Chưa — cần key embedding thật |
| P1-15 module fake tự sửa hành vi agent | Chưa |
| P2-8 khoá phiên bản thư viện | Chưa — cần `pip freeze` trên máy chạy thật |
| P2-9, P2-10 khai lại kiểu dữ liệu | Chưa (trùng lặp, không gây lỗi) |
| P2-11 ô tìm kiếm bắn nhiều request | Chưa |
| P2-14 test chỉ tìm chữ trong code | Chưa |
| Chạy đủ 6 file test của `apps/api` | Chờ image `mongo:7` tải xong (Docker đã bật) |

---

## Test với dữ liệu MongoDB thật (Atlas `hr_bot`)

### Dữ liệu đang có

| Bảng | Số bản ghi |
|---|---|
| employees | **2.439** (tất cả đều có `departmentId`) |
| stores | 144 · departments 37 |
| users | 5 (cả 5 đều gắn `employeeId`) |
| policies | **5 tài liệu → 32 đoạn** |
| schedule_entries | 3.275 · schedule_blocks 105 · attendance_corrections 115 |
| raw_cells | 32.980 |

### Phát hiện 1 — lỗi thật, đã sửa: chat mặc định **hỏng** trên dữ liệu thật

32 đoạn quy chế trong Atlas **không có vector** (`embedding` rỗng ở cả 32). Retriever mặc định là `hybrid`,
mà hybrid cần vector ⇒ dựng retriever là **ném lỗi**:

```
hybrid: ERROR ValueError: DenseRetriever needs an embedder for chunks without embeddings
```

Nghĩa là: chạy với dữ liệu thật, mọi câu hỏi quy chế đều lỗi. Test bằng dữ liệu mẫu (seed) không bao giờ
thấy lỗi này vì seed có vector.

**Đã sửa**: `build_retriever` tự lùi về tìm theo từ khoá khi không có vector, và ghi log rõ ràng. Kiểm lại:

```
lexical  | Đi muộn 10 phút bị phạt bao nhiêu? | Quy chế GUTA — Giờ làm việc và chấm công / Điều 3
hybrid   | Đi muộn 10 phút bị phạt bao nhiêu? | Quy chế GUTA — Giờ làm việc và chấm công / Điều 3
lexical  | Làm thêm giờ tính lương thế nào?    | Bộ luật Lao động 2019 / Điều 98
hybrid   | Làm thêm giờ tính lương thế nào?    | Bộ luật Lao động 2019 / Điều 98
```

### Phát hiện 2 — bộ đo chất lượng **không dùng được** với dữ liệu thật

Chạy `eval/run_eval.py --corpus db` cho ra recall@1/@3/@5 = **0.00**. Nhưng đó không phải vì tìm kém:

```
in-scope items: 30 | expectedDocument khớp đúng title nào đó trong DB: 0
nhãn không tồn tại trong DB:
  - Nội Quy Lao Động & Khen Thưởng Kỷ Luật GUTA
  - Quy Chế Chấm Công & Giải Trình Công GUTA
  - Quy Chế Quản Lý Két Tiền & Kiểm Kê Quỹ Ca
  - Quy Định Vận Hành Ca Kíp Cửa Hàng GUTA
```

Bộ 40 câu hỏi được gán nhãn cho **4 tài liệu khác** — 4 tài liệu đó không có trong Atlas. 0/30 nhãn khớp ⇒
mọi chỉ số đều bằng 0 bất kể retriever tốt hay dở. Muốn đo thật phải làm một trong hai:
(a) gán lại nhãn 40 câu theo 5 tài liệu đang có, hoặc (b) nạp 4 tài liệu kia vào Atlas rồi tạo vector cho chúng.

### Đã kiểm chứng bằng dữ liệu thật

- `users` → `employees`: 5/5 liên kết đúng ⇒ phần lấy mã nhân viên + cửa hàng cho chat (P1-7) chạy được với dữ liệu thật.
- `employees.departmentId`: 2.439/2.439 có giá trị ⇒ phạm vi theo cửa hàng dùng được.
- `profileChangeRequests`: chưa có bản ghi nào (tính năng mới) — route mới ghi vào đúng chỗ này.

---

## Xong trong lượt trước (5 mục)

| Mục | Đã làm | Kiểm chứng |
|---|---|---|
| **P1-17** | Thêm mục **"Hồ sơ của tôi"** vào menu trái; bấm vào mở `EmployeeProfileView` (trước đây file có nhưng không có chỗ nào mở) | `web tsc --noEmit` exit 0 |
| **P1-8** | Viết 3 route còn thiếu: `POST/GET /api/employees/:id/change-requests` và `GET /api/change-requests?status=` (duyệt theo phòng ban). Dữ liệu lưu trong chính hồ sơ nhân viên, không thêm collection (ADR-018) | `api tsc --noEmit` exit 0 |
| **P1-7** (phần dữ liệu) | Khi nhân viên chat, hệ thống giờ lấy được **mã nhân viên + cửa hàng** từ tài khoản (trước chỉ có mã tài khoản và quyền) | `api tsc` exit 0 |
| **P2-5** | Bỏ việc tự tạo vector giả khi thiếu công cụ thật. Giờ báo lỗi rõ ràng thay vì trả kết quả rác | `py_compile` OK |
| **P1-16** | Sửa vòng lặp tải lại vô hạn ở màn "Đề tài": hàm thông báo đổi mỗi lần vẽ lại nên effect chạy mãi | `web tsc` exit 0 |

## Chưa làm — và vì sao (nói thẳng)

| Mục | Tình trạng |
|---|---|
| **"Agent hỏi lại"** (ý bạn: câu hỏi global thì trả lời luôn, cần biết cửa hàng nào thì agent đưa menu cho user chọn) | **Chưa làm.** Đây là tính năng mới, không phải bug: phải thêm kiểu trả lời `clarify` (câu hỏi + danh sách lựa chọn) vào agent, và UI vẽ menu chọn. Cần ~1 lượt làm riêng. |
| P2-6 (tài liệu không gắn cửa hàng) | **Theo ý bạn là đúng thiết kế**: quy chế chung thì trả lời chung, không cần chặn. Chỉ còn phần "hỏi lại khi cần cửa hàng" ở trên. |
| P1-15 (module fake tự sửa hành vi agent khi import) | Chưa làm — refactor lớn, chạm nhiều test |
| P2-8 (khoá phiên bản thư viện) | Chưa làm — cần chạy `pip freeze` trên máy thật |
| P2-9, P2-10 (khai lại kiểu dữ liệu ở 2 nơi) | Chưa làm — trùng lặp, không gây lỗi |
| P2-11 (ô tìm kiếm bắn quá nhiều request) | Chưa làm |
| P2-14 (test chỉ tìm chữ trong code) | Chưa làm |

## Chuyện "bị chặn" — đã xử lý

Test đầy đủ cần MongoDB ở máy. Docker Desktop có nhưng chưa bật → đã bật, và đang tải image `mongo:7`
(chậm do mạng). Tải xong là chạy được `npm test` đầy đủ 6 file.

Lưu ý: bộ test **cố tình cấm** dùng Atlas (`require-isolated-db.mjs` chặn `ATLAS_URI`), nên IP Access List
`0.0.0.0/0` không giúp gì cho test — phải là database riêng trên máy.

---

## (Bản cũ) Đã xong trước đó: 18 mục

| Mục | Fix | Kiểm chứng |
|---|---|---|
| **P0-2** | Xoá `DEFAULT_JWT_SECRET`; thiếu secret → throw; dev opt-in `ALLOW_DEV_JWT_SECRET=1` dùng secret random per-process; chặn secret < 32 ký tự | `tsc --noEmit` exit 0 · `grep DEFAULT_JWT_SECRET` = 0 |
| P1-3 | Gắn `authenticateToken` vào `GET /attachments/:category/:filename` | `tsc` 0 |
| P1-4 | Rate limit 5 lần/5 phút theo `ip+email`; nhánh "không có user" chạy dummy hash để cân thời gian | `tsc` 0 · **chưa chạy test** (cần Mongo) |
| P1-5 | Transition fail ⇒ `findByIdAndDelete` report vừa tạo (bù trừ tường minh, ADR-004) | `tsc` 0 |
| P1-6 | Bỏ câu "đã thực thi an toàn"; nói đúng "chưa có thay đổi dữ liệu nào" + TODO executor | đọc code |
| P1-9 | `ChatDonePayloadSchema` thêm `reply`/`proposedAction`/`degraded`/`decisionSource` | contracts **38/38 pass** |
| P1-13 | `_cors_origins()` allowlist; `*` + credentials ⇒ từ chối khởi động | chạy thật: `*` bị chặn |
| P1-14 | Action chỉ được đề xuất khi **router rule** và **LLM** cùng khớp intent | `python -m unittest tests.test_jev*` 21/21 |
| P2-4 | `shutdown(wait=False, cancel_futures=True)` ⇒ timeout tool có hiệu lực | `py_compile` OK |
| P2-7 | Tách `except`: transport → `LLM_UNAVAILABLE` (retryable); logic → `AGENT_LOGIC_ERROR` (non-retryable) | 21/21 |
| P2-12 | `detailRequestId` ref chặn response cũ ghi đè chi tiết mới | `web tsc --noEmit` exit 0 |
| J-1 | `JEV_USEJEVAI_TIMEOUT_MS` 15000 → **6000** (API abort ở 15s) | config load đúng |
| J-2 | `load_settings()` validate pool timeout ≤ decision timeout; `AI_DECISION_TIMEOUT_MS` 5000 → 8000 | config load đúng |
| J-3 | Không cache turn `degraded` | 21/21 |
| J-4 | `load_dotenv` trong `config.py` ⇒ `uvicorn app.main:app` cũng có key | `jev keys loaded = True` khi chỉ import config |
| J-5 | Bỏ tunnel `abc-tunnel.us` khỏi source; thiếu `AI_LLM_BASE_URL` ⇒ fail-closed | `tsc` 0 · `grep abc-tunnel` = 0 |
| J-6 | `_POOLS.clear()` trước khi tạo pool mới | 21/21 |

**Đã fix từ trước (không phải việc của đợt này):** P0-1, P0-3, P0-4, P0-5, P0-6, P0-7, P1-1, P1-2, P1-10
(`pretest` build), P1-11, P1-12, P2-1, P2-2, P2-3, P2-13.

## Còn lại: 12 mục

| Mục | Vì sao chưa xong |
|---|---|
| P1-7 | `userContext` qua socket thiếu `employeeId`/`departmentId` — `User` model không có `departmentId`, phải join `Employee`; cần quyết định: nhét vào JWT claims hay lookup mỗi connection |
| P1-8 | Web gọi `change-requests` (endpoint không tồn tại) — phải quyết định xoá caller hay dựng route |
| P1-15 | `fake.py` monkey-patch `AgentLoop.run` lúc import — refactor sang DI, chạm nhiều test |
| P1-16 | `onNotify` không memo trong `ProjectListView` — cần đọc luồng props |
| P1-17 | Mount `EmployeeProfileView` — cần biết đặt vào tab nào (quyết định UX) |
| P2-5 | Embedder fallback — chặn hẳn hay chỉ log (quyết định hành vi) |
| P2-6 | Chunk thiếu `department_ids` = public — đổi mặc định sẽ ảnh hưởng eval RAG |
| P2-8 | Pin `requirements.txt` — cần `pip freeze` từ môi trường chạy thật |
| P2-9 | `chatSocket.ts` khai lại payload — chờ P1-9 xong (đã xong) nên làm được ngay |
| P2-10 | Schema chat khai lại trong `apps/api` — cần thêm `ChatRequestSchema` vào contracts |
| P2-11 | Search không debounce/abort trong `EmployeeListView` |
| P2-14 | `web-integration.test.mjs` chỉ grep chuỗi |

## Chặn hạ tầng (không phải bug)

`npm test` của `apps/api` **treo** vì `db-guard`/`auth` cần Mongo ở `127.0.0.1:27017`. Muốn cổng kiểm chứng
số 2 chạy được phải dựng Mongo local, hoặc chỉ chạy từng file (`chat-gateway` 6/6 đã pass).
