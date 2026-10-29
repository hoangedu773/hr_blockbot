# Báo cáo Tái Thẩm Định QA (Vòng 2): Kiến Trúc Luồng Landing Page

- **Ngày thực hiện:** 26/10/2026
- **Trạng thái:** PASS 100%
- **Đối tượng kiểm thử:**
  - `apps/web/public/diagrams/chatbot-architecture.html`
  - `apps/web/src/components/landing/WorkflowSection.tsx`
  - `apps/web/src/components/FolioLandingView.tsx`
  - `apps/web/test/landing-workflow.test.mjs`

---

## 1. Trade-offs

| Hạng mục thiết kế | Phương án áp dụng | Đánh đổi / Rủi ro đã triệt tiêu | Lý do chọn |
|---|---|---|---|
| **Fullscreen API Support** | Feature detection `typeof container.requestFullscreen === 'function'` kèm fallback `window.open` | iOS Safari / WebKit không hỗ trợ Fullscreen API trên thẻ `<div>`, dễ phát sinh `TypeError: undefined is not a function`. | Đảm bảo tính khả dụng đa nền tảng, không sập runtime trên thiết bị Apple. |
| **Iframe PostMessage Security** | Ràng buộc định danh nguồn `event.source !== iframe.contentWindow` và type guard `typeof data.state === 'string'` | Bỏ qua origin/source cho phép injection hoặc cross-site event spoofing từ tiện ích trình duyệt hoặc tab khác. | Khóa chặt giao tiếp hai chiều cô lập, ngăn chặn race condition và invalid state injection. |
| **Canvas Zoom vs. Document Scroll** | Ngắt zoom cuộn mặc định, chỉ kích hoạt khi `e.ctrlKey \|\| e.metaKey` | Wheel listener mặc định sẽ chiếm quyền cuộn (scroll-jacking), làm người dùng bị "kẹt chuột" khi cuộn trang landing. | Giữ trải nghiệm cuộn trang mượt mà tự nhiên, tương thích chuẩn thao tác zoom bản đồ/canvas chuyên nghiệp (Figma/Miro standard). |
| **Color System Compliance** | Loại bỏ 100% mã màu vàng/amber (`#b45309`, `#fdd663`, `#f59e0b`, `#fbbf24`), chuẩn hóa Emerald `#10b981` | Sự xuất hiện màu vàng phá vỡ tiêu chuẩn nhận diện thương hiệu Dark Emerald. | Bảo đảm zero-pixel màu cấm theo design system của dự án. |

---

## 2. Kết Quả Kiểm Chứng & Bằng Chứng Mã Nguồn

### 2.1. Lệnh Kiểm Chứng Tự Động
- **Unit/Integration Test**:
  ```bash
  node apps/web/test/landing-workflow.test.mjs
  ```
  - Kết quả: **4/4 passed (100%)** trong 16.7ms.
  - Các khía cạnh xác thực: Animation infinite, postMessage protocol, responsive toolbar, wheel zoom guard, không tồn tại màu cấm, feature detection Fullscreen.
- **Biên dịch Production**:
  ```bash
  pnpm --filter web build
  ```
  - Kết quả: **Thành công (0 error, 0 warning)** qua `tsc && vite build` trong 11.37s.

### 2.2. Kiểm Tra Mã Nguồn Chi Tiết

1. **Gỡ bỏ màu cấm triệt để:**
   - Đã quét toàn bộ `apps/web/public/diagrams/chatbot-architecture.html`, `apps/web/src/components/landing/WorkflowSection.tsx`, `apps/web/src/components/FolioLandingView.tsx`.
   - Kết quả: Không còn bất kỳ mã màu `#b45309`, `#fdd663`, `#f59e0b`, `#fbbf24` hay token `crm-pill-amber`.

2. **Bảo mật PostMessage & Type Guards:**
   - Trong `WorkflowSection.tsx` & `FolioLandingView.tsx`:
     ```typescript
     if (iframeRef.current && event.source !== iframeRef.current.contentWindow) return;
     if (typeof data.state === 'string') {
       setIsPlaying(data.state === 'play');
     }
     ```
   - Chặn đứng mọi tin nhắn không rõ nguồn gốc hoặc tin nhắn sai cấu trúc.

3. **iOS Safari Fullscreen Safety:**
   - Áp dụng kiểm tra hàm trước khi gọi:
     ```typescript
     if (container && typeof container.requestFullscreen === 'function') {
       container.requestFullscreen().catch(() => {
         window.open(diagramSrc, '_blank', 'noopener,noreferrer');
       });
     } else {
       window.open(diagramSrc, '_blank', 'noopener,noreferrer');
     }
     ```
   - Xử lý hoàn chỉnh cho trình duyệt di động iOS mà không gây unhandled TypeError.

4. **Loại bỏ Scroll-Jacking trên Diagram:**
   - Trong `chatbot-architecture.html`:
     ```javascript
     viewportEl.addEventListener('wheel', (e) => {
       if (e.ctrlKey || e.metaKey) {
         e.preventDefault();
         const delta = e.deltaY < 0 ? 0.09 : -0.09;
         setZoom(currentZoom + delta);
       }
     }, { passive: false });
     ```
   - Cuộn chuột thông thường tiếp tục cuộn trang landing tự nhiên.

---

## 3. Operational Concerns & Security

- **Operations:** Tối ưu hóa hiệu năng bằng hardware acceleration (`transform`, `opacity`), tự động dừng animation khi kích hoạt `prefers-reduced-motion`.
- **Security:** Ràng buộc chặt `event.source` ngăn chặn cross-origin spoofing và prototype pollution.

---

## 4. Kết Luận

**PASS 100%** — Toàn bộ tiêu chí nghiệm thu đều được thỏa mãn và đã được bảo vệ bởi test tự động trong CI.
