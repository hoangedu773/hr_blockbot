# Kế Hoạch: Thiết Kế Bộ Sưu Tập 50 Previews HTML Dashboard & Command Center (50 Flagship Dashboard Explorations)

- **Mục tiêu:** Tạo thư mục mới `previews/50-dashboard-explorations/` gồm **50 trang HTML Dashboard độc lập** (`preview-01.html` đến `preview-50.html`) và **1 trang Showcase Hub** (`index.html`) để User duyệt, trải nghiệm các biến thể bố cục Dashboard thông minh, giàu animation, high-taste, ăn theo design system trang chủ (Obsidian Dark, Newsreader + Inter/Geist, Zero-Yellow, Zero-Navy).
- **5 Nhóm Bố Cục Dashboard Biến Hóa Sáng Tạo (10 Mẫu mỗi nhóm = 50 Mẫu Dashboard):**
  1. **Nhóm 1 (01–10): Chat-First AI Command Center** (Giao diện Copilot trung tâm lớn, prompt starters điều động ca, trích dẫn quy định, drawer CRM phụ bên cạnh).
  2. **Nhóm 2 (11–20): Split-Screen Hybrid Operations** (Chia đôi màn hình: Một bên là Chat AI Copilot / Assistant, một bên là bảng 45 chi nhánh hoặc timeline ca trực thời gian thực).
  3. **Nhóm 3 (21–30): Bento Grid & Executive KPI HUD** (Lưới bento đa tầng kiểu Apple/Vercel: KPI doanh thu két, radar nhân sự, tỷ lệ đúng giờ ZKTeco, nút cảnh báo Telegram).
  4. **Nhóm 4 (31–40): Visual Shift Timeline & Shift Gantt** (Lịch phân ca 24H trực quan, timeline Barista theo giờ, trạng thái bàn giao ca sáng/chiều/tối, kéo thả đổi ca).
  5. **Nhóm 5 (41–50): Neo-Cyber High-Density Operations Wall** (Phong cách Linear/Raycast/Stripe: Bảng điều hành mật độ cao, live activity feed, ⌘K command palette nổi, ticker ca trực).

---

## 1. Ranh Giới File Sở Hữu (Strict File Ownership)

Subagent `fullstack-developer` được phép tạo:
- Thư mục mới: `previews/50-dashboard-explorations/`
  - `previews/50-dashboard-explorations/index.html` (Showcase Gallery Hub duyệt 50 dashboard, chọn kích thước viewport, mở tab mới).
  - `previews/50-dashboard-explorations/preview-01.html` đến `preview-50.html` (50 dashboard HTML hoàn chỉnh, standalone, đầy đủ animation, dữ liệu ca kíp 45 chi nhánh, nhân sự Barista, két ca).

Các file mã nguồn ứng dụng hiện tại (`apps/web/src`, `apps/api/src`) giữ nguyên không bị ảnh hưởng.

---

## 2. Tiêu Chí Nghiệm Thu (Acceptance Criteria)

- [ ] Tạo đủ chính xác 50 file `preview-01.html` đến `preview-50.html` trong `previews/50-dashboard-explorations/`.
- [ ] Tạo file `previews/50-dashboard-explorations/index.html` có bộ lọc 5 nhóm dashboard, iframe preview responsive (Desktop 1440px, Tablet 768px, Mobile 375px), nút Open in new tab.
- [ ] Tuân thủ nghiêm ngặt Design System:
  - Zero-Yellow (0 màu vàng cấm).
  - Zero-Navy (0 màu xám xanh slate-900). Nền Dark Obsidian Neutral (`#09090b`, `#121214`).
  - Font: Newsreader (Serif) + Inter/Geist + JetBrains Mono.
  - Animation: `cubic-bezier(0.23, 1, 0.32, 1)`, button active scale 0.98, card hover float, live pulse dots, drawer slide mượt mà.
- [ ] Subagent QA kiểm thử: 100% 50 file mở được, không lỗi console, iframe load mượt.
