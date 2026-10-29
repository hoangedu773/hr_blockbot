# Kế Hoạch: Thiết Kế Bộ Sưu Tập 50 Previews HTML Trang Chủ Biến Hóa Bố Cục & Motion (50 Flagship Homepage Explorations)

- **Mục tiêu:** Tạo một thư mục mới `previews/50-explorations/` gồm **50 trang HTML preview độc lập** (`preview-01.html` đến `preview-50.html`) và **1 trang Showcase Hub** (`index.html`) để User duyệt, trải nghiệm trực tiếp qua iframe, chuyển đổi layout và chọn mẫu ưng ý nhất.
- **Tiêu chuẩn thiết kế & System Design:**
  - **Typography:** Newsreader (Editorial Serif) kết hợp Geist Sans / Inter và JetBrains Mono.
  - **Màu sắc & Tokens:** Zero-Yellow, Zero-Slate-900 (không navy xám xanh), Neutral Obsidian Dark Mode (`#09090b`, `#0e0e11`, `#141418`, `#27272a`), điểm xuyết tinh tế Emerald (`#10b981`), Sapphire (`#2563eb`) và Zinc.
  - **Animation & Taste:** Chuẩn Emil Kowalski & Apple macOS `cubic-bezier(0.23, 1, 0.32, 1)`, button scale 0.98, floating glass cards, live AI prompt interaction, marquee partners, hover glow borders.
  - **5 Nhóm Bố Cục Biến Hóa Sáng Tạo (10 Mẫu mỗi nhóm = 50 Mẫu):**
    1. **Nhóm 1 (01–10): Editorial Luxury & Modern Serif** (Cảm hứng Monocle/Vogue/Kinfolk - Typography Newsreader tráng lệ, split story, quote layout, editorial timeline).
    2. **Nhóm 2 (11–20): Bionic Linear & Command AI Center** (Cảm hứng Linear/Raycast/OpenAI - Live AI Copilot composer ở hero, floating pill cards, ⌘K command bar, obsidian glow).
    3. **Nhóm 3 (21–30): Bento Grid & Metric Intelligence** (Cảm hứng Apple/Vercel - Lưới bento đa tầng, interactive shift slider, live barista radar, glassmorphism tinh xảo).
    4. **Nhóm 4 (31–40): Minimalist Swiss High-Precision** (Cảm hứng Braun/Dieter Rams - Grid cực chuẩn xác, monolithic headlines, hairline borders, tabular numbers).
    5. **Nhóm 5 (41–50): Neo-Cyber F&B Operations Hub** (Cảm hứng Stripe/Arc/Pitch - Bold geometric layout, live shift ticker marquee, dynamic Kanban preview, animated status pills).
- **Trạng thái:** HOÀN THÀNH - NGHIỆM THU PASS 100% (QA Sign-off 25/10/2026).

---

## 1. Ranh Giới File Sở Hữu (Strict File Ownership)

Đã tạo thành công:
- Thư mục: `previews/50-explorations/`
  - `previews/50-explorations/index.html` (Showcase Gallery Hub có sidebar chọn mẫu 1–50, bộ lọc nhóm, xem iframe responsive desktop 1440px / tablet 768px / mobile 375px, nút mở tab mới, toàn màn hình).
  - `previews/50-explorations/preview-01.html` đến `preview-50.html` (50 trang HTML hoàn chỉnh, standalone, đầy đủ Google Fonts Newsreader/Inter/Geist/JetBrains Mono, CSS animation cubic-bezier, SVG icons, logo `/assets/logos/guta-mark-pure.svg`, micro-interactions).

---

## 2. Tiêu Chí Nghiệm Thu (Acceptance Criteria)

- [x] Tạo đủ chính xác 50 file `preview-01.html` đến `preview-50.html` trong `previews/50-explorations/`.
- [x] Tạo file `previews/50-explorations/index.html` đóng vai trò Hub triển lãm: có danh sách 50 mẫu phân theo 5 nhóm, thumbnail/preview iframe trực quan, nút chuyển đổi nhanh, nút đổi kích thước màn hình (Desktop 1440px, Tablet 768px, Mobile 375px).
- [x] Cả 50 mẫu đều tuân thủ nghiêm ngặt:
  - Ăn khớp nhận diện HR-BlockBot / Guta Workspace.
  - Zero-Yellow (0 màu vàng cấm).
  - Zero-Navy (0 màu xám xanh slate-900). Dùng dải màu Neutral Dark Obsidian / Charcoal sang trọng.
  - Có đầy đủ animation physics `cubic-bezier(0.23, 1, 0.32, 1)`, button active scale 0.98, hover effects, interactive mockups.
- [x] Subagent QA (`tester`) kiểm tra độc lập bằng Playwright:
  - 100% 50 file mở được, không lỗi HTTP 404, không vỡ layout.
  - Iframe chuyển đổi mượt mà giữa các mẫu.
  - Đổi viewport 1440px, 768px, 375px chính xác.
  - Bộ lọc 5 nhóm hiển thị đúng 10 mẫu/nhóm và All 50 mẫu.
  - 0 console error, 0 page error.
