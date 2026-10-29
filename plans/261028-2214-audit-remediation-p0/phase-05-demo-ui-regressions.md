---
phase: 5
name: demo-ui-regressions
owner: web-demo-ui
claims: [P0-6-adjacent, P2-13, audit-23-10-05, audit-23-10-06]
depends_on: []
---

# Phase 05 — Regression UI tiền demo

Bốn mục dưới đây đều là thứ người chấm nhìn thấy trong 60 giây đầu.

## 5.1 · Console đỏ `ERR_CONNECTION_REFUSED` khi khởi động

**File**: `apps/web/src/context/AuthContext.tsx:29-63`

Hiện trạng: `useEffect` gọi `refreshAccessToken()` vô điều kiện ⇒ `fetch` tới `http://localhost:3001/api/auth/refresh` khi chưa có `.env`, sinh lỗi network đỏ trong console (đúng ca test 15 đang fail).

**Yêu cầu**
1. Chỉ gọi `refreshAccessToken()` khi **có dấu hiệu phiên**: có `getAuthUser()` hoặc `getAccessToken()` trả non-null. Không có → `setIsLoading(false)` ngay, không gọi mạng.
2. Giữ nguyên `catch` hiện có cho trường hợp có phiên nhưng server chết.
3. Không đổi public API của `AuthContext` (`user`, `isAuthenticated`, `isLoading`, `login`, `logout`).

**Acceptance**
- Tải trang khi API offline, chưa đăng nhập: **không** có request `/auth/refresh` trong Network, **không** có console error.
- Đăng nhập xong → refresh vẫn hoạt động khi có phiên (test 15 pass).

## 5.2 · Nav "Phân ca" / "Đề tài" lệch nội dung

**File**: `apps/web/src/components/CrmDashboardView.tsx:66-73`

Hiện trạng: `data-section="schedules"` (nhãn "Phân ca") render `RosterView` có heading "Hồ Sơ Nhân Sự (F1)"; `data-section="projects"` (nhãn "Đề tài / Báo cáo") render `ProjectListView` — nghiệp vụ **đề tài khóa luận** (Tạo đề tài DRAFT, nộp báo cáo, nghiệm thu), lạc hẳn ngữ cảnh chuỗi F&B.

**Yêu cầu (chọn một, ghi lý do vào report)**
- Ưu tiên: **gỡ `projects` khỏi nav demo** (xoá nút `data-section="projects"`) và đổi nhãn `schedules` thành đúng nội dung nó render ("Hồ sơ nhân sự"), hoặc map `schedules` sang view thật sự về ca trực nếu có. Không được để nhãn nói một đằng, nội dung một nẻo.
- `EmployeeListView` (nav "Nhân sự") giữ nguyên.
- Không xoá `ProjectListView.tsx` khỏi repo — chỉ không expose trong nav demo.

**Acceptance**
- Không còn cặp nhãn/nội dung lệch: mỗi nút `[data-section]` mở ra màn hình có heading khớp nghĩa nhãn.
- `grep -n 'data-section="projects"' apps/web/src/components/CrmDashboardView.tsx` → 0 kết quả.
- Ảnh chụp 4 màn sau khi sửa (dùng Playwright có sẵn trong `apps/web/test/`), lưu vào `previews/` và nêu đường dẫn trong report.

## 5.3 · Chat offline không có thông điệp "dịch vụ chưa khả dụng"

**File**: `apps/web/src/components/chat/ChatPageView.tsx:378-384`

Hiện trạng: khi `fetch` lỗi, chỉ chèn một message lỗi chung vào hội thoại. Tab mặc định của app là `chat` (`App.tsx:29`), nên màn hình đầu tiên sau đăng nhập là chat — mà không nói rõ vì sao không dùng được.

**Yêu cầu**
1. Thêm state `serviceUnavailable` (hoặc tương đương) bật khi lỗi thuộc nhóm network/timeout (`TypeError` từ `fetch`, `AbortError`, HTTP 5xx).
2. Render một banner/empty-state **tĩnh, không gọi mạng** ở đầu khung chat với nội dung: "Demo an toàn · Dịch vụ AI chưa khả dụng" + một dòng giải thích "Bạn vẫn xem được dữ liệu CRM; phần trả lời AI cần backend."
3. Banner phải biến mất khi gửi thành công lần sau. Không chặn input.
4. Chuỗi phải **đúng nguyên văn** `Demo an toàn · Dịch vụ AI chưa khả dụng` (test 9 đang chờ chuỗi này).

**Acceptance**
- Test 9 (`ChatPage: desktop empty state…`) chuyển xanh.
- Offline + gửi 1 câu → banner xuất hiện, không có exception, không màn hình trắng.

## 5.4 · P2-13 · `url` từ server vào `href`/`src` không kiểm scheme

**File**: `apps/web/src/components/chat/ChatPageView.tsx:131-143` (parse attachment), render `:504-520`

**Yêu cầu**
1. Thêm hàm `safeUrl(raw: string): string | null`: chỉ chấp nhận `http:`, `https:`, hoặc đường dẫn tương đối bắt đầu bằng `/`. Mọi scheme khác (`javascript:`, `data:`, `vbscript:`, `file:`) → `null`.
2. `url: null` → **không render** attachment đó (hoặc render text thuần, không link). Không dùng `href={undefined}` để rồi component tự fallback.
3. Áp dụng cho cả `href` và `src` của attachment (ảnh).

**Acceptance**
- Payload test có `url: "javascript:alert(1)"` → không có `<a href="javascript:` và không có `<img src="javascript:` trong DOM; dán output `page.content()` kiểm chứng.
- `url: "https://example.com/a.pdf"` và `url: "/assets/a.pdf"` → render bình thường.

## Ranh giới

Chỉ được sửa: `context/AuthContext.tsx`, `components/CrmDashboardView.tsx`, `components/chat/ChatPageView.tsx`, `test/e2e-revamp-flow.test.mjs`. **Không** sửa `services/api.ts` (agent khác đang giữ), không sửa `apps/api/**`.
