# hr_blockbot

Khóa luận cử nhân CNTT (HUIT) — mã đề tài **KLCN133**: *Xây dựng Chatbot chuyển đổi số quản lý nhân sự*.

Ý tưởng: một nền tảng quản trị nhân sự gồm **Web Dashboard** cho bộ phận Quản lý nhân sự và **Trợ lý ảo
Chatbot** là kênh tương tác hằng ngày của nhân viên, nối với nhau bằng AI (PhoBERT + LLM Function Calling)
và WebSocket thời gian thực.

> Trạng thái: đang ở giai đoạn khảo sát & lập tài liệu. Chưa có mã nguồn.
> Đề cương gốc: [`docs/KLCN133_TranVietHung.docx`](docs/KLCN133_TranVietHung.docx)

## Tài liệu

| File | Nội dung |
|---|---|
| [`docs/research/RESEARCH-PLAN.md`](docs/research/RESEARCH-PLAN.md) | Kế hoạch research (B0–B15), bộ docs chuẩn sẽ sinh ra, luật phạm vi, câu hỏi cần GVHD duyệt |
| [`docs/research/B0-worksheet.md`](docs/research/B0-worksheet.md) | Phiếu đối chiếu các hệ thống HRM thông minh → rút ra luồng người dùng cho hệ thống |

Bộ docs thiết kế — kiến trúc, data model, API, thuật toán, UI/UX, conventions — sẽ được viết dần vào `docs/`
theo mục §2 của RESEARCH-PLAN.

## Phạm vi kỹ thuật (theo đề cương)

- **7 chức năng**: hồ sơ & phân cấp nhân sự · vòng đời đề tài công việc · chatbot tra cứu KPI & chính sách ·
  thuật toán gợi ý phân công theo kỹ năng · phân tích ngữ nghĩa nhận xét để lượng hóa KPI · Dashboard ·
  tiếp nhận báo cáo nghiệm thu & nhắc hạn.
- **Stack**: MERN + TypeScript · Python/FastAPI cho lõi AI · Socket.IO · pnpm monorepo.
- **AI**: `vinai/phobert-base` cho semantic matching, LLM + Function Calling cho Agent Loop.
- **Triển khai**: MongoDB Atlas M0 · Render/VPS (API + AI service) · Vercel/Netlify (Web & Chatbot client).

## Commit convention

[Conventional Commits](https://www.conventionalcommits.org/): `feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert`
với scope theo module (`auth`, `hr`, `project`, `chatbot`, `ai`, `dashboard`, `realtime`, `docs`, `ci`).
Chi tiết quy ước: [`docs/15-engineering-conventions.md`](docs/15-engineering-conventions.md).
Nội dung cam kết bằng **tiếng Anh**; trao đổi trong nhóm bằng tiếng Việt.

## Nhóm

Phạm Việt Hoàng · Nguyễn Thái Hòa · Nguyễn Ngọc Phi — GVHD: Trần Việt Hùng.
Thời gian thực hiện: 12 tuần, 24/08/2026 → 16/11/2026.
