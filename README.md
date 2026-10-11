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
