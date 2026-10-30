---
phase: 02
plan: design-system-big-update
title: Chat surfaces — ChatPage, ChatDrawer, motion chat theo chuẩn 60fps
owner: fullstack-developer
status: pending
priority: P1
effort: 8h
depends_on: [00]
blocks: [03]
---

# Phase 02 — Chat surfaces

## Context Links

- `research/design-direction.md` §3 (dealt sheet), §2 (motion budget)
- `ak-motion-craft/references/animation-rules.md` (Frequency Gate, curve, duration)
- `ak-motion-craft/references/mobile-native.md` (hover gate, tap highlight, 16px input, dvh)
- `ak-design-taste/references/app-screens.md` §11 (states), §12 (phone)

## Vấn đề phải giải

`ChatDrawer.tsx` (1.166 dòng) và `ChatPageView.tsx` chứa 4 nhóm vi phạm đo được:

| Nhóm | Bằng chứng | Số lượng |
|---|---|---|
| Gradient | `ChatDrawer.tsx:453` shimmer sweep; `ChatPageView.tsx:275` | 2 |
| Emoji làm UI | `ChatDrawer.tsx:569`, `:902` | 2 trong file này, 13 toàn bộ |
| `box-shadow` + `backdrop-filter` trên element tĩnh | `ChatDrawer.tsx:441,460`; `ChatPageView.tsx:238,243,244,246,263` | 6 |
| `ease-in-out` cho loop vô hạn | `ChatDrawer.tsx:467` `guta-model-sparkle` | 1 |

Ngoài ra: drawer transition 250ms **đối xứng** (vào = ra) — `ChatDrawer.tsx:518`. Hệ thống nên
trả lời nhanh hơn người dùng quyết định.

## File Ownership

| Hành động | File |
|---|---|
| Sửa | `apps/web/src/components/chat/ChatDrawer.tsx` |
| Sửa | `apps/web/src/components/chat/ChatPageView.tsx` |
| Sửa | `apps/web/src/styles/product.css` (block `.chat-*`) |

**Không chạm:** `CrmDashboardView.tsx`, `FolioLandingView.tsx`, `landing/**`, file test.

## Motion audit — Before / After

| Before | After | Why |
|---|---|---|
| `transition: 'transform 250ms cubic-bezier(0.16,1,0.3,1), visibility 250ms ease'` (`:518`) | `transform 240ms var(--ease-out), visibility 0ms 240ms` khi mở; `transform 180ms var(--ease-exit)` khi đóng | Bất đối xứng: hệ thống phản hồi nhanh hơn người dùng quyết định; exit ngắn hơn ~70% |
| `animation: guta-model-sparkle 2.5s ease-in-out infinite` (`:467`) | Xoá. Sparkle tĩnh, hoặc `opacity` pulse 1.8s `linear` nếu là live indicator | `ease-in-out` trên loop vô hạn gây cảm giác "thở" không đều; `linear` đúng cho constant motion |
| `box-shadow: 0 4px 20px rgba(0,0,0,0.2), inset 0 1px 0 ...` (`:441`) | Xoá. Surface `--bg-raised`, phân tầng bằng lightness | Shadow trên element tĩnh là tell của dashboard do AI tạo |
| `backdrop-filter: blur(16px)` (`:441`) | Xoá. Surface đặc, một bước lightness | Glass là tell; `app-screens.md` §13 xếp vào banned |
| `linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)` shimmer (`:453`) | Xoá hoàn toàn. Thinking indicator dùng 3 chấm `opacity` pulse | Gradient sweep là decoration, không mang nghĩa |
| `animation: guta-dot-pulse ... transform: scale(0.85)` (`:461`) | `opacity` 0.25→1, 1.4s `linear`, stagger 0/200/400ms. Bỏ `scale` | Scale trên loop làm chữ sống động quá mức; opacity đủ để đọc "đang gõ" |
| `animation: guta-step-cycle-* 6s infinite` (3 keyframe) (`:463-465`) | Giữ nhưng đổi sang `linear` và bỏ `transform: translateY` | Đây là text state machine thật; chỉ cần opacity |

## Các thay đổi theo bề mặt

### 1. ChatDrawer (slide-over trong CRM)

- **Mở:** `translateX(100%) → 0`, 240ms `--ease-out`. **Đóng:** `→ translateX(100%)`, 180ms `--ease-exit`.
- Backdrop `opacity` 180ms, không blur.
- Header: bỏ shadow, surface phẳng.
- Message bubble: vào bằng `translateY(6px) + opacity 0 → 0`, **160ms** `--ease-out`. Không `scale(0)`.
- Streaming indicator: 3 chấm `opacity` pulse, **`linear`**, 1.4s, stagger 200ms.
- Input: `font-size: 16px` ở `(pointer: coarse)` để iOS không zoom.
- Drawer container: `height: 100dvh` (không `100vh`).
- `overscroll-behavior: contain` trên message list.
- Emoji `✕` ở nút đóng → SVG 16px stroke 1.5.
- Giữ nguyên: placeholder "Hỏi AI về ca trực, nhân sự, tiền két...", citations, confirm card, `scrollIntoView` reduced-motion check (`:269`).

### 2. ChatPageView (route chat riêng)

- Cùng bộ token với ChatDrawer. Không có gradient/glass/shadow tĩnh.
- Empty state: giữ illustrated empty state (đã có test `Combo B UI/UX Anti-Slop`), nhưng bỏ gradient
  nền nếu có; dùng surface phẳng + 1 đường hairline.
- Suggestion chips: hover gate `(hover: hover)`.
- Mobile 320/375: đã có test contrast (`Chat text contrast ratios: 16.44, 8.65, 7.62, 21.00`) — **phải giữ ≥ 4.5:1**.

### 3. Motion token wiring

Mọi duration/curve lấy từ `tokens.css` (Phase 00). Không hardcode `cubic-bezier` trong TSX nữa.
Chỗ đang dùng `cubic-bezier(0.23, 1, 0.32, 1)` inline → thay bằng `var(--ease-out)`.

## Implementation Steps

1. Grep toàn bộ `cubic-bezier`, `transition`, `animation`, `box-shadow`, `backdrop-filter`,
   `linear-gradient` trong 2 file chat.
2. Thay từng chỗ theo bảng Before/After ở trên.
3. Chuyển các khối `<style>` inline sang `product.css` block `.chat-*` để có một nguồn.
4. Thêm `100dvh`, `overscroll-behavior: contain`, `font-size: 16px` coarse pointer.
5. Chạy `pnpm --filter web test` — 3 test chat phải xanh:
   - `ChatDrawer renders Markdown/citations...`
   - `ChatPage: desktop empty state, demo an toàn, citations...`
   - `ChatPage: mobile 320/375px, landscape, keyboard, reduced motion và contrast`

## Success Criteria

1. `grep -c "linear-gradient\|backdrop-filter\|box-shadow" apps/web/src/components/chat/*.tsx` → **0**.
2. `grep -c "cubic-bezier" apps/web/src/components/chat/*.tsx` → **0** (dùng token).
3. Drawer mở 240ms / đóng 180ms (đo bằng Playwright `getComputedStyle().transitionDuration`).
4. `prefers-reduced-motion: reduce` → không còn transform nào; content vẫn hiển thị.
5. Contrast chat ≥ 4.5:1 ở 320/375px (test đã có, phải giữ).
6. 3 test chat PASS.

## Risk Assessment

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| Bỏ shimmer làm thinking indicator khó nhận biết | Trung | 3 chấm opacity pulse vẫn đủ; kiểm bằng screenshot |
| `100dvh` gây layout shift trên Android khi keyboard mở | Trung | Test 375px landscape + keyboard trong suite hiện có |
| Chuyển `<style>` inline sang file CSS làm mất specificity | Trung | Dùng class, không `!important`; verify bằng computed style |

## Security Considerations

- Không render HTML từ model response mà không qua markdown renderer hiện có (đã có test escape HTML
  `ChatPage: API hợp lệ... escape HTML`). Giữ nguyên.
- Không log nội dung message ra console.

## Next Steps

Phase 03 (Auth modal + 8 states) chạy song song.
