# hr_blockbot

Khóa luận cử nhân CNTT (HUIT) — mã đề tài **KLCN133**: *Xây dựng Chatbot chuyển đổi số quản lý nhân sự*.

Ý tưởng: một nền tảng quản trị nhân sự gồm **Web Dashboard** cho bộ phận Quản lý nhân sự và **Trợ lý ảo
Chatbot** là kênh tương tác hằng ngày của nhân viên, nối với nhau bằng AI (PhoBERT + LLM Function Calling)
và WebSocket thời gian thực.

> Trạng thái: đang ở giai đoạn khảo sát & lập tài liệu. Chưa có mã nguồn.
> Đề cương gốc: [`docs/KLCN133_TranVietHung.docx`](docs/KLCN133_TranVietHung.docx)
## Tài liệu

Bộ tài liệu thiết kế nằm trong [`docs/`](docs/), sinh ra từ vòng research 1 của nhóm.

| File | Nội dung |
|---|---|
| [`docs/00-vision-scope.md`](docs/00-vision-scope.md) | Vấn đề, phạm vi 3 tầng (bắt buộc / bổ sung chờ duyệt / **ngoài phạm vi có chủ đích**), ràng buộc, 6 rủi ro, định nghĩa "xong" |
| [`docs/01-requirements.md`](docs/01-requirements.md) | FR theo F1–F7 + NFR, traceability → user flow → CLO/thang điểm |
| [`docs/02-architecture.md`](docs/02-architecture.md) | C4 (context / container / component), trần hạ tầng gắn vào từng container, fitness functions kèm lệnh CI |
| [`docs/03-decision-records/`](docs/03-decision-records) | 16 ADR — mỗi quyết định kiến trúc một file, có phương án bị loại và đánh đổi thật |
| [`docs/04-domain-model.md`](docs/04-domain-model.md) | 5 bounded context, từ điển nghiệp vụ, state machine đề tài, BR-01…BR-20 |
| [`docs/05-data-model.md`](docs/05-data-model.md) | 11 collections, ERD, index ↔ query, vì sao không dùng transaction |
| [`docs/06-api-spec.md`](docs/06-api-spec.md) | Endpoint REST, error catalog, 9 event WebSocket, hợp đồng nội bộ api ↔ ai-service |
| [`docs/07-auth-rbac.md`](docs/07-auth-rbac.md) | JWT + Refresh Token Rotation, reuse detection, permission matrix 2 vai |
| [`docs/08-algorithms.md`](docs/08-algorithms.md) | Matching ngữ nghĩa, calibration/abstention, explainability, agent loop, RAG, công thức KPI |
| [`docs/09-ai-evaluation.md`](docs/09-ai-evaluation.md) | Hai bài toán đo (nhị phân vs ranking), protocol dataset, gate hồi quy chất lượng |
| [`docs/10-ui-ux-spec.md`](docs/10-ui-ux-spec.md) · [`12-performance.md`](docs/12-performance.md) · [`13-security.md`](docs/13-security.md) · [`14-devops-deployment.md`](docs/14-devops-deployment.md) | Design system nền tối + chat UX · ngân sách hiệu năng · threat model · CI/CD + runbook |
| [`docs/11-quality-testing.md`](docs/11-quality-testing.md) · [`15-engineering-conventions.md`](docs/15-engineering-conventions.md) | Chiến lược test + UAT · Conventional Commits, branch/PR, quy ước code, gate CI |
| [`docs/16-project-plan.md`](docs/16-project-plan.md) · [`17-innovation-playbook.md`](docs/17-innovation-playbook.md) · [`18-user-flows.md`](docs/18-user-flows.md) | WBS 12 tuần + RACI · các mục nhóm tự bổ sung + gate · 10 user flow + 28 intent chatbot |
| [`docs/backlog-parked.md`](docs/backlog-parked.md) | Những gì bị dời ra ngoài phạm vi, kèm lý do và điều kiện mở lại |
| [`docs/research/RESEARCH-PLAN.md`](docs/research/RESEARCH-PLAN.md) | Kế hoạch research (B0–B15) — giữ nguyên làm bằng chứng vòng 1, kèm danh sách bị research bác |
| [`docs/research/NOTES-01.md`](docs/research/NOTES-01.md) | **Kết quả research của nhóm** — nguồn sự thật duy nhất của toàn bộ `docs/` |
| [`docs/research/B0-worksheet.md`](docs/research/B0-worksheet.md) | Phiếu trống để đối chiếu các hệ thống HRM thông minh |

**Lưu ý trung thực:** nhiều con số trong `NOTES-01` **mất URL nguồn khi paste**, nên các file thiết kế đánh dấu
`[CẦN NGUỒN]` / `TBD` ở những chỗ đó. Không chép một số nào vào báo cáo khi chưa bổ sung được nguồn.

## Phạm vi kỹ thuật (theo đề cương)

- **7 chức năng**: hồ sơ & phân cấp nhân sự · vòng đời đề tài công việc · chatbot tra cứu KPI & chính sách ·
  thuật toán gợi ý phân công theo kỹ năng · phân tích ngữ nghĩa nhận xét để lượng hóa KPI · Dashboard ·
  tiếp nhận báo cáo nghiệm thu & nhắc hạn.
- **Stack**: MERN + TypeScript · Python/FastAPI cho lõi AI · Socket.IO · pnpm monorepo.
- **AI**: `vinai/phobert-base` cho semantic matching, LLM + Function Calling cho Agent Loop.
- **Triển khai**: MongoDB Atlas M0 · Render/VPS (API + AI service) · Vercel/Netlify (Web & Chatbot client).

## Commit convention

[Conventional Commits](https://www.conventionalcommits.org/): `feat|fix|docs|style|refactor|perf|test|build|ci|revert`
(không dùng `chore` — mọi việc dọn dẹp phải rơi vào `build`/`ci`/`style`/`refactor`, xem tài liệu quy ước).
Scope theo module: `auth`, `hr`, `project`, `chatbot`, `ai`, `dashboard`, `realtime`, `docs`, `ci`.
Chi tiết quy ước: [`docs/15-engineering-conventions.md`](docs/15-engineering-conventions.md).
Nội dung cam kết bằng **tiếng Anh**; trao đổi trong nhóm bằng tiếng Việt.

## Nhóm

Phạm Việt Hoàng · Nguyễn Thái Hòa · Nguyễn Ngọc Phi — GVHD: Trần Việt Hùng.
Thời gian thực hiện: 12 tuần, 24/08/2026 → 16/11/2026.
