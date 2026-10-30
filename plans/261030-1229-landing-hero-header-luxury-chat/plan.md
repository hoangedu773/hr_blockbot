---
title: "Landing hero photo, header pill, luxury ink & chat simplification"
description: "Đưa ảnh phong cảnh trở lại sau mockup CRM với grade tối, header thu thành viên thuốc khi cuộn, nâng chất brand register bằng ink ấm + thang surface, và đơn giản hoá surface chat (bỏ 'Copilot', gộp menu, thay native select)."
status: completed
priority: P1
effort: "32h"
branch: integration/full-delivery
tags: [frontend, design, landing, motion, chat, refactor]
blockedBy: []
blocks: []
created: 2026-10-30
mode: hard
parallelizable: "00 → (01 → 02 → 03) ∥ (04) → 05 → 06"
---

# Plan: Landing hero photo, header pill, luxury ink & chat simplification

## Overview

Bốn khiếm khuyết người dùng chỉ ra trên bản chạy thật:

1. **Hero mất ảnh.** `apps/web/previews/folio-layout.html` (bản tham chiếu) đặt ảnh phong cảnh
   `dashboard-bg.jpg` **phía sau** mockup CRM, inset âm, opacity .6, mask hai lớp. Bản production
   `FOLIO_HTML` đã bỏ hẳn ảnh, chỉ còn `.hero-stage-glow` khai báo `display: none`. Kết quả: mockup
   trôi trên nền đen phẳng. Người dùng muốn ảnh trở lại, nhưng **tối đi** — ảnh gốc là đồi cỏ hoàng
   hôn cam, rất sáng, đặt cạnh canvas `#121212` thì nó thành vật thể sáng nhất trang.
2. **Header không thu.** `nav` đang `position: fixed` full-bleed; khi cuộn chỉ đổi
   `background` + `backdrop-filter`. Không có chuyển hình dạng, nên thanh nav chiếm một dải ngang
   đầy đủ suốt trang.
3. **Trang một màu.** Brand register chỉ có hai cực: canvas `#121212` và ink `#fafafa`, mọi surface
   khác biệt bằng viền 1px. Không có bậc sáng, không có nhiệt độ.
4. **Chat nặng và chữ nghĩa thừa.** "AI Copilot" xuất hiện ở 6 bề mặt; sidebar chat có hai nhóm
   nav trùng chức năng; 7 thẻ `<select>` native trong luồng chat/CRM vi phạm Quy tắc 11 của
   `docs/rules/project-design-rules.md` (dropdown xám của OS).

Plan này sửa theo thứ tự nhân quả: token ấm + preview duyệt → hero → header → quét luxury toàn
landing → chat → control system → verification.

## Hướng thiết kế

Dealt sheet: **`dark-room`** (The dark room), seed `1424797928`, sector `hospitality`, giữ
`palette,type` theo brief đã chốt. Lưu tại `.taste-skill/landing/direction.json`.

**Ý tưởng, một câu:** trang là một căn phòng tối, và tấm ảnh phong cảnh là thứ duy nhất được chiếu
sáng — mockup CRM đứng trước nó như một tấm kính phát sáng, không phải một cái card dán lên ảnh nền.

Kiểm phép thử thay thế: nếu đổi sang một chuỗi cà phê khác, câu trên **vẫn đúng** — nhưng nó chỉ đúng
vì ảnh là phong cảnh Việt Nam gắn với "chuỗi cà phê 45 chi nhánh TP.HCM", không phải ảnh văn phòng
chung chung. Giữ ảnh này, không thay bằng stock corporate.

Điều hướng này **không** cho phép: neon, glow màu, gradient màu, hay ảnh thứ hai. Nó cho phép đúng
một vùng sáng: tấm ảnh, và một vật sáng hơn: mockup.

## Phases

| Phase | Name | Status |
|---|---|---|
| 00 | [Nền tảng — ink ấm, thang surface, motion token, preview duyệt](./phase-00-foundation.md) | Pending |
| 01 | [Hero — tấm ảnh phong cảnh sau mockup, grade tối](./phase-01-hero-photo-plate.md) | Pending |
| 02 | [Header — thu thành viên thuốc khi cuộn](./phase-02-header-pill-collapse.md) | Pending |
| 03 | [Luxury sweep — nhịp section, surface bậc, card](./phase-03-landing-luxury-sweep.md) | Pending |
| 04 | [Chat — bỏ "Copilot", gộp menu, chuẩn hoá control](./phase-04-chat-surface-simplification.md) | Pending |
| 05 | [Control system — Select tự dựng thay native](./phase-05-custom-select.md) | Pending |
| 06 | [Verification — build, test, inspect, lint, critique](./phase-06-verification.md) | Pending |

Thứ tự: **00 → 01 → 02 → 03** (cùng file, tuần tự) song song với **04 → 05**, rồi **06**.
Ước lượng: 3h + 6h + 3h + 6h + 4h + 6h + 4h.

## Quyết định đã chốt

| # | Quyết định | Lựa chọn | Hệ quả |
|---|---|---|---|
| D1 | Xử lý ảnh phong cảnh | **Giữ ấm, grade xuống** (saturate ~.62, brightness ~.5, scrim 2 lớp) | Ảnh thành "ánh sáng trong phòng tối"; phải so screenshot 3 vòng, không được để cam bết thành vàng |
| D2 | Cơ chế header pill | **Một container, transition `max-width`/`border-radius`** | Chỉ một nav trong DOM; không nhân đôi focus order; cần hysteresis chống nhấp nháy |
| D3 | Đòn bẩy luxury | **Ink ấm + 3 bậc surface** | Chỉ đổi brand register; product register giữ neutral (test khoá `sidebarBg === headerBg`) |
| D4 | Đổi tên Copilot | **Đổi copy + sửa test cùng lúc** | 4 file test, 17 locator; không để chuỗi ma trong DOM |
| D5 | Phạm vi native select | **Chat + CRM shell (7 select)** | `AddShiftModal` là dead code, không đụng |

## Bất biến không được phá

Các chuỗi dưới đây bị test khoá cứng. Mọi thay đổi visual phải giữ nguyên chúng trong source:

| Nguồn | Chuỗi |
|---|---|
| `test/landing-workflow.test.mjs:122-138` | `id="solution"`, `kiến trúc & luồng xử lý agentic` (case-insensitive), `Luồng Vận Hành Tự Động 24/7`, `Fast Rule Gate … Jev AI … Gemini 3.8 Flash`, `/diagrams/chatbot-architecture.html`, `Live Loop`, `export { WorkflowSection }`, `a[href="#solution"]` |
| `test/e2e-revamp-flow.test.mjs:265` | `h1` khớp `/Quản Trị Nhân Sự & Phân Ca Tự Động/i` |
| `test/e2e-revamp-flow.test.mjs:272-290` | 0 phần tử có `color`/`backgroundColor`/`borderColor` thuộc `rgb(255,209,0)`, `rgb(234,179,8)`, `rgb(245,158,11)` |
| `test/e2e-revamp-flow.test.mjs:397-421` | `sidebarBlur === 'none'`, `headerBlur === 'none'`, `sidebarBg === headerBg`, `navActiveBg === 'rgba(0,0,0,0)'`, `navRuleWidth === '1px'`, KPI `backgroundImage` toàn `none`, KPI `borderRadius === '0px'`, `transitionAll === 0` |
| `test/e2e-revamp-flow.test.mjs:637-647` | composer chat: `borderRadius '9999px'`, `background rgba(255,255,255,0.05)`, `border rgba(255,255,255,0.12)`, `backdropFilter 'blur(20px)'`, `rows 1`, thứ tự con `LABEL, BUTTON, TEXTAREA, BUTTON` |
| `test/web-integration.source-shape.test.mjs:140` | `App.tsx` không chứa `AddShiftModal`, `VisualTimeline`, `TwoColumnGrid`, `AiCopilotModal`, `StaffDrawer` |

Ghi chú quan trọng: test zero-yellow quét **computed style**, không đọc pixel ảnh. Ảnh phong cảnh cam
không làm test fail, nhưng vẫn phải grade — đây là kiểm tra bằng mắt trên screenshot, ghi rõ trong
phase 01 là **chưa được test tự động bảo vệ**.

## Non-goals

- Không đổi palette/typography của product register (CRM, drawer, auth). Hue ở đó bị test khoá và
  người dùng thao tác 8 tiếng/ngày nên không phải chỗ thử nghiệm nhiệt độ màu.
- Không thêm section marketing mới, không viết lại copy đã duyệt, không đổi claim.
- Không đổi backend, contract `@hr-blockbot/contracts`, hay luồng auth.
- Không thay `AddShiftModal`, `VisualTimeline`, `TwoColumnGrid`, `AiCopilotModal`, `StaffDrawer`,
  `ChatPanel`, `MetricCards` (dead code, ngoài phạm vi).
- Không thêm dependency (không Radix, không framer-motion). Select tự dựng bằng React + CSS.

## Success Criteria

- [ ] Ảnh phong cảnh hiện sau mockup ở 1440/768/390, không có vùng cam chói, không đẩy text
      xuống dưới fold, mockup vẫn là vật thể sáng nhất khối hero.
- [ ] Cuộn > 24px: nav thu còn `max-width: 960px`, `border-radius: 9999px`, `backdrop-filter: blur`,
      hairline; cuộn về < 8px trả lại full-bleed. Không nhấp nháy khi dao động quanh ngưỡng.
- [ ] Reduced motion: nav đổi trạng thái tức thời, không transition; ảnh và mockup hiện đủ ngay.
- [ ] Brand register có ≥3 bậc surface phân biệt bằng độ sáng, ink ấm; mọi cặp text/ground ≥ 4.5:1
      đo bằng script, không suy từ mã màu.
- [ ] Không còn chuỗi "Copilot" trong `apps/web/src` và trong locator test.
- [ ] 0 `<select>` native trong luồng chat + CRM shell; Select mới đủ bàn phím (Arrow/Home/End/
      Enter/Esc/typeahead), `aria-expanded`, `aria-activedescendant`, đóng khi click ngoài và khi
      Tab ra.
- [ ] `pnpm --filter web build` 0 error; `pnpm --filter web test` pass; inspector 0 FAIL trên
      landing 3 width; lint không phát sinh FAIL mới.
- [ ] Preview `previews/261030-hero-header-luxury.html` được duyệt trước khi áp vào production.

## Validation Log

### Verification Results (2026-10-30)

- Claims checked: 24 — Verified: 24 | Failed: 0 | Unverified: 0
- Tier: Full (7 phases)

Bằng chứng chính:

| Claim | Bằng chứng |
|---|---|
| Ảnh phong cảnh có trong repo và từng được dùng | `apps/web/public/assets/folio/images/dashboard-bg.jpg` (2000×1333, 482KB); markup tham chiếu tại `apps/web/previews/folio-layout.html` |
| Production đã bỏ ảnh | `FolioLandingView.tsx:78-81` không có `<img>`; `.hero-stage-glow` = `display: none` (`folio-layout.css:592-594`), không có trong markup |
| Nav chỉ đổi màu, không đổi hình dạng | `folio-layout.css:138-159`; `FolioLandingView.tsx:511` |
| Không có `scroll-margin-top` trong repo | `grep -rn "scroll-margin\|scroll-padding"` → 0 kết quả |
| Card dùng `--folio-card-bg`, không dùng `--folio-surface-raised` | `folio-layout.css:1255, 1301`; `surface-raised` chỉ ở 4 chỗ control (`:333, 405, 1431, 1664`) |
| Accent hiện tại 4.03:1 | tính WCAG trên `#266df0` / `#121212` |
| `.crm-avatar-sm` chữ trắng 11px trên accent | `folio-layout.css:1128-1134` |
| 17 locator test khoá "Copilot" | `e2e-revamp-flow` 13, `chat-drawer` 2, `auth-login-flow` 1, `source-shape` 1 |
| 7 `<select>` trong phạm vi | `RosterView:126,147`; `StoreDirectoryView:445,457,470,712,727` |
| 10 `<select>` ngoài phạm vi | `AdminSettingsView:474`; `EmployeeProfileView:258`; `ProjectListView:429,625`; `UserAccountsView:277,339,482,496`; `AddShiftModal:129,202` (dead code) |
| `z-index` layer: drawer/slide-over 250, modal tạo cửa hàng 300 | `product.css:890, 2638`; `StoreDirectoryView.tsx:673` |
| Composer chat bị test khoá style | `e2e-revamp-flow.test.mjs:637-647` |
| Test zero-yellow quét computed style, không đọc pixel ảnh | `e2e-revamp-flow.test.mjs:272-290` |
| Sidebar chat có 2 nav, 4 quick reply/vai | `ChatPageView.tsx:305-334`; `ROLE_QUICK_REPLIES` = 4 nhãn × 4 vai |

### Quyết định từ phiên validation

| # | Câu hỏi | Trả lời |
|---|---|---|
| 1 | Xử lý ảnh phong cảnh | Giữ ấm, grade xuống (saturate ~.48, brightness ~.34, scrim 2 lớp) |
| 2 | Cơ chế header pill | Một container, transition `max-width`/`border-radius` + hysteresis |
| 3 | Đòn bẩy luxury | Ink ấm + 3 bậc surface |
| 4 | Đổi tên Copilot | Đổi copy + sửa test cùng commit |
| 5 | Phạm vi native select | Chat + CRM shell (7 select), `AddShiftModal` là dead code nên loại |

### Chưa kiểm chứng (ghi để không ai tưởng đã pass)

- Safari/Firefox: `mask-composite` và `backdrop-filter` chưa chạy trên trình duyệt thật trong môi
  trường này (chỉ có Chromium qua Playwright).
- Contrast trên nền ảnh (nav pill khi đè ảnh hero): phải đo bằng ảnh chụp, không suy từ token.
- Screen reader thật (NVDA/VoiceOver) cho Select tự dựng.
- LCP/CLS thật sau khi thêm ảnh: chỉ đo được khi có build production + network throttling.

## Rủi ro

| Rủi ro | Xử lý |
|---|---|
| Ảnh cam đọc thành "vàng" dù test không bắt | Grade theo bảng số ở phase 01, chụp 3 width, tự soát bằng mắt; nếu vẫn chói thì hạ saturation thêm bậc, ghi lại quyết định |
| Transition `max-width` gây reflow mỗi frame | Chỉ chạy khi toggle class một lần; hysteresis 24/8px; `prefers-reduced-motion` tắt transition |
| Ảnh 2000×1333 nặng 482KB | `loading="eager"` + `fetchpriority="high"` chỉ cho ảnh này; thêm `decoding="async"`; không preload vì nó dưới fold |
| Đổi tên Copilot làm vỡ e2e ở 17 locator | Phase 04 sửa test cùng commit, chạy `pnpm --filter web test` trước khi sang phase 05 |
| Select tự dựng sai focus | Bảng kiểm bàn phím ở phase 05, chạy bằng Playwright `keyboard.press` thật, không suy luận |
