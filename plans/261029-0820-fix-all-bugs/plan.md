---
plan: fix-all-bugs
created: 2026-10-29 08:20 (+07)
mode: parallel (file-ownership waves)
source_audits:
  - plans/reports/team-lead-261027-1758-audit-readonly-full-stack.md (38 claim)
  - plans/reports/audit-261028-recheck-verdict.md (§1-§7 + §8 J-1..J-6)
  - reports/2026-10-23/pre-demo-readiness-audit.md (UI tiền demo)
status: ready-for-execution
---

# Plan: fix toàn bộ bug còn lại, theo thứ tự không xung đột

## 0. Verdict trước khi lên lịch: **audit cũ đã lỗi thời, đừng fix theo nó**

`node scripts/verify-claims.mjs` hôm nay trả **17 VERIFIED · 18 DRIFT · 3 FAIL** — hôm qua là 38/38
VERIFIED. Nghĩa là working tree đã đổi đáng kể. Spot-check bằng mắt xác nhận **5 claim đã fix xong** trong
khi audit vẫn ghi "chưa fix":

| Claim | Audit nói | Thực tế hôm nay | Bằng chứng |
|---|---|---|---|
| P0-1 | key LLM hardcode trong file tracked | **ĐÃ FIX** | `grep "sk-" apps/ai-service/tests/test_live_db_chat.py` → 0 kết quả |
| P0-3 | `_verify_service_key` fail-open | **ĐÃ FIX** | `main.py:80-90` raise `503 SERVICE_KEY_NOT_CONFIGURED` (fail-closed) |
| P0-4 | cache key chỉ theo `configVersion` | **ĐÃ FIX** | `chain.py:4-5,84` hash toàn payload, `configVersion` chỉ là prefix |
| P0-6 | web gọi `/projects/:id/reports` (404) | **ĐÃ FIX** | `web/src/services/api.ts:337-345` gọi `/reports`, có comment giải thích |
| P1-11 | script test chỉ 2/6 file | **ĐÃ FIX** | `apps/api/package.json` liệt kê đủ 6 file |

Và **2 claim vẫn còn bug nhưng anchor đã dời** (nên đừng tin "DRIFT = đã fix"):

| Claim | Thực tế |
|---|---|
| P0-2 | `auth.service.ts:15` vẫn `DEFAULT_JWT_SECRET = "hr-blockbot-super-secret-…"` → **CÒN BUG** |
| P0-5 | `projects.ts:309` vẫn chỉ chặn `IN_PROGRESS` + Employee → **CÒN BUG** (dời 251 → 309) |

**Hệ quả cho kế hoạch:** bắt buộc có Phase 00 re-triage ngữ nghĩa 21 claim DRIFT/FAIL trước khi sửa. Không có
bước này, ít nhất 5 "bug" sẽ được fix lần hai (vô nghĩa) và 2 bug thật bị bỏ qua vì tưởng đã xong.

> Bài học ghi vào quy trình: `verify-claims.mjs` chỉ kiểm **anchor còn ở đúng dòng**, không kiểm **bug còn
> tồn tại**. P1-11 là ví dụ ngược: anchor `--test test/db-guard.test.mjs test/auth.test.mjs` vẫn khớp (vì là
> tiền tố của danh sách 6 file) nhưng bug đã hết → anchor xanh mà bug đã chết.

---

## 1. Kho bug thực tế (3 rổ)

| Rổ | Nội dung | Số lượng | Cách xử lý |
|---|---|---|---|
| **A. Chắc chắn còn bug** | 17 claim VERIFIED + P0-2 + P0-5 (đã spot-check bằng mắt) | **19** | vào thẳng phase fix |
| **B. Cần re-triage** | 18 DRIFT + 3 FAIL − (5 đã xác nhận fix) | **~16** | Phase 00 đọc code, phân FIXED / STILL-BUG / N/A |
| **C. Bug mới đợt Jev** | J-1..J-6 (§8 audit 28/10) | **6** | Phase 05 + 06 |

Tổng thực tế phải sửa: **~19 chắc chắn + ~16 chờ phân loại + 6 mới ≈ 25–41 mục**.

### 1.1 Danh sách ban đầu (trước re-triage — **ĐÃ BỊ THAY THẾ**, xem §1.2)

| ID | Mức | File | Vấn đề |
|---|---|---|---|
| P0-2 | P0 | `apps/api/src/services/auth.service.ts:15` | JWT secret hardcode fallback |
| P0-5 | P0 | `apps/api/src/routes/projects.ts:309` | Chỉ nhánh `IN_PROGRESS` kiểm role; Employee set `COMPLETED` được |
| P0-7 | P0 | `apps/web/src/components/AdminSettingsView.tsx:58,139` | `toFormState` trả `apiKey: ''` ⇒ key Admin gõ bị mất |
| P1-1 | P1 | `apps/api/src/routes/reports.ts:79` | GET report detail không check scope |
| P1-2 | P1 | `apps/api/src/routes/projects.ts:159` | GET project detail không check department scope |
| P1-3 | P1 | `apps/api/src/routes/attachments.ts:58` | Route tải attachment thiếu `authenticateToken` |
| P1-4 | P1 | `apps/api/src/routes/auth.ts:38` | Login không rate limit + timing enumeration |
| P1-5 | P1 | `apps/api/src/routes/reports.ts:37` | Tạo report trước transition, không bù trừ |
| P1-6 | P1 | `apps/api/src/socket.ts:144` | `chat:confirm` báo "đã thực thi" nhưng không gọi service |
| P1-7 | P1 | `apps/api/src/socket.ts:79` | `userContext` qua socket thiếu `employeeId`/`departmentId` |
| P1-8 | P1 | `apps/web/src/services/api.ts:218` | Gọi endpoint `change-requests` không tồn tại |
| P1-9 | P1 | `apps/api/src/socket.ts:89` | `chat:done` phát field ngoài `ChatDonePayloadSchema` |
| P1-10 | P1 | `packages/contracts/test/contracts.test.mjs:47` | Test import `../dist` trong khi `dist` bị gitignore |
| P1-12 | P1 | `apps/ai-service/app/llm/openai_compatible.py` | `baseUrl` từ request, không allowlist host |
| P1-13 | P1 | `apps/ai-service/app/main.py:49` | CORS `*` + `allow_credentials=True` |
| P1-14 | P1 | `apps/ai-service/app/agent/loop.py` | Gate intent/action tự xác nhận vòng tròn |
| P1-15 | P1 | `apps/ai-service/app/llm/fake.py:191` | Monkey-patch `AgentLoop.run` lúc import, `except: pass` |
| P1-16 | P1 | `apps/web/src/components/ProjectListView.tsx:108` | `onNotify` không memo ⇒ refetch vô hạn |
| P1-17 | P1 | `apps/web/src/components/CrmDashboardView.tsx:961` | `EmployeeProfileView` không được mount |
| P2-* | P2 | (11 mục) | xem `claims.json` |

### 1.2 Danh sách fix THẬT sau Phase 00 (`retriage.md`, 08:30)

**31 mục.** Đã loại 13 mục vì đã fix sẵn trong working tree: P0-1, P0-3, P0-4, P0-6, P0-7, P1-1, P1-2,
P1-11, P1-12, P2-1, P2-2, P2-3, P2-13.

| Phase | Mục còn phải fix |
|---|---|
| 02 | **P0-2** (JWT secret), P1-13 (CORS) |
| 03 | P1-5 (report mồ côi), P1-8 (endpoint chết) |
| 04A | **P0-5** (transition whitelist) |
| 04B | P1-6 (confirm nói dối), P1-7 (userContext), P1-9 (payload schema) |
| 04C | P1-3 (attachment auth), P1-4 (rate limit login), P2-10 (schema chat) |
| 05 | P1-15 (monkey-patch), J-1, J-2, J-4, J-5, J-6 |
| 06A | P1-14 (gate vòng tròn), P2-7 (gộp lỗi), J-3 (cache degraded) |
| 06B | P2-4 (timeout tool), P2-5 (embedder partial), P2-6 (chunk public), P2-8 (pin deps) |
| 07 | P1-16 (refetch), P1-17 (mount), P2-9, P2-11, P2-12, + AuthContext + nhãn nav |
| 01 | P1-10, P2-14 |

Đã fix trong đợt này (đừng làm lại): xem `retriage.md` §"Kết quả".

---

## 2. Ma trận xung đột (file → claim → phase)

Một file **chỉ thuộc một phase**. Trong cùng phase, hai worker không được chạm cùng file.

| File | Claim | Phase |
|---|---|---|
| `apps/ai-service/app/main.py` | P0-3 (done), P1-13, P2-5 | **02** |
| `apps/api/src/services/auth.service.ts` | P0-2 | **02** |
| `apps/api/src/routes/reports.ts` | P0-6s (done), P1-1, P1-5, P2-1 | **03** |
| `apps/web/src/services/api.ts` | P0-6c (done), P1-8 | **03** |
| `apps/api/src/routes/projects.ts` | P0-5, P1-2, P2-2 | **04A** |
| `apps/api/src/socket.ts` | P1-6, P1-7, P1-9 (+ `decisionSource` đã thêm) | **04B** |
| `apps/api/src/routes/attachments.ts` | P1-3 | **04C** |
| `apps/api/src/routes/auth.ts` | P1-4 | **04C** |
| `apps/api/src/routes/chat.ts` | P2-10 (+ `decisionSource` đã thêm) | **04C** |
| `apps/ai-service/app/llm/chain.py` | P0-4 (done) | 05 (chỉ verify) |
| `apps/ai-service/app/llm/openai_compatible.py` | P1-12 | **05** |
| `apps/ai-service/app/llm/fake.py` | P1-15 | **05** |
| `apps/ai-service/app/config.py` | J-1, J-2, J-4 | **05** |
| `apps/api/src/services/ai-client.service.ts` | J-1, J-5 | **05** |
| `apps/ai-service/app/agent/jev_gateway.py` | J-6 | **05** |
| `apps/ai-service/app/agent/loop.py` | P1-14, P2-7, J-3 | **06A** |
| `apps/ai-service/app/agent/tools.py` | P2-4 | **06B** |
| `apps/ai-service/app/rag/retrieval.py` | P2-6 | **06B** |
| `apps/ai-service/requirements.txt` | P2-8 | **06B** |
| `apps/web/src/components/AdminSettingsView.tsx` | P0-7 | **07** |
| `apps/web/src/components/CrmDashboardView.tsx` | P1-17 + nav label + AuthContext liên quan | **07** |
| `apps/web/src/components/ProjectListView.tsx` | P1-16 | **07** |
| `apps/web/src/components/EmployeeListView.tsx` | P2-11 | **07** |
| `apps/web/src/components/RosterView.tsx` | P2-12 | **07** |
| `apps/web/src/components/chat/ChatPageView.tsx` | P2-13 | **07** |
| `apps/web/src/services/chatSocket.ts` | P2-9 | **07** |
| `apps/web/src/context/AuthContext.tsx` | audit 23/10 #5 (`ERR_CONNECTION_REFUSED`) | **07** |
| `apps/api/test/auth.test.mjs` | P2-3 | **01** |
| `packages/contracts/test/contracts.test.mjs` | P1-10 | **01** |
| `apps/web/test/web-integration.test.mjs` | P2-14 | **01** |
| `apps/api/package.json` | P1-11 (done) | 01 (verify) |

---

## 3. Thứ tự phase (và chỗ nào chạy song song được)

```text
00 re-triage (đọc code, không sửa)      ── bắt buộc trước mọi thứ
        │
01 test infra                            ── để verify có nghĩa
        │
02 secrets & service auth  (P0-2, P1-13, P2-5)
        │
03 reports flow            (P1-1, P1-5, P2-1, P1-8)
        │
        ├── 04A projects RBAC   (P0-5, P1-2, P2-2)     ┐
        ├── 04B socket scope    (P1-6, P1-7, P1-9)     ├─ 3 worker song song, file rời nhau
        └── 04C small API       (P1-3, P1-4, P2-10)    ┘
        │
        ├── 05 LLM transport    (P1-12, P1-15, J-1, J-2, J-4, J-5, J-6)
        └── 06A agent loop      (P1-14, P2-7, J-3)     ┐
            06B tools/RAG/deps  (P2-4, P2-6, P2-8)     ┘ song song
        │
07 web UI (P0-7, P1-16, P1-17, P2-9, P2-11..13, AuthContext, nav)
        │
08 verify toàn bộ + đóng audit + cập nhật docs
```

**Vì sao thứ tự này:**

1. **00 trước tất cả** — vì audit lỗi thời (mục 0). Fix theo danh sách cũ = 5 mục vô ích.
2. **01 trước 02** — P1-10/P2-3/P2-14 làm test có khả năng phát hiện lỗi thật; sửa bảo mật mà test giả thì không biết mình vá đúng hay sai.
3. **02 trước 03/04** — secret và service auth là P0, mọi thứ khác đứng sau.
4. **03 trước 04** — Phase 03 chốt shape response của reports (scope + atomicity); 04A/04C dùng lại helper scope đó, làm ngược sẽ phải sửa hai lần.
5. **04A/04B/04C song song** — 3 file khác nhau, không share helper mới (nếu cần helper chung, viết trong `apps/api/src/utils/scope.ts` ở **04A** rồi 04B/04C import).
6. **05 và 06 song song** — `ai-service` transport vs agent loop, file rời nhau; nhưng **06A phải sau 05** nếu J-2 đổi cách `config.py` đọc timeout (06A không đọc config đó → thực tế an toàn).
7. **07 cuối** — UI phụ thuộc contract của 03/04 (endpoint + field). Làm UI trước sẽ phải sửa lại.
8. **08** — chỉ tuyên bố xong khi 6 bộ lệnh ở §5 đều xanh.

---

## 4. Luật thi hành (chống xung đột)

1. **Một file — một worker — một phase.** Không ai sửa file ngoài danh sách file của phase mình.
2. **Không reformat, không đổi import order, không "dọn dẹp"** file ngoài phạm vi diff. Mỗi dòng diff phải
   truy vết được về một claim ID.
3. **Không tạo helper dùng chung** trừ khi ghi rõ trong phase sở hữu nó (04A sở hữu `utils/scope.ts`).
4. **Commit theo phase**, message dạng `fix(<scope>): <claim ids>` — scope whitelist: `auth | hr | project |
   chatbot | ai | dashboard | realtime | docs | ci`. Ví dụ `fix(auth): P0-2 remove hardcoded JWT fallback`.
5. **Không commit gộp nhiều phase** — nếu phase sau fail, phase trước vẫn revert được độc lập.
6. **`.env` không bao giờ vào git**; key mới chỉ đặt qua env/dashboard.
7. **Không tuyên bố "đã fix"** khi chưa chạy lệnh verify của phase và đọc output.

---

## 5. Cổng kiểm chứng (chạy lại ở phase 08)

```bash
# 1. contracts
pnpm --filter @hr-blockbot/contracts test

# 2. api (6 file, sau P1-11)
cd apps/api && npm test

# 3. ai-service (unittest — pytest không có trong môi trường này)
cd apps/ai-service && python -m unittest discover -s tests -p "test_jev*.py"
cd apps/ai-service && python -m unittest discover -s tests -p "test_retrieval.py"

# 4. web unit + e2e
node --test apps/web/test/landing-workflow.test.mjs
node --test apps/web/test/web-integration.test.mjs
node --test apps/web/test/e2e-revamp-flow.test.mjs   # 6 fail cũ: 5 test lỗi thời + 1 lỗi thật (AuthContext)

# 5. build
pnpm --filter web build && pnpm --filter api build

# 6. Jev smoke (không tốn tiền: trial)
python scripts/jev_smoke.py --dry-run
python scripts/jev_gateway_live_check.py
```

**Điều kiện đóng plan:** 1-6 xanh, **hoặc** mọi dòng đỏ được ghi rõ là "đã biết, chấp nhận" kèm lý do trong
`plans/reports/audit-261029-close-verdict.md`.

---

## 6. Rủi ro & cách né

| Rủi ro | Ảnh hưởng | Né |
|---|---|---|
| Fix P0-5 (RBAC projects) làm hỏng luồng demo đang chạy | Demo gãy trước hội đồng | 04A phải chạy `chat-gateway.test.mjs` + smoke 2 luồng: Employee tạo report, SM duyệt |
| P0-7 (apiKey) sửa sai → mất key Admin | Không gọi được LLM | test tay: lưu provider → reload → `hasKey` phải true, không in key ra |
| J-1 hạ timeout quá thấp | Trial chậm 2,5–3,7s ⇒ timeout oan | đặt 6000ms, đo lại bằng `jev_gateway_live_check.py` trước khi chốt |
| Phase 00 kết luận sai "đã fix" | Bug lọt ra demo | mỗi kết luận FIXED phải kèm **lệnh + output**, không kèm suy luận |
| Sửa 25–41 mục trong 1 lượt | Không ai review nổi | commit theo phase, mỗi phase ≤ 6 file |

---

## 7. Phase files

| Phase | File | Mục tiêu |
|---|---|---|
| 00 | `phase-00-retriage.md` | Phân loại 21 claim DRIFT/FAIL |
| 01 | `phase-01-test-infra.md` | Test có khả năng phát hiện lỗi |
| 02 | `phase-02-secrets.md` | P0-2, P1-13, P2-5 |
| 03 | `phase-03-reports.md` | P1-1, P1-5, P2-1, P1-8 |
| 04 | `phase-04-rbac-socket.md` | P0-5, P1-2, P2-2 ‖ P1-6/7/9 ‖ P1-3, P1-4, P2-10 |
| 05 | `phase-05-llm-transport.md` | P1-12, P1-15, J-1, J-2, J-4, J-5, J-6 |
| 06 | `phase-06-agent-rag.md` | P1-14, P2-7, J-3 ‖ P2-4, P2-6, P2-8 |
| 07 | `phase-07-web-ui.md` | P0-7, P1-16, P1-17, P2-9, P2-11..13, AuthContext, nav |
| 08 | `phase-08-verify-close.md` | Chạy 6 cổng, đóng audit, cập nhật docs |
