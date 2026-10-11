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

## 🌿 Mô hình Git Worktree & Phân nhánh (`/ak-agentkit`)

Để đáp ứng quy trình phát triển song song nhiều dịch vụ (Web, API, AI) và hỗ trợ điều phối đa Agent tự động thông qua **AgentKit** mà không gây xung đột working tree, dự án áp dụng chiến lược **Git Worktree Isolation**.

### 1. Tại sao dùng Git Worktree thay vì `git checkout` truyền thống?
- **Không xung đột dependencies:** Không phải cài lại `node_modules` hay kích hoạt lại môi trường ảo Python `venv` khi chuyển ngữ cảnh giữa các phần việc.
- **Phát triển song song không chặn nhau:** Lập trình viên hoặc AI Agent có thể sửa và chạy thử đồng thời giao diện `apps/web` ở một thư mục, trong khi backend `apps/api` hay logic AI `apps/ai-service` đang được kiểm thử ở một thư mục khác.
- **Hỗ trợ AgentKit / Multi-Agent Orchestration:** Cho phép các subagent (như `fullstack-developer`, `code-reviewer`, `tester`, `pm`) làm việc độc lập trên từng worktree vật lý riêng biệt, tránh triệt để lỗi file lock trên Windows và dirty state.

### 2. Sơ đồ nhánh & Thư mục Worktree chuẩn

| Nhánh (Branch) | Thư mục Worktree gợi ý | Vai trò & Phạm vi phụ trách |
|---|---|---|
| `main` | `C:/work-space/hr-blockbot` | Nhánh ổn định, tích hợp toàn bộ monorepo |
| `feat/pm-agentkit` | `C:/work-space/hr-blockbot-pm` | **Nhánh hiện tại:** Điều phối dự án, kiến trúc, tài liệu và AgentKit orchestration |
| `feat/frontend-web` | `../hr-blockbot-web` | Phát triển giao diện Web Command Center (`apps/web`) |
| `feat/api-backend` | `../hr-blockbot-api` | Phát triển REST API, MongoDB Atlas, Socket.IO (`apps/api`) |
| `feat/ai-service` | `../hr-blockbot-ai` | Phát triển FastAPI AI Sidecar, Policy RAG & Tools (`apps/ai-service`) |

### 3. Hướng dẫn thao tác Git Worktree cho Team

```bash
# 1. Xem danh sách các worktree đang hoạt động
git worktree list

# 2. Tạo một worktree mới cho tính năng mới (tách ra từ main)
git worktree add ../hr-blockbot-feature-x -b feat/feature-x

# 3. Di chuyển vào worktree để làm việc độc lập
cd ../hr-blockbot-feature-x

# 4. Khi hoàn thành và đã merge nhánh, xóa worktree an toàn
cd C:/work-space/hr-blockbot
git worktree remove ../hr-blockbot-feature-x

# Hoặc sử dụng skill AgentKit có sẵn trong môi trường:
/ak-worktree
```

---

## ⚡ Hướng dẫn Khởi động Nhanh (Quickstart)

### Yêu cầu môi trường
- **Node.js** >= 18.x & **pnpm** >= 9.x
- **Python** >= 3.10
- **MongoDB Atlas** (hoặc local MongoDB URI)

### 1. Cài đặt Dependencies

```bash
# Cài đặt toàn bộ Node.js packages trong monorepo
pnpm install

# Cài đặt Python dependencies cho AI Service
cd apps/ai-service
pip install -r requirements.txt
cd ../..
```

### 2. Cấu hình biến môi trường (`.env`)

- **Backend API:** Copy `apps/api/.env.example` thành `apps/api/.env` và cập nhật:
  ```env
  PORT=5000
  MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/hr_bot?retryWrites=true&w=majority
  CLIENT_ORIGIN=http://localhost:5173
  ```
- **AI Service:** Copy `apps/ai-service/.env.example` thành `apps/ai-service/.env` (nếu cần cấu hình khóa LLM).

### 3. Khởi chạy các dịch vụ (Local Development)

| Dịch vụ | Lệnh chạy | Địa chỉ cục bộ |
|---|---|---|
| **API Backend** | `pnpm dev:api` | `http://localhost:5000` (Health: `/health`) |
| **Web Command Center** | `pnpm dev:web` | `http://localhost:5173` |
| **AI Service (FastAPI)** | `pnpm dev:ai` | `http://localhost:8000` (Swagger: `/docs`) |

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
