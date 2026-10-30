# 📚 Trung Tâm Điều Hướng Tài Liệu (Docs Navigation Hub)

> **Dự án KLCN133 — HR BlockBot / Guta Workforce Command Center**  
> Toàn bộ tài liệu kỹ thuật, kiến trúc và phân tích nghiệp vụ của dự án được lưu trữ tại thư mục `docs/`.  
> Tài liệu này đóng vai trò bản đồ chỉ dẫn để các thành viên trong nhóm và AI Agent nhanh chóng tiếp cận đúng tài liệu cần đọc theo vai trò.

---

## 🗺️ Bản đồ 3 tuyến công việc của dự án

Theo [`docs/20-project-map-and-direction.md`](20-project-map-and-direction.md), dự án được cấu trúc theo 3 tuyến rõ ràng:

1. **Tuyến A — Khóa luận cốt lõi (Đường găng chính):**
   - Đề cương KLCN133 với 7 chức năng bắt buộc (F1–F7): hồ sơ nhân sự, vòng đời đề tài/công việc, chatbot chính sách & KPI, gợi ý phân công ca, lượng hóa nhận xét, dashboard quản trị, nhắc hạn & báo cáo.
   - Stack: MERN + TypeScript monorepo, FastAPI AI sidecar, MongoDB Atlas, Socket.IO.
2. **Tuyến B — VietHR Core (Lộ trình sau khóa luận):**
   - Định hướng mở rộng SaaS HRM hoàn chỉnh cho thị trường Việt Nam (chi tiết tại [`vietnam-hrm-platform-proposal.md`](vietnam-hrm-platform-proposal.md)).
3. **Tuyến C — Dữ liệu thực tế chuỗi GUTA Cafe (Data đề bài):**
   - Bộ dữ liệu thực tế từ 34 chi nhánh (2.456 nhân viên, 3.275 dòng ca kíp, giải trình chấm công, kiểm quỹ tiền mặt).
   - Thiết kế schema và trích xuất tại [`database-design.md`](database-design.md) & [`database-extraction.md`](database-extraction.md).

---

## 🧭 Lộ trình đọc tài liệu theo vai trò (Reading Paths)

Chọn vai trò của bạn để đi theo luồng tài liệu tối ưu nhất:

### 1. 🎯 Dành cho PM & Tech Lead (Tổng quan & Quản lý)
*Nắm vững phạm vi, kiến trúc hệ thống, quyết định kỹ thuật và tiến độ:*
1. [`AGENT-GUIDELINES.md`](AGENT-GUIDELINES.md) — Hướng dẫn cộng tác dành riêng cho AI Agent & Git Worktree ownership.
2. [`../plans/261011-1423-project-kickoff/plan.md`](../plans/261011-1423-project-kickoff/plan.md) — Kế hoạch khởi động & lộ trình 6 tuần cuối.
3. [`00-vision-scope.md`](00-vision-scope.md) — Bài toán, phạm vi 3 tầng (In-scope / Pending / Out-of-scope), 6 rủi ro chính.
4. [`20-project-map-and-direction.md`](20-project-map-and-direction.md) — Bản đồ 3 tuyến công việc và kế hoạch hành động.
5. [`02-architecture.md`](02-architecture.md) — Kiến trúc tổng thể C4, ràng buộc hạ tầng và fitness functions.
6. [`03-decision-records/`](03-decision-records/) — 16 ADRs giải thích vì sao chọn/bỏ từng công nghệ.
7. [`16-project-plan.md`](16-project-plan.md) — Kế hoạch WBS 12 tuần và ma trận phân công RACI.
8. [`backlog-parked.md`](backlog-parked.md) — Danh sách tính năng tạm hoãn ngoài phạm vi kèm lý do.

---

### 2. 💻 Dành cho Backend Developer
*Nắm schema dữ liệu, API contract, auth và cơ chế realtime:*
1. [`04-domain-model.md`](04-domain-model.md) — 5 Bounded Contexts, State Machine vòng đời, 20 Business Rules (BR-01..BR-20).
2. [`05-data-model.md`](05-data-model.md) — Thiết kế 11 collections MongoDB, cơ chế Single-Document Atomic Update.
3. [`database-design.md`](database-design.md) — Schema thực tế của database `hr_bot` (SQLite/Atlas) ánh xạ từ chuỗi GUTA.
4. [`06-api-spec.md`](06-api-spec.md) — Đặc tả REST API endpoints, catalog mã lỗi, 9 sự kiện Socket.IO.
5. [`07-auth-rbac.md`](07-auth-rbac.md) — Cơ chế JWT + Refresh Token Rotation, ma trận phân quyền 2 vai (Admin & Employee).
6. [`ADR-002`](03-decision-records/ADR-002-giu-express-thay-vi-nestjs.md), [`ADR-004`](03-decision-records/ADR-004-khong-multi-document-transaction.md), [`ADR-010`](03-decision-records/ADR-010-socket-io-single-instance.md).

---

### 3. 🎨 Dành cho Frontend Developer
*Nắm giao diện chỉ huy, hệ màu dark theme, luồng người dùng và tích hợp API:*
1. [`DESIGN.md`](DESIGN.md) — **Unified Enterprise Design System v3.0**: Design Brief hai register (Product/Brand), kiến trúc token 3 tầng, Zero-Yellow invariant (Obsidian + Electric Sapphire), Motion Physics 60fps, ma trận 8 trạng thái tương tác, đặc tả 4 bề mặt (Landing, CRM, Chat, Auth). Nguồn chân lý duy nhất cho mọi thay đổi UI.
2. [`rules/project-design-rules.md`](rules/project-design-rules.md) — 10 quy tắc bất biến chống AI-slop, enforce tự động bằng test (`yellowCount === 0`).
3. [`10-ui-ux-spec.md`](10-ui-ux-spec.md) — Đặc tả thông tin & hành vi: kiến trúc thông tin theo vai, phân vùng quyền, token semantic, luồng dữ liệu.
4. [`18-user-flows.md`](18-user-flows.md) — 10 luồng người dùng chi tiết (UF-01 đến UF-10) và 28 intents chatbot.
5. [`06-api-spec.md`](06-api-spec.md) — Danh sách endpoint và format dữ liệu trả về kết nối qua client service.
6. [`ADR-015`](03-decision-records/ADR-015-shadcn-ui-va-recharts.md) — Lựa chọn component UI và thư viện biểu đồ.
7. Mã nguồn thực tế: `apps/web/src/components/FolioLandingView.tsx`, `apps/web/src/components/CrmDashboardView.tsx`, `apps/web/src/components/chat/ChatPageView.tsx`, `apps/web/src/components/chat/ChatDrawer.tsx`.

---

### 4. 🧠 Dành cho AI & NLP Engineer
*Nắm thuật toán matching ngữ nghĩa, RAG Engine, Function Calling và quy chuẩn đánh giá AI:*
1. [`08-algorithms.md`](08-algorithms.md) — Semantic matching với PhoBERT, cơ chế từ chối đoán (Abstention), Agent Loop.
2. [`09-ai-evaluation.md`](09-ai-evaluation.md) — Tiêu chuẩn đo lường nhị phân vs ranking, bộ dataset benchmark và regression gates.
3. [`ADR-003`](03-decision-records/ADR-003-tach-fastapi-ai-sidecar.md), [`ADR-005`](03-decision-records/ADR-005-mot-atlas-vector-index-khong-qdrant.md), [`ADR-012`](03-decision-records/ADR-012-llm-provider-abstraction.md).
4. Mã nguồn thực tế: xem `apps/ai-service/README.md` và `apps/ai-service/app/`.

---

### 5. 🛡️ Dành cho QA & DevOps
*Chiến lược kiểm thử, bảo mật và quy trình phát hành:*
1. [`11-quality-testing.md`](11-quality-testing.md) — Tháp kiểm thử, kịch bản UAT và tiêu chí nghiệm thu.
2. [`12-performance.md`](12-performance.md) — Ngân sách hiệu năng (Core Web Vitals, API response time, vector latency).
3. [`13-security.md`](13-security.md) — Threat model, OWASP Top 10, bảo mật token và dữ liệu nhân sự (PII).
4. [`14-devops-deployment.md`](14-devops-deployment.md) — Quy trình CI/CD, kịch bản deploy Render/Atlas/Vercel.
5. [`15-engineering-conventions.md`](15-engineering-conventions.md) — Quy ước Conventional Commits, quy tắc đặt tên branch/PR.

---

### 6. 🤖 Dành cho AI Agents & Đồng Nghiệp Sử Dụng Coding Agents
*Quy chuẩn ranh giới file, nhánh Git Worktree và techstack bất biến:*
1. [`AGENT-GUIDELINES.md`](AGENT-GUIDELINES.md) — Quy tắc bắt buộc khi Agent thực hiện code/review/test trên repo.
2. [`../plans/261011-1423-project-kickoff/plan.md`](../plans/261011-1423-project-kickoff/plan.md) — Kế hoạch khởi động & ranh giới 4 nhánh worktree.

---

## 📑 Danh mục chi tiết toàn bộ tài liệu

| Nhóm tài liệu | File | Tóm tắt nội dung chính |
|---|---|---|
| **Cốt lõi & Định hướng** | [`AGENT-GUIDELINES.md`](AGENT-GUIDELINES.md) | **Cẩm nang cho AI Agent:** Quy chuẩn nhánh, techstack cấm/cho phép, file ownership. |
| | [`00-vision-scope.md`](00-vision-scope.md) | Mục tiêu đề tài, phạm vi 3 tầng, 6 rủi ro, định nghĩa "Done". |
| | [`20-project-map-and-direction.md`](20-project-map-and-direction.md) | Bản đồ 3 tuyến, giải quyết mâu thuẫn tài liệu, lộ trình hành động. |
| | [`backlog-parked.md`](backlog-parked.md) | Các hạng mục tạm gác ngoài phạm vi (Parked items). |
| **Kiến trúc & Quyết định** | [`02-architecture.md`](02-architecture.md) | Kiến trúc C4, trần tài nguyên container, fitness functions. |
| | [`03-decision-records/`](03-decision-records/) | Thư mục 16 ADRs kiến trúc (ADR-001 đến ADR-016). |
| **Nghiệp vụ & Yêu cầu** | [`01-requirements.md`](01-requirements.md) | Phân rã yêu cầu chức năng (F1–F7) và phi chức năng (NFR). |
| | [`04-domain-model.md`](04-domain-model.md) | Bounded Contexts, quy tắc nghiệp vụ BR-01..BR-20, State Machine. |
| | [`18-user-flows.md`](18-user-flows.md) | 10 kịch bản người dùng (UF-01..UF-10) và 28 chatbot intents. |
| **Dữ liệu & Backend** | [`05-data-model.md`](05-data-model.md) | Thiết kế 11 collections MongoDB, indexing, atomic updates. |
| | [`database-design.md`](database-design.md) | Thiết kế database `hr_bot` thực tế (SQLite & Atlas) từ dữ liệu GUTA. |
| | [`database-extraction.md`](database-extraction.md) | Pipeline trích xuất 34 Google Sheets thành database chuẩn. |
| | [`06-api-spec.md`](06-api-spec.md) | Danh mục REST API endpoints, mã lỗi, 9 sự kiện Socket.IO. |
| | [`07-auth-rbac.md`](07-auth-rbac.md) | Xác thực JWT, Refresh Token Rotation, phân quyền Admin/Employee. |
| **Trí tuệ nhân tạo (AI)** | [`08-algorithms.md`](08-algorithms.md) | Thuật toán PhoBERT semantic matching, Policy RAG, Agent Loop. |
| | [`09-ai-evaluation.md`](09-ai-evaluation.md) | Bộ khung đánh giá độ chính xác RAG và regression gate. |
| **Giao diện & Trải nghiệm** | [`10-ui-ux-spec.md`](10-ui-ux-spec.md) | Thiết kế Dark Command Center, responsive, tương tác chat. |
| | [`DESIGN.md`](DESIGN.md) | Thư viện nguồn cảm hứng, layout & components gallery trực quan. |
| | [`rules/project-design-rules.md`](rules/project-design-rules.md) | **10 Quy tắc thiết kế bất biến:** The Unified Enterprise Design System (chống AI slop). |
| | [`17-innovation-playbook.md`](17-innovation-playbook.md) | Các tính năng sáng tạo bổ sung (S-items) ngoài đề cương. |
| **Chất lượng & Vận hành** | [`11-quality-testing.md`](11-quality-testing.md) | Chiến lược test đa tầng, kiểm thử UAT, coverage gates. |
| | [`12-performance.md`](12-performance.md) | Chỉ số SLA, Core Web Vitals, tối ưu hóa truy vấn MongoDB. |
| | [`13-security.md`](13-security.md) | Phân tích rủi ro bảo mật, bảo vệ PII nhân viên, rate limiting. |
| | [`14-devops-deployment.md`](14-devops-deployment.md) | Kế hoạch CI/CD, Docker hóa, hướng dẫn triển khai cloud. |
| | [`15-engineering-conventions.md`](15-engineering-conventions.md) | Quy ước Conventional Commits, quy tắc code, chuẩn PR. |
| | [`16-project-plan.md`](16-project-plan.md) | Kế hoạch dự án 12 tuần, phân công trách nhiệm RACI. |
| **Nghiên cứu thị trường** | [`research/NOTES-01.md`](research/NOTES-01.md) | Nghiên cứu vòng 1: B0–B15 nền tảng công nghệ và nghiệp vụ. |
| | [`research/NOTES-02.md`](research/NOTES-02.md) | Nghiên cứu vòng 2: Quy trình nhân sự ngành dọc F&B chuỗi. |
| | [`research/NOTES-03.md`](research/NOTES-03.md) | Nghiên cứu vòng 3: Cập nhật luật lao động 2026 & AI tiếng Việt. |
| | [`19-vertical-workforce-assessment.md`](19-vertical-workforce-assessment.md) | Đánh giá nghiệp vụ ca kíp và tiền két ngành F&B. |
| | [`vietnam-hrm-platform-proposal.md`](vietnam-hrm-platform-proposal.md) | Đề xuất nền tảng VietHR Core thương mại độc lập. |
