# Cook report — Landing hero photo, header pill, luxury ink & chat simplification

Plan: `plans/261030-1229-landing-hero-header-luxury-chat/plan.md`
Ngày: 2026-10-30 · Branch: `integration/full-delivery`

## Kết quả

Bốn yêu cầu đã vào production và đo được:

| # | Yêu cầu | Trạng thái | Bằng chứng |
|---|---|---|---|
| 1 | Ảnh phong cảnh sau mockup | Xong | `.hero-plate` trong `FolioLandingView.tsx`, ảnh `dashboard-bg-hero.jpg` 187 KB, chụp `.taste-skill/shots/hero-check.jpg` |
| 2 | Header thu thành viên thuốc khi cuộn | Xong | Đo computed: `maxWidth: min(960px, 100% - 32px)`, `borderRadius: 9999px`, `backdropFilter: blur(20px) saturate(1.4)` |
| 3 | Bớt "một màu", thêm luxury | Xong | Ba bậc chữ (17.26 / 13.47 / 8.70), bốn bậc surface, ink ấm; inspector 0 FAIL |
| 4 | Chat đơn giản hơn, bỏ "Copilot" | Xong | `grep -ri copilot apps/web/src` = 0 chuỗi người dùng đọc; sidebar 2 nav → 1 |
| 5 | Bỏ select native | Xong | 7/7 chuyển sang `Select`; 11/11 test bàn phím pass |

## Thay đổi theo file

| File | Nội dung |
|---|---|
| `apps/web/src/styles/folio-layout.css` | Token ấm hai theme + 3 bậc chữ; hero plate mask/scrim; nav hai hình dạng + hysteresis + `scroll-margin-top`; card theo bậc sáng; ba nhịp section; tagline band; nhãn section xuống dưới heading |
| `apps/web/src/styles/product.css` | `.select-trigger/.select-menu/.select-option`; label sidebar sentence case; z-index 400 cho menu |
| `apps/web/src/styles/tokens.css` | `--t-pill: 280ms`, `--t-plate: 900ms` |
| `apps/web/src/components/FolioLandingView.tsx` | Markup `.hero-plate`; bỏ pill eyebrow, thêm `.hero-status`; `data-ui` cho mockup và 4 bento story; hysteresis `syncScrolledNav` |
| `apps/web/src/components/CrmDashboardView.tsx` | Nhãn "Trợ lý HR BlockBot"; handler khớp `.crm-copilot` thay vì `textContent.includes('Copilot')` |
| `apps/web/src/components/chat/ChatPageView.tsx` | Đổi 5 chuỗi; gộp sidebar còn một `<nav>` |
| `apps/web/src/components/chat/ChatDrawer.tsx` | Đổi 4 chuỗi (aria-label, nhãn, lời chào) |
| `apps/web/src/components/RosterView.tsx` | 2 select → `<Select>` |
| `apps/web/src/components/StoreDirectoryView.tsx` | 5 select → `<Select>` (3 filter + 2 form) |
| `apps/web/src/components/ui/Select.tsx` | **Mới** — combobox tự dựng |
| `apps/web/public/assets/folio/images/dashboard-bg-hero.jpg` | **Mới** — grade brightness .55 / saturation .40 |
| `apps/web/test/select-component.test.mjs` | **Mới** — 11 test |
| `apps/web/test/{e2e-revamp-flow,auth-login-flow,chat-drawer}.test.mjs` | Cập nhật locator theo nhãn mới |
| `previews/261030-hero-header-luxury.html` + `previews/index.html` | **Mới** — preview duyệt, đã đăng ký tab "Mẫu F" |

## Quyết định trong lúc làm (khác plan)

| # | Plan nói | Thực tế | Vì sao |
|---|---|---|---|
| 1 | Grade ảnh brightness .34 | **.55** | Ở .34 ảnh chỉ còn mảng nâu, không đọc ra phong cảnh. Đo mean L: .34 → 36, .55 → 60. Bù bằng `opacity: .72` + scrim nên vẫn tối hơn canvas. |
| 2 | Ink `#f5f2ec` | **`#f1efec`** | `#f5f2ec` có saturation 0.31, rơi vào dải `palette-cream` của inspector. Hạ còn 0.15 vẫn giữ ấm nhưng không bị đọc là kem vàng. |
| 3 | `--folio-muted: #a49c92` | **`#b5ada3`** + thêm `--folio-body-ink` | Ở #a49c92, body copy chỉ 6.90:1 — dưới ngưỡng 7:1 của `grey-body`. Tách ba bậc: ink / body / muted. |
| 4 | Canvas light `#f7f4ef` | **`#f6f4f1`** | Bản đầu bị `palette-cream`; stone trung tính vẫn ấm nhưng hue gần 30°. |
| 5 | "Xoá `.folio-preview > header nav > div`" | **Giữ, bỏ `padding-inline`** | Xoá hẳn thì `max-width: var(--folio-width)` mất theo và nội dung nav dồn sát mép khi chưa cuộn. |
| 6 | Select giữ focus trên listbox | **Giữ focus trên trigger** | Portal nằm cuối `<body>`, focus vào listbox làm Tab nhảy về đầu trang. Đây là pattern combobox chuẩn: `aria-activedescendant` trên trigger. |

## Lỗi phát hiện và sửa trong quá trình

| Lỗi | Nguyên nhân | Sửa |
|---|---|---|
| Nav links đè lên nút action khi thành pill | `.folio-nav-links` dùng `position: absolute; left: 50%` — bỏ qua bề rộng brand/action | Đổi sang `margin-inline: auto` trong flex; đo lại: links phải 844.6 < actions trái 872.7 |
| `backdrop-filter` biến mất khỏi bundle | lightningcss gộp hai khai báo prefix/unprefix và giữ cái cuối — bản `-webkit-` đứng sau | Đảo thứ tự: prefix trước, chuẩn sau |
| Menu mobile bị bo tròn khi đang cuộn | Rule `nav[data-state="active"]` thua specificity của `nav.nav-scrolled` | Lặp chuỗi selector đầy đủ, không dùng `!important` |
| Handler nút "Trợ lý" ngừng chạy sau khi đổi nhãn | `CrmDashboardView` khớp `textContent.includes('Copilot')` | Khớp `classList.contains('crm-copilot')` — không phụ thuộc copy |
| Test Select treo 30s mỗi case | Harness dùng `setContent` + chèn script khai báo `const` nhiều lần → redeclaration | Tạo page mới mỗi test, dùng `React.useId` thật |
| Chấm `.hero-status` rơi xuống dòng riêng trên mobile | `align-items: center` trên khối hai dòng | `align-self: flex-start` + `margin-top: .62em` |

## Đo lường

### Contrast (đo bằng script trên computed value, cả hai theme)

| Cặp | Dark | Light | Ngưỡng |
|---|---|---|---|
| ink / canvas | 16.80:1 | 15.97:1 | 4.5 |
| body-ink / surface | 12.73:1 | 12.05:1 | 4.5 |
| muted / raised | 7.40:1 | 6.50:1 | 4.5 |
| accent / canvas | 5.24:1 | 6.10:1 | 3 |
| white / accent-solid | 4.64:1 | 6.70:1 | 4.5 |

### Hysteresis header

`scrollY` 0→40→22→10→30→15→5 cho chuỗi `false true true true true true false`. Không nhấp nháy giữa 8 và 24.

### Inspector

| Bề mặt | Kết quả |
|---|---|
| Landing production (1440/768/390) | **0 FAIL, 6 WARN** |
| App mode | **0 FAIL, 4 WARN** |
| Preview phase 00 | **0 FAIL, 6 WARN** |

### Test

`29/29 pass` — gồm 11 test Select (bàn phím, ARIA, typeahead, disabled, reduced motion), 18 test contract/landing/chat.

## WARN còn lại — phân loại

| WARN | Phân loại | Lý do |
|---|---|---|
| `card-rows` (4 hàng card) | Chấp nhận | Trang có 3 section nội dung dạng lưới; đó là cách trình bày nội dung, không phải template. Đổi sang layout khác là ngoài phạm vi brief. |
| `no-real-pictures` (1 ảnh thật) | Chấp nhận | Repo chỉ có một ảnh phong cảnh. Thêm ảnh stock là bịa bằng chứng về sản phẩm — `ak-page-showcase` cấm. |
| `no-footage` | Chấp nhận | Không có clip nào của Guta; thêm video stock là cùng lý do trên. |
| `small-text` (1 block) | Chấp nhận | Một nhãn 12px trong workflow toolbar; nằm trong `data-ui` một phần. |
| `size-count` @768 (10 cỡ) | Chấp nhận | Mockup CRM có thang riêng; `data-ui` che phần lớn nhưng một số nhãn trang vẫn lọt. |
| `off-centre` @768 (31/54px) | **Chưa sửa** | Lệch 23px ở tablet. Nguyên nhân: `.guta-container` và mockup có inset khác nhau. Cần một vòng riêng — ghi vào backlog. |

## Chưa kiểm

- **Safari / Firefox**: `mask-composite` và `backdrop-filter` chỉ đo trên Chromium (Playwright). Ghi rõ chưa xác nhận.
- **Screen reader thật** (NVDA/VoiceOver) cho `Select`: đã kiểm ARIA attribute bằng DOM, chưa kiểm bằng trình đọc màn hình.
- **Contrast chữ nav trên nền ảnh** khi cuộn qua hero: chỉ đo trên nền pill đặc, chưa đo trên vùng ảnh phía sau pill.
- **e2e Playwright đầy đủ** (`e2e-revamp-flow.test.mjs`, `auth-login-flow.test.mjs`): cần API + MongoDB thật. Đã sửa locator nhưng **chưa chạy được** trong môi trường này — không đánh dấu pass.
- **LCP/CLS thật** sau khi thêm ảnh 187 KB: chưa đo với network throttling.

## Vấn đề môi trường gặp phải

`pnpm --filter web dev` (Vite dev) không render được trang: `@hr-blockbot/contracts` build ra CommonJS, Vite dev phục vụ qua `/@fs` và báo `does not provide an export named 'LoginResponseSchema'`. Đây là lỗi có sẵn, không do thay đổi này. Mọi kiểm chứng rendered trong report dùng `vite preview` trên bundle production (`localhost:4173`).

## Câu hỏi còn mở

1. `dashboard-bg.jpg` không có file credit trong repo. Nếu là ảnh lấy từ nguồn ngoài, cần ghi nguồn và giấy phép trước khi trang public.
2. Lệch margin 23px ở 768px — có muốn tôi mở phase sửa riêng không?
3. `Select` hiện không hỗ trợ `multiple`/`optgroup`. Nếu các select ngoài phạm vi (`UserAccountsView`, `ProjectListView`, `AdminSettingsView`, `EmployeeProfileView`) cần chuyển tiếp, cần bổ sung trước.
