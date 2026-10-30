# ADR-021: Test style-snapshot → behavioral assertions

- **Ngày:** 2026-10-30
- **Trạng thái:** Proposed (cần chốt trước Phase 04)
- **Liên quan:** `apps/web/test/e2e-revamp-flow.test.mjs:193-227`

## Bối cảnh

Test hiện tại assert **giá trị CSS cụ thể** của CRM dashboard. Đây là snapshot của một quyết định
thẩm mỹ, không phải hành vi người dùng:

```js
assert.equal(glass.sidebar, 'blur(24px)');
assert.equal(glass.kpi, 'blur(16px)');
assert.equal(glass.thead, 'blur(12px)');
assert.match(glass.gradient, /linear-gradient/);          // KPI card PHẢI có gradient
assert.equal(glass.iconBackground, 'rgba(255, 255, 255, 0.05)'); // icon trong khối tinted
await page.waitForFunction(() => getComputedStyle(...).transform === 'matrix(1, 0, 0, 1, 0, -2)');
```

Ba trong bốn assert này **trực tiếp vi phạm** dealt sheet `data-terminal` và house rules của
`ak-design-taste/references/app-screens.md`:

| Assertion | House rule bị vi phạm |
|---|---|
| `blur(24px)/16px/12px` | `glass` — "No gradients, glows, glass, backdrop blur"; inspector xếp `glass` vào WARN 19 lần |
| `linear-gradient` trên `.crm-kpi-card` | "Gradients on grounds, buttons, cards, text and KPI tiles" — banned |
| icon `rgba(255,255,255,0.05)` trên mọi row | "An icon in a coloured circle or tinted square on every KPI or card (0 of 23)" |

Nghĩa là: **test đang khoá chặt đúng những thứ plan này muốn bỏ.** Không sửa test thì Phase 03
không thể implement dealt sheet; sửa component mà không sửa test thì suite đỏ và mất khả năng phân biệt
hồi quy thật với thay đổi có chủ đích.

## Quyết định

Chuyển các assertion thẩm mỹ thành **behavioral assertions** đo thuộc tính mà người dùng thực sự cảm nhận.

| Loại bỏ (style snapshot) | Thay bằng (behavioral) |
|---|---|
| `blur(24px)`, `blur(16px)`, `blur(12px)` | Đo contrast text trên surface ≥ 4.5:1; đo `--bg-surface` khác `--bg-canvas` (phân tầng bằng lightness) |
| `assert.match(gradient, /linear-gradient/)` | `backgroundImage === 'none'` trên mọi `.crm-kpi-card` (đây là invariant mới của dealt sheet) |
| icon `rgba(255,255,255,0.05)` | Đo icon dùng `currentColor` kế thừa, không có `background-color` riêng |
| hover `matrix(...,-2)` | `transitionProperty` chỉ chứa `transform`/`opacity`/`background-color`; **không** chứa `all`; có `prefers-reduced-motion` fallback |
| `yellowCount === 0` | **GIỮ NGUYÊN** — đây là brand invariant, không phải style preference |
| 45 dòng `tr[data-id]`, empty state, drawer, Ctrl+K, toast | **GIỮ NGUYÊN** — hành vi thật |

Bổ sung assertion mới phản ánh plan:
- Mọi figure trong bảng có `font-variant-numeric: tabular-nums`.
- Không phần tử nào có `transition: all`.
- Mọi `.crm-kpi-card` có `background-image: none`.
- Không `:hover` nào áp dụng khi `matchMedia('(hover: none)')` (kiểm bằng `page.emulateMedia`).
- `document.documentElement.scrollWidth === clientWidth` ở 390px.

## Hệ quả

**Tích cực**
- Suite đo hành vi, không đo gu. Đổi style có chủ đích không làm đỏ test; hồi quy thật thì đỏ.
- Có thể enforce invariant mới (no gradient, tabular, no `transition: all`) bằng test thay vì bằng review mắt.
- `yellowCount === 0` giữ nguyên làm brand guard.

**Tiêu cực**
- Mất lớp bảo vệ "đừng đổi look-and-feel ngoài ý muốn". Bù lại bằng screenshot diff trong Phase 04
  (chụp 3 viewport × 4 bề mặt, lưu vào `plans/.../assets/`).
- Phải viết lại ~30 dòng test; rủi ro gõ sai selector. Giảm thiểu bằng cách chạy suite sau mỗi lần sửa.

## Phương án bị loại

| Phương án | Vì sao loại |
|---|---|
| Giữ nguyên test, không implement dealt sheet | Plan vô nghĩa; `docs/DESIGN.md` v3.0 tiếp tục mâu thuẫn với code |
| Xoá trắng block test đó | Mất luôn guard `yellowCount === 0` và các assert hành vi lẫn trong cùng block |
| `test.skip` block đó | Nợ kỹ thuật ẩn; người sau không biết vì sao bị skip |

## Cách xác minh

```bash
pnpm --filter web test    # 50/50 pass, không skip
git diff apps/web/test/e2e-revamp-flow.test.mjs   # review từng assert được thay
```
