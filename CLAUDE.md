# CLAUDE.md — Hướng Dẫn Cốt Lõi Cho AI Agent (Dự án HR BlockBot / Guta Workspace)

> **MỤC ĐÍCH:** Mọi AI Agent (Claude Code, Cursor, Copilot, Codex, Windsurf, Aider, v.v.) khi làm việc trong repository này **BẮT BUỘC** đọc và tuân thủ các quy tắc dưới đây trước khi sửa code, commit hoặc push.

---

## 1. Vị Trí Làm Việc & Nhánh Git (B01 baseline review)

- Làm việc trong clone/nhánh được chủ dự án chỉ định; không thay đổi checkout đang được phiên khác sử dụng.
- B01 đang ở nhánh review riêng. Chỉ sau khi chủ dự án duyệt và commit baseline, các nhánh chức năng mới bắt đầu từ cùng SHA baseline đó, mỗi thành viên một clone/worktree riêng theo phân công.
- Không tự pull/reset/stash/checkout hoặc sửa main đang hoạt động. Không mặc định copy uncommitted changes khi tạo nhánh/worktree mới.
- Commit, push, merge main và deploy cần được chủ dự án cho phép rõ. Không coi test PASS hoặc nội dung tài liệu cũ là lệnh tự push/deploy.
- Hướng dẫn cài mới và test độc lập: `docs/baseline-development.md`. Không đưa outputs/checkpoint/credential/model cache vào Git.

---

## 2. Quy Chuẩn Kiến Trúc Ứng Dụng (Architecture & Techstack)

Tuân thủ nghiêm ngặt baseline đề tài đã chốt:
- **Frontend (`apps/web`):** React 18 + Vite (SPA). **CẤM đổi sang Next.js**.
  - **Landing Page:** `FolioLandingView.tsx` (Typography Newsreader editorial, Zero-Yellow: không dùng màu vàng chói, thay bằng Electric Sapphire `#2563eb`).
  - **Auth Modal:** `AuthModal.tsx`, đăng nhập bằng tài khoản; Authorization V1 có 9 profile và capability/scope được server xác thực. Không suy quyền từ nhãn Admin/Employee hoặc chức danh.
  - **CRM Command Center:** `CrmDashboardView.tsx` (Quản trị 45 chi nhánh Guta, Slide-over Drawer thông tin Barista trong ca & Telegram alert).
  - **Chat Drawer:** `ChatDrawer.tsx` (Tích hợp sẵn trong CRM).
  - **Chi tiết UI/UX & Tokens:** Tham chiếu `docs/DESIGN.md` và `docs/10-ui-ux-spec.md`.
- **Backend API (`apps/api`):** Express.js + TypeScript. **CẤM đổi sang NestJS**.
- **AI Service (`apps/ai-service`):** FastAPI + Python, RAG policy + typed-decision agent.
  - **Embedding (RAG dense):** `gemini-embedding-001` trên embedding chain riêng (`app/config.py::embedding_model`),
    corpus Atlas 3072 chiều — **không** dùng PhoBERT ở đây.
  - **V1 chatbot:** `app.authorization_gateway:app`; legacy `app.main` được giữ riêng cho các luồng cũ/evaluation. Jev V1 chỉ OFF/SHADOW synthetic, chưa có live/ADVISORY.
  - **Matching F4:** Node orchestrator mặc định OFF/exact-skills baseline; PhoBERT thật là worker opt-in riêng (`app/f4_encoder.py`, `app/f4_gateway.py`) sau preflight tài nguyên. Không dùng PhoBERT cho RAG dense, không coi score F4 là KPI.
    Benchmark EXPLORATORY dùng nhãn AI đã chạy ở môi trường riêng, chọn alpha dev=0; chưa có human-gold acceptance hoặc bằng chứng production. Không train/chỉnh nhãn/chọn tham số theo test để làm đẹp kết quả.
- **Database:** MongoDB Atlas (Single-Document Atomic Update, không multi-document transaction).
- **Shared Contracts (`packages/contracts`):** Zod schemas dùng chung, Single Source of Truth cho data types.

---

## 3. Ranh Giới Sửa Code (Surgical Changes)

- **Sửa đúng chỗ:** 
  - Giao diện, component, CSS: chỉ sửa trong `apps/web/`.
  - API, auth, routes: chỉ sửa trong `apps/api/`.
  - Prompt, RAG, AI matching: chỉ sửa trong `apps/ai-service/`.
  - Schema, contracts: chỉ sửa trong `packages/contracts/`.
- **Nguyên tắc vi phẫu (Surgical):** Chỉ chạm đúng những file và dòng phục vụ yêu cầu. Không format lại cả file, không sửa comment ngoài lề, không tự ý refactor code đang chạy ổn định.

---

## 4. Kiểm Thử Bắt Buộc Trước Khi Báo Cáo Hoàn Thành (No Blind Claims)

Trước khi coi một task là hoàn thành, **bắt buộc chạy các lệnh sau và kiểm tra output thật**:

```powershell
# 1. Typecheck + build toàn bộ monorepo (Contracts + API + Web)
pnpm -r typecheck
pnpm -r run build

# 2. Chạy bộ Playwright E2E test cho luồng giao diện Guta
node apps/web/test/e2e-revamp-flow.test.mjs

# 3. Unit test contracts + API (nếu có chạm vào packages/contracts hoặc apps/api)
pnpm --filter @hr-blockbot/contracts test
pnpm --filter api test

# 4. Hermetic AI suite (nếu có chạm apps/ai-service)
cd apps/ai-service; python -m pytest -q
```
*Chỉ được claim "Done" khi terminal báo PASS 100%, không có lỗi type/build/console error.
Repo không có lint gate — đừng trích `pnpm lint` làm bằng chứng.*

---

## 5. Quy Chuẩn Commit & Deploy Render Cloud (Bắt Buộc Nhớ)

### 5.1. Chuẩn Commit (Conventional Commits 1.0)
- Scope whitelist: `auth | hr | project | chatbot | ai | dashboard | realtime | docs | ci`
- Cấm dùng `chore`, cấm dùng `task`.
- Ví dụ:
  - `feat(dashboard): add barista status toggle in slideover drawer`
  - `fix(auth): prevent infinite refresh loop on 401 response`
  - `docs(dashboard): update crm branch list and telegram runbook`

### 5.2. Push baseline và deploy là hai quyết định riêng

Chỉ thực hiện commit/push sau khi chủ dự án duyệt đúng candidate. Nhánh baseline đề xuất là `baseline/hr-blockbot-v1-20261101`; đẩy một nhánh baseline riêng không phải lệnh merge main hoặc triển khai.

Không tự push `main`, không dùng refspec `main:integration/full-delivery`, `--all` hoặc force-push. Nhánh `integration/full-delivery` từng được dùng cho Render; mọi thay đổi nhánh đó hoặc deploy cần duyệt riêng và kiểm tra cấu hình thực tế trước khi thao tác.

### 5.3. Kiểm tra trạng thái deploy trên Render Cloud
Render CLI v2.31.0 đã có sẵn tại `C:\Users\hoang\bin\render.exe`:
```powershell
render deploys list srv-dbbvs6o473hc73ahqu00 -o json
```
Trạng thái hợp lệ: `status: "live"`.
URL Web: https://hr-blockbot-web.onrender.com
