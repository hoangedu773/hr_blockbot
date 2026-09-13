# 14 — DevOps & Triển khai

Khóa luận **KLCN133**. File này trả lời: **hệ thống chạy ở đâu**, **biến môi trường nào**, **pipeline CI/CD ra
sao**, **khi nào có lệnh chạy thật**, và **khi nó hỏng thì làm gì**.

Nguồn:

| Phần | Nguồn |
|---|---|
| Kiến trúc triển khai theo đề cương: Backend & AI Service trên Render/VPS Ubuntu; MongoDB Atlas M0; Frontend Web/Chatbot Client trên Vercel/Netlify | `docs/research/RESEARCH-PLAN.md` §1 |
| Trần hạ tầng: Atlas 0.5 GB / connections / ops/s / **không backup tự động** / tối đa 3 Search-Vector index; Render sleep 15' + wake ~1'; Vercel WS Public Beta; Netlify phù hợp frontend hơn | `NOTES-01.md` §B1 |
| Socket.IO 1 instance không Redis, rooms, 9 event, `clientMessageId`, một namespace | `NOTES-01.md` §B7; ADR-010 |
| Thứ tự CI + bộ công cụ test + mocked/nightly | `NOTES-01.md` §B10; ADR-016 |
| Fitness functions và luật *"mỗi gate phải có lệnh CI"* | `RESEARCH-PLAN.md` §11; `02-architecture.md` §9 |
| Agenda (job store trên Mongo), idempotency, job survive restart | `NOTES-01.md` §B15; ADR-011 |
| `make demo` + seed có khoá (S14) | `RESEARCH-PLAN.md` §9 S14, §11; `05-data-model.md` §6.2 |
| Notification matrix (lịch nhắc + chống spam) | `NOTES-01.md` §B0; `18-user-flows.md` |
| Scope commit `auth\|hr\|project\|chatbot\|ai\|dashboard\|realtime\|docs\|ci` | `NOTES-01.md` §B11; `15-engineering-conventions.md` §1.2 |
| S9 graceful degradation khi hết quota | `RESEARCH-PLAN.md` §9 |

> **Trạng thái repo:** chưa có mã nguồn, chưa có workflow file (`README.md`). Toàn bộ lệnh dưới đây là
> **cam kết dựng tuần 1**; gate nào chưa có lệnh thì **chưa bật**, và file này ghi thẳng như vậy thay vì giả
> vờ xanh (`RESEARCH-PLAN.md` §11).

---

## 1. Ma trận môi trường

| | **local** | **dev (staging)** | **prod (demo/nghiệm thu)** |
|---|---|---|---|
| Mục đích | code + unit/integration test | tích hợp liên tục, UAT nội bộ, chạy eval | trình diễn cho GVHD/hội đồng + UAT |
| `apps/web` | `pnpm --filter web dev` (Vite) | Vercel **hoặc** Netlify preview | Vercel **hoặc** Netlify |
| `apps/api` | `pnpm --filter api dev` (nodemon/tsx) | Render free | Render free **hoặc** VPS Ubuntu |
| `apps/ai-service` | `uvicorn` trên máy | Render free service riêng **hoặc** cùng VPS | như dev |
| Database | `mongodb-memory-server` (test) **hoặc** một Atlas M0 dev | **Atlas M0 (cluster dev)** | **Atlas M0 (cluster demo)** — **cùng free tier, khác database** |
| LLM | **mock provider tất định** (`temperature=0`, fixture) | provider thật, quota thấp | provider thật + **S9 fallback đã bật** |
| Seed | `make demo` | `make demo` | `make demo` **trước** mỗi buổi demo |
| Realtime | 1 instance, WS local | 1 instance | 1 instance (Render hỗ trợ WS — `§B1`) |
| Ai được phép deploy | cả ba người | tự động từ `main` qua CI | **một người được chỉ định** + 1 người xác nhận qua chat (không ai deploy một mình trước buổi bảo vệ) |

Ba quy tắc:

1. **Không có env "production" theo nghĩa doanh nghiệp.** Prod ở đây = *môi trường demo công khai*. Nó chia
   sẻ chính xác một rủi ro với production thật: **dữ liệu không có backup** (`§B1`).
2. **Không chạy `make demo` trên cluster prod** khi đang có người dùng thử (`05` §6.2: *"cấm chạy trên Atlas
   production"*). Prod và dev là hai database khác nhau trong cùng cluster, không phải cùng một database.
3. **Không có secret nào trong repo**, kể cả secret dev (`15` §5.5, gate `gitleaks`).

### 1.1 Biến môi trường (tên — **không ghi giá trị bí mật**)

| Tên | Nơi dùng | Ý nghĩa | Bắt buộc ở env nào | Giá trị |
|---|---|---|---|---|
| `NODE_ENV` | api, web build | `development` / `test` / `production` | tất cả | công khai |
| `PORT` | api | cổng HTTP (Render cấp) | dev, prod | công khai |
| `MONGODB_URI` | api, ai-service, seed | connection string Atlas (đóng dấu) | tất cả | **BÍ MẬT** |
| `MONGODB_DB_NAME` | api, seed | tách dev / demo / test trên cùng cluster | tất cả | công khai |
| `JWT_ACCESS_PUBLIC_KEY` | api (`jose`) | key verify/signed access token | dev, prod | **BÍ MẬT** |
| `JWT_ACCESS_TTL` | api | hạn access token | tất cả | **`TBD — chưa chốt`** (`07-auth-rbac.md` A-01) |
| `REFRESH_TOKEN_TTL` | api | hạn refresh token | tất cả | **`TBD — chưa chốt`** (A-01) |
| `REFRESH_HASH_KEY` | api | khoá HMAC cho `tokenHash`/`ipHash` (`07` §4, A-03) | dev, prod | **BÍ MẬT**, thuật toán `[CẦN NGUỒN]` |
| `RT_COOKIE_SAMESITE` | api | `strict` / `lax` (`07` §4, A-02 — chưa chốt vì web và API khác domain) | dev, prod | **`TBD`** |
| `WEB_ORIGIN` | api | origin được phép cho cookie/CORS (CORS **chưa có trong nguồn** — `07` §9 mục 38) | dev, prod | công khai |
| `AI_SERVICE_URL` | api | địa chỉ FastAPI nội bộ | dev, prod | công khai |
| `AI_SERVICE_SHARED_SECRET` | api ↔ ai-service | auth nội bộ giữa hai service — **hình thức (shared secret hay HMAC) chưa chốt**: `02-architecture.md` §12 điểm #5 `[CẦN NGUỒN]` | dev, prod | **BÍ MẬT** |
| `LLM_PROVIDER` | ai-service | `gemini` \| `groq` \| `openai` \| `mock` (`§B6`, ADR-012) | tất cả | công khai |
| `LLM_API_KEY` | ai-service | key provider | dev, prod | **BÍ MẬT** |
| `LLM_MODEL` | ai-service | tên model đã pin | tất cả | công khai |
| `LLM_MAX_STEPS` | ai-service | guard `maxSteps = 5` (`§B6`) | tất cả | công khai, mặc định 5 |
| `LLM_TOOL_TIMEOUT_MS`, `LLM_TIMEOUT_MS`, `LLM_MAX_TOOL_RESULT_BYTES` | ai-service | ba guard còn lại (`§B6`) | tất cả | **ngưỡng `TBD`** |
| `EMBEDDING_MODEL` | ai-service | model nhúng đang bật (S3 đổi qua lại giữa 4 ứng viên — `§B5`) | tất cả | công khai |
| `EMBEDDING_CACHE_MAX_ENTRIES` | ai-service | trần cache embedding (`12-performance.md` §4.4) | dev, prod | **`TBD`** |
| `AGENDA_CONCURRENCY`, `AGENDA_LOCK_LIMIT`, `AGENDA_RETRY` | api | tham số Agenda — **không có trong `NOTES-01`** → `[CẦN NGUỒN]` (ADR-011 mục "Đánh đổi") | dev, prod | **`TBD`** |
| `SCHEDULER_ENABLED` | api | **chỉ một entrypoint** được start scheduler (ADR-011: hai process cùng start sẽ tranh job) | tất cả | công khai (`true`/`false`) |
| `REMINDER_TZ` | api | múi giờ + tuần làm việc của job (`§B15` nhắc timezone qua so sánh node-cron) | tất cả | công khai |
| `SEED_KEY` | seed (S14) | **khoá sinh dataset** — cố định trong repo, đổi là ra dataset khác (`05` §6.2) | local, dev | công khai theo thiết kế, **giá trị `TBD`** |
| `VERCEL_URL` / `NETLIFY` | web | biến do nền tảng cung cấp, dùng để suy origin | prod | nền tảng cấp |
| `GIT_SHA` | api, web | commit đang chạy — để log và màn hình "about" truy vết được phiên | dev, prod | CI inject |

Cấm: giá trị bí mật trong `.env.example` (chỉ tên + comment), trong fixture test, trong log CI. `gitleaks` ở
pre-commit **và** CI chặn đúng điều đó (`§B10`, `RESEARCH-PLAN.md` §11).

---

## 2. Kiến trúc triển khai (đúng đề cương) + hệ quả của trần

```text
        Browser (Admin + Employee)
                  │
        ┌─────────┴──────────┐
        │                    │
  Vercel hoặc Netlify   WebSocket (Socket.IO)
   apps/web (SPA)             │
        │ HTTPS REST          │
        │ (client sinh bằng   │
        │  Orval từ OpenAPI)  │
        └────────►  Render free  HOẶC  VPS Ubuntu        │
                    apps/api (Express, TypeScript)       │
                    ├─ REST + jose verify + RBAC         │
                    ├─ Socket.IO server (1 instance)     │
                    └─ Agenda worker (SCHEDULER_ENABLED)  │
                              │ HTTP nội bộ (1 chiều)     │
                              ▼                           │
                    apps/ai-service (FastAPI, Python)     │
                    PhoBERT + e5-small + matching +       │
                    calibration + LLMProvider             │
                              │                           │
              ┌───────────────┴───────────────┐           │
              ▼                               ▼           │
        MongoDB Atlas M0                LLM provider      │
        business data + policies        Gemini / Groq     │
        + 1 Vector Search index         (free tier quota) │
        + Agenda job store                                │
```

| Thành phần | Chỗ đặt (đề cương cho phép) | Hệ quả của trần (`§B1`) | Cách hệ thống sống chung |
|---|---|---|---|
| `apps/api` | Render free **hoặc** VPS Ubuntu | **sleep sau 15 phút không có HTTP/WS traffic; wake-up có thể ~1 phút** | notification **persist** + client đọc lại khi mở tab (`§B7`) ⇒ nhắc hạn là *hàng đợi*, không phải chuông (ADR-010); UX báo "đang kết nối lại" (`10-ui-ux-spec.md` §3.1) |
| `apps/api` | một instance | **không Redis** ⇒ không scale ngang | room model tối giản `user:` / `department:`; mọi broadcast đi qua **một** publisher (`02-architecture.md` §5.3) |
| `apps/ai-service` | cùng host hoặc service riêng | **RAM cho Node API + FastAPI + PhoBERT trên CPU chưa được chứng minh** — `RESEARCH-PLAN.md` §3 B1 hỏi, vòng 1 không trả lời: `[CẦN NGUỒN]` | nếu dồn lên một VPS nhỏ ⇒ **phải đo trước khi cam kết**; nếu tách sang Render free thứ hai ⇒ **hai** tiến trình cùng ngủ đông |
| MongoDB Atlas M0 | managed | 0.5 GB · **không backup tự động** · ~100 ops/s · connection ceiling **500 (đang bị hỏi: 500 hay 512)** · tối đa 3 Search/Vector index | **một** connection pool trong `apps/api`, không mở pool mới mỗi job (`02-architecture.md` §6); TTL index thay job dọn dẹp; dùng **1/3** quota index, để trống 2 cho thử nghiệm (ADR-005); số liệu chỉ tái lập được bằng **seed**, không bằng backup |
| `apps/web` | Vercel **hoặc** Netlify | Vercel: WS **Public Beta từ 22/06/2026**; Netlify: *"không phải lựa chọn ưu tiên cho Socket.IO backend chính"* | **client chỉ là client** — WS endpoint trỏ về `apps/api`, không đặt WS server trên Vercel/Netlify ở baseline |
| LLM provider | bên ngoài | quota free (RPM/TPM/RPD), và **tính không ổn định** | guard `§B6` + **S9 fallback**; live eval chỉ chạy nightly (ADR-016) |

**Connection budget** (API + ai-service + Agenda chĩa vào cùng một M0): **`TBD — chưa đo`**. Không có số nào
trong `NOTES-01` về số connection thực tế hệ thống mở; đây là con số **đo từ log Atlas**, không phải con số
thiết kế.

---

## 3. Pipeline CI/CD

Nhịp: **mọi push/PR** (chặn merge) + **nightly** (không chặn merge) + **release** (thủ công, trước demo).

### 3.1 Chuỗi chặn merge — đúng thứ tự `NOTES-01.md` §B10

```text
install → lint → typecheck → unit → API integration → Python AI tests
        → AI regression gate → build → Playwright smoke → Lighthouse → gitleaks
```

| # | Gate | Lệnh | Trạng thái gate | Ghi chú |
|---|---|---|---|---|
| 0 | **commit message** (chạy trước, ở `commit-msg` hook và một job nhỏ trong CI) | `npx commitlint --from HEAD~1` | **chưa bật — chờ `commitlint` config** | scope whitelist `auth\|hr\|project\|chatbot\|ai\|dashboard\|realtime\|docs\|ci` (`§B11`) |
| 1 | install | `pnpm install --frozen-lockfile` | **chưa bật — chờ `pnpm-lock.yaml`** (repo chưa có code) | lockfile lệch `package.json` = đỏ |
| 2 | lint | `pnpm -r lint` | **chưa bật — chờ `packages/eslint-config`** | gồm cả rule cấm hard-code màu (`10` §2.1) |
| 3 | typecheck | `pnpm -r typecheck` | chưa bật — chờ scaffold | `tsc --noEmit`, `strict` |
| 4 | unit | `pnpm test` | chưa bật — chờ scaffold | Vitest; **100% state-machine transition** (`RESEARCH-PLAN` §11) |
| 4b | coverage logic | `pnpm --filter api exec vitest run --coverage domain` | **chưa bật** | 100% transition + 90% service; **không** đo coverage UI |
| 5 | API integration | `pnpm test:api` | chưa bật | Supertest + `mongodb-memory-server` (Mongo thật, dựng được replica set — `§B10`) |
| 5b | **WS contract** | `pnpm --filter api test -- realtime/contracts` | **chưa bật — chờ `06-api-spec.md`** | event không khai báo trong spec ⇒ fail (`RESEARCH-PLAN` §11) |
| 5c | **kiến trúc không rò rỉ** | `pnpm depcruise --validate .dependency-cruiser.js apps/api/src` | **chưa bật — chờ `.dependency-cruiser.js`** | `domain/` không import `mongoose`/`express` |
| 5d | **API không trôi khỏi spec** | `npx schemathesis run ./artifacts/openapi.json` | **chưa bật — chờ `06-api-spec.md`** + bước sinh OpenAPI | mọi response phải validate schema |
| 6 | Python AI tests | `cd apps/ai-service && pytest -q` | **chưa bật — chờ `ai-service`** | unit + harness tất định |
| 7 | **AI regression gate** | `pytest -q tests/eval -m gate` | **chưa bật — chờ `09-ai-evaluation.md`** | "F1/P@5 không tụt **quá 2 điểm** so với baseline đã công bố" — **không có baseline thì gate không có ngữ nghĩa** (`11-quality-testing.md` §4.4) |
| 8 | build | `pnpm -r build` | chưa bật | web + api; ai-service build là bước riêng (§3.3) |
| 9 | Playwright smoke | `pnpm test:e2e` | chưa bật | luồng khói: login → hỏi chatbot → nhận card → confirm nộp báo cáo → dashboard đổi |
| 10 | Lighthouse | `npx @lhci/cli autorun` rồi `npx @lhci/cli assert` · `npx size-limit` | **chưa bật — chờ `apps/web` + cấu hình route (`TBD`)** | LCP/INP/CLS theo `§B9` |
| 11 | gitleaks | `gitleaks detect --source . --redact` | **có lệnh, bật được ngay khi có repo** | **1 secret leak = fail build** |
| 12 | **seed hash check (S14)** | `make demo` · `node scripts/check-seed-hash.mjs` (tên script **chưa chốt** — `02-architecture.md` §9 ghi `[CẦN NGUỒN]`) | **chưa bật — chỉ bật khi S14 được GVHD duyệt** (`RESEARCH-PLAN.md` §12 luật 4) | `make demo` phải dựng ra **đúng** bộ dữ liệu đã công bố |

Bốn hàng "chưa bật — chờ file" là **trạng thái thật**, không phải việc nợ: `06-api-spec.md` và
`09-ai-evaluation.md` đang được viết song song, và theo luật `RESEARCH-PLAN.md` §11 thì **một gate không có
lệnh chạy được thì phải xoá khỏi bảng**, không được giữ làm "chuẩn trên giấy".

### 3.2 Nhịp nightly / release — **không chặn merge**

```text
PR            → mocked deterministic agent tests
nightly/release → live provider evaluation
```
(`NOTES-01.md` §B10, ADR-016.)

| Việc | Lệnh | lý do không ở PR |
|---|---|---|
| Live provider evaluation (tỷ lệ chọn đúng tool, tỷ lệ tham số đúng, first token, chi phí/phiên) | `pytest -q -m eval_live` | quota + bất định (`§B10`) |
| API benchmark p95 đầy đủ | **công cụ `TBD`** — `11-quality-testing.md` §9 mục 9 | cần thời gian chạy, làm PR chậm |
| `pytest` benchmark embedding + RAM | `cd apps/ai-service && pytest -q -m bench` | phụ thuộc máy chạy |
| Playwright **bộ đầy đủ** (không chỉ smoke) | `pnpm test:e2e` (all) | chậm |
| Fail nightly → **mở issue có chủ** | người được phân công theo lịch | ADR-016 luật 4: *"không phải email tự động trôi"* |

**Nơi lưu kết quả eval theo ngày**: `TBD` — ADR-016 mục "Mở" #4 giao việc này cho file này, và ưu tiên của nó
là *"không thêm dịch vụ mới"*. Phương án đề xuất (chưa chốt): artifact của GitHub Actions + một file CSV trong
`docs/research/eval-history/` để có chuỗi thời gian mà không thêm hệ thống phải vận hành.

### 3.3 Deploy tự động

| Branch / thẻ | Điều gì chạy |
|---|---|
| `feat/*`, `fix/*`, `docs/*` + PR | chuỗi §3.1; **squash merge** khi xanh (`15` §4.4) |
| `main` | chuỗi §3.1 rồi **deploy**: Vercel/Netlify build `apps/web`; Render auto-deploy `apps/api`; `ai-service` build bằng Dockerfile (S14 có nêu *"Dockerfile cho AI service"*) |
| nightly (0 UTC+7) | §3.2 |
| `v*` (release) | §3.1 + **toàn bộ** §3.2 + `make demo` trên cluster dev + **bảng số eval in ra** để dán vào báo cáo |

Không push thẳng `main`, không `--no-verify`, không force-push (`15` §4.1, §6.1).

---

## 4. Runbook

### 4.1 Deploy

```bash
# 0. chỉ từ main đã xanh
git fetch origin && git log origin/main -1 --oneline

# 1. web
pnpm install --frozen-lockfile && pnpm -r build && pnpm -r lint && pnpm -r typecheck
#   rồi để nền tảng build (Vercel/Netlify nối repo) — không upload tay

# 2. api + ai-service
pnpm --filter api build
cd apps/ai-service && pip install -r requirements.txt && python -m compileall .

# 3. cấu hình Render: env theo §1.1, health check path, SCHEDULER_ENABLED=true cho ĐÚNG một service
# 4. xác nhận deploy bằng health (không phải bằng mắt)
curl -fsS "$API_HEALTH_URL" || echo "FAIL: api chưa health"
curl -fsS "$AI_HEALTH_URL"  || echo "FAIL: ai-service chưa warm"   # 12-performance.md §4.5
```

Bốn điều kiện "deploy xong":
1. `GET /healthz` của api trả `gitSha` đúng commit vừa deploy (đó là lý do `GIT_SHA` tồn tại ở §1.1).
2. `ai-service` báo **model warm** — chưa warm thì chưa mở demo.
3. Một kết nối WS handshake được và **9 event** không đổi tên.
4. `make demo` **không** được chạy ở bước này (chỉ ở §4.4).

### 4.2 Rollback

Ba lớp, theo thứ tự rẻ trước:

```bash
# Lớp 1 — app-only rollback (Render/Vercel giữ bản trước)
#   Render: Rollback to previous build · Vercel: Promote previous deployment
#   Không đụng schema ⇒ an toàn nhất. Đây là cách dùng 90% số lần.

# Lớp 2 — rollback bằng redeploy commit cũ
git revert <sha-cua-squash-commit>          # 1 commit revert, message "revert: undo ..."
pnpm install --frozen-lockfile && pnpm -r build

# Lớp 3 — rollback DỮ LIỆU: chỉ khi seed/migration làm hỏng dataset
```

**Lớp 3 không có đường quay lại tự động.** `NOTES-01.md` §B1: Atlas M0 **không backup tự động**, và free tier
**không có snapshot** để restore. Phương án của nhóm, xếp theo độ khả thi:

| Cách | Lệnh | Giới hạn |
|---|---|---|
| **A. Export/restore bằng `mongodump`/`mongorestore`** | `mongodump --uri="$MONGODB_URI" --db="$MONGODB_DB_NAME" --out ./backups/$(date +%F-%H%M)` · `mongorestore --uri="$MONGODB_URI" --nsFrom="$MONGODB_DB_NAME.*" --nsTo="$MONGODB_DB_NAME.*" --drop ./backups/<stamp>` | chạy **từ máy của nhóm**, không phải từ Atlas; 0.5 GB nên dump được; **phải lưu file ra ngoài Atlas**, nếu không thì "backup" nằm trên chính ổ sắp mất dữ liệu |
| **B. Tái lập bằng seed (S14)** | `make demo` với cùng `SEED_KEY` | chỉ khôi phục được **dữ liệu seed**, **mất mọi dữ liệu phát sinh** (báo cáo đã nộp, notification đã gửi, audit đã ghi); nhưng đó chính xác là thứ cần mất trong môi trường demo |
| **C. Export từng collection quan trọng** | `mongoexport --uri=… --collection=project_events --out=audit-$(date +%F).json` | đây là cách **duy nhất** bảo vệ được A-6 (audit bất biến) trên free tier |

**Nói thẳng, không vòng:** trên free tier, **khả năng mất dữ liệu là thật và không có lưới an toàn tự động**.
Quy trình duy nhất nhóm kiểm soát được là *export thủ công trước mỗi phiên UAT/demo* (đưa vào checklist §7) và
*coi `make demo` là đường hồi phục chính*.

Không có destructive change trước tuần 11 (đóng băng tính năng, `RESEARCH-PLAN.md` §12 luật 5; `05` §6.1 mục
4). Nếu buộc phải: **thêm field optional → deploy code đọc được cả hai → backfill → bỏ field cũ**.

### 4.3 Xem log

| Nguồn | Cách xem | Chú ý |
|---|---|---|
| `apps/api` (Render) | Render dashboard → service → Logs; hoặc CLI của nền tảng nếu đã cấu hình | log **không** được chứa token/password/`tokenHash`/connection string/`Authorization`/cookie (`15` §5.5) |
| `apps/ai-service` | log của service chứa nó; trên VPS: `journalctl -u hrbot-ai -f` | warm-up và timeout phải lộ ra ở đây |
| WS | event handshake + từng `chat:send` có `clientMessageId` để lần vết trùng | 9 event duy nhất; log event lạ = có code chưa theo spec |
| Atlas | Metrics → Real-Time Performance; xem ops/s và connection đang mở | đây là chỗ duy nhất thấy được trần `§B1` có bị chạm không |
| Audit nghiệp vụ | query `project_events` / `evaluations` | **đây không phải log text**: lịch sử là **dữ liệu**, append-only (BR-03 docs 04) |
| LLM provider | dashboard quota của provider | dùng để phát hiện "sắp hết quota" **trước** khi nó thành sự cố (§4.6) |

### 4.4 Reset demo data — `make demo` (S14)

```bash
# chỉ nhắm cluster dev/demo; script phải từ chối chạy nếu MONGODB_DB_NAME trông như dữ liệu thật
make demo
```

`make demo` = **seed dữ liệu giả lập tiếng Việt có khoá cố định + dựng DB + chạy eval in bảng số**
(`RESEARCH-PLAN.md` §9 S14). Ba ràng buộc (`05` §6.2):

1. **Mọi phân bố derive từ `SEED_KEY`** — đổi khoá là ra dataset khác; gate "seed hash check" đòi `make demo`
   dựng ra **đúng** bộ dữ liệu đã công bố trong báo cáo.
2. Seed **không** chứa PII thật: không lương, không CCCD, không số điện thoại thật (`05` §6.2); `refresh_sessions`
   **không** được seed (token là sản phẩm của login runtime).
3. Kiểm tra sau seed (`05` §6.2): mỗi employee đúng 1 `level` và ≥ 1 skill; mỗi project đúng 1 `status`;
   `dueDate` trải **cả** quá hạn lẫn sắp tới hạn để demo được **cả ba dòng reminder** của matrix `§B0`; có ≥ 1
   project ở mỗi trạng thái, ≥ 1 project đã `reject`, ≥ 1 `evaluation` đã publish.

**Số lượng bản ghi cụ thể không nằm trong tài liệu vận hành này** (`05` §6.2: *"không nêu con số trong docs
thiết kế"*) — nó là nội dung S14 và phải khớp số liệu báo cáo + `seed hash check`.

### 4.5 Khi Render ngủ

Dấu hiệu: request đầu tiên treo tới ~1 phút (`§B1`), WS đứt, dashboard trống, "đang kết nối lại" hiện trên top
bar (`10-ui-ux-spec.md` §3.1).

```text
1. ĐỪNG bấm loạn — mỗi lần bấm thêm một request lại làm thêm việc trong lúc host đang thức.
2. Gửi MỘT request health; chờ nó về; rồi mới thao tác tiếp.
3. Nói rõ với người xem: "service vừa thức dậy, độ trễ này là của free tier" —
   đây là hạn chế ĐÃ ĐƯỢC THIẾT KẾ ĐỂ CHẤP NHẬN (ADR-010), không phải sự cố.
4. Nghiệp vụ không mất: notification đã persist trong `notifications`,
   client đọc lại khi mount. Người dùng không mất tin, chỉ nhận muộn.
5. Nếu buổi demo mà service còn ngủ được nữa → VPS (đề cương cho phép — RESEARCH-PLAN §1),
   với điều kiện RAM chưa được chứng minh: [CẦN NGUỒN].
```

Phòng ngừa: **giữ phiên trong suốt demo** (một tab dashboard mở + một socket sống) và **warm trước khi hội
đồng vào phòng** (§7). Health beat từ ngoài: **đang cân nhắc, chưa bật** — mỗi beat tính vào trần ops/s
(`12-performance.md` §4.8).

### 4.6 Khi hết quota LLM (S9)

```text
provider trả 429 / quota / timeout
  → LLMProvider báo "quota" như MỘT KẾT QUẢ HỢP LỆ, không phải exception (ADR-012 nghĩa vụ 3)
  → chatbot rơi về pipeline PhoBERT-only: intent cố định + tool đọc trực tiếp (RESEARCH-PLAN §9 S9)
  → UI báo rõ "đang dùng chế độ tra cứu không cần AI" (10-ui-ux-spec.md §6.5)
  → tool GHI bị TẮT trong chế độ này (không có LLM thì không có gì để confirm — khỏi nguy cơ ghi nhầm)
  → % tính năng còn dùng được: TBD — chưa đo (chính S9 yêu cầu đo con số này)
```

Ba việc vận hành: (1) **theo dõi quota trên dashboard provider mỗi sáng** trong tuần 10–12, không phải lúc
đang demo; (2) **mock provider luôn sẵn** — mocked layer vẫn chứng minh toàn bộ nghiệp vụ chạy đúng và cho
phép demo offline (ADR-016 "Điểm mạnh"); (3) **PR không bao giờ gọi provider thật** (§3.1) — đây là cách chính
để quota còn nguyên cho ngày cần nó.

### 4.7 Khi Atlas chạm trần

| Dấu hiệu | Nguyên nhân có khả năng nhất | Hành động |
|---|---|---|
| query chậm bất thường, ops/s bão | N+1 / thiếu projection / broadcast digest lớn | dừng broadcast, đo lại theo `12-performance.md` §4.2; mỗi aggregate phải khai báo index dùng tới |
| "too many connections" | nhiều hơn một pool (job/CLI tự mở pool riêng) | **một** pool trong `apps/api`; `ai-service` đi qua đường riêng có giới hạn |
| sắp hết 0.5 GB | `policies.chunks` (embedding nhiều chiều × nhiều chunk) là chỗ ăn chỗ nhanh nhất | giảm số chunk thật (đây là quyết định nghiệp vụ, phải ghi vào báo cáo như kết quả đo) |
| Vector Search không trả kết quả | **chưa xác minh M0 có Vector Search** — NOTES-01 CẦN BỔ SUNG #4 `[CẦN NGUỒN]` | đây là **rủi ro kiến trúc**, không phải lỗi vận hành; ADR-005 và toàn bộ UF-10 phụ thuộc nó |

---

## 5. Socket.IO trên Render — cấu hình

Những điều **đã chốt** bởi `§B7` / ADR-010:

```text
1 instance, không Redis adapter          (§B7)
1 namespace, không tách 2 namespace      (§B7: "Không cần 2 namespace ngay")
Rooms: user:<userId>  department:<departmentId>   (id lấy từ JWT đã verify — 07 §8.2)
Events: chat:send chat:accepted chat:chunk chat:done chat:error
        notification:new project:updated report:updated kpi:updated   (9 tên duy nhất)
Mỗi client message có clientMessageId    (§B7)
Durable notification vẫn persist phía app (§B7)
Xác thực ở handshake trước khi cho vào room (07 §8.1)
```

Những điều **`NOTES-01` không trả lời** — `RESEARCH-PLAN.md` §3 B7 hỏi đúng ba điểm *"Render/VPS: `transports`,
sticky session có cần không, heartbeat/timeout"* và vòng research 1 **im lặng** → **[CẦN NGUỒN]**:

| Hạng mục | Trạng thái | Tại sao không tự đặt |
|---|---|---|
| `transports` (`websocket` hay cho phép `polling` fallback) | `[CẦN NGUỒN]` | `§B7` ghi *"Socket.IO tự hỗ trợ fallback và reconnect"* nhưng **không** chốt danh sách transport; chọn sai là đụng trần của proxy hosting |
| **Sticky session** có cần không | `[CẦN NGUỒN]` | về lý, **một instance** ⇒ không cần cân bằng tải ⇒ không cần sticky (`02-architecture.md` §4 ghi "không cần sticky session ở tầng này"); nhưng cấu hình cụ thể ở Render thì nguồn không nói |
| heartbeat / ping interval / ping timeout | `[CẦN NGUỒN]` | tương tác trực tiếp với trần *"sleep sau 15 phút không có HTTP/**WS** traffic"* (`§B1`) — đây là tham số **quyết định** hệ có ngủ hay không, không được đoán bừa |
| `path` của socket endpoint sau proxy | `[CẦN NGUỒN]` | phụ thuộc cấu hình host |
| max payload size mỗi message | `[CẦN NGUỒN]` | liên quan control DoS qua WS còn thiếu (`13-security.md` §2.13) |
| `cors.origins` cho WS | `[CẦN NGUỒN]` | CORS **không có** trong `§B3`/`§B4` (`07` §9 mục 38) |

**Việc của nhóm:** dựng đúng một môi trường, bật WS, rồi **đo** ba cái trên bằng cách quan sát (a) kết nối có
sống qua >15 phút idle không, (b) reconnect có tạo `clientMessageId` trùng không, (c) broadcast cho
`department:<id>` tốn bao nhiêu. Kết quả: `TBD — chưa đo`. Không chép cấu hình của một dự án khác vào đây rồi
gọi là "chuẩn".

---

## 6. Agenda — lịch job và idempotency

Quyết định: **Agenda > BullMQ > node-cron** (`§B15`, ADR-011) vì *"Atlas đã có → Agenda dùng Mongo → không phải
dựng Redis → job survive restart"*. Job store nằm **trong cùng Atlas M0** ⇒ ăn vào trần ops/s và 0.5 GB.

### 6.1 Danh sách job

| Job (tên trong code — **không** phải WS event) | Lịch (đề xuất của nhóm, **cron cụ thể `TBD`**) | Đọc | Ghi | Nguồn nghiệp vụ |
|---|---|---|---|---|
| `deadline_sweep` | mỗi buổi sáng trong tuần làm việc | `projects` theo I-02 `(status, dueDate)` | `notifications` (`type: deadline_3d`) | matrix `§B0`: "Deadline còn 3 ngày — Employee — WS + in-app — **1 lần/ngày**" |
| `deadline_final` | cùng nhịp | như trên | `notifications` (`deadline_1d`) | "Deadline còn 1 ngày — **1 lần**" |
| `overdue_sweep` | cùng nhịp | vị từ **dẫn xuất** `dueDate < now AND status ≠ COMPLETED` (`§B4`; `OVERDUE` **không phải state**) | `notifications` (`overdue`) cho Employee + gom vào digest Admin | "Quá hạn — Employee + Admin — WS + digest — 1 lần/ngày" |
| `kpi_review_digest` | mỗi ngày | `evaluations` của kỳ đang mở | `notifications` (`kpi_review`) — kênh **digest** | "KPI cần review — Admin — digest — 1 lần/ngày" |
| `daily_digest_job` | cuối ngày | item quá hạn + KPI cần review, **1 bản/ngày** | `notifications` (`daily_digest`) | `§B0` matrix + `§B15` |
| `standup_ask` | *(chỉ nếu S6 được GVHD duyệt)* | đề tài đang `IN_PROGRESS` | `notifications` (`standup_prompt`) | **`S6` đang ở nhóm chờ duyệt phạm vi** (`00-vision-scope.md` §4); ⚠️ B7 **chưa có event** cho message do hệ thống khởi xướng → **phải chốt hợp đồng event trước** (`18-user-flows.md` notification matrix, hàng "Daily standup") |

Ba điều cấm: job **không** đổi `project.status` (nó chỉ gửi thông báo — ADR-011 ràng buộc 3, và `OVERDUE` là
dẫn xuất); job **không** được start ở hai process (`SCHEDULER_ENABLED` chọn đúng **một** entrypoint, ADR-011
mục "Đánh đổi"); job **không** được tự đặt tên event ngoài 9 cái của `§B7`.

### 6.2 Idempotency — job chạy lại là chuyện bình thường

Vì sao bắt buộc: Render ngủ/restart (`§B1`), và `§B15` nêu ngoại lệ *"job chạy lại"* của UF-09.

```text
khoá chống trùng  dedupeKey  = <type>:<projectId>:<YYYY-MM-DD>     (định dạng do docs đề xuất —
                                                                       công thức khoá cụ thể [CẦN NGUỒN])
UNIQUE (userId, dedupeKey)   → insert trùng = lỗi có chủ đích → BỎ QUA, không gửi đúp
thứ tự bắt buộc              → persist notifications TRƯỚC, rồi mới emit notification:new
```

Cơ chế này là **I-17** trong `05-data-model.md` §4.1 (`// SUY DIỄN` — nguồn không có index này nhưng matrix
`§B0` đòi "1 lần/ngày", và docs 05 giải thích đó là *"cách bảo đảm '1 lần/ngày' ngay cả khi job Agenda chạy
lại sau restart"*). Test bắt buộc tương ứng: `11-quality-testing.md` §5 dòng F7 — *"job chạy lại **không** gửi
trùng; notification vẫn được persist chứ không chỉ gửi qua WS"*.

**Không có đường nào để "defer người đang nghỉ phép":** ngoại lệ đó cần dữ liệu nghỉ phép của **UF-02**, mà
UF-02 đang **`PARKED` — chờ GVHD** và `§B4` không có collection leave (`18-user-flows.md` UF-09 bước 8). Tài
liệu vận hành này ghi rõ giới hạn thay vì giả vờ xử lý được.

---

## 7. Checklist trước khi demo

Chạy **toàn bộ, đúng thứ tự**, ít nhất **60 phút** trước giờ trình diễn. Không có mục nào được tick "đại khái".

- [ ] `git log -1` trên `main` = commit dự định demo; **không** có PR đang mở liên quan tới luồng sẽ diễn.
- [ ] `pnpm -r lint && pnpm -r typecheck && pnpm -r build` xanh trên máy sạch (`pnpm install --frozen-lockfile`).
- [ ] `pnpm test && pnpm test:api && pnpm test:e2e` xanh ở local.
- [ ] **`mongodump` export bộ dữ liệu demo hiện tại** ra file, **lưu ra ngoài Atlas** (§4.2 — vì không có
      backup tự động).
- [ ] `make demo` trên **cluster demo** xong, và các kiểm tra sau seed của `05` §6.2 pass (đủ trạng thái, đủ
      mốc hạn để diễn được **cả ba dòng reminder**: 3 ngày / 1 ngày / quá hạn).
- [ ] `GET /healthz` của api và **model warm** của ai-service đều OK (§4.1 bước 3–4).
- [ ] **Đánh thức service**: mở dashboard, đăng nhập, chờ dữ liệu đầu tiên về. Ghi lại thời gian chờ **thực
      đo** của lần này (đó là số thật duy nhất của buổi demo; con số `§B1` không kèm URL).
- [ ] **Giữ phiên**: tab dashboard mở + một kết nối WS sống suốt buổi; **không** đóng tab giữa chừng.
- [ ] Đăng nhập **hai vai** ở **hai trình duyệt**: `Admin` (duyệt, giao việc, override) và `Employee` (tra cứu,
      nộp báo cáo, nhận nhắc hạn) — DoD mục 3 của `00-vision-scope.md` §7.
- [ ] Chạy thử **một lần end-to-end** đúng kịch bản sẽ nói: UF-01 → UF-04 (`find_candidates` → card giải thích
      → `assign_project` confirm) → UF-05 (`submit_progress` → `submit_report` → reject → lý do → resubmit →
      approve) → UF-06 (`machineScore` → `override_kpi` có lý do) → UF-09 (nhắc hạn) → UF-10 (`search_policy`
      kèm `document/version/source`).
- [ ] Kiểm **confirm-before-write** hoạt động thật: bấm gửi mà **không** confirm thì dữ liệu không đổi.
- [ ] Kiểm **abstention**: một câu dưới ngưỡng phải ra "hỏi lại", không ra gợi ý hạng chót.
- [ ] Kiểm **từ chối đoán**: một câu hỏi chính sách ngoài tài liệu phải trả "chưa có trong tài liệu", **không**
      bịa nguồn.
- [ ] Quota LLM còn đủ cho buổi diễn? Xem dashboard provider (§4.3). Nếu thấp → **bật trước** đường S9 và diễn
      cả hai chế độ.
- [ ] Chuẩn bị **video/ảnh chụp màn hình** các luồng chính. Không phải để "nói dối hay hơn", mà vì free tier
      có thể ngủ ngay trong lúc đang nói; đây là phương án "demo sẵn" đã ghi ở `12-performance.md` §4.8.
- [ ] Kiểm tra **không lộ số chưa đo** trên màn hình: mọi ô chưa có dữ liệu hiển thị `—`, không hiển thị `0`
      (`10-ui-ux-spec.md` §9).
- [ ] Người **xác nhận deploy** và người **bấm nút** là hai người khác nhau (§1 quy tắc 3).

---

## 8. Backup & khả năng mất dữ liệu của free tier

Nói thẳng một câu cho đủ, không giảm nhẹ: **hệ thống này không có backup tự động, và mất dữ liệu là khả năng
thật, không phải rủi ro lý thuyết.**

| Loại dữ liệu | Có backup tự động? | Mất thì sao | Biện pháp thật |
|---|---|---|---|
| dữ liệu seed (nhân viên, phòng ban, đề tài, chính sách) | **không** (`§B1`: M0 *không backup tự động*) | mất bản ghi | `make demo` tái lập **chính xác** bằng `SEED_KEY` (S14) — đây là thiết kế của hệ thống, không phải lời an ủi |
| dữ liệu phát sinh trong UAT/demo (báo cáo đã nộp, audit, notification) | **không** | **mất hẳn**, không khôi phục được | `mongodump` thủ công trước mỗi phiên (§7); export `project_events` riêng (§4.2 cách C) |
| lịch sử phiên (`refresh_sessions`) | **không** | người dùng phải login lại — **chấp nhận được**, và **tốt** nếu xét `tokenHash` là bí mật | TTL index tự dọn (`§B4`) |
| job store của Agenda | **không** | mất lịch hẹn còn lại | job được định nghĩa trong code + quét lại theo `dueDate`; idempotency chống trùng |
| audit (`project_events`, `statusHistory[]`) | **không** | mất **bằng chứng** — thiệt hại nghiêm trọng nhất trong hệ HR | export riêng (§4.2 C); **đừng bao giờ** dùng `make demo` như cách "xoá cho sạch" khi còn số liệu phải trình |

Bốn việc phải làm, không phải để "làm đẹp" free tier mà để nó không thành tai nạn:

1. **Backup là một bước trong checklist demo**, không phải việc "khi nào rảnh" (§7).
2. **File dump phải nằm ngoài Atlas** — nếu không thì bản gốc và bản sao chết cùng nhau.
3. **Chỉ dùng dữ liệu giả lập cho tới khi GVHD trả lời §7.10** (dữ liệu thật hay giả lập). Đưa dữ liệu nhân sự
   thật vào một hệ không có backup tự động là một quyết định mà nhóm 3 sinh viên không nên phải giải trình
   trước hội đồng (`11-quality-testing.md` §7.1 ràng buộc dữ liệu, `13-security.md` §2.10).
4. **Ghi hạn chế này vào báo cáo**, ở phần triển khai, đúng như nó là. `00-vision-scope.md` §4 đã tuyên bố
   Kubernetes/microservice/"production thật" nằm ngoài phạm vi; năng lực backup thuộc cùng quyết định đó.
