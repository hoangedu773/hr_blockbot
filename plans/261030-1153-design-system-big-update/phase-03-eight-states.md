---
phase: 03
plan: design-system-big-update
title: Ma trận 8 trạng thái — Auth modal, form, control trên toàn Product register
owner: fullstack-developer
status: pending
priority: P1
effort: 7h
depends_on: [01, 02]
blocks: [05]
---

# Phase 03 — Ma trận 8 trạng thái

## Context Links

- `docs/DESIGN.md` §4 (8-State Interaction Matrix)
- `ak-design-taste/references/app-screens.md` §11 (empty/zero/loading/error), §8 (forms)
- `ak-motion-craft/references/mobile-native.md` §1,2,4,5,8
- `ak-motion-craft/references/review-standards.md` (10 tiêu chuẩn)

## Vấn đề phải giải

Đo trên `apps/web/src`: **8 rule `focus-visible`** và **8 rule `:active`** trên 1.204 dòng CSS cũ.
Phần lớn control không có trạng thái focus nhìn thấy được. Không có empty/loading/error state chuẩn
cho các block dữ liệu (chỉ có empty state của bảng CRM, viết riêng trong `CRM_HTML`).

## File Ownership

| Hành động | File |
|---|---|
| Sửa | `apps/web/src/components/AccountLoginModal.tsx` |
| Sửa | `apps/web/src/components/ChangePasswordModal.tsx` |
| Sửa | `apps/web/src/components/Toast.tsx` |
| Sửa | `apps/web/src/components/DemoErrorBoundary.tsx` |
| Sửa | `apps/web/src/styles/product.css` (block `.state-*`, `.field-*`, `.btn-*`) |

**Không chạm:** `CrmDashboardView.tsx`, `chat/**`, `FolioLandingView.tsx`, `landing/**`.

## Ma trận 8 trạng thái (bắt buộc cho mọi control)

| # | State | Spec | Token |
|---|---|---|---|
| 1 | Default | surface `--bg-raised`, border `1px var(--border-subtle)`, text `--text-primary` | — |
| 2 | Hover | `background: --obsidian-800`; **chỉ** trong `@media (hover: hover) and (pointer: fine)` | 150ms `ease` |
| 3 | Focus-visible | `outline: 2px solid var(--accent-action); outline-offset: 2px` — **không** `box-shadow` | 0ms (tức thời) |
| 4 | Active | `transform: scale(0.98)` | 100ms `--ease-snappy` |
| 5 | Disabled | `opacity: .4; cursor: not-allowed; pointer-events: none` | — |
| 6 | Loading | Skeleton đúng shape thật: bar xám cao đúng bằng value, giữ nguyên row pitch. **Không** shimmer gradient | — |
| 7 | Empty | Icon outline 20px + 1 câu cụ thể + 1 action. Giữ frame và header của block | — |
| 8 | Error / Success | Border `--status-bad` + 1 câu nói cái gì hỏng và làm gì tiếp; success `--status-ok`, tự ẩn sau 3s | — |

## Các thay đổi cụ thể

### 1. AccountLoginModal

Hiện tại: `id="auth-modal"`, form với `#login-username`, `button[type=submit]`, `aria-busy`.
Đã có focus trap và Escape (test `form desktop tối giản, giữ focus và đóng bằng Escape`).

Cần thêm/sửa:
- **Focus-visible** rõ trên input và button: `outline: 2px solid var(--accent-action); outline-offset: 2px`.
- **Error state inline**: sai mật khẩu → border `--status-bad` trên input, message 13px dưới field,
  `aria-describedby` trỏ tới message id, `aria-invalid="true"`. Không `window.alert`.
- **Loading**: `button[type=submit]` giữ nguyên width, đổi label thành "Đang đăng nhập…", `disabled`,
  `aria-busy="true"`. Không spinner tròn — giữ chữ.
- **Disabled**: nút submit disabled khi username hoặc password rỗng; nói rõ vì sao bằng cách
  giữ label và giảm opacity, **không** ẩn.
- **Input font-size 16px** ở `(pointer: coarse)`.
- **Success**: đóng modal + focus trả về trigger.

**Bảo toàn:** `#auth-modal`, `aria-labelledby="auth-modal-title"`, `getByLabel('Tên đăng nhập')`,
`getByLabel('Mật khẩu')`, `button[type=submit]` — 6 test auth đang phụ thuộc.

### 2. ChangePasswordModal

Cùng ma trận. Đặc biệt:
- Validation client-side: độ dài tối thiểu, khớp confirm, không trùng mật khẩu cũ.
- Error message cụ thể: "Mật khẩu mới phải có ít nhất 8 ký tự." — không "Invalid input".
- `mustChangePassword` flow: modal không đóng được bằng Escape (bắt buộc đổi) — kiểm tra hành vi hiện tại trước khi đổi.

### 3. Toast

- Vào: `translateY(8px) + opacity 0 → 0`, **180ms** `--ease-out`. Ra: `opacity → 0`, **120ms** `--ease-exit`.
- **Transition, không keyframes** — toast có thể bị trigger liên tiếp; transition retarget từ giá trị hiện tại.
- `role="status"` cho info/success, `role="alert"` cho error.
- Không `box-shadow` lớn; dùng `--bg-raised` + border.
- Auto-dismiss 3s cho success, **không auto-dismiss** cho error.
- `aria-live="polite"` (info/success) / `"assertive"` (error).

### 4. DemoErrorBoundary

- Fallback state: frame giữ nguyên, 1 câu "Không tải được màn hình này." + nút "Thử lại".
- Không stack trace ra UI. Log qua console.error một lần.

### 5. CSS block trong `product.css`

```css
.state-skeleton {
  background: var(--obsidian-800);
  border-radius: var(--radius-sm);
  /* height set inline theo value thật; không shimmer */
}
.btn:focus-visible, .field:focus-visible, .nav-item:focus-visible {
  outline: 2px solid var(--accent-action);
  outline-offset: 2px;
}
@media (hover: hover) and (pointer: fine) {
  .btn:hover { background: var(--obsidian-800); }
}
.btn:active:not(:disabled) { transform: scale(0.98); transition: transform 100ms var(--ease-snappy); }
@media (prefers-reduced-motion: reduce) {
  .btn:active:not(:disabled) { transform: none; }
}
```

## Implementation Steps

1. Audit từng control trong 4 file: liệt kê state nào còn thiếu.
2. Thêm CSS block vào `product.css` trước, sau đó wire class vào component.
3. Sửa AccountLoginModal theo thứ tự: focus-visible → error → loading → disabled → coarse pointer.
4. Sửa Toast: transition thay keyframes, role/aria-live, auto-dismiss policy.
5. Sửa ChangePasswordModal validation message.
6. Sửa DemoErrorBoundary fallback.
7. Chạy 10 test auth + toast.

## Success Criteria

1. Mọi `<input>`, `<button>`, `<select>` trong 4 file có rule `:focus-visible` nhìn thấy được
   (kiểm bằng `page.keyboard.press('Tab')` + đọc `outlineWidth`).
2. `grep -c "window.alert" apps/web/src` → 0.
3. Toast dùng `transition`, không `animation` (grep `@keyframes` trong Toast.tsx → 0).
4. `prefers-reduced-motion` → mọi transform về `none`, opacity vẫn chuyển.
5. 10 test auth + 2 test toast PASS.
6. 390px: input font-size ≥ 16px (đo computed).

## Risk Assessment

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| Đổi label nút submit làm vỡ `getByRole('button', {name: 'Đăng nhập'})` | **Cao** | Chỉ đổi label **khi đang loading**; trạng thái nghỉ giữ nguyên chữ "Đăng nhập" |
| Thêm `aria-invalid` làm screen reader đọc khác | Thấp | Đúng chuẩn ARIA; test bằng `aria-describedby` presence |
| Toast không auto-dismiss error gây rối | Thấp | Có nút đóng rõ ràng |
| ChangePasswordModal không cho Escape có thể trap người dùng | Trung | Chỉ chặn Escape khi `mustChangePassword === true`; luôn có nút đăng xuất |

## Security Considerations

- Error message đăng nhập **không** phân biệt "sai username" vs "sai password" (chống enumeration) —
  giữ message chung "Tên đăng nhập hoặc mật khẩu không đúng."
- Không log credential. `ChangePasswordModal` không giữ mật khẩu trong state sau khi submit.
- `autocomplete="username"` / `"current-password"` / `"new-password"` đúng chuẩn.

## Next Steps

Phase 05 (Verification) chạy sau khi 01, 02, 03, 04 xanh.
