---
title: "Design System Big Update — tái cấu trúc khoa học toàn bộ UI/UX"
description: "Sửa gốc CSS không tái sinh được (61 class chết), implement dealt sheet data-terminal cho Product register và editorial+showcase cho Brand register, verify bằng inspector/lint/critique."
status: pending
priority: P1
effort: 49h
branch: main
tags: [frontend, refactor, tech-debt, critical, docs]
blockedBy: []
blocks: []
created: 2026-10-30
mode: hard
parallelizable: "01 ∥ 02 ∥ 04 (sau 00) → 03 (sau 01,02) → 05"
---

# Plan: Design System Big Update

## Overview

`docs/DESIGN.md` cũ là danh sách link thư viện kèm ghi chú chat, mâu thuẫn với
`docs/rules/project-design-rules.md` (Amber vs Sapphire) và với chính test suite. Nhưng vấn đề lớn hơn
tài liệu: **CSS của `apps/web` không tái sinh được**. Tailwind không có trong `package.json`; CSS là
hai bundle tĩnh 256KB đã purge tại thời điểm copy; **61/211 class trong `CRM_HTML` render ra không có
style nào**; `index.css` dài 1.204 dòng với 106 `!important` để chống lại bundle đó.

Plan này sửa theo thứ tự nhân quả: nền tảng build → Product register → Chat → 8 trạng thái →
Brand register + showcase → verification. Mỗi phase có ranh giới file tuyệt đối và ngưỡng số
kiểm chứng được.

## Phases

| Phase | Name | Status |
|---|---|---|
| 00 | [Nền tảng — Tailwind v4, token 3 tầng, xoá dead code](./phase-00-foundation.md) | Pending |
| 01 | [Product register — CRM shell, KPI, bảng 45 chi nhánh](./phase-01-product-crm-shell.md) | Pending |
| 02 | [Chat surfaces — ChatPage, ChatDrawer, motion 60fps](./phase-02-chat-surfaces.md) | Pending |
| 03 | [Ma trận 8 trạng thái — Auth, form, control](./phase-03-eight-states.md) | Pending |
| 04 | [Brand register — Landing editorial, hero appear, Bento loops](./phase-04-brand-landing-showcase.md) | Pending |
| 05 | [Verification — inspect, lint, adversarial QA, critique](./phase-05-verification.md) | Pending |

Thứ tự thực thi: **00 → (01 ∥ 02 ∥ 04) → 03 → 05**. Ước lượng: 6h + 10h + 8h + 12h (song song) + 7h + 6h.

## Dependencies

- Không phụ thuộc plan khác.
- Phase 00 chặn toàn bộ: không có Tailwind build thì mọi phase sau là trang trí trên nền gãy.

## Ba quyết định phải chốt trước khi code

| # | Quyết định | Khuyến nghị | Tài liệu |
|---|---|---|---|
| D1 | Tailwind bundle tĩnh vs build thật | Build thật | [`decisions/ADR-020`](./decisions/ADR-020-tailwind-v4-real-build.md) |
| D2 | Test assert glass/gradient trên KPI card | Chuyển sang behavioral | [`decisions/ADR-021`](./decisions/ADR-021-test-style-snapshot-to-behavioral.md) |
| D3 | `index.css` 1.204 dòng / 106 `!important` | Xoá, thay bằng `src/styles/*` | ADR-020 §Quyết định |

## Nghiên cứu kèm theo

| File | Nội dung |
|---|---|
| [`research/baseline-evidence.md`](./research/baseline-evidence.md) | Số đo thật: 61 class chết, 5 FAIL inspector, 38 FAIL + 153 WARN lint, motion audit, ràng buộc test |
| [`research/design-direction.md`](./research/design-direction.md) | Design Brief, dealt sheet `data-terminal` (seed 111000223), face + signature element, story table cho 5 visual |
| [`assets/lint-baseline.txt`](./assets/lint-baseline.txt) | Output lint đầy đủ trước khi sửa |
| [`assets/inspect-landing-baseline/`](./assets/inspect-landing-baseline/) | Screenshot + `report.json` 3 width |
| [`assets/audit-class-coverage.mjs`](./assets/audit-class-coverage.mjs) | Script đo class chết — chạy lại được ở mọi phase |
| [`assets/base-crm-1440.png`](./assets/base-crm-1440.png) | Baseline CRM để so diff |

## Outcome

1. CSS sinh từ source; `audit-class-coverage` = 0 missing; không `!important`.
2. Product register theo dealt sheet `data-terminal`: shell ruled T-frame, KPI strip chia hairline,
   bảng số tabular right-aligned, **cột Đúng giờ là nơi duy nhất mang accent** (1px).
3. Motion đúng chuẩn Kowalski: không `transition: all`, không `scale(0)`, hover gate, reduced-motion
   đầy đủ, drawer bất đối xứng 240/180ms, **không entrance animation trên app screen**.
4. Brand register: hero appear < 1.2s, một signature moment duy nhất, section entrances khác nhau
   theo nội dung, tagline reveal section, 4 bento living loops.
5. 8 trạng thái đầy đủ trên mọi control; focus-visible nhìn thấy được.
6. Inspector **0 FAIL** trên 4 bề mặt × 3 width; critique score ≥ 7.5.

## Non-goals

- Không đổi backend, API, contracts, database.
- Không thêm thư viện UI/motion (không Framer Motion, không shadcn runtime). Tailwind v4 là build tool, không phải runtime.
- Không chuyển `dangerouslySetInnerHTML` sang JSX trong plan này (ghi thành ADR riêng nếu cần).
- Không làm dark/light theme toggle mới; giữ dark-only cho Product, landing giữ light/dark hiện có.
- Không xuất video showcase (MP4/GIF); chỉ build loop sống trong trang.

## Acceptance Criteria (toàn plan)

| # | Tiêu chí | Lệnh đo |
|---|---|---|
| 1 | 0 class chết | `node assets/audit-class-coverage.mjs` |
| 2 | 0 `!important` trong styles mới | `grep -rc "!important" apps/web/src/styles/` |
| 3 | 0 FAIL inspector, 4 bề mặt × 3 width | `node scripts/inspect.mjs … --widths 1440,768,390` |
| 4 | 0 FAIL lint (`gradient`/`emoji`/`micro-label`/`purple`), 0 `transition-all` | `node scripts/lint.mjs --app …` |
| 5 | 50/50 test PASS, 0 skip | `pnpm --filter web test` |
| 6 | `yellowCount === 0` giữ nguyên | trong suite |
| 7 | 390px không tràn ngang trên 4 bề mặt | `scrollWidth === clientWidth` |
| 8 | Critique overall ≥ 7.5 | `references/critique.md` rubric |
| 9 | `docs/DESIGN.md` khớp code (không mô tả thứ không tồn tại) | review thủ công |

## Rủi ro cấp plan

| Rủi ro | Mức | Ảnh hưởng | Giảm thiểu |
|---|---|---|---|
| Phase 00 làm vỡ layout diện rộng | **Cao** | Toàn bộ UI | Baseline screenshot từng bề mặt; commit Phase 00 riêng, revert được |
| Test style snapshot chặn Phase 01 | **Chắc chắn** | Phase 01 không xong | ADR-021 chốt trước; sửa test cùng commit |
| Hero appear làm LCP tệ | Trung | SEO/UX landing | Đo LCP trước/sau; `html.js` gate; giảm delay nếu > 2.5s |
| Story loop jank trên mobile | Trung | Brand register | Chỉ transform/opacity; pause off-screen; test 390px |
| Chuỗi `KIẾN TRÚC &amp;...` bị test khoá nhưng là micro-label | Trung | 1 FAIL tồn tại | Chốt: sửa test regex cùng lúc, hoặc chấp nhận có lý do |

## Handoff

Sau khi D1/D2/D3 được duyệt: chạy Phase 00, commit riêng. Xanh thì mở 3 nhánh song song 01/02/04.
Không chạy 05 trước khi 01–04 xanh.
