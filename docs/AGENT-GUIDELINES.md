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

## 2. Ranh Giới Nhánh & Quyền Sở Hữu File (Worktree & Branch Boundary)

Dự án chia 4 luồng phát triển song song qua **Git Worktrees**. Khi Agent được giao việc, chỉ thao tác đúng phạm vi nhánh được phân công:

```text
hr_blockbot/
├── apps/
│   ├── web/          ──> Thuộc nhánh feat/frontend-web (Worktree: ../hr-blockbot-web)
│   ├── api/          ──> Thuộc nhánh feat/api-backend   (Worktree: ../hr-blockbot-api)
│   └── ai-service/   ──> Thuộc nhánh feat/ai-service    (Worktree: ../hr-blockbot-ai)
├── packages/
│   └── contracts/    ──> Thuộc nhánh feat/pm-agentkit   (Worktree: ../hr-blockbot-pm)
├── docs/             ──> Thuộc nhánh feat/pm-agentkit
└── plans/            ──> Thuộc nhánh feat/pm-agentkit
```

### Quy tắc bất biến cho Agent (Invariants):
1. **Phân quyền đọc/ghi minh bạch (Read/Write Boundaries):**
   - **Quyền đọc chung (Read-only):** Mọi Agent trên các nhánh dev (`feat/frontend-web`, `feat/api-backend`, `feat/ai-service`) được phép đọc **READ-ONLY** các thư mục dùng chung: `packages/contracts/**`, `docs/**`, và `plans/**` để đối chiếu hợp đồng, spec và kế hoạch kỹ thuật.
   - **Quyền ghi cô lập (Write isolation):** Quyền ghi bị cô lập nghiêm ngặt theo từng ứng dụng được giao:
     - Agent trên nhánh `feat/frontend-web` chỉ được ghi/sửa file trong `apps/web/`.
     - Agent trên nhánh `feat/api-backend` chỉ được ghi/sửa file trong `apps/api/`.
     - Agent trên nhánh `feat/ai-service` chỉ được ghi/sửa file trong `apps/ai-service/`.
     - Tuyệt đối không can thiệp ghi chéo app hoặc tự ý sửa `packages/**`, `docs/**`, `plans/**` trên nhánh dev.
2. **Sửa đổi schema dùng chung:** Nếu cần thêm trường hoặc đổi type dữ liệu, phải tạo đề xuất/PR vào `packages/contracts` trên nhánh `feat/pm-agentkit`. Không tự ý định nghĩa kiểu cục bộ sai lệch contract chung.
3. **Surgical Changes (Sửa đổi vi phẫu):** Chỉ chạm đúng những dòng cần sửa; không tự ý format lại toàn bộ file, không sửa comment hoặc refactor code xung quanh ngoài phạm vi task.

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
