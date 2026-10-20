---
title: "Phase 3 — Web: admin provider, chat, F1/F2 UI"
status: pending
priority: P1
effort: 32h
owner: Web
created: 2026-10-20
depends_on: phase-01
---

# Phase 3 — Web

## Goal

Đưa dashboard từ trạng thái "gọi 4 endpoint đã 503 và nuốt lỗi" sang trạng thái dùng API thật, thêm 2 bề mặt mới: **trang Admin cấu hình LLM provider** và **panel chat** hiển thị trích dẫn.

## Preconditions

- Phase 1 xong (contracts). API có thể chưa xong — dùng mock server hoặc chờ Phase 2 cho phần chat.
- Worktree: `feat/frontend-web`.

## Tasks

### 1. Gỡ nợ hiện tại

- [ ] `apps/web/src/services/auth.ts`: `API_BASE` đang **hardcode** `http://localhost:3001/api` → đổi sang `import.meta.env.VITE_API_BASE ?? 'http://localhost:3001/api'`. Không sửa thì deploy Render sẽ trỏ về máy dev và toàn bộ app chết.
- [ ] `apps/web/src/services/api.ts`: xoá `fetchStores/fetchSchedules/fetchCorrections/fetchCashCounts` (endpoint đã 503) và các chỗ `.catch(() => [])` đang che lỗi.
- [ ] `App.tsx`: bỏ `loadData` gọi 4 API chết; thay bằng dữ liệu F1 (`/api/employees`) + F2 (`/api/projects`).
- [ ] Xoá `AddShiftModal`, `VisualTimeline` khỏi luồng chính nếu gắn với ca kíp (giữ file nếu còn dùng).
- [ ] Mọi lỗi API phải hiện toast thật, không nuốt.

### 2. Admin — LLM Providers

- [ ] Trang `AdminSettingsView`: danh sách provider (name, type, model, priority, enabled, `keyHint`, `lastTestOk`).
- [ ] Form thêm/sửa: `type` (select), `baseUrl`, `model`, `apiKey` (password, chỉ ghi), `priority`, `enabled`.
- [ ] Nút **Test connection** → gọi endpoint test, hiện latency + lỗi thật.
- [ ] Không bao giờ hiển thị key; sau khi lưu chỉ thấy `keyHint`.
- [ ] Chỉ render cho `role === "Admin"`; route 403 nếu Employee mở.

### 3. Chat panel

- [ ] `ChatPanel` dùng WebSocket `chat:*` (contract Phase 1/2): gửi `chat:send` kèm `clientMessageId`, render `chat:chunk` theo `kind`.
- [ ] `kind="text"` → markdown; `kind="citation"` → chip tài liệu (document/version/article, click mở chi tiết); `kind="action_proposal"` → card có nút Xác nhận/Huỷ (FR-020).
- [ ] Trạng thái bắt buộc: `idle · sending · streaming · abstain · error · degraded`.
- [ ] Abstain: hiện "chưa có trong tài liệu chính sách", liệt kê tài liệu đã nạp, **không** hiện nút giả.
- [ ] Degraded: badge "đang ở chế độ không có LLM", render kết quả thô.
- [ ] Reconnect: giữ `conversationId`, gửi lại `clientMessageId` chưa ack.

### 4. F1 / F2 UI

- [ ] F1: danh sách nhân sự (filter department/level/status), hồ sơ own vs đồng nghiệp (allowlist), form yêu cầu đổi field nhạy cảm, hàng đợi duyệt cho Admin (reject bắt buộc lý do).
- [ ] F2: danh sách đề tài + filter quá hạn (dẫn xuất), tạo DRAFT, giao việc, chuyển trạng thái, nộp báo cáo, duyệt/từ chối kèm lý do.
- [ ] Giữ preview tĩnh `apps/web/previews/index.html` cập nhật theo giao diện mới (6 trạng thái).

## File ownership

| Ok | File |
|---|---|
| ✅ | `apps/web/**` |
| ❌ | `apps/api/**`, `apps/ai-service/**`, `packages/contracts/**`, `docs/**`, `plans/**` |

## Verification

```bash
pnpm --filter @hr-blockbot/contracts build
pnpm --filter web test
pnpm --filter web build
grep -rn "fetchStores\|fetchSchedules\|fetchCashCounts" apps/web/src && echo "FAIL: còn endpoint 503" || echo "OK"
```

## Acceptance

1. Không còn lời gọi tới 4 endpoint 503.
2. Admin thêm provider `openai_compatible` qua UI, Test connection trả latency thật; reload trang vẫn thấy provider nhưng **không** thấy key.
3. Chat: gửi câu trong phạm vi → có ít nhất 1 citation chip; câu ngoài phạm vi → trạng thái abstain, không có nguồn bịa.
4. 6 trạng thái chat render được, có ảnh chụp cho báo cáo.
5. `pnpm --filter web build` pass, không warning chặn.

## Rollback

- Revert theo khối: (1) gỡ nợ, (2) admin page, (3) chat panel, (4) F1/F2. Không trộn commit.

## Không được làm

- Không tự định nghĩa type schema (import từ `@hr-blockbot/contracts`).
- Không hardcode danh sách provider hay model.
- Không hiện số liệu giả khi API lỗi.
