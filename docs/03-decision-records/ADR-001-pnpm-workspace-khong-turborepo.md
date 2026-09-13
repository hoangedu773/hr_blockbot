# ADR-001 — Dùng pnpm workspace, chưa dùng Turborepo

- **Status:** Accepted
- **Date:** 13/09/2026
- **Quyết định này ảnh hưởng tới:** `02-architecture.md` §4 (cây thư mục monorepo), §9 (gate CI), ADR-002

---

## Context

Đề cương bắt buộc **pnpm monorepo** (`RESEARCH-PLAN.md` §1, dòng 26: "MERN + TypeScript; lõi AI
Python/FastAPI; Socket.IO; pnpm monorepo"), và repo phải chứa ba workspace khác nhau về công cụ:
`apps/web` (React + TS), `apps/api` (Express + TS), `apps/ai-service` (FastAPI + Python),
cộng với `packages/` dùng chung (`contracts`, `config`, `eslint-config`) — cấu trúc cây ở
`NOTES-01.md` §B2 dòng 153–173.

Câu hỏi research B2 đặt ra (`RESEARCH-PLAN.md` §3 B2 dòng 125): "**Turborepo có cần không, hay pnpm
workspace đủ cho repo 3 người?**"

Ràng buộc quyết định: nhóm **3 người / 12 tuần** (`RESEARCH-PLAN.md` §1 dòng 32), và nguyên tắc chọn
công cụ ở `RESEARCH-PLAN.md` §0.4: "thông tin này có làm thay đổi quyết định thiết kế không? Không → bỏ."

## Decision

**Dùng pnpm workspace làm cơ chế tổ chức monorepo. Không đưa Turborepo vào baseline.**

Cây thư mục chốt theo `NOTES-01.md` §B2:

```text
root/
├─ apps/
│  ├─ web/
│  ├─ api/
│  └─ ai-service/
├─ packages/
│  ├─ contracts/
│  ├─ config/
│  └─ eslint-config/
├─ docs/
├─ pnpm-workspace.yaml
└─ package.json
```

Ba hệ quả trực tiếp của lựa chọn này, được tài liệu kiến trúc ghi nhận:

1. Task chạy bằng `pnpm -r` (recursive) thay vì `turbo run`; các lệnh CI ở `02-architecture.md` §9
   viết theo dạng `pnpm --filter <workspace> ...`.
2. Pipeline `Zod → OpenAPI → Orval` (`NOTES-01.md` §B2 dòng 175–176) là **build step thủ công trong
   workspace `packages/contracts`**, không phải task trong dependency graph tự động.
3. Không có remote caching ⇒ CI ở GitHub Actions cache bằng mechanism của Actions, không bằng cache của
   Turborepo.

## Alternatives considered

| Phương án | Lý do loại (nguyên văn NOTES-01 §B2 dòng 148–149) |
|---|---|
| **Turborepo ngay từ đầu** | "Không dùng Turborepo ở tuần đầu. Ba người / 12 tuần → pnpm workspace là đủ. Turborepo chủ yếu đem caching và remote caching; thêm từ đầu chưa tạo nhiều giá trị. **Chỉ thêm khi CI/build thực sự chậm.**" |
| Bỏ monorepo, tách repo cho web/api/ai-service | Không nằm trong ràng buộc đề cương (đề cương ghi rõ pnpm monorepo) và sẽ phá hợp đồng `packages/contracts` — một nguồn sự thật cho Zod → OpenAPI → client |
| Turborepo + pnpm (vừa phải) | Vẫn giữ nguyên lập luận trên: giá trị duy nhất là caching, chưa phải nút thắt ở tuần 1; `NOTES-01.md` dòng 530 liệt kê Turborepo vào danh sách "**Không thêm ở baseline**" |

## Consequences

**Điểm mạnh:**

- Zero khớp nối: không daemon, không thêm dependency trong pipeline CI, không học thêm tool. Đúng
  nguyên tắc "ít khớp nối cho nhóm 3 người / 12 tuần".
- Dependency graph vẫn khai báo được bằng `workspace:` protocol của pnpm ⇒ các gate
  `pnpm -r typecheck` / `pnpm -r lint` chạy đúng phạm vi.
- `packages/eslint-config` và `packages/config` chia sẻ được ngay, không cần publish.

**Đánh đổi thật (phải chấp nhận, có ghi ở docs):**

- **Không có incremental build cache.** Ở tuần 9–11, khi `apps/web` có dashboard + chart và
  `packages/contracts` đổi thường xuyên, toàn bộ typecheck/build có thể chạy lại vô ích. Đây chính là
  nút thắt NOTES-01 nêu tên.
- Không có "affected" tự nhiên: CI muốn chạy đúng phần bị ảnh hưởng thì phải tự viết logic
  path-filter trong workflow (chi phí nhỏ, nhưng là chi phí thật).
- Nếu Python và Node phải dựng chung một bước, không có task orchestration giúp thứ tự hoá; phải định
  nghĩa rõ trong workflow.

**Điều kiện mở lại quyết định** (tiên lượng sẵn, ghi đúng như nguồn): khi **CI/build thực sự chậm**
(`NOTES-01.md` §B2 dòng 149). Ngưỡng "chậm" cụ thể bằng bao nhiêu phút: `[CẦN NGUỒN]` — NOTES-01 không đưa
con số, do đó không được đặt ngưỡng tùy tiện; khi nào thêm Turborepo thì phải viết ADR mới để supersede.

## References

- `docs/research/NOTES-01.md` §B2, dòng 146–177 (kết luận "Không dùng Turborepo" + cây thư mục)
- `docs/research/NOTES-01.md` dòng 530–531 ("**Không thêm ở baseline:** … Turborepo …")
- `docs/research/RESEARCH-PLAN.md` §1 dòng 26 (ràng buộc pnpm monorepo); §3 B2 dòng 124–125 (câu hỏi research)
- `docs/02-architecture.md` §4 (cây thư mục), §9 (lệnh CI dạng `pnpm -r` / `pnpm --filter`)
