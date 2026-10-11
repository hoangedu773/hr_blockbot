# Kế Hoạch Khởi Động Dự Án (Project Kickoff Plan) — KLCN133

> **Thời gian:** 11/10/2026 (Tuần 7/12 khóa luận — còn 5 tuần đến hạn nộp 16/11/2026)  
> **Định hướng chiến lược:** Áp dụng phương án **A1** (theo [`docs/20-project-map-and-direction.md`](../../docs/20-project-map-and-direction.md)): Tập trung toàn lực hoàn thành 7 chức năng khóa luận (F1–F7), sử dụng dữ liệu chuỗi GUTA Cafe làm data đề bài, hoãn nhánh VietHR Core sau 16/11.

---

## 1. Mục Tiêu & Ranh Giới (Vision & Constraints)

### 1.1 Outcome
- Đưa hệ thống monorepo 3 thành phần (`web`, `api`, `ai-service`) từ trạng thái scaffold sang trạng thái tích hợp chạy thông suốt (End-to-End).
- Hoàn thành đầy đủ 7 chức năng bắt buộc theo đề cương KLCN133 trước ngày đóng băng (09/11/2026).
- Vận hành song song 3 stream phát triển qua mô hình **Git Worktree**.

### 1.2 Techstack Đã Chốt (Theo ADR-001 đến ADR-016)
- **Frontend Web:** React 18 + Vite + Tailwind CSS + Shadcn UI (SPA, Dark Command Center).
- **Backend API:** Express.js + TypeScript + MongoDB Atlas M0 + Socket.IO (Realtime events).
- **AI Service:** FastAPI + Python + Policy RAG Engine + PhoBERT / LLM Agent tools.
- **Contracts:** Zod schemas chung tại `packages/contracts`.

---

## 2. Phân Luồng Phát Triển & Trách Nhiệm Git Worktree

| Stream | Nhánh Git | Thư mục Worktree | Thành viên phụ trách | Nhiệm vụ chính |
|---|---|---|---|---|
| **Stream 1: Frontend** | `feat/frontend-web` | `../hr-blockbot-web` | Dev Frontend | Hoàn thiện UI Dashboard, Timeline phân ca, Modal duyệt, Chatbot drawer, Toast realtime |
| **Stream 2: Backend** | `feat/api-backend` | `../hr-blockbot-api` | Dev Backend | REST API CRUD, Auth (JWT + RTR), Socket.IO gateway, kết nối MongoDB Atlas, Mongoose models |
| **Stream 3: AI Core** | `feat/ai-service` | `../hr-blockbot-ai` | Dev AI / NLP | Policy RAG vector search, PhoBERT semantic matching, Function calling agent, KPI sentiment |
| **Stream 4: Điều phối** | `feat/pm-agentkit` | `C:/work-space/hr-blockbot-pm` | PM / Tech Lead | Quản lý monorepo, contracts, docs, CI/CD gates, merge integration vào `main` |

---

## 3. Lộ Trình Triển Khai 6 Tuần (Roadmap & Milestones)

### Giai đoạn 1: Tuần 7 (Hiện tại: 11/10 – 18/10) — Tích hợp nền móng (Core Integration)
- [x] Đẩy 3 nhánh tính năng (`feat/frontend-web`, `feat/api-backend`, `feat/ai-service`) lên GitHub.
- [x] Chuẩn hóa tài liệu điều hướng `docs/README.md` và quy chế Git Worktree trong `README.md`.
- [ ] **Task 1.1 (Backend):** Hoàn thiện module Auth (Login 2 vai Admin / Employee, JWT + Refresh Token Rotation theo ADR-007, ADR-008).
- [ ] **Task 1.2 (Data):** Nạp dữ liệu seed GUTA nguyên bản (2.456 nhân viên, 3.275 ca) vào MongoDB Atlas bằng script `scripts/export_for_mongo.py`.
- [ ] **Task 1.3 (AI):** Kiểm chứng `$vectorSearch` trên MongoDB Atlas M0 (kiểm tra latency và giới hạn index).
- [ ] **Task 1.4 (Web):** Nối client API service (`apps/web/src/services/api.ts`) với backend thật, thay mock data bằng API call.
- **Gate kiểm tra:** Đăng nhập được 2 vai trên Web, hiển thị dữ liệu nhân viên và ca làm việc thật từ Atlas.

---

### Giai đoạn 2: Tuần 8 (19/10 – 25/10) — Hoàn thiện F1 (Hồ sơ) & F2 (Vòng đời ca kíp)
- [ ] **Task 2.1:** F1 — Hồ sơ nhân viên, phân cấp quản trị, tra cứu danh sách nhân sự cửa hàng.
- [ ] **Task 2.2:** F2 — State Machine 5 trạng thái cho ca kíp & đề tài công việc (`DRAFT` → `ASSIGNED` → `IN_PROGRESS` → `SUBMITTED` → `APPROVED`).
- [ ] **Task 2.3:** Realtime synchronization: Khi Quản lý phân ca hoặc duyệt đổi ca, Socket.IO đẩy notification ngay lập tức tới nhân viên.
- **Gate kiểm tra:** Chạy thông luồng UF-01 (Phân công ca) và UF-05 (Duyệt giải trình chấm công).

---

### Giai đoạn 3: Tuần 9 (26/10 – 01/11) — Hoàn thiện F3 (Chatbot Tra Cứu) & F4 (Gợi Ý Phân Ca)
- [ ] **Task 3.1:** F3 — Chatbot RAG: Tra cứu nội quy lao động, quy chế chấm công, kiểm quỹ tiền két (Abstention rate > 0 khi ngoài phạm vi).
- [ ] **Task 3.2:** F4 — Thuật toán PhoBERT / semantic similarity matching gợi ý nhân sự thay ca dựa trên độ tương đồng kỹ năng và lịch trống.
- **CỘT MỐC LỚN (BIG GATE W9):** Toàn bộ F1–F7 chạy thông suốt dạng Skeleton (End-to-End). Đạt điều kiện để mở các tính năng sáng tạo S-items.

---

### Giai đoạn 4: Tuần 10 (02/11 – 08/11) — F5 (Lượng Hóa KPI), F7 (Báo Cáo) & Benchmark S3
- [ ] **Task 4.1:** F5 — Phân tích sắc thái nhận xét đánh giá (Sentiment Analysis) để lượng hóa điểm KPI minh bạch.
- [ ] **Task 4.2:** F7 — Tiếp nhận báo cáo kết ca / nghiệm thu và tự động nhắc hạn nộp.
- [ ] **Task 4.3:** Thực nghiệm S3 — Chạy benchmark so sánh 4 mô hình embedding trên tập dữ liệu tiếng Việt.
- **Gate kiểm tra:** Bảng số liệu benchmark AI có số thật; lệnh `pnpm test` pass 100%.

---

### Giai đoạn 5: Tuần 11 (09/11 – 15/11) — Đóng Băng Tính Năng, UAT & Triển Khai Cloud
- [ ] **09/11/2026: ĐÓNG BĂNG TÍNH NĂNG (FEATURE FREEZE)** — Không thêm tính năng mới, chỉ sửa lỗi.
- [ ] Triển khai Staging: Web lên Vercel, API & AI Service lên Render/VPS, DB trên Atlas M0.
- [ ] Chạy kiểm thử chấp nhận người dùng (UAT) theo 10 kịch bản `docs/18-user-flows.md`.
- **Gate kiểm tra:** Hệ thống online, uptime ổn định, các chỉ số NFR đạt chuẩn.

---

### Giai đoạn 6: Tuần 12 (16/11/2026) — Hoàn Thiện Báo Cáo & Diễn Tập Nghiệm Thu
- [ ] Đồng bộ số liệu mã nguồn vào báo cáo khóa luận Word/PDF theo mẫu của Khoa.
- [ ] Diễn tập kịch bản demo (kênh Web Dashboard và kênh Chatbot Telegram/Web).
- [ ] Nộp khóa luận chính thức.

---

## 4. Hành Động Ngay Trong Tuần Này (Next Actions)

1. **Team Sync (Hôm nay):** Họp nhóm 3 người chốt phân công 3 stream theo bảng trên.
2. **Kích hoạt Stream:** Từng thành viên clone/worktree nhánh tương ứng của mình (`feat/frontend-web`, `feat/api-backend`, `feat/ai-service`) và chạy thử local.
3. **Thực thi Task 1.1 & 1.2:** Triển khai Auth và import seed Atlas.
