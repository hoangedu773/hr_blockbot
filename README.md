# HR BlockBot — Guta Workforce Command Center & HR Chatbot

Khóa luận cử nhân CNTT (HUIT) — Mã đề tài **KLCN133**: *Xây dựng Chatbot chuyển đổi số quản lý nhân sự*.

Hệ thống quản trị nhân lực và trợ lý ảo thông minh dành cho chuỗi bán lẻ / F&B, tích hợp **Web Dashboard Chỉ huy (Command Center)** cho nhà quản lý và **Trợ lý ảo Chatbot (PhoBERT + LLM Policy RAG)** cho nhân viên, vận hành thời gian thực qua WebSocket trên dữ liệu thực tế 34 cửa hàng của chuỗi **GUTA Cafe**.

> **Trạng thái dự án:** Monorepo đã hoàn thành tích hợp 3 dịch vụ cốt lõi:
> - **Web Frontend:** Guta Workforce Command Center (React, Vite, Tailwind, Dark Theme).
> - **Backend API:** Express, TypeScript, MongoDB Atlas, Socket.IO realtime.
> - **AI Service:** FastAPI, Python, Policy RAG Engine & Tool-calling Agent.
> - Đề cương gốc: [`docs/KLCN133_TranVietHung.docx`](docs/KLCN133_TranVietHung.docx)

---

## 🏗️ Cấu trúc Monorepo

Dự án được tổ chức dưới dạng `pnpm workspace` kết hợp Python service:

```text
hr_blockbot/
├── apps/
│   ├── web/                # Guta Workforce Command Center (React 18, Vite, Tailwind CSS)
│   ├── api/                # REST & WebSocket API Backend (Express, TypeScript, MongoDB Atlas)
│   └── ai-service/         # Lõi AI Sidecar (FastAPI, Policy RAG Engine, PhoBERT/LLM Agent)
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
| **Phase 1: Contracts** | Zod schemas chuẩn cho Auth, phân quyền 2 vai (`Admin`/`Employee`), allowlist loại bỏ 100% PII nhạy cảm (bank, lương, cccd, phone). | 10 / 10 tests pass | `feat/pm-agentkit` |
| **Phase 2: Backend API** | Express API cổng 3001, hash Argon2id, jose JWT, Refresh Token Rotation (RTR fail-closed), scope guard `assertInScope()`, khóa 503 legacy routes và Socket.IO. | 22 / 22 tests pass | `feat/api-backend` |
| **Phase 3: Frontend Web** | Web React cổng 5173, token lưu trong memory (zero-storage), auto-refresh 401 single-flight, xóa sạch mock data `SEED_*` và fake toasts, UI preview gate 6 trạng thái. | Build & test pass | `feat/frontend-web` |
| **Phase 4: AI Service** | FastAPI cổng 8000, xóa sạch credentials hardcode, endpoint `/health` ping DB Atlas thật (phân biệt liveness vs readiness), khóa mock chat (403). | 11 / 11 tests pass | `feat/ai-service` |
| **Phase 5: Kiểm định QA** | Kiểm thử tích hợp tự động toàn diện trên cả 4 phân hệ, ghi nhận báo cáo QA chi tiết. | 47 / 47 tests pass (100%) | `feat/pm-agentkit` |

---

### 2. Các Luồng Nghiệp Vụ ĐÃ CHẠY THẬT Ngay Hôm Nay:
- 🔐 **Xác thực & Vòng đời Token:** Đăng nhập `POST /api/auth/login` -> cấp Access Token (memory) + Refresh Token (HttpOnly cookie). Tự động xoay vòng token `POST /api/auth/refresh` (phát hiện replay attack thu hồi ngay toàn bộ session family). Đăng xuất `POST /api/auth/logout`. Lấy danh tính `GET /api/auth/me`.
- 👥 **Tra cứu nhân sự có kiểm soát (Data Minimization):**
  - **Quản lý (Admin):** Gọi `GET /api/employees` chỉ nhận allowlist (họ tên, cấp bậc, kỹ năng, trạng thái), không lộ số tài khoản hay lương; chặn truy cập ngoài scope phòng ban/cửa hàng (403 `RBAC_DENIED`).
  - **Nhân viên (Employee):** Chỉ được xem hồ sơ chính mình `GET /api/employees/:id`; xem người khác bị chặn 403.
- 🖥️ **Giao diện Web Command Center:** Xử lý token bộ nhớ, tự động refresh ngầm khi token hết hạn; trang xem trước giao diện độc lập tại `apps/web/previews/index.html` với 6 trạng thái thực tế.
- 🤖 **Giám sát AI:** `/health` phản ánh trung thực liveness và readiness của MongoDB Atlas.

---

### 3. Kế Hoạch Các Luồng Tiếp Theo Theo Lộ Trình (Tuần 8 – 12):
- **Tuần 8:** Hoàn thiện F1 (Hồ sơ nhân viên chuyên sâu) & F2 (Vòng đời ca kíp & giải trình công với State Machine 5 bước `DRAFT` → `ASSIGNED` → `IN_PROGRESS` → `SUBMITTED` → `APPROVED`).
- **Tuần 9:** Hoàn thiện F3 (Chatbot tra cứu chính sách RAG) & F4 (Gợi ý phân công ca qua PhoBERT semantic matching).
- **Tuần 10:** Hoàn thiện F5 (Lượng hóa điểm KPI qua phân tích cảm xúc) & F7 (Báo cáo nghiệm thu & nhắc hạn).
- **Tuần 11:** Đóng băng tính năng (Feature Freeze 09/11/2026), kiểm thử UAT và triển khai Staging Cloud.
- **Tuần 12:** Hoàn thiện báo cáo khóa luận Word/PDF và bảo vệ đề tài (16/11/2026).

---

## 🌿 Mô hình Phân nhánh & Vận hành Đa Dịch Vụ

Dự án áp dụng quy trình phát triển song song 3 dịch vụ cốt lõi theo từng nhánh chuyên biệt. Mỗi nhánh đại diện cho một mảng kỹ thuật độc lập để các thành viên trong nhóm có thể phát triển song song mà không gây xung đột working tree:

| Nhánh (Branch) | Thành phần phụ trách | Stack & Cổng chạy | Trạng thái hiện tại |
|---|---|---|---|
| **`feat/api-backend`** | REST API & WebSocket Backend | Express, TypeScript, MongoDB Atlas (Cổng `3001`, prefix `/api`) | ✅ Hoàn thành Auth JWT + RTR, Scope Guard, API allowlist nhân viên. **22/22 tests pass**. |
| **`feat/frontend-web`** | Web Command Center | React 18, Vite, Tailwind CSS (Cổng `5173`) | ✅ Hoàn thành in-memory auth, 401 single-flight refresh, UI preview 6 trạng thái. |
| **`feat/ai-service`** | Lõi AI Sidecar | FastAPI, Python 3.10+ (Cổng `8000`) | ✅ Hoàn thành `/health` ping DB Atlas thật, khóa mock chat (403), probe RAG. **11/11 tests pass**. |
| **`feat/pm-agentkit`** | Điều phối & Hợp đồng chung | Zod schemas, Docs, Kế hoạch kiểm định | ✅ Hoàn thành `@hr-blockbot/contracts`, bộ test contract **10/10 pass**. |
| **`main`** | Nhánh tích hợp tổng thể | Monorepo hoàn chỉnh | Nhánh ổn định để hội đồng nghiệm thu và triển khai staging. |

---

## ⚡ Hướng Dẫn Vận Hành Cho Đồng Nghiệp & Dev (Step-by-Step)

### Cách 1: Chạy và kiểm thử theo từng nhánh chuyên biệt (Khuyên dùng khi dev tính năng)

Khi bạn được phân công làm việc ở mảng nào, hãy checkout sang nhánh tương ứng:

#### 1. Phát triển & Chạy Backend API (`feat/api-backend`):
```bash
# Chuyển sang nhánh Backend
git checkout feat/api-backend
git pull origin feat/api-backend

# Cài đặt thư viện
pnpm install

# Cấu hình biến môi trường: tạo file apps/api/.env (sao chép từ .env.example)
# Đảm bảo có: PORT=3001 và MONGODB_URI=<chuỗi_kết_nối_Atlas>

# Chạy bộ test xác thực 22 kịch bản (Auth, RTR, RBAC, Data Minimization):
pnpm --filter api test:auth

# Khởi chạy API dev server:
pnpm dev:api
# -> API chạy tại http://localhost:3001 (Kiểm tra health: http://localhost:3001/api/health)
```

#### 2. Phát triển & Chạy Giao diện Web (`feat/frontend-web`):
```bash
# Chuyển sang nhánh Web Frontend
git checkout feat/frontend-web
git pull origin feat/frontend-web

# Cài đặt thư viện & build contracts
pnpm install
pnpm --filter @hr-blockbot/contracts build

# Chạy kiểm tra test giao diện & build:
pnpm --filter web test
pnpm --filter web build

# Khởi chạy Web dev server:
pnpm dev:web
# -> Web chạy tại http://localhost:5173
# -> Xem trang Preview UI kiểm duyệt: mở file apps/web/previews/index.html trên trình duyệt
```

#### 3. Phát triển & Chạy AI Service (`feat/ai-service`):
```bash
# Chuyển sang nhánh AI Service
git checkout feat/ai-service
git pull origin feat/ai-service

# Cài đặt thư viện Python
cd apps/ai-service
pip install -r requirements.txt

# Cấu hình file .env: đảm bảo có MONGODB_URI=<chuỗi_kết_nối_Atlas>

# Chạy test kiểm tra liveness và health probe:
python tests/test_health_probe.py
python tests/test_vector_probe.py

# Khởi chạy AI FastAPI server:
python -m uvicorn app.main:app --port 8000 --reload
# -> Swagger Docs xem tại: http://localhost:8000/docs
```

---

### Cách 2: Vận hành đồng thời cả 3 dịch vụ qua Git Worktree (Multi-Service Workspace)

Nếu máy tính của bạn muốn mở và chạy đồng thời cả 3 dịch vụ cùng lúc mà không phải switch branch liên tục:

```bash
# 1. Tạo 3 thư mục làm việc vật lý song song tách biệt:
git worktree add ../hr-blockbot-api feat/api-backend
git worktree add ../hr-blockbot-web feat/frontend-web
git worktree add ../hr-blockbot-ai feat/ai-service

# 2. Mở từng terminal riêng để khởi chạy:
# Terminal 1: cd ../hr-blockbot-api && pnpm dev:api   (Cổng 3001)
# Terminal 2: cd ../hr-blockbot-web && pnpm dev:web   (Cổng 5173)
# Terminal 3: cd ../hr-blockbot-ai/apps/ai-service && uvicorn app.main:app --port 8000  (Cổng 8000)
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
| **Lõi AI, PhoBERT & RAG Chính Sách** | [`docs/08-algorithms.md`](docs/08-algorithms.md)<br>[`docs/09-ai-evaluation.md`](docs/09-ai-evaluation.md) | Thuật toán semantic matching, bộ quy chế trích dẫn BR-15, cơ chế từ chối đoán (Abstention). |
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
