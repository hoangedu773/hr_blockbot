---
phase: 05
plan: landing-hero-header-luxury-chat
title: Control system — Select tự dựng thay native
owner: fullstack-developer
status: completed
priority: P1
effort: 6h
depends_on: [04]
blocks: [06]
---

# Phase 05 — Select tự dựng

## Mục tiêu

Thay 7 `<select>` native trong luồng chat + CRM shell bằng một component dùng chung, đúng
`docs/rules/project-design-rules.md` Quy tắc 11 (cấm dropdown OS), đủ bàn phím và đủ ARIA.

## Vì sao không dùng native + `appearance: none`

`appearance: none` chỉ đổi cái hộp; **popup** vẫn do OS vẽ — trên Windows là danh sách xám, trên macOS
là menu trắng. Không có CSS nào chạm được vào popup. Chỉ có hai lựa chọn: thư viện (Radix/Headless UI)
hoặc tự dựng. Repo không có Radix và plan này không thêm dependency → tự dựng.

## Phạm vi — 7 select

| File | Dòng | Vai trò | Ghi chú |
|---|---|---|---|
| `RosterView.tsx` | 126 | Lọc cấp bậc | filter, `value=""` = Tất cả |
| | 147 | Lọc trạng thái | filter |
| `StoreDirectoryView.tsx` | 445 | Lọc loại cửa hàng | filter, nằm trong `.crm-table-shell`? **không** — nằm trên toolbar |
| | 457 | Lọc trạng thái | filter |
| | 470 | Lọc quận | filter, mirror của nút "Bộ lọc Quận" trong chrome |
| | 712 | Loại (form tạo/sửa) | trong modal `role="dialog"` |
| | 727 | Trạng thái (form) | trong modal |

Ngoài phạm vi (giữ native): `AdminSettingsView` 1, `EmployeeProfileView` 1, `ProjectListView` 2,
`UserAccountsView` 4, `AddShiftModal` 2 (dead code).

## Component

`apps/web/src/components/ui/Select.tsx` — API thay thế 1-1 cho `<select>`:

```tsx
export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  id?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}
```

Không hỗ trợ `multiple`, không hỗ trợ `<optgroup>`, không hỗ trợ `name`/form submit — 7 chỗ dùng đều
là controlled state, không nằm trong `<form action>`. Ghi rõ giới hạn này trong JSDoc để người sau
không tưởng nó thay được mọi `<select>`.

### Popup phải portal

Trigger nằm trong `.crm-table-shell` (`overflow-x-auto`, `StoreDirectoryView:494`) và trong modal
(`role="dialog"`, `z-index: 300`). Popup `position: absolute` sẽ bị `overflow` cắt hoặc chui dưới
modal. Dùng `createPortal(document.body)` + `position: fixed` + toạ độ từ
`trigger.getBoundingClientRect()`.

Đây chính là pattern đã dùng ở `CrmDashboardView.tsx:2` (`import { createPortal } from 'react-dom'`),
nên không phải khái niệm mới trong repo.

### Vị trí popup

```ts
const rect = triggerRef.current.getBoundingClientRect();
const MENU_MAX = 280;
const spaceBelow = window.innerHeight - rect.bottom;
const openUp = spaceBelow < Math.min(MENU_MAX, 200) && rect.top > spaceBelow;
const top = openUp ? rect.top - Math.min(MENU_MAX, rect.top - 8) - 6 : rect.bottom + 6;
const left = Math.min(rect.left, window.innerWidth - rect.width - 8);
```

Đóng và tính lại vị trí khi: `scroll` (capture, passive), `resize`, và khi trigger unmount.

### Bàn phím

| Phím | Hành vi trên trigger (đóng) | Trên listbox (mở) |
|---|---|---|
| `Enter` / `Space` | mở, active = item đang chọn | chọn item active, đóng |
| `ArrowDown` | mở, active = item đang chọn | active +1 (clamp) |
| `ArrowUp` | mở, active = item cuối | active −1 (clamp) |
| `Home` / `End` | mở, active đầu/cuối | active đầu/cuối |
| `Escape` | — | đóng, trả focus về trigger |
| `Tab` | — | đóng, **cho phép** Tab đi tiếp (không `preventDefault`) |
| ký tự in được | mở + typeahead | typeahead 500ms reset |

Typeahead: buffer string, so `label.toLowerCase().startsWith(buffer)`, bỏ qua item `disabled`.

### ARIA

Trigger: `role="combobox"`, `aria-haspopup="listbox"`, `aria-expanded`, `aria-controls={listboxId}`,
`aria-labelledby` (từ `<label>` ngoài, nếu có).

Listbox: `role="listbox"`, `tabindex={-1}`, `aria-labelledby` = label id hoặc `aria-label` của trigger.
Option: `role="option"`, `aria-selected`, `id`, `aria-disabled`.

Khi mở: focus chuyển vào listbox (không phải option) và dùng `aria-activedescendant` trỏ option active.
Cách này giữ được một điểm focus, không cần roving tabindex, và screen reader đọc đúng khi Arrow.

### CSS

Thêm vào `product.css` cạnh `.select` (`:1419`), **giữ** `.select` cũ cho các `<select>` ngoài phạm vi:

```css
.select-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 34px;
  padding: 7px 10px;
  border-radius: 6px;
  border: 1px solid var(--border-subtle);
  background: var(--surface-card);
  color: var(--text-primary);
  font: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
  transition: border-color 160ms var(--ease-out), background 160ms var(--ease-out);
}

.select-trigger:hover:not(:disabled) { border-color: var(--border-control); }
.select-trigger:disabled { opacity: .55; cursor: not-allowed; }
.select-trigger[data-placeholder="true"] { color: var(--text-secondary); }
.select-trigger[data-open="true"] { border-color: var(--border-focus); }

.select-menu {
  position: fixed;
  /* Xếp lớp thật trong repo: chat drawer + slide-over = 250, modal tạo cửa hàng
     = 300 (inline). Menu phải trên cả hai. */
  z-index: 400;
  max-height: 280px;
  overflow-y: auto;
  padding: 4px;
  border-radius: 8px;
  border: 1px solid var(--border-control);
  /* Menu ở bậc card, option active ở bậc raised — nếu menu dùng raised thì
     highlight option trùng màu và mất tín hiệu hover. */
  background: var(--surface-card);
  /* Overlay thật: menu nổi trên nội dung. */
  box-shadow: 0 10px 30px rgba(0, 0, 0, .5);
  animation: select-in 125ms var(--ease-out);
}

.select-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 36px;
  padding: 6px 10px;
  border-radius: 4px;
  font-size: 12px;
  color: var(--text-primary);
  cursor: pointer;
}

.select-option[data-active="true"] { background: var(--surface-raised); }
.select-option[aria-selected="true"] { font-weight: 500; }
.select-option[aria-disabled="true"] { opacity: .45; cursor: not-allowed; }

@keyframes select-in {
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: none; }
}

@media (prefers-reduced-motion: reduce) {
  .select-menu { animation: none; }
}

@media (pointer: coarse) {
  .select-option { min-height: 44px; }
  .select-trigger { min-height: 44px; font-size: 16px; }
}
```

`z-index: 400` phải cao hơn modal tạo cửa hàng (`zIndex: 300` inline tại
`StoreDirectoryView.tsx:673`) và drawer (250). Kiểm bằng cách mở select **trong** modal.

## Chuyển đổi call site

Ví dụ `RosterView.tsx:126`:

```tsx
<Select
  id="roster-level"
  value={level}
  onChange={(next) => { setPage(1); setLevel(next); }}
  options={[{ value: '', label: 'Tất cả' }, ...LEVELS.map((v) => ({ value: v, label: v }))]}
  aria-labelledby="roster-level-label"
/>
```

`<label htmlFor>` hiện tại trỏ tới `id` của `<select>`; đổi sang `aria-labelledby` trên trigger với
`id` của `<label>`, hoặc giữ `htmlFor` và cho trigger cùng `id` — **phải chọn một**, không cả hai
(nếu không, click label focus vào phần tử không tồn tại).

Khuyến nghị: giữ `<label htmlFor="roster-level">` và cho trigger `id="roster-level"` + `role="combobox"`.
`htmlFor` trỏ tới một `div[role=combobox]` hoạt động với trình duyệt hiện đại nhưng **không** đảm bảo
a11y; an toàn hơn là `aria-labelledby` với id trên label:

```tsx
<label className="field__label" id="roster-level-label">Cấp bậc</label>
<Select aria-labelledby="roster-level-label" … />
```

## File Ownership

| Hành động | File |
|---|---|
| Tạo | `apps/web/src/components/ui/Select.tsx` |
| Sửa | `apps/web/src/styles/product.css` (thêm `.select-trigger`, `.select-menu`, `.select-option`, keyframes) |
| Sửa | `apps/web/src/components/RosterView.tsx` (2 select) |
| Sửa | `apps/web/src/components/StoreDirectoryView.tsx` (5 select) |

**Không chạm:** các view ngoài phạm vi, `.select` CSS cũ, test (chưa có test nào dùng `selectOption`).

## Kiểm chứng

Viết `apps/web/test/select-component.test.mjs` theo harness hiện có (esbuild transform + React UMD,
xem `test/helpers/browser-deps.mjs`):

1. **Mở/đóng:** click trigger → listbox hiện; click ngoài → đóng; `Escape` → đóng + focus về trigger.
2. **Bàn phím:** `ArrowDown` mở, `ArrowDown` ×2, `Enter` → chọn item thứ 3; `Home`/`End` nhảy đúng.
3. **Typeahead:** gõ "Tạ" trong 500ms → active nhảy tới "Tạm dừng".
4. **ARIA:** trigger có `aria-expanded` đúng; listbox có `role=listbox`; option active có
   `aria-activedescendant` khớp `id`.
5. **Vị trí:** mở select trong modal tạo cửa hàng → menu render trên modal (kiểm `z-index` computed và
   `getBoundingClientRect` không bị clip).
6. **Disabled option:** không chọn được bằng click lẫn Enter.
7. **Reduced motion:** `animationDuration === '0s'`.

```bash
cd apps/web && pnpm test
node "C:/Users/hoang/.omp/agent/skills/ak-design-taste/scripts/inspect.mjs" http://localhost:5173 --app --out .taste-skill/inspect/select
```

Đạt khi: 7 chỗ dùng `<Select>`; `grep -c "<select" src/components/RosterView.tsx src/components/StoreDirectoryView.tsx` = 0; test mới pass; `pnpm test` toàn bộ pass; inspector không FAIL mới.

## Rủi ro

| Rủi ro | Xử lý |
|---|---|
| Portal + `position: fixed` lệch khi trang cuộn bên trong container | Nghe `scroll` với `capture: true` trên `window` để bắt cả scroll của container con; tính lại rect mỗi lần |
| iOS: focus vào listbox làm bàn phím ảo bật lên | Listbox `tabindex={-1}` + `inputmode="none"`; nếu vẫn bật, dùng `aria-activedescendant` trên trigger thay vì focus listbox — ghi lại phương án dự phòng |
| `z-index: 400` vẫn dưới drawer 250? Không — 400 > 250 > modal 300? | Thứ tự thực: drawer 250, modal 300 → menu phải > 300. Đặt 400. Kiểm bằng ảnh chụp |
| Modal có focus trap riêng (`StoreDirectoryView`) chặn focus ra portal | Kiểm ngay khi tích hợp; nếu trap chặn, portal listbox vào chính modal thay vì `body` (dùng `container` prop) |
| Chuyển 7 chỗ trong một lần làm hỏng filter | Chuyển từng file, chạy `pnpm test` sau mỗi file; Roster trước, StoreDirectory sau |
