# 24 — Runbook deploy Render (Phase 5, plan `full-delivery`)

Buổi sáng chỉ cần bấm nút. File này là danh sách thao tác cho **một người** (người deploy) + **một người xác nhận**
(quy tắc `docs/14-devops-deployment.md` §1). Mọi lệnh config/command giữ tiếng Anh.

Nguồn: `plans/261020-2200-full-delivery/phase-05-integration-deploy.md` §2/§Verification/§Rollback/§Ngân sách +
cấu hình thật trong repo (`package.json`, `pnpm-workspace.yaml`, `apps/api/tsconfig.json`, `apps/web/vite.config.ts`,
`apps/ai-service/requirements.txt`) + code trên 3 nhánh feature (`feat/api-backend`, `feat/frontend-web`,
`feat/ai-service`) + tài liệu Render Blueprint YAML Reference.

> **Đọc mục 7 trước khi tin file này.** Phần lớn nội dung là *thiết kế đã đối chiếu tài liệu*, **chưa deploy lần
> nào** vì phiên này không có tài khoản Render.

---

## 0. Sự thật của thời điểm hiện tại (đọc 1 phút)

| # | Sự thật | Hệ quả |
|---|---|---|
| 1 | HEAD của `integration/full-delivery` = `a03ae0a2a79c4779cb9a0142e74a13973df6fdfc` = baseline `main` | Chưa có `/api/auth/*`, `/api/admin/llm-providers`, `VITE_API_BASE` trong web, provider layer trong AI. `render.yaml` viết cho trạng thái **sau merge phase 1–4** |
| 2 | `render.yaml` chưa được validate/deploy | `render blueprints validate` + deploy thử là việc **đầu tiên** buổi sáng |
| 3 | `apps/api/.env.example` và `apps/ai-service/.env.example` **đang được git track và chứa connection string Atlas có mật khẩu** | Coi credential đó là **đã lộ** (chi tiết §3.3). Phải rotate trước buổi demo |
| 4 | `dist/` bị `.gitignore` (cả `packages/contracts`) | Mọi build command phải build contracts trước web/api; không có "deploy thẳng" |
| 5 | Plan ghi ngân sách $7 (Overview) **và** $14 (phase-05 §Ngân sách) | Chưa chốt. Mặc định runbook này = **$14** (2 Starter). Phương án $7: §6 |

---

## 1. Env matrix

Nguyên tắc: **tên biến + nơi cấp**, không ghi giá trị. Bí mật chỉ nằm trong Render Dashboard (loại
`sync: false` của blueprint), không nằm trong repo.

| Biến | Service | Bắt buộc | Ai cấp | Cách có giá trị | Ghi chú |
|---|---|---|---|---|---|
| `MONGODB_URI` | `api`, `ai` | Có | **user** (Atlas) | Atlas → Database Access (user mới) → Connect → Drivers, thay `<password>` | **Bí mật**. User cũ phải rotate (§3.3). Atlas Network Access phải cho phép IP Render (§3.1) |
| `JWT_SECRET` | `api` | Có | **tự sinh** | `openssl rand -hex 32` | **Bí mật**. Đổi giá trị = mọi access token cũ vô hiệu (user phải login lại) |
| `SETTINGS_ENCRYPTION_KEY` | `api` | Có | **tự sinh** | `openssl rand -base64 32` | **Bí mật**. Phải là **32 byte base64** (AES-256-GCM). Mất/đổi = không giải mã được key LLM trong `settings` → phải nhập lại key provider |
| `AI_SERVICE_API_KEY` | `api`, `ai` | Có | **tự sinh** | `openssl rand -hex 32` | **Bí mật**. Hai service phải **cùng giá trị**; blueprint lấy từ `api` sang `ai` bằng `fromService` nên chỉ nhập 1 lần |
| `FRONTEND_URL` | `api` | Có | **user** (lấy từ URL web) | `https://hr-blockbot-web.onrender.com` (không `/` cuối) | CORS whitelist; code **không** dùng `origin: "*"` (đã xác nhận trong `apps/api/src/app.ts` nhánh `feat/api-backend`) |
| `NODE_ENV` | `api` | Có | **cố định** | `production` | Không phải secret. Auth fail-closed khi thiếu/sai |
| `AI_SERVICE_URL` | `api` | Có | **user** | `http://<ai-private-host>:<port>` (ưu tiên, Render Dashboard → service `ai` → Connect) hoặc `https://hr-blockbot-ai.onrender.com` | Không phải secret. Đổi domain AI là phải sửa biến này |
| `VITE_API_BASE` | `web` | Có | **user** | `https://hr-blockbot-api.onrender.com/api` | **Bắt buộc có hậu tố `/api`**. Vite nhúng lúc build → đổi biến phải **redeploy web** |
| `AI_AGENT_ENABLED` | `ai` | Có (cho demo) | **cố định** | `true` | Code mặc định khoá agent (403). phase-05 §5 yêu cầu bật cho demo, kèm rate limit |
| `SKIP_INSTALL_DEPS` | `web` | Có | **cố định** | `true` | Tắt cơ chế Render tự cài dependency của static site, để `pnpm install` trong buildCommand làm việc đó |
| `ACCESS_TOKEN_TTL` | `api` | Không | mặc định | `15m` | Có default trong code (`auth.service.ts`); chỉ đặt nếu muốn khác |
| `PORT` | `api`, `ai` | Không | **Render cấp** | — | **Không tự đặt.** Code đọc `process.env.PORT`; blueprint dùng `$PORT` trong startCommand |

Ghi chú cho cột "Cách có giá trị": các lệnh `openssl rand ...` ở trên là dạng chuẩn, **nhưng `openssl` không có
trên PATH của máy này** — dùng lệnh đầy đủ hoặc bản PowerShell ở mục ngay dưới.

**Key LLM (Gemini / DeepSeek / OpenRouter / bất kỳ OpenAI-compatible) KHÔNG phải env var** trong thiết kế đích:
theo ADR-017, key được nhập ở Admin UI → mã hoá AES-256-GCM bằng `SETTINGS_ENCRYPTION_KEY` → `api` truyền config
sang `ai` theo request. Nếu phần Admin UI/provider chưa merge xong thì chưa có đường cấu hình (xem §6).

### Sinh secret ngay trên máy (Windows PowerShell)

```powershell
# JWT_SECRET / AI_SERVICE_API_KEY — hex 32 byte
openssl rand -hex 32

# SETTINGS_ENCRYPTION_KEY — base64 của đúng 32 byte
openssl rand -base64 32
```

Dán thẳng vào ô Render hỏi lúc tạo Blueprint. Không ghi ra file, không gửi qua chat, không commit.

**Đã kiểm chứng trên máy này:** `openssl` **không có trên PATH**, nhưng bản trong Git for Windows chạy đúng
(OpenSSL 3.5.4; `rand -hex 32` → 64 ký tự, `rand -base64 32` → decode ra đúng 32 byte):

```powershell
& "C:\Program Files\Git\usr\bin\openssl.exe" rand -hex 32
& "C:\Program Files\Git\usr\bin\openssl.exe" rand -base64 32
```

Không dùng openssl cũng được — **PowerShell của máy này là 5.1**, nên `[Convert]::ToHexString` và
`RandomNumberGenerator::GetBytes` **không tồn tại**; dùng bản đã chạy được:

```powershell
$b = New-Object 'byte[]' 32
(New-Object Security.Cryptography.RNGCryptoServiceProvider).GetBytes($b)
[Convert]::ToBase64String($b)                       # SETTINGS_ENCRYPTION_KEY (base64 32 byte)
-join ($b | ForEach-Object { $_.ToString('x2') })   # JWT_SECRET / AI_SERVICE_API_KEY (hex 32 byte)
```

`SETTINGS_ENCRYPTION_KEY` **phải là đúng 32 byte** sau khi decode base64 — cả hai cách trên đều thoả; đừng tự
thêm/bớt ký tự khi dán.

---

## 2. Checklist thao tác Render (Blueprint từ repo)

Điều kiện vào: phase 1–4 đã merge vào nhánh ship; `pnpm -r build` xanh local; `render.yaml` đã có trên nhánh đó.

1. **Push nhánh ship lên origin** (người có quyền push — agent Phase 5 không push).
2. Render Dashboard → **New +** → **Blueprint**.
3. Chọn repo `hoangedu773/hr_blockbot`, chọn **branch ship thực tế** (`integration/full-delivery` hoặc nhánh đã
   merge xong). Render đọc `render.yaml` ở root repo.
4. Review 3 service Render sẽ tạo — đúng phải là: `hr-blockbot-web` (**static**, Free), `hr-blockbot-api`
   (**Starter**, Singapore), `hr-blockbot-ai` (**Starter**, Singapore). Nếu thấy plan/region khác → sửa
   `render.yaml` rồi push lại, **đừng bấm Apply vội**.
5. Render hỏi giá trị cho từng biến `sync: false` → dán theo §1. `AI_SERVICE_API_KEY`: chỉ nhập ở service `api`
   (service `ai` lấy qua `fromService`).
6. **Apply** → Render build/deploy lần đầu cả 3 service. Theo dõi từng **Logs**:
   - web: phải thấy `pnpm --filter web build` sinh `apps/web/dist/index.html`
   - api: phải thấy `tsc` xong và `[HR BlockBot API] Server running`
   - ai: phải thấy `Uvicorn running on http://0.0.0.0:<port>`
7. Lấy 3 URL `onrender.com` trong Dashboard, quay lại **Environment** của từng service điền các biến phụ thuộc URL
   (nếu lần đầu nhập sai/chưa biết): `FRONTEND_URL`, `AI_SERVICE_URL` (api); `VITE_API_BASE` (web).
   **Lưu ý**: biến `sync: false` **chỉ được hỏi lúc tạo Blueprint đầu tiên**; lần sync sau Render bỏ qua chúng →
   thêm/đổi secret về sau phải làm **tay trong Dashboard**.
8. Redeploy web sau khi đặt `VITE_API_BASE` (static build nhúng biến lúc build).
9. Chạy §4 (health + smoke). Chưa qua §4 thì **chưa coi là deploy xong**.
10. Trong tuần freeze: cân nhắc tắt auto-deploy (Dashboard → Settings → Auto-Deploy = No, hoặc
    `autoDeployTrigger: 'off'` trong `render.yaml`) để merge dở dang không tự đẩy lên bản demo.

Thời gian build lần đầu: **chưa đo** (chưa deploy). Nếu vượt 15 phút ở bước 6, xem log build trước khi làm lại.

---

## 3. Atlas

### 3.1 Network Access — thêm IP Render

1. Render Dashboard → chọn service `hr-blockbot-api` → nút **Connect** → tab **Outbound** → copy danh sách CIDR
   của region (dải này **dùng chung cho mọi service cùng region**, không phải IP riêng của mình).
2. Atlas → **Project → Network Access → Add IP Address** → thêm **từng CIDR** vừa copy (làm cho cả `api` và `ai`;
   cùng region nên cùng dải).
3. `0.0.0.0/0` chỉ dùng khi bí (không lấy được dải outbound): **chỉ trong tuần demo**, ghi lại ngày bật và
   **gỡ ngay sau buổi bảo vệ**. Không để qua tuần.
4. Kiểm: `curl -s <API_URL>/api/health` phải trả `"readiness":"ok"`; nếu 503/`database_unavailable` thì gần như
   chắc là Network Access hoặc `MONGODB_URI` sai.

Giới hạn: dải outbound là **dải chung của region**, không phải allowlist chặt như IP tĩnh riêng — đừng ghi vào
báo cáo là "đã khoá theo IP của hệ thống". Dải này lấy từ Dashboard **sau khi** service được tạo; giá trị cụ thể
**chưa kiểm chứng trong phiên này**.

### 3.2 Giới hạn Atlas M0 (nhắc lại, không mới)

Không backup tự động, 0.5 GB, ~100 ops/s, tối đa 3 Search/Vector index (`docs/14-devops-deployment.md` §2/§8).
Trước demo nên `mongodump` thủ công ra ngoài Atlas — vẫn là việc của người vận hành, không có trong blueprint.

### 3.3 Rotate user DB — BẮT BUỘC trước demo

Credential Atlas từng nằm trong `apps/api/.env.example` (và `apps/ai-service/.env.example`) — **file này đang
được git track**, tức là đã nằm trong lịch sử git, và giá trị đó còn xuất hiện trong output tool của phiên làm
việc này. Coi như **đã lộ**; không có cách "un-leak" ngoài rotate.

```text
1. Atlas → Database Access → Add New Database User:
   user mới (vd. hr_bot_deploy), quyền readWrite trên database hr_bot (không cấp atlasAdmin).
2. Cập nhật MONGODB_URI (password mới) ở CẢ api và ai trong Render Dashboard → Manual Deploy.
3. Xoá user cũ ngay sau khi health xanh.
4. Sửa 2 file .env.example thành placeholder:
   mongodb+srv://<username>:<password>@<cluster-url>/hr_bot?...  — việc này thuộc owner apps/api + apps/ai-service
   (agent Phase 5 không ghi vào apps/**), cần một commit riêng trên nhánh tương ứng.
5. (Tuỳ chọn, nếu có thời gian) git filter-repo/BFG để xoá khỏi lịch sử — chỉ làm khi cả nhóm đồng ý, vì viết lại
   lịch sử ảnh hưởng mọi nhánh.
```

---

## 4. Verify: health + smoke test

Chạy theo thứ tự, dừng ở lỗi đầu tiên. `<...>` là chỗ điền URL/giá trị thật, không phải copy nguyên.

> **Môi trường lệnh trên Windows:** các block dưới là **bash** — chạy trong **Git Bash** hoặc **WSL**. Đã kiểm chứng
> máy này có `curl.exe` 8.13.0 (`C:\Windows\system32\curl.exe`). Trong PowerShell 5.1, `curl` là alias của
> `Invoke-WebRequest` → phải gõ `curl.exe`. Riêng bước login có gán biến, bản PowerShell:
>
> ```powershell
> $TOKEN = (Invoke-RestMethod -Method Post -Uri "$API_URL/api/auth/login" -ContentType 'application/json' `
>   -Body '{"email":"<admin-email>","password":"<admin-password>"}').accessToken
> ```

### 4.1 Health (bắt buộc, chạy trước mọi thứ)

```bash
API_URL=https://hr-blockbot-api.onrender.com
AI_URL=https://hr-blockbot-ai.onrender.com
WEB_URL=https://hr-blockbot-web.onrender.com

curl -s "$API_URL/api/health"
# kỳ vọng: HTTP 200, {"status":"ok","liveness":"ok","readiness":"ok","timestamp":"..."}
# 503 + "readiness":"database_unavailable" → Atlas Network Access hoặc MONGODB_URI

curl -s "$AI_URL/health"
# kỳ vọng: {"status":"ok","readiness":"ready","database":{"status":"connected"},
#           "mock_tools":{"agent_enabled":true}}

curl -s "$AI_URL/health/ready" -o /dev/null -w '%{http_code}\n'
# kỳ vọng: 200. /health vẫn trả 200 khi Mongo lỗi (chỉ đổi status) → /health/ready mới là cổng thật

curl -sI "$WEB_URL" | head -1
# kỳ vọng: HTTP/2 200
```

### 4.2 Smoke test 4 lệnh (đúng 4 bước phase-05 §Verification)

**(1) Login** — lấy access token Admin

```bash
TOKEN=$(curl -s -X POST "$API_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"<admin-email>","password":"<admin-password>"}' \
  | python -c "import sys,json;print(json.load(sys.stdin)['accessToken'])")
echo "${TOKEN:0:12}..."   # chỉ in đầu token để kiểm tra có giá trị
```

Kỳ vọng: HTTP 200, body `{"accessToken":"...","user":{"id":"<ObjectId>","role":"Admin"}}`, kèm `Set-Cookie`
`refreshToken` HttpOnly. Sai mật khẩu → **401** `{"error":{"code":"UNAUTHENTICATED"}}` (không nói user có tồn tại).

**(2) Xem hồ sơ**

```bash
curl -s "$API_URL/api/employees/<employeeObjectId>" -H "Authorization: Bearer $TOKEN"
```

Kỳ vọng: HTTP 200, `EmployeeDetailDto` nếu là hồ sơ của chính mình, `EmployeeSummaryDto` (allowlist, **không** có
`phone`) nếu xem người khác; không có token → 401; Employee xem người khác → 403 `RBAC_DENIED`.
Kiểm tra nhanh token hợp lệ: `curl -s "$API_URL/api/auth/me" -H "Authorization: Bearer $TOKEN"` → 200.

**(3) Hỏi chính sách** — câu trong phạm vi, phải có citation

```bash
curl -s -X POST "$AI_URL/api/v1/rag/query" \
  -H "Content-Type: application/json" \
  -d '{"question":"Nhân viên thử việc được nghỉ phép bao nhiêu ngày?"}'
```

Kỳ vọng: HTTP 200, `{"answer":"...","citations":[{"document":"...","version":"...","article":"...","score":0.xx}],
"abstain":false}`. Lặp với 1 câu **ngoài phạm vi** → `"abstain":true`, `citations:[]`, câu trả lời kiểu "chưa có
trong tài liệu", **không** bịa nguồn.

Lưu ý 1: đây là endpoint của `ai-service`, **không đi qua CORS/cookie của web** — dùng để kiểm RAG nhanh. Đường
demo thật là chat trên web (WebSocket `chat:*`), curl không handshake WS đơn giản được.
Lưu ý 2: theo code nhánh `feat/ai-service`, `/api/v1/rag/query` **không** kiểm `AI_SERVICE_API_KEY` (chỉ
`/api/v1/agent/chat` kiểm) → nếu service `ai` để public, ai cũng hỏi được policy. Trước demo phải hoặc (a) bật
kiểm key cho mọi endpoint, hoặc (b) để `ai` là private service / chỉ nhận từ `api`. Chưa sửa được ở phase này
(thuộc `apps/ai-service/**`).

**(4) Đổi provider** (Admin UI/API, không redeploy)

```bash
cat > provider.json <<'JSON'
{
  "providers": [
    {
      "id": "primary",
      "name": "Primary provider",
      "type": "openai_compatible",
      "baseUrl": "https://api.deepseek.com/v1",
      "model": "<model-id>",
      "maxTokens": 512,
      "timeoutMs": 20000,
      "priority": 1,
      "enabled": true,
      "apiKey": "<provider-api-key>"
    }
  ]
}
JSON

curl -s -X PUT "$API_URL/api/admin/llm-providers" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d @provider.json
```

Kỳ vọng: HTTP 200, danh sách provider **đã mask** (`keyHint`), **không** có `keyCipher`, không có `apiKey`.

```bash
# không lộ key trong response
curl -s "$API_URL/api/admin/llm-providers" -H "Authorization: Bearer $TOKEN" | grep -c keyCipher
# kỳ vọng: 0

# test connection thật (1 completion max_tokens=1)
curl -s -X POST "$API_URL/api/admin/llm-providers/<providerId>/test" \
  -H "Authorization: Bearer $TOKEN"
# kỳ vọng: {"ok":true,"latencyMs":<số>,"model":"<model>"}; ok:false thì đọc "error"
```

Body chính xác của `PUT` do contract Phase 1 chốt (`UpdateLLMProvidersRequestSchema`) — file `provider.json` ở trên
là **dạng dự kiến từ phase-02 §1**, phải đối chiếu `packages/contracts` **sau khi merge** rồi mới chạy. Chưa kiểm chứng.

Sau 4 bước: bật web, login bằng UI, chat 1 câu có trích dẫn, đổi provider trên UI rồi chat lại — đây mới là bằng
chứng cho báo cáo (kèm ảnh chụp, phase-05 §3).

---

## 5. Rollback

Nguyên tắc: **2 lớp rẻ trước**, không đụng dữ liệu.

```bash
# 0. GHI LẠI SHA trước khi deploy (điền vào bảng dưới)
git rev-parse HEAD
git log -1 --format='%H %ci %s'
```

| Mốc | SHA | Ghi chú |
|---|---|---|
| Baseline `main` xanh gần nhất (2026-10-11) | `a03ae0a2a79c4779cb9a0142e74a13973df6fdfc` | Chưa có F1/F2/F3 mới; dùng được làm điểm lùi "chắc chắn chạy" |
| Commit ship buổi sáng | *(điền ngay trước khi deploy)* | Đây là SHA sẽ rollback về nếu buổi demo lỗi |
| Commit trước commit ship | *(điền)* | — |

```text
1. App-only rollback (dùng 90% số lần):
   Render Dashboard → service → Deploys → chọn deploy trước → "Rollback to this deploy".
   Làm cho CẢ 3 service cùng một bộ commit, không rollback lẻ 1 service.

2. Rollback bằng commit cũ (khi cần đúng SHA):
   Render Dashboard → Manual Deploy → Deploy a specific commit → dán SHA.

3. Sau mỗi lần rollback: chạy lại §4.1 health + 1 smoke test login. Không tuyên bố "đã rollback" khi chưa thấy
   health xanh.

4. KHÔNG có rollback dữ liệu: Atlas M0 không backup tự động. Có thay đổi schema/collection thì phải chấp nhận
   hoặc dump trước (§3.2).
```

Lưu ý: `VITE_API_BASE`/`FRONTEND_URL` là cấu hình, không nằm trong commit → rollback code không tự đổi env. Nếu
vừa đổi env mà lỗi, sửa env trước rồi mới rollback code.

---

## 6. Cần user quyết (chặn buổi sáng)

| # | Quyết định | Vì sao chặn | Mặc định đề xuất |
|---|---|---|---|
| 1 | **Tài khoản Render** (workspace Hobby + thẻ thanh toán) — ai đứng tên | Không có tài khoản thì không tạo được Blueprint; phase này không có credential | 1 người đứng tên, 1 người xác nhận deploy |
| 2 | **Key LLM**: Gemini / DeepSeek / OpenRouter (+ model id) | Toàn bộ F3 (chat có trích dẫn) phụ thuộc provider; phase-04 §Task 1 | 1 provider `openai_compatible` + 1 key dự phòng; nhập qua Admin UI, **không** vào env |
| 3 | **Ngân sách $7 hay $14/tháng** | `plan.md` ghi $7, `phase-05` ghi $14 (2 × Starter). `render.yaml` đang là **$14** | **$14** nếu xoay được: 2 tiến trình riêng, không OOM, đúng kiến trúc ADR-003 |
| 4 | **Branch ship** | Blueprint deploy theo 1 branch cố định | `integration/full-delivery` sau khi merge xong; không deploy từ worktree chưa merge |
| 5 | **Region** | Không đổi được sau khi tạo; ảnh hưởng latency demo | `singapore` (gần VN). Chưa đo latency |

### Phương án $7 (chỉ khi bắt buộc) — và rủi ro

Có 2 cách, cả hai đều **chưa kiểm chứng**:

- **(A) Gộp API + AI vào 1 container** (Dockerfile đa tiến trình, giống gợi ý phase-05 §Ngân sách): 1 service
  Starter $7 chạy cả Express + Uvicorn. Rủi ro: 512 MB cho 2 runtime + socket + FastAPI là **rất sát**; OOM lúc
  chat = demo chết giữa buổi; cần Dockerfile (chưa có trong repo) và change `render.yaml` sang `runtime: docker`.
  Plan đã tự ghi "rủi ro OOM, chỉ làm nếu không xoay được $14".
- **(B) `ai` dùng plan `free`**: tổng $7. Free = 0.1 CPU / 512 MB và **ngủ sau ~15 phút không có traffic**
  (`docs/14-devops-deployment.md` §2, `§B1`), đánh thức có thể ~1 phút → câu chat đầu tiên sau khi idle rất chậm,
  và sleep có thể xảy ra **giữa buổi bảo vệ** nếu ngồi im lâu.

Đề xuất: chốt **$14** trước buổi demo, sau buổi bảo vệ hạ về $7 nếu cần.

---

## 7. Chưa kiểm chứng (không được trích như sự thật)

| # | Nội dung | Trạng thái |
|---|---|---|
| 1 | **Chưa deploy lần nào**, chưa chạy `render blueprints validate` | Phiên này không có tài khoản Render; toàn bộ §2/§4 là thiết kế |
| 2 | `render.yaml` dùng đúng field/giá trị Render chấp nhận (`runtime: static`, `staticPublishPath`, `routes.rewrite`, `rootDir` cho python, `fromService.envVarKey`, `plan: starter`, `region: singapore`) | Đối chiếu Render Blueprint YAML Reference mới nhất; **chưa validate** |
| 3 | `pnpm` có sẵn trên Render Node image | Không chắc → buildCommand tự cài `npm install -g pnpm@11` (máy dev đang dùng pnpm 11.21.0, lockfile `lockfileVersion: '9.0'`; đã kiểm chứng local); nếu bị chặn quyền global thì thử `corepack enable` (cũng chưa kiểm chứng) |
| 4 | Env var của **static site** có được nhúng lúc build (`VITE_API_BASE`) | Tài liệu Render có nói static site nhận env var (vd. `SKIP_INSTALL_DEPS`); chưa chạy thật |
| 5 | `/health` của ai trả **200 kể cả khi Mongo lỗi** (chỉ đổi `status`) | Đọc từ code nhánh `feat/ai-service`; muốn health check chặn DB down thì dùng `/health/ready` |
| 6 | `/api/v1/rag/query` **không** kiểm `AI_SERVICE_API_KEY` | Đọc từ code nhánh `feat/ai-service`; đây là lỗ hổng cần xử lý trước khi để service public (thuộc `apps/ai-service/**`) |
| 7 | Shape JSON của `PUT /api/admin/llm-providers` | Phase-02 §1 mô tả, contract Phase 1 chưa merge → phải đối chiếu `packages/contracts` sau merge |
| 8 | Giá $7/Starter, $14 tổng | Lấy từ plan + Render pricing/compute-plans (Starter = `0.5c-512mb`); **chưa đối chiếu hoá đơn thật** |
| 9 | Dải outbound IP cụ thể của region | Phải lấy trên Dashboard **sau khi** tạo service; giá trị thay đổi theo region |
| 10 | Thời gian build lần đầu, latency p50/p95 trên Render | Chưa đo (chưa deploy) |
| 11 | `docs/22-erd-overall.md` được plan nhắc tới | **Không tồn tại** trong worktree tích hợp hiện tại (docs chỉ 00–20 + phụ lục) — không chặn deploy nhưng chặn mục "đồng bộ ERD" của phase-05 §5 |

---

## 8. Hướng Dẫn Vận Hành CD Render & Đồng Bộ Tự Động (Dành Cho Agent/Dev)

> **CẬP NHẬT KIỂM CHỨNG THỰC TẾ (10/2026):** Blueprint `hr-blockbot` đã được triển khai live thành công trên Render Cloud!  
> Tài khoản quản trị: `Hoang Pham` (Workspace ID: `tea-d08nvgqdbo4c73e4orig`).  
> Render CLI v2.31.0 đã cài đặt tại: `C:\Users\hoang\bin\render.exe`.

### 8.1. Ranh Giới Nhánh Kích Hoạt Auto-Deploy
- Render Blueprint theo dõi nhánh: **`integration/full-delivery`**.
- Khi có commit mới được push lên `origin/integration/full-delivery`, Render sẽ tự động kích hoạt deploy mới cho các services bị ảnh hưởng.
- **Lưu ý sống còn:** Nếu chỉ push lên `main`, Render **SẼ KHÔNG** deploy.

### 8.2. Quy Trình 4 Bước Chuẩn (Standard Agent Workflow):
```powershell
# Bước 1: Kiểm thử local trước khi commit (chỉ commit khi pass 100%)
pnpm --filter web build
node apps/web/test/e2e-revamp-flow.test.mjs

# Bước 2: Commit trên working directory chính (nhánh main)
git add <các_file_thay_đổi>
git commit -m "feat(dashboard): align web app with folio layout and 21st crm preview standards"

# Bước 3: Fast-forward merge vào worktree integration/full-delivery (C:\work-space\hr-blockbot-int)
git -C "C:/work-space/hr-blockbot-int" merge main --ff-only

# Bước 4: Push đồng thời lên remote
git push origin main
git -C "C:/work-space/hr-blockbot-int" push origin integration/full-delivery
```

### 8.3. Kiểm Tra Trạng Thái Bằng Render CLI:
```powershell
# Xem danh sách dịch vụ và trạng thái hiện tại
render services

# Xem tiến độ deploy dịch vụ Web (srv-dbbvs6o473hc73ahqu00)
render deploys list srv-dbbvs6o473hc73ahqu00 --output json

# Xem log runtime/build trực tiếp
render logs srv-dbbvs6o473hc73ahqu00
```
