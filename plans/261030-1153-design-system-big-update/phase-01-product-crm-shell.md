---
phase: 01
plan: design-system-big-update
title: Product register — CRM shell, KPI strip, bảng 45 chi nhánh theo dealt sheet
owner: fullstack-developer
status: completed
priority: P1
effort: 10h
depends_on: [00]
blocks: [02, 03]
---

# Phase 01 — Product register: CRM Command Center

## Context Links

- `research/design-direction.md` §3 (dealt sheet `data-terminal`, seed 111000223)
- `research/baseline-evidence.md` §2 (61 class chết), §6 (test assert glass/gradient)
- `decisions/ADR-021-test-style-snapshot-to-behavioral.md`
- `ak-design-taste/references/app-screens.md` §3.2 (sidebar), §4.2 (một trục trái), §5 (KPI), §7 (bảng)

## Vấn đề phải giải

CRM hiện tại vi phạm dealt sheet ở 5 điểm đo được (`assets/inspect-landing-baseline/report.json`
+ `assets/lint-baseline.txt`):

| # | Vi phạm | Bằng chứng |
|---|---|---|
| 1 | KPI card có `linear-gradient` + `backdrop-blur(16px)` | `e2e-revamp-flow.test.mjs:219-220` đang **assert** điều này |
| 2 | Icon trong khối tinted `rgba(255,255,255,0.05)` trên mọi row | `lint` rule `glass` ×19, `app-screens.md` §14 "tells of generated dashboards" |
| 3 | Nav active là filled pill, không phải đường 1px accent | `.nav-item` trong `index.css:919` |
| 4 | Số trong bảng **không** tabular-nums | `inspect` `[tabular]` 0% figures |
| 5 | Không có cột nào mang accent trên data | `inspect` `[no-data-hue]` |

## File Ownership

| Hành động | File |
|---|---|
| Sửa | `apps/web/src/components/CrmDashboardView.tsx` (chuỗi `CRM_HTML` dòng 23–566) |
| Sửa | `apps/web/src/styles/product.css` (Phase 00 tạo) |
| Sửa | `apps/web/src/components/Toast.tsx` (chỉ class) |
| Sửa | `apps/web/src/components/{AdminSettingsView,UserAccountsView,EmployeeListView,EmployeeProfileView,ProjectListView,RosterView}.tsx` (chỉ class) |
| Sửa | `apps/web/test/e2e-revamp-flow.test.mjs` (theo ADR-021) |

**Không chạm:** `FolioLandingView.tsx`, `landing/**`, `chat/**` (Phase 02/04 sở hữu).

## Signature element (bắt buộc implement)

**Cột "Đúng giờ %" là nơi duy nhất mang accent.**

Mỗi ô gồm: số mono + một **đường 1px accent dài đúng bằng tỷ lệ đó**, đặt trên rule của hàng,
bắt đầu từ trục trái của ô. Nhìn dọc một cột là thấy chi nhánh nào tụt mà không cần đọc số.

```css
.crm-punctuality { position: relative; font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
.crm-punctuality::after {
  content: ""; position: absolute; left: 0; bottom: -4px; height: 1px;
  width: calc(var(--pct) * 1%); max-width: 100%;
  background: var(--accent-action);
}
```
Đặt `--pct` bằng inline style trên từng ô. Đây là **một trong hai chỗ duy nhất** được dùng accent
(ngoài focus ring). Không dùng accent cho nav active, không cho button fill.

## Các thay đổi theo màn hình

### 1. Shell — Ruled T-frame

- Sidebar 224px + top bar 64px trên **cùng một ground** `--bg-canvas`, chia bằng `1px solid var(--border-subtle)`.
  Hiện sidebar dùng `backdrop-filter: blur(24px)` → **bỏ**, thay bằng surface phẳng.
- Nav active: **bỏ filled pill**. Dùng đường 1px accent đặt trên cạnh trái của sidebar, dài đúng
  bằng bề rộng nhãn + icon. Label đổi từ `--text-secondary` sang `--text-primary`.
- Bỏ `.crm-sidebar .size-8.rounded-xl` background tinted quanh logo → logo `currentColor` trên ground.
- Top bar: giữ search (Ctrl+K), giữ freshness stamp; bỏ "Bộ lọc" nếu không có filter thật.

### 2. KPI strip — một container chia bằng hairline

Thay 4 card riêng bằng **một container** `display: grid; grid-template-columns: repeat(4, 1fr)` chia bằng
`1px solid var(--border-subtle)`. Không gradient, không blur, không icon trong khối tinted.

- Label 12px `--text-secondary` sentence case (bỏ `uppercase tracking-wider`).
- Value 30px cho figure chính (doanh thu), 24px cho 3 figure còn lại — figure lớn nhất trả lời câu hỏi của màn.
- Delta 14px, **màu chỉ khi hướng xấu**: tăng doanh thu = grey; giảm đúng giờ = `--status-bad`.
  Delta phải nêu baseline trong cùng câu ("so với hôm qua", "so với ca sáng qua").
- Bỏ `sparkline`, bỏ icon.

### 3. Bảng 45 chi nhánh

- Row height 42px (dense, theo sheet). Header 12px `--text-secondary`, sentence case, **không** uppercase,
  **không** fill band, **không** rule dưới header.
- **Mọi cột số right-align + `font-variant-numeric: tabular-nums` + `font-family: var(--font-mono)`.**
  Cột tiền: 2 chữ số thập phân, dấu `₫` là suffix xám nhỏ hơn.
- Identity column (`Tên cửa hàng`) rộng nhất (~35%), không bao giờ bị truncate trước cột khác.
- Status: pill 20px cao, pale tint + dark text cùng hue (`--pill-positive-bg/ink`, `--pill-negative-bg/ink`).
  **Một** status mark mỗi hàng — bỏ badge trùng nghĩa.
- Bỏ icon ly cà phê trong khối tròn ở mọi row (đây là `icon in tinted square` bị cấm).
- Hover row: **không đổi fill**, dùng `box-shadow: inset 0 0 0 1px var(--border-control)` và gate
  `@media (hover: hover) and (pointer: fine)`.
- Giữ nguyên: `tr[data-id]`, 45 dòng, search, empty state string, Ctrl+K.

### 4. Slide-Over Barista drawer

- Trượt từ phải, **vào 240ms `--ease-out`, ra 180ms `--ease-exit`** (bất đối xứng — hệ thống trả lời nhanh hơn người dùng quyết định).
- `transform: translateX(100%) → 0`, không animate `width`/`left`.
- Backdrop: `opacity 0 → 1` 180ms, `background: rgba(0,0,0,0.6)`, **không** `backdrop-filter`.
- Focus trap: focus vào nút đóng khi mở, trả focus về dòng đã bấm khi đóng.
- `Escape` đóng. Click backdrop đóng.
- Giữ `#detail-drawer`, `#drawer-backdrop`, nút "Gửi Cảnh Báo Telegram", toast.

## Motion budget (Product register)

| Element | Tần suất | Quyết định | Curve | Duration |
|---|---|---|---|---|
| Nav hover | hàng chục/ngày | đổi màu text | `ease` | 150ms |
| Row hover | hàng chục/ngày | inset ring | `ease` | 150ms |
| Button press | hàng chục/ngày | `scale(0.98)` | `--ease-snappy` | 100ms |
| Drawer mở | thi thoảng | `translateX` | `--ease-out` | 240ms |
| Drawer đóng | thi thoảng | `translateX` | `--ease-exit` | 180ms |
| Search focus | hàng chục/ngày | ring 2px, **0ms** | — | 0 |
| Tab switch | 100+/ngày | **không animation** | — | 0 |

**Cấm:** entrance animation cho bất kỳ block nào trên màn này. `app-screens.md` §2.8:
"App screens have no motion floor… Nothing on the screen performs an entrance (house rule)."

## Implementation Steps

1. Đọc `CRM_HTML` dòng 23–566, lập bảng class → thay thế.
2. Viết lại shell (sidebar + top bar) trong `CRM_HTML`; CSS vào `product.css`.
3. Viết lại KPI strip thành một container chia hairline.
4. Viết lại `<thead>`/`<tbody>`: bỏ uppercase, bỏ icon tinted, thêm `tabular-nums`, right-align số,
   thêm `--pct` cho cột Đúng giờ.
5. Viết lại drawer CSS + wiring trong `useEffect` (`:606-955`): đổi transition, thêm focus trap.
6. Cập nhật `e2e-revamp-flow.test.mjs:193-227` theo ADR-021 (thay style snapshot bằng behavioral).
7. Chạy audit + inspect + test.

## Success Criteria

1. `node scripts/inspect.mjs <crm-url> --app --widths 1440,768,390` → **0 FAIL**.
2. Không còn `backdrop-filter` trên `.crm-sidebar`, `.crm-kpi-card`, `.crm-table-head`.
3. `.crm-kpi-card` có `background-image: none` (assert trong test mới).
4. 100% cột số trong bảng có `font-variant-numeric: tabular-nums` (assert trong test mới).
5. `yellowCount === 0` giữ nguyên.
6. 45 dòng `tr[data-id]`, search "Sư Vạn Hạnh", empty state, Ctrl+K, drawer, toast Telegram — **tất cả vẫn pass**.
7. 390px: `scrollWidth === clientWidth` (không tràn ngang).
8. Cột Đúng giờ hiển thị đường 1px accent đúng tỷ lệ ở 1440px (kiểm bằng screenshot + đo `width` computed).

## Risk Assessment

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| Test cũ đỏ vì bỏ blur/gradient | **Chắc chắn xảy ra** | ADR-021 phải được duyệt trước; sửa test cùng commit |
| `CRM_HTML` là string → sai một dấu `"` làm vỡ toàn bộ | Cao | Sửa theo block nhỏ, build sau mỗi block |
| Focus trap làm hỏng keyboard nav hiện có | Trung | Test `Escape` + `Tab` cycle bằng Playwright |
| Bỏ icon khối tròn làm bảng khó quét | Trung | Thay bằng khoảng trắng có chủ đích + identity column rộng hơn; đo lại bằng screenshot |

## Security Considerations

- `dangerouslySetInnerHTML` với string tĩnh — **không** nội suy dữ liệu người dùng vào `CRM_HTML`.
  Nếu Phase sau cần render dữ liệu thật, phải chuyển sang JSX hoặc sanitize (ghi thành ADR riêng).
- Không thêm `target="_blank"` thiếu `rel="noopener"`.

## Next Steps

Phase 02 (Chat) và Phase 03 (Auth + states) chạy song song sau Phase 01.
