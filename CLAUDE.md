# CLAUDE.md — Hướng Dẫn Cốt Lõi Cho AI Agent (Dự án HR BlockBot / Guta Workspace)

> **MỤC ĐÍCH:** Mọi AI Agent (Claude Code, Cursor, Copilot, Codex, Windsurf, Aider, v.v.) khi làm việc trong repository này **BẮT BUỘC** đọc và tuân thủ các quy tắc dưới đây trước khi sửa code, commit hoặc push.

---

## 1. Vị Trí Làm Việc & Nhánh Git (Single Workspace Standard)

- **Thư mục làm việc duy nhất:** `C:\work-space\hr-blockbot` (hoặc root của repo này).
- **Nhánh duy nhất để code:** `main`.
- **Tuyệt đối không tự ý:**
  - Không tạo thêm worktree ngoài (`../hr-blockbot-*`).
  - Không checkout sang các nhánh cũ (`feat/*` đã được xóa sạch sau khi merge 100%).
  - Mọi thao tác đều thực hiện trực tiếp trên `main`.

---

## 2. Quy Chuẩn Kiến Trúc Ứng Dụng (Architecture & Techstack)

Tuân thủ nghiêm ngặt baseline đề tài đã chốt:
- **Frontend (`apps/web`):** React 18 + Vite (SPA). **CẤM đổi sang Next.js**.
  - **Landing Page:** `FolioLandingView.tsx` (Typography Newsreader editorial, Zero-Yellow: không dùng màu vàng chói, thay bằng Electric Sapphire `#2563eb`).
  - **Auth Modal:** `AuthModal.tsx` (1-Click login cho 3 vai trò: SM, AOM, Admin).
  - **CRM Command Center:** `CrmDashboardView.tsx` (Quản trị 45 chi nhánh Guta, Slide-over Drawer thông tin Barista trong ca & Telegram alert).
  - **Chat Drawer:** `ChatDrawer.tsx` (Tích hợp sẵn trong CRM).
  - **Chi tiết UI/UX & Tokens:** Tham chiếu `docs/DESIGN.md` và `docs/10-ui-ux-spec.md`.
- **Backend API (`apps/api`):** Express.js + TypeScript. **CẤM đổi sang NestJS**.
- **AI Service (`apps/ai-service`):** FastAPI + Python (PhoBERT semantic matching, RAG policy).
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
# 1. Kiểm tra build toàn bộ monorepo (Contracts + API + Web)
pnpm -r run build

# 2. Chạy bộ Playwright E2E test cho luồng giao diện Guta
node apps/web/test/e2e-revamp-flow.test.mjs

# 3. Kiểm tra unit test contracts (nếu có chạm vào packages/contracts)
pnpm --filter @hr-blockbot/contracts test
```
*Chỉ được claim "Done" khi terminal báo PASS 100%, không có lỗi type/lint/console error.*

---

## 5. Quy Chuẩn Commit & Deploy Render Cloud (Bắt Buộc Nhớ)

### 5.1. Chuẩn Commit (Conventional Commits 1.0)
- Scope whitelist: `auth | hr | project | chatbot | ai | dashboard | realtime | docs | ci`
- Cấm dùng `chore`, cấm dùng `task`.
- Ví dụ:
  - `feat(dashboard): add barista status toggle in slideover drawer`
  - `fix(auth): prevent infinite refresh loop on 401 response`
  - `docs(dashboard): update crm branch list and telegram runbook`

### 5.2. Cách Push Để Render Tự Động Deploy
Render Blueprint theo dõi nhánh **`integration/full-delivery`**, không theo dõi trực tiếp `main`. Do đó, sau khi commit trên `main`, **BẮT BUỘC push bằng 2 lệnh sau**:

```powershell
# Đẩy lên nhánh main trên GitHub
git push origin main

# Đồng bộ trực tiếp HEAD của main lên nhánh integration/full-delivery để Render tự build & deploy
git push origin main:integration/full-delivery
```

### 5.3. Kiểm tra trạng thái deploy trên Render Cloud
Render CLI v2.31.0 đã có sẵn tại `C:\Users\hoang\bin\render.exe`:
```powershell
render deploys list srv-dbbvs6o473hc73ahqu00 -o json
```
Trạng thái hợp lệ: `status: "live"`.
URL Web: https://hr-blockbot-web.onrender.com
