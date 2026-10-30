# HR BlockBot — Guta Workforce Command Center & HR Chatbot

Khóa luận cử nhân CNTT (HUIT) — Mã đề tài **KLCN133**: *Xây dựng Chatbot chuyển đổi số quản lý nhân sự*.

Hệ thống quản trị nhân lực và trợ lý ảo thông minh dành cho chuỗi bán lẻ / F&B, tích hợp **Web Dashboard Chỉ huy (Command Center)** cho nhà quản lý và **Trợ lý ảo Chatbot (RAG Policy + typed-decision agent)** cho nhân viên, vận hành thời gian thực qua WebSocket trên dữ liệu thực tế 34 cửa hàng của chuỗi **GUTA Cafe**.

> **Trạng thái dự án:** Monorepo đã hoàn thành tích hợp 3 dịch vụ cốt lõi:
> - **Web Frontend:** Guta Workforce Command Center (React, Vite, Tailwind, Dark Theme).
> - **Backend API:** Express, TypeScript, MongoDB Atlas, Socket.IO realtime.
> - **AI Service:** FastAPI, Python, Policy RAG Engine & Tool-calling Agent.
> - **Hiện trạng đo ngày 2026-10-20 (không tô hồng):** DB Atlas `hr_bot` có **2.439 hồ sơ nhân sự + 37 phòng ban** thật, nhưng `users`, `policies`, `projects`, `reports`, `evaluations` **rỗng** → chưa đăng nhập được và F2/F3 chưa chạy end-to-end; chatbot đang khoá **403**, các route dashboard legacy trả **503** (fail-closed). Các hạng mục dưới đây chỉ được đánh dấu "chạy thật" khi có lệnh verify + output thật.
> - Kế hoạch đóng F1/F2/F3 + deploy: [`plans/261020-2200-full-delivery/plan.md`](plans/261020-2200-full-delivery/plan.md)
> - Đề cương gốc: [`docs/KLCN133_TranVietHung.docx`](docs/KLCN133_TranVietHung.docx)

---

## 🏗️ Cấu trúc Monorepo

Dự án được tổ chức dưới dạng `pnpm workspace` kết hợp Python service:

```text
hr_blockbot/
├── apps/
│   ├── web/                # Guta Workforce Command Center (React 18, Vite, Tailwind CSS)
│   ├── api/                # REST & WebSocket API Backend (Express, TypeScript, MongoDB Atlas)
│   └── ai-service/         # Lõi AI Sidecar (FastAPI, Policy RAG Engine, typed-decision agent)
├── packages/
│   └── contracts/          # Schemas chung (Zod) và TypeScript types dùng chung giữa các service
├── docs/                   # Bộ 25 tài liệu kiến trúc, nghiệp vụ và 16 quyết định ADR
├── plans/                  # Kế hoạch triển khai, nhật ký và báo cáo kỹ thuật
└── scripts/                # Pipeline trích xuất & làm sạch dữ liệu Google Sheets -> SQLite -> Atlas
```

---

## 🚦 Hiện Trạng Triển Khai & Bản Đồ Tính Năng (Feature Status)

### 1. 5 Giai Đoạn Nền Móng Đã Hoàn Thành (Bootstrap Foundation — Tuần 7)
Hệ thống đã hoàn tất toàn bộ 5 phase nền tảng, bảo mật và kết nối thực tế:

| Phase Bootstrap | Công việc đã hoàn tất trong mã nguồn | Kết quả kiểm thử | Nhánh phụ trách |
|---|---|---|---|
| **Phase 1: Contracts** | Zod schemas chuẩn cho Auth, phân quyền 2 vai (`Admin`/`Employee`), allowlist loại bỏ 100% PII nhạy cảm (bank, lương, cccd, phone); thêm schema F1/F2 + 8 schema mới của plan Full Delivery (LLM provider, conversation, policy, citation). | 38 / 38 tests pass | `feat/pm-agentkit` |
| **Phase 2: Backend API** | Express API cổng 3001, hash Argon2id, jose JWT, Refresh Token Rotation (RTR fail-closed), scope guard `assertInScope()`, khóa 503 legacy routes và Socket.IO. | 22 / 22 tests pass | `feat/api-backend` |
| **Phase 3: Frontend Web** | Web React cổng 5173, token lưu trong memory (zero-storage), auto-refresh 401 single-flight, xóa sạch mock data `SEED_*` và fake toasts, UI preview gate 6 trạng thái. | Build & test pass | `feat/frontend-web` |
| **Phase 4: AI Service** | FastAPI cổng 8000, xóa sạch credentials hardcode, endpoint `/health` ping DB Atlas thật (phân biệt liveness vs readiness), khóa mock chat (403). | 11 / 11 tests pass | `feat/ai-service` |
| **Phase 5: Kiểm định QA** | Kiểm thử tích hợp tự động toàn diện trên cả 4 phân hệ, ghi nhận báo cáo QA chi tiết. | 47 / 47 tests pass (100%) | `feat/pm-agentkit` |

---

### 2. Trạng thái thực tế của từng luồng (đo ngày 2026-10-20) — không claim "đã chạy thật" khi chưa verify:
- 🔐 **Xác thực & Vòng đời Token:** code login/refresh/logout + RTR có trong nhánh `feat/api-backend`, nhưng **chưa chạy end-to-end** vì collection `users` = 0 document (chưa có tài khoản nào để đăng nhập).
- 👥 **Tra cứu nhân sự có kiểm soát (Data Minimization):** contract allowlist + scope guard đã có; chứng minh được ngay khi `users` có tài khoản:
  - **Quản lý (Admin):** `GET /api/employees` chỉ trả allowlist (họ tên, cấp bậc, kỹ năng, trạng thái), không lộ số tài khoản hay lương; ngoài scope phòng ban/cửa hàng → 403 `RBAC_DENIED`.
  - **Nhân viên (Employee):** chỉ xem hồ sơ chính mình; xem người khác → 403.
- 🖥️ **Giao diện Web Command Center:** token lưu trong memory + auto-refresh ngầm hoạt động ở mức UI; trang preview tĩnh tại `apps/web/previews/index.html`. **Dashboard chưa gọi được dữ liệu thật** — các route legacy của API trả **503** (khoá có chủ đích, fail-closed).
- 🤖 **AI Service:** `/health` phản ánh liveness/readiness của MongoDB Atlas thật; chat bị khoá **403** (mock bị vô hiệu) và **chưa có key LLM** → F3 chưa trả lời được câu hỏi chính sách.

---

### 3. Kế Hoạch Các Luồng Tiếp Theo Theo Lộ Trình (Tuần 8 – 12):
- **Tuần 8:** Hoàn thiện F1 (Hồ sơ nhân viên chuyên sâu) & F2 (**Vòng đời đề tài** — không phải ca kíp — với State Machine 5 bước `DRAFT` → `ASSIGNED` → `IN_PROGRESS` → `PENDING_REVIEW` → `COMPLETED`, chống conflict bằng `version`).
- **Tuần 9:** Hoàn thiện F3 (Chatbot tra cứu chính sách RAG) & F4 (Gợi ý phân công ca — hiện `app/agent/matching.py`
  dùng skill-overlap + LOO; PhoBERT semantic matching theo đề cương `FR-023..027` **chưa** triển khai).
- **Tuần 10:** Hoàn thiện F5 (Lượng hóa điểm KPI qua phân tích cảm xúc) & F7 (Báo cáo nghiệm thu & nhắc hạn).
- **Tuần 11:** Đóng băng tính năng (Feature Freeze 09/11/2026), kiểm thử UAT và triển khai Staging Cloud.
- **Tuần 12:** Hoàn thiện báo cáo khóa luận Word/PDF và bảo vệ đề tài (16/11/2026).

---

## 🌿 Mô Hình Nhánh & Vận Hành (Single Workspace)

Từ 2026-10-30, toàn bộ nhánh `feat/*` đã merge 100% vào `main` và bị xoá khỏi `origin`. Dự án vận hành
trong **một** checkout duy nhất; mỗi service là một process riêng, không phải một nhánh riêng.

| Service | Thành phần | Stack & Cổng | Trạng thái (đo 2026-10-30) |
|---|---|---|---|
| `apps/api` | REST API & Socket.IO | Express, TypeScript (Cổng `3001`, prefix `/api`) | Auth JWT + RTR, Scope Guard, allowlist nhân viên. `pnpm --filter api test` = 10 file. |
| `apps/web` | Web Command Center | React 18, Vite, Tailwind (Cổng `5173`) | in-memory auth, 401 single-flight refresh, preview UI. Build + `web test` pass. |
| `apps/ai-service` | Lõi AI Sidecar | FastAPI, Python (Cổng `8000`) | Jev typed-decision gate, RAG `gemini-embedding-001`, tool-calling agent. `pytest` 177 passed. |
| `packages/contracts` | Hợp đồng chung | Zod | `contracts test` 40/40 pass. |
| `main` | Nhánh tích hợp duy nhất | Monorepo | Nhánh ổn định để nghiệm thu và deploy staging. |

---

## ⚡ Hướng Dẫn Vận Hành Cho Đồng Nghiệp & Dev (Step-by-Step)

> **Single workspace (2026-10-30):** mọi nhánh `feat/*` đã merge 100% vào `main` và không còn trên
> `origin`. Làm việc trực tiếp trong `C:/work-space/hr-blockbot` trên `main`; **không** tạo worktree,
> **không** `git checkout feat/...` (lệnh sẽ fail).

```bash
git fetch origin && git checkout main && git pull origin main
pnpm install
pnpm --filter @hr-blockbot/contracts build
```

#### 1. Backend API (`apps/api`, cổng 3001)
```bash
# Cấu hình: apps/api/.env (sao chép từ .env.example) — cần PORT=3001 và MONGODB_URI
pnpm --filter api test      # 10 file node --test trên mongodb-memory-server
pnpm dev:api                # http://localhost:3001/api/health
```

#### 2. Giao diện Web (`apps/web`, cổng 5173)
```bash
pnpm --filter web test
pnpm --filter web build
pnpm dev:web                # http://localhost:5173
# -> Preview UI tĩnh: apps/web/previews/index.html
```

#### 3. AI Service (`apps/ai-service`, cổng 8000)
```bash
cd apps/ai-service
pip install -r requirements.txt
# .env: cần MONGODB_URI; AI_SERVICE_API_KEY fail-closed (rỗng => mọi request 503)

python -m pytest -q         # 177 passed, 1 skipped (hermetic: không dùng credential máy)
python start.py             # hoặc: python -m uvicorn app.main:app --port 8000 --reload
# -> Swagger: http://localhost:8000/docs
```

#### 4. Gate toàn workspace
```bash
pnpm -r typecheck            # tsc --noEmit: api + web + contracts
pnpm -r build
pnpm -r test
```
Repo **không** có eslint/prettier và không có script `lint` — đừng trích `pnpm lint` làm bằng chứng.

---

### Chạy đồng thời cả 3 dịch vụ

Không cần worktree: mỗi service là một process riêng trong cùng checkout.

```bash
# Terminal 1: pnpm dev:api
# Terminal 2: pnpm dev:web
# Terminal 3: cd apps/ai-service && python start.py
```

---

## 📚 Bản đồ Tài liệu Kỹ thuật (Curated Documentation Map)

Hệ thống tài liệu hoàn chỉnh được lưu trữ và điều hướng chi tiết tại [`docs/README.md`](docs/README.md). Dưới đây là phân cụm chính:

```text
docs/
├── 🏛️ Cốt lõi & Định hướng:       00-vision-scope, 20-project-map-and-direction, backlog-parked
├── 📐 Kiến trúc & Quyết định:     02-architecture, 03-decision-records/ (16 ADRs)
├── 💼 Nghiệp vụ & Dữ liệu GUTA:   01-requirements, 04-domain-model, 05-data-model, database-design
├── 🤖 Trí tuệ nhân tạo (AI):      08-algorithms, 09-ai-evaluation, apps/ai-service/README
├── 🔌 API, Auth & Realtime:       06-api-spec, 07-auth-rbac, 13-security
├── 🎨 Giao diện & Trải nghiệm:    10-ui-ux-spec, 18-user-flows, design-plan
├── 🚀 Vận hành & Quy ước:         11-quality-testing, 12-performance, 14-devops, 15-conventions, 16-plan
└── 🔬 Nghiên cứu thị trường:      research/ (NOTES-01, 02, 03), 19-vertical-workforce-assessment
```

### 🧭 Bản Đồ Điều Hướng Tài Liệu (Docs Router)

Bảng tra cứu nhanh tài liệu theo nhu cầu tìm hiểu và luồng nghiệp vụ:

| Bạn cần tìm hiểu về... | Tài liệu cần đọc | Tóm tắt nội dung chính |
|---|---|---|
| **Báo cáo QA & Kiểm thử tự động** | [`plans/reports/qa-261011-bootstrap-verification.md`](plans/reports/qa-261011-bootstrap-verification.md)<br>[`docs/11-quality-testing.md`](docs/11-quality-testing.md) | Báo cáo chi tiết 47 test assertions đạt 100%, kim tự tháp test, số liệu kiểm thử thực tế. |
| **Kế hoạch 5 Phase Bootstrap** | [`plans/261011-0753-bootstrap-foundation/plan.md`](plans/261011-0753-bootstrap-foundation/plan.md) | Toàn văn kế hoạch nền móng kỹ thuật, ranh giới file ownership, checklist từng phase. |
| **Lộ trình 6 tuần cuối (Tuần 7-12)** | [`plans/261011-1423-project-kickoff/plan.md`](plans/261011-1423-project-kickoff/plan.md)<br>[`docs/16-project-plan.md`](docs/16-project-plan.md) | Kế hoạch WBS 12 tuần của khóa luận KLCN133, ma trận RACI và các mốc deadline. |
| **Xác thực JWT, RTR & Phân quyền RBAC** | [`docs/07-auth-rbac.md`](docs/07-auth-rbac.md) | Cơ chế token trong memory, HttpOnly cookie, thuật toán Argon2id, scope guard `assertInScope()`. |
| **Đặc tả REST API & Catalog mã lỗi** | [`docs/06-api-spec.md`](docs/06-api-spec.md) | Danh mục endpoints `/api/*`, bao gói chuẩn `{ items, paging }`, catalog lỗi hệ thống. |
| **Cơ sở dữ liệu & 11 Collections** | [`docs/05-data-model.md`](docs/05-data-model.md)<br>[`docs/database-design.md`](docs/database-design.md) | Thiết kế 11 collections MongoDB Atlas, schema mapping chuỗi GUTA Cafe, atomic updates. |
| **Lõi AI & RAG Chính Sách** | [`docs/08-algorithms.md`](docs/08-algorithms.md)<br>[`docs/09-ai-evaluation.md`](docs/09-ai-evaluation.md) | Thuật toán semantic matching, bộ quy chế trích dẫn BR-15, cơ chế từ chối đoán (Abstention). |
| **Giao diện Dark Command Center & UX** | [`docs/10-ui-ux-spec.md`](docs/10-ui-ux-spec.md)<br>[`docs/18-user-flows.md`](docs/18-user-flows.md) | Thiết kế visual timeline, bảng màu nền tối, 10 luồng người dùng (UF-01 đến UF-10). |
| **Kiến trúc hệ thống C4 & 16 ADRs** | [`docs/02-architecture.md`](docs/02-architecture.md)<br>[`docs/03-decision-records/`](docs/03-decision-records/) | Sơ đồ C4, trần tài nguyên container, 16 quyết định kiến trúc giải thích lý do chọn công nghệ. |
| **Quy chuẩn cộng tác cho Dev** | [`docs/AGENT-GUIDELINES.md`](docs/AGENT-GUIDELINES.md)<br>[`docs/15-engineering-conventions.md`](docs/15-engineering-conventions.md) | Quy tắc phân quyền đọc/ghi, hướng dẫn kéo nhánh, quy ước Conventional Commits. |

### Điểm nhấn cho người mới tham gia dự án (5 phút nắm bắt):
1. **Mục tiêu & Ranh giới:** Đọc [`docs/00-vision-scope.md`](docs/00-vision-scope.md) để biết 7 chức năng bắt buộc và các rủi ro.
2. **Kế hoạch & Tuyến công việc:** Đọc [`docs/20-project-map-and-direction.md`](docs/20-project-map-and-direction.md) để hiểu sự kết nối giữa Khóa luận, VietHR Core và Dữ liệu GUTA Cafe.
3. **Quyết định kiến trúc:** Xem danh mục 16 ADRs tại [`docs/03-decision-records/`](docs/03-decision-records) để hiểu lý do chọn MERN + FastAPI + MongoDB thay vì PostgreSQL/NestJS/Redis.
4. **Quy chuẩn lập trình:** Tuân thủ [`docs/15-engineering-conventions.md`](docs/15-engineering-conventions.md) khi viết code, commit và tạo PR.

---

## 📝 Quy ước Commit (Conventional Commits)

Dự án áp dụng chặt chẽ [Conventional Commits 1.0](https://www.conventionalcommits.org/):
```text
<type>(<scope>): <description>
```
- **Type hợp lệ:** `feat` | `fix` | `docs` | `style` | `refactor` | `perf` | `test` | `build` | `ci` | `revert` (không dùng `chore` cho logic).
- **Scope chuẩn:** `auth`, `hr`, `project`, `chatbot`, `ai`, `dashboard`, `realtime`, `docs`, `ci`, `contracts`, `web`, `api`.
- **Ngôn ngữ:** Message commit bằng **tiếng Anh**; thảo luận tài liệu và trao đổi nội bộ bằng **tiếng Việt**.

---

## 👥 Nhóm Thực Hiện

- **Sinh viên thực hiện:**
  - Phạm Việt Hoàng
  - Nguyễn Thái Hòa
  - Nguyễn Ngọc Phi
- **Giảng viên hướng dẫn:** ThS. Trần Việt Hùng
- **Thời gian thực hiện:** Khóa luận cử nhân CNTT — HUIT (2026–2027).
