---
phase: 4
name: broken-business-flows
owner: web-business
claims: [P0-6, P0-7, P1-8]
depends_on: []
---

# Phase 04 — Luồng nghiệp vụ chết

## P0-6 · Nộp báo cáo luôn 404

**File**: `apps/web/src/services/api.ts:337-348` · server: `apps/api/src/routes/reports.ts:14`

Hiện trạng: web gọi `POST /projects/:id/reports`; server chỉ có `POST /reports` và `ReportSubmitSchema` **bắt buộc `projectId` trong body**.

**Yêu cầu (theo ADR-01 — sửa client, không thêm route lồng)**
1. `submitReport(projectId, payload)` gọi `POST /reports` với body `{ projectId, content, attachments, expectedVersion }`.
2. Xoá comment sai ở `:337-339` ("Canonical report submit path … nested under their project") — thay bằng comment đúng: server expose `POST /reports`, `projectId` nằm trong body.
3. Giữ nguyên kiểu trả về `SubmitReportResult`.

**Acceptance**
- `grep -n "projects/\${encodeURIComponent(projectId)}/reports" apps/web/src/services/api.ts` → 0 kết quả.
- Body gửi lên có đủ 4 field; chứng minh bằng unit test nhỏ hoặc bằng cách stub `fetch` và in body (dán output).
- `pnpm --filter web build` exit 0.

## P0-7 · Admin lưu provider làm mất `apiKey`

**File**: `apps/web/src/components/AdminSettingsView.tsx:45-61` (`toFormState`), `:85-99` (`toProviderInput`), `:130-160` (`persist`), `:161-200` (`handleSaveForm`)

Hiện trạng: `persist()` dựng lại payload qua `toProviderInput(toFormState(provider), provider)`; `toFormState` luôn trả `apiKey: ''` ⇒ key Admin vừa gõ bị xoá.

**Yêu cầu**
1. `persist` nhận thêm map `apiKeyById: Record<string, string>` (chỉ chứa key vừa nhập trong phiên form), và khi dựng payload thì `if (apiKeyById[provider.id]) input.apiKey = apiKeyById[provider.id]`.
2. `handleSaveForm`: nếu `form.apiKey.trim()` khác rỗng → ghi vào `apiKeyById[input.id]` trước khi gọi `persist`. Không lưu key vào state lâu dài hơn mức cần thiết, không log key.
3. Sau khi lưu thành công: xoá entry khỏi map (key đã gửi lên server), giữ nguyên hành vi `setForm(null)`.
4. **Không** đổi `toFormState` (nó đúng: key write-only, không prefill). Sửa ở đường đi của `persist`.
5. Không đổi contract `LLMProviderInput`.

**Acceptance**
- Thêm provider mới với key → payload gửi lên **có** `apiKey`; sửa provider cũ + nhập key mới → payload **có** `apiKey` mới; sửa provider cũ **không** nhập key → payload **không** có field `apiKey` (giữ key cũ). Chứng minh bằng stub `fetch` in body, dán output 3 case.
- `pnpm --filter web build` exit 0.

## P1-8 · 4 endpoint không tồn tại (404 khi bấm)

**Endpoint thiếu**: `PATCH /employees/:id`, `POST /employees/:id/change-requests`, `GET /change-requests`, `POST /conversations`.

**Yêu cầu (theo ADR-05 — ẩn affordance, không implement route)**
1. `RosterView.tsx`: phần "Hàng đợi duyệt" (dùng `fetchPendingProfileChangeRequests`, `:87-96`, render `:352-395`) phải **không còn gọi API**. Thay bằng empty-state tĩnh: "Hàng đợi duyệt hồ sơ đang trong giai đoạn tích hợp — chưa khả dụng ở bản demo." Không spinner, không gọi mạng, không toast lỗi.
2. Các nút sửa hồ sơ / tạo change-request trong `RosterView` (nếu có) → `disabled` + `title` giải thích. Không gọi `updateEmployeeFields` / `createProfileChangeRequest`.
3. **Không** xoá hàm trong `api.ts` (chúng là contract của phase sau) — chỉ ngừng gọi từ UI.
4. Ghi rõ trong report: 4 endpoint vẫn thiếu, đây là containment tạm, phase 07 sẽ implement.

**Acceptance**
- `grep -n "fetchPendingProfileChangeRequests\|createProfileChangeRequest\|updateEmployeeFields" apps/web/src/components/` → 0 kết quả.
- Mở tab Nhân sự trong demo offline: không có request 404 nào trong Network, không toast lỗi. Dán ảnh/log.

## Ranh giới

Chỉ được sửa 3 file: `services/api.ts`, `components/AdminSettingsView.tsx`, `components/RosterView.tsx`. Không chạm `chat/**`, `context/**`, `CrmDashboardView.tsx`.
