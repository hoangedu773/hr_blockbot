# 🤖 Hướng Dẫn Dành Cho AI Agent (AI Agent Collaboration & Worktree Guide)

> **Dành cho:** Các AI Agent (Claude Code, Cursor, Copilot, Codex, Windsurf, OpenCode, Aider, v.v.) hoạt động cùng lập trình viên trong dự án **KLCN133 — HR BlockBot**.  
> **Mục tiêu:** Định hướng nhanh ngữ cảnh dự án, techstack đã chốt, ranh giới file ownership theo từng nhánh/worktree để cộng tác an toàn, không xung đột.

---

## 1. Bản Đồ Techstack Đã Chốt (Strict Architecture Baseline)

Mọi Agent hoạt động trong repository này **phải tuân thủ nghiêm ngặt** quyết định kiến trúc đã phê duyệt:

| Thành phần | Công nghệ ĐÃ CHỐT | Công nghệ TUYỆT ĐỐI KHÔNG DÙNG | Lý do kiến trúc |
|---|---|---|---|
| **Web Dashboard** | **React 18 + Vite (SPA)** | ❌ **Next.js** | Dashboard nội bộ 2 vai, không cần SEO/SSR; Next.js gây phức tạp hóa WebSocket realtime và khó deploy tĩnh. |
| **Backend API** | **Express.js + TypeScript** | ❌ **NestJS** | Đề cương gốc chốt MERN (ADR-002). Giữ module 5-file tinh gọn (`routes`, `controller`, `service`, `repository`, `schema`), không dùng NestJS DI boilerplate. |
| **AI Service** | **FastAPI + Python 3.10+** | ❌ Chạy chung Node.js | Sidecar độc lập xử lý Policy RAG và PhoBERT semantic matching (ADR-003). |
| **Database** | **MongoDB Atlas M0** | ❌ PostgreSQL (ở khóa luận) | Đã nạp dữ liệu thật 34 cửa hàng GUTA Cafe; dùng Single-Document Atomic Update (ADR-004), không dùng transaction đa collection. |
| **Contracts** | **Zod (`packages/contracts`)** | ❌ Tự định nghĩa kiểu trùng lặp | Single Source of Truth cho toàn bộ data model giữa Web, API và AI. |

---

## 2. Quy Chuẩn Làm Việc Tập Trung Trên Nhánh Main (Single Workspace Standard)

Toàn bộ các nhánh feature (`feat/*`) và worktree cũ đã được **merge 100% vào nhánh `main`**. Mọi Agent hoạt động trực tiếp tại thư mục gốc repository:

```text
C:/work-space/hr-blockbot/ (Nhánh: main)
├── apps/
│   ├── web/          ──> Frontend React 18 + Vite (Folio Landing & 21st CRM Command Center)
│   ├── api/          ──> Backend Express.js + TypeScript
│   └── ai-service/   ──> AI Sidecar FastAPI + Python
├── packages/
│   └── contracts/    ──> Zod Schemas & TypeScript Types dùng chung
├── docs/             ──> Tài liệu kiến trúc & hướng dẫn vận hành
├── plans/            ──> Kế hoạch phát triển & báo cáo kiểm thử
└── previews/         ──> Visual previews & mockups
```

### Quy tắc bất biến cho Agent (Invariants):
1. **Làm việc trực tiếp trên `main`:** Không tự ý tạo thêm worktree hoặc checkout sang các nhánh cũ đã xóa.
2. **Surgical Changes (Sửa đổi vi phẫu):** Chỉ chạm đúng những file và dòng liên quan trực tiếp đến task được giao.
3. **Kiểm thử trước khi bàn giao:** Bắt buộc chạy kiểm thử (Web build, Playwright E2E, API build, Contracts test) và đọc output thật trước khi báo cáo hoàn thành.
4. **Quy trình deploy Render Cloud:** Render tracking nhánh `integration/full-delivery`. Khi push thay đổi từ `main`, đồng bộ trực tiếp bằng lệnh:
   ```powershell
   git push origin main
   git push origin main:integration/full-delivery
   ```

---

## 3. Lộ Trình & Kế Hoạch 6 Tuần Đang Thực Hiện

Kế hoạch chi tiết được quản lý tại:  
👉 [`plans/261011-1423-project-kickoff/plan.md`](../plans/261011-1423-project-kickoff/plan.md)

### Thứ tự ưu tiên hiện tại (Tuần 7/12 — 11/10 đến 18/10/2026):
1. **API Backend:** Hoàn thiện Auth JWT + Refresh Token Rotation (`apps/api/src/routes/auth.ts`, `apps/api/src/models/Employee.ts`).
2. **AI Service:** Test kiểm chứng `$vectorSearch` trên MongoDB Atlas M0.
3. **Frontend Web:** Nối API client (`apps/web/src/services/api.ts`) với API endpoint thật thay cho mock data.

---

## 4. Tài Liệu Tham Khảo Nhanh Cho Từng Lĩnh Vực

- **Backend:** Xem [`docs/04-domain-model.md`](04-domain-model.md), [`docs/05-data-model.md`](05-data-model.md), [`docs/06-api-spec.md`](06-api-spec.md), [`docs/07-auth-rbac.md`](07-auth-rbac.md).
- **Frontend:** Xem [`docs/10-ui-ux-spec.md`](10-ui-ux-spec.md), [`docs/18-user-flows.md`](18-user-flows.md).
- **AI/NLP:** Xem [`docs/08-algorithms.md`](08-algorithms.md), [`docs/09-ai-evaluation.md`](09-ai-evaluation.md), [`apps/ai-service/README.md`](../apps/ai-service/README.md).
- **Tổng quan dự án:** Xem [`docs/README.md`](README.md) và [`docs/20-project-map-and-direction.md`](20-project-map-and-direction.md).

---

## 5. Trạng Thái Các Nhánh Bootstrap & Hướng Dẫn Tiếp Quản

### 5.1 Trạng Thái Các Nhánh Đã Hoàn Thành & Push GitHub (Tuần 7)

| Nhánh | Worktree | Commit SHA | Trạng thái & Kết quả kiểm chứng |
|---|---|---|---|
| `feat/pm-agentkit` | `../hr-blockbot-pm` | `27ff731` | **DONE:** Chốt Zod contracts (Auth, Employee allowlist không PII, pagination, error catalog), phân quyền đọc/ghi các app, kịch bản Phase 5. Test 10/10 pass. |
| `feat/api-backend` | `../hr-blockbot-api` | `32f4000` | **DONE:** Xóa hardcode secrets, Argon2id + jose (JWT + RTR fail-closed), scope guard `assertInScope()`, Allowlist API `/api/employees`, khóa routes cũ và Socket.IO. Test `pnpm --filter api test:auth` 22/22 pass. |
| `feat/frontend-web` | `../hr-blockbot-web` | `b0d9cdc` | **DONE:** Liên kết contracts, in-memory token, interceptor 401 single-flight refresh, xóa sạch `SEED_*` và optimistic toasts giả, dựng UI preview gate 6 trạng thái tại `apps/web/previews/index.html`. Build pass. |
| `feat/ai-service` | `../hr-blockbot-ai` | `ba08fd2` | **DONE:** Xóa hardcode secrets, endpoint `/health` ping DB Atlas thật báo liveness/readiness trung thực, khóa mock chat (403), giữ requirements tinh gọn. Test 11/11 pass. |

### 5.2 Hướng Dẫn Đồng Nghiệp & Dev Tiếp Quản Nhánh

1. **Kéo mã nguồn mới nhất:**
   ```bash
   git fetch origin
   git checkout <tên_nhánh>
   git pull origin <tên_nhánh>
   ```
2. **Kiểm tra kiểm thử tự động:**
   - Backend API: `pnpm --filter api test:auth` (22/22 tests pass)
   - Contracts: `pnpm --filter @hr-blockbot/contracts test` (10/10 tests pass)
   - Frontend Web: `pnpm --filter web build` (TypeScript + Vite build pass)
   - AI Service: `pytest apps/ai-service/tests/test_health_probe.py`
3. **Môi trường & Biến môi trường (`.env`):**
   - Đảm bảo file `.env` chứa `MONGODB_URI` hoặc `ATLAS_URI` hợp lệ kết nối tới cụm Atlas của dự án.
   - Không commit file `.env` lên git repository.

---

## 6. Hướng Dẫn Deploy & Đồng Bộ Lên Render Cloud (Dành Cho Agent Tiếp Quản)

> **LƯU Ý QUAN TRỌNG:** Render Blueprint `hr-blockbot` được cấu hình theo dõi nhánh **`integration/full-delivery`**, **KHÔNG PHẢI** nhánh `main`. Nếu chỉ push lên `main`, Render **SẼ KHÔNG** tự động kích hoạt deploy!

### 6.1. Quy Trình 4 Bước: Sửa Code → Kiểm Thử → Commit → Push & Auto Deploy

Khi agent hoặc dev hoàn thành sửa lỗi/tính năng ở thư mục làm việc chính (`C:\work-space\hr-blockbot` - nhánh `main`):

1. **Bước 1: Chạy kiểm thử tự động tại local (Bắt buộc pass 100%):**
   ```powershell
   # Kiểm tra build toàn bộ monorepo (Contracts + API + Web) & chạy E2E Playwright:
   pnpm -r run build
   node apps/web/test/e2e-revamp-flow.test.mjs
   pnpm --filter @hr-blockbot/contracts test
   ```

2. **Bước 2: Commit theo chuẩn Conventional Commits 1.0:**
   - Scope whitelist: `auth | hr | project | chatbot | ai | dashboard | realtime | docs | ci` (Cấm `chore`, cấm `task`).
   ```powershell
   git add <danh_sách_file_thực_sự_thay_đổi>
   git commit -m "<type>(<scope>): <tiêu đề tiếng Anh ngắn gọn>"
   ```

3. **Bước 3: Push đồng bộ cả nhánh main và trigger Render deploy:**
   - Đẩy trực tiếp HEAD của `main` lên cả `origin/main` và `origin/integration/full-delivery` mà không cần worktree phụ:
   ```powershell
   git push origin main
   git push origin main:integration/full-delivery
   ```
   *(Ngay khi nhánh `integration/full-delivery` nhận commit mới, webhook của Render sẽ tự động kích hoạt pipeline build và deploy trực tiếp trên cloud)*

4. **Bước 4: Kiểm tra tiến độ deploy bằng Render CLI:**
   - Render CLI v2.31.0 đã được cài đặt sẵn tại `C:\Users\hoang\bin\render.exe` và đã đăng nhập workspace `tea-d08nvgqdbo4c73e4orig`.
   ```powershell
   # Xem lịch sử và trạng thái deploy mới nhất của Web:
   render deploys list srv-dbbvs6o473hc73ahqu00 -o json

   # Xem lịch sử deploy của API:
   render deploys list srv-dbbvs6o473hc73ahqtt0 -o json
   ```

   # Xem log trực tiếp khi build/run:
   render logs srv-dbbvs6o473hc73ahqu00
   ```

### 6.2. Danh Sách URL Dịch Vụ Live Trên Render Cloud

| Dịch vụ | Service ID | URL Công Khai | Health Endpoint |
|---|---|---|---|
| **Frontend Web** | `srv-dbbvs6o473hc73ahqu00` | https://hr-blockbot-web.onrender.com | `/` (HTTP 200) |
| **API Backend** | `srv-dbbvs6o473hc73ahqtt0` | https://hr-blockbot-api.onrender.com | `/api/health` |
| **AI Service** | `srv-dbbvsudg1s2s73fggta0` | https://hr-blockbot-ai.onrender.com | `/health` |

