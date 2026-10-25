# Kế Hoạch: Thiết Kế Lại Ô Chatbox Chuẩn OpenAI / ChatGPT (Capsule Pill & Zero-Blue Tokens)

- **Mục tiêu:**
  1. Tái cấu trúc hoàn toàn ô chatbox trong `ChatPageView.tsx` theo chuẩn giao diện OpenAI (Ảnh 2):
     - Dạng thanh viên thuốc capsule (`rounded-full` hoặc `rounded-[32px]`), nền xám đen mờ `rgba(255, 255, 255, 0.05)`, viền xám mờ mỏng `rgba(255, 255, 255, 0.12)`.
     - Xóa bỏ viền chữ nhật lồng bên trong của textarea (`border: none !important; outline: none !important; box-shadow: none !important;`).
     - Ẩn hoàn toàn nhãn `label` "Tin nhắn cho Guta AI" bằng `.sr-only` (chỉ dành cho accessibility).
     - Xóa bỏ hoàn toàn dòng chữ thừa "Enter gửi · Shift+Enter xuống dòng" bên trong input.
     - Nút đính kèm `+` tròn bên trái (`size-8` hoặc `size-10` mờ nhẹ thanh lịch).
     - Nút gửi dạng tròn (`rounded-full size-11`), khi disabled là màu xám mờ nhẹ (`rgba(255, 255, 255, 0.1)`), khi active là màu trắng `#ffffff` icon đen `#000000` (hoặc xám sáng), **HOÀN TOÀN BỎ NÚT VUÔNG MÀU XANH DƯƠNG**.
  2. Rà soát và loại bỏ toàn bộ token màu xanh (`#2563eb`, `#93c5fd`, `#35435a`, `#233149`) trong `ChatPageView.tsx`, đưa về dải màu trung tính (Dark Slate / Charcoal & Neutral Frosted Gray) chuẩn OpenAI dark mode.
  3. Đảm bảo toàn bộ test E2E Playwright (`e2e-revamp-flow.test.mjs`) và build PASS 100%.
  4. Thực hiện git commit và push lên Render để tự động deploy.

---

## 1. Ranh Giới File Sở Hữu (Strict File Ownership)

Subagent `fullstack-developer` CHỈ ĐƯỢC PHÉP chỉnh sửa các file sau:
1. `apps/web/src/components/chat/ChatPageView.tsx` (Refactor ô chatbox OpenAI capsule, xóa màu xanh, nút gửi tròn)
2. `apps/web/test/e2e-revamp-flow.test.mjs` (Cập nhật assertions kiểm tra thanh chatbox OpenAI và đảm bảo 16/16 tests PASS)

---

## 2. Chi Tiết Thực Thi & Spec Kỹ Thuật

### 2.1. Cấu trúc JSX của Composer
```tsx
<form className="guta-chat-composer" onSubmit={(event) => { event.preventDefault(); send(); }}>
  <label htmlFor="copilot-message" className="sr-only">Tin nhắn cho Guta AI</label>
  <button type="button" className="chat-attach-btn" aria-label="Thao tác bổ sung">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14m-7-7h14"/></svg>
  </button>
  <textarea
    id="copilot-message"
    ref={inputRef}
    rows={1}
    maxLength={4000}
    value={input}
    onChange={(event) => setInput(event.target.value)}
    placeholder="Hỏi Guta AI về ca trực, nhân sự, tiền két..."
    onKeyDown={(event) => {
      if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
        event.preventDefault();
        send();
      }
    }}
  />
  <button className="chat-send" type="submit" aria-label="Gửi" disabled={isTyping || !input.trim()}>
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5m-6 6 6-6 6 6" /></svg>
  </button>
</form>
```

### 2.2. CSS Token Rà Soát (Loại Bỏ Toàn Bộ Dấu Vết Xanh Dưới Mọi Hình Thức)
- Thay:
  `--chat-border: #35435a;` -> `--chat-border: rgba(255, 255, 255, 0.1);`
  `--chat-focus: #93c5fd;` -> `--chat-focus: rgba(255, 255, 255, 0.3);`
  `--chat-accent: #2563eb;` -> `--chat-accent: #ffffff;`
  `--chat-hover: #233149;` -> `--chat-hover: rgba(255, 255, 255, 0.08);`
  `--chat-card: #182235;` -> `--chat-card: #212121;`
- `.guta-chat-composer`:
  - `display: flex; align-items: center; gap: 10px; border-radius: 9999px;`
  - `background: rgba(255, 255, 255, 0.05); backdrop-filter: blur(20px); border: 1px solid rgba(255, 255, 255, 0.12);`
  - `padding: 6px 8px 6px 14px;`
  - `:focus-within { border-color: rgba(255, 255, 255, 0.28); box-shadow: 0 4px 24px rgba(0,0,0,0.4); }`
- `.guta-chat-composer textarea`:
  - `flex: 1; border: none !important; outline: none !important; box-shadow: none !important; background: transparent; padding: 6px 0; font-size: 14px;`
  - Không có bất kỳ viền hoặc outline màu xanh nào khi focus!
- `.chat-send`:
  - `border-radius: 9999px; min-width: 44px; min-height: 44px; width: 44px; height: 44px; border: none; display: flex; align-items: center; justify-content: center;`
  - Disabled: `background: rgba(255, 255, 255, 0.1); color: rgba(255, 255, 255, 0.35);`
  - Enabled: `background: #ffffff; color: #000000; box-shadow: 0 2px 8px rgba(255, 255, 255, 0.2);` (Không màu xanh!)
- `.chat-attach-btn`:
  - `border-radius: 9999px; min-width: 44px; min-height: 44px; width: 44px; height: 44px; border: none; background: transparent; color: rgba(255, 255, 255, 0.6); display: flex; align-items: center; justify-content: center;`
  - Hover: `background: rgba(255, 255, 255, 0.08); color: #ffffff;`
- Nút xác nhận hành động `.chat-primary`:
  - Đổi từ màu xanh sang nền sáng chữ đen `#ffffff` text `#000000` hoặc xám sang trọng.

---

## 3. Kiểm Thử & Nghiệm Thu
- `pnpm -r run build` -> Exit 0.
- `node apps/web/test/e2e-revamp-flow.test.mjs` -> PASS 16/16.
- Quét token màu: 0 mã màu xanh trong `ChatPageView.tsx` (`#2563eb`, `#93c5fd`, `#35435a`, `#233149`).
