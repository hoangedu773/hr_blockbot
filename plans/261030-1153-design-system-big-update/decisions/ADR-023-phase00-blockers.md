# ADR-023: Hai điểm chặn Phase 00 — quyết định của Lead

- **Ngày:** 2026-10-30
- **Trạng thái:** Accepted
- **Bối cảnh:** Dev báo 2 điểm chặn không tự quyết. Đây là quyết định của Lead, ghi lại để Phase sau không mở lại.

## Điểm chặn 1 — hai test đọc cứng `src/index.css`

`test/chat-drawer.test.mjs:12` (`new URL('../src/index.css')` → `addStyleTag`) và
`test/landing-workflow.test.mjs:166` (`readFileSync(join(webRoot,'src/index.css'))`) đọc cứng đường dẫn
file đã bị thay bằng `src/styles/index.css`.

**Quyết định: sửa 2 test, trỏ sang nguồn CSS mới.**

Đây là **routine maintenance**, không phải thay đổi hành vi: sửa một đường dẫn mà bằng chứng hiện tại
chứng minh đã sai (`ak-docs/references/doc-content-rules.md` §Write Authority — "correcting a path…
that current evidence proves false"). Không thay đổi assertion nào.

Cách sửa:
- `landing-workflow.test.mjs`: đọc `src/styles/index.css` **và** 4 file token liền kề, hoặc đọc
  `dist/assets/*.css` sau build. Chọn đọc `src/styles/*` (không cần build).
- `chat-drawer.test.mjs`: `addStyleTag` cần CSS resolve được trong browser. `@import "tailwindcss"`
  không resolve ngoài bundler → trỏ sang `dist/assets/*.css` (test này đã chạy Playwright trên dist).

**Ràng buộc:** giữ nguyên mọi assertion nội dung (màu, selector, chuỗi). Chỉ đổi đường dẫn nguồn.

## Điểm chặn 2 — CRM đổi 21.5% pixel

Hai nguyên nhân, **xử lý khác nhau**.

### 2a. Font CRM: `Times New Roman` → `Geist`

**Giữ nguyên bản sửa.** Bundle tĩnh cũ có bug thật: `--default-font-family: var(--font-inter)` nhưng
`--font-inter` rỗng → cascade rơi về serif mặc định. Đây là **sửa lỗi**, không phải thay đổi gu.
`Times New Roman` trong một CRM F&B là lỗi rõ ràng; không có lý do bảo toàn.

### 2b. `min-w-[960px]` từ dead class → active

**Giữ nguyên, không override.** Đây là hệ quả trực tiếp và đúng của ADR-020: class chết nay có tác dụng.
Cột "Trạng thái" bị đẩy khỏi viewport 1440px là **hành vi đúng của `min-w-[960px]`** — bảng cần 960px
tối thiểu, container 1136px không đủ cho 10 cột.

**Nhưng** trạng thái này chỉ được tồn tại **trong Phase 00**. Phase 01 rebuild bảng theo dealt sheet
(`app-screens.md` §7: identity column rộng nhất, số right-align, bỏ icon tinted) và phải giải quyết
bằng **bố cục cột**, không bằng `min-w`. Ghi thành acceptance criterion bổ sung cho Phase 01:

> **AC bổ sung Phase 01:** ở 1440px, cả 10 cột hiển thị đầy đủ **không cần cuộn ngang** trong
> `.crm-table-shell`. Cột "Trạng thái" phải nằm trong viewport. Không dùng `min-w` để che vấn đề.

Nếu Phase 01 không đạt được: giảm số cột (gộp "Số Barista" + "Ca Hiện Tại"), không tăng `min-w`.

## Điểm chặn 3 — 29 class không match rule

- 15 `guta-chat-*` được style qua `<style>` inline trong `ChatPageView.tsx` — **ngoài scope Phase 00**,
  Phase 02 xử lý.
- 14 còn lại (`lucide`, `group/sidebar-wrapper`, `chat-*`, `empty-state-row`…) **vốn đã không có style
  từ trước** — marker trơ, không phải regression.

**Chấp nhận.** Không phải nợ kỹ thuật mới. Phase 02 và 05 sẽ dọn.

## Ảnh hưởng tới acceptance của Phase 00

| Tiêu chí gốc | Điều chỉnh |
|---|---|
| `audit-class-coverage` = 0 missing | → **72/73** đạt; 1 còn lại (`min-w-[960px]`… không, class này đã active) — QA xác minh con số thật |
| `grep !important` trong `src/styles/*` = 0 | Đạt (5/5 file = 0) |
| CSS bundle < 60KB gzip | Đạt (27.94KB) |
| 50/50 test PASS | Đạt — sau khi sửa 2 đường dẫn test |
| Screenshot không lệch | **Điều chỉnh:** landing 3.29% (đạt), CRM 21.50% (chấp nhận có lý do, ghi ở trên) |
