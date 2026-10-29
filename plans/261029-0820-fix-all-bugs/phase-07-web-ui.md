# Phase 07 — Web UI: lỗi mất dữ liệu, refetch vô hạn, XSS, và 2 lỗi chặn demo

**Mục tiêu:** sửa P0-7 (mất apiKey) + các lỗi UI, và dọn 2 thứ hội đồng sẽ thấy đầu tiên.

## File sở hữu (exclusive)

```
apps/web/src/components/AdminSettingsView.tsx          P0-7
apps/web/src/components/ProjectListView.tsx            P1-16
apps/web/src/components/CrmDashboardView.tsx           P1-17 + nhãn nav
apps/web/src/components/EmployeeListView.tsx           P2-11
apps/web/src/components/RosterView.tsx                 P2-12
apps/web/src/components/chat/ChatPageView.tsx          P2-13
apps/web/src/services/chatSocket.ts                    P2-9
apps/web/src/context/AuthContext.tsx                   audit 23/10 #5
```

## Việc

1. **P0-7 — apiKey bị xoá khi lưu provider** (`AdminSettingsView.tsx:58,139`): `toFormState()` trả
   `apiKey: ''`, `persist()` gửi lại nguyên payload đó ⇒ key Admin vừa gõ bị ghi đè bằng rỗng.
   - Tách "form state" khỏi "submit payload": chỉ gửi `apiKey` khi người dùng **thực sự nhập mới**;
     để trống = "giữ key cũ". UI phải hiện `hasKey: true/false`, **không** hiện lại key.
   - Đây là P0 vì sau khi sửa, không ai cấu hình được LLM → cả hệ thống chết.

2. **P1-16 — refetch vô hạn** (`ProjectListView.tsx:108`): `onNotify` tạo mới mỗi render, nằm trong deps của
   `useEffect` ⇒ loop. Bọc `useCallback` với deps thật, hoặc dùng `useRef` cho callback.

3. **P1-17 — `EmployeeProfileView` không được mount** (`CrmDashboardView.tsx:961`): component tồn tại nhưng
   không có route/nhánh render ⇒ tính năng chết. Mount vào đúng tab, hoặc xoá file nếu đã bỏ khỏi phạm vi.

4. **P2-9 — `chatSocket.ts:25` khai lại payload WS**: import type từ `packages/contracts` thay vì định nghĩa lại.

5. **P2-11 — search không debounce/abort** (`EmployeeListView.tsx:27`): gõ nhanh bắn N request, response cũ về
   sau ghi đè kết quả mới. Thêm debounce 300ms + `AbortController`.

6. **P2-12 — `openDetail` không so id** (`RosterView.tsx:60,104`): response của nhân viên A ghi đè chi tiết
   đang mở của B. So `if (id !== currentId) return;` trước khi set state.

7. **P2-13 — XSS qua URL** (`ChatPageView.tsx:167`): `typeof item.url === 'string'` là không đủ.
   Chỉ cho `http:`/`https:`, chặn `javascript:`/`data:`; thêm `rel="noopener noreferrer"`.

8. **AuthContext `ERR_CONNECTION_REFUSED`** (`AuthContext.tsx:43-56`): boot luôn gọi `refreshAccessToken()`
   dù chưa có phiên ⇒ console đỏ trước mặt người chấm. Chỉ gọi khi có refresh cookie/flag, và `catch` im lặng
   đúng nghĩa (không log error).

9. **Nhãn nav lệch nội dung** (`CrmDashboardView.tsx` nav): "Phân ca" mở `RosterView` có heading
   "Hồ Sơ Nhân Sự (F1)"; "Đề tài / Báo cáo" mở `ProjectListView` (nghiệp vụ khóa luận) trong demo F&B.
   - Sửa heading cho khớp nhãn; và **gỡ `projects` khỏi demo path** (hoặc đổi nhãn thành "Khóa luận (demo)").

## Acceptance

```bash
node --test apps/web/test/landing-workflow.test.mjs
node --test apps/web/test/web-integration.test.mjs
pnpm --filter web build
# test tay bắt buộc:
#  1. Admin nhập key mới → Lưu → reload → hasKey=true, gọi LLM được
#  2. Admin để trống key → Lưu → key cũ còn nguyên
#  3. Mở app khi backend tắt → console KHÔNG có ERR_CONNECTION_REFUSED
#  4. Nav: mỗi nhãn mở đúng màn hình có heading tương ứng
```

## Cấm

- Không sửa `apps/api` trong phase này (nếu phát hiện thiếu endpoint → mở lại phase 03/04, không tự thêm route).
- Không đổi design/layout ngoài phạm vi từng mục.
