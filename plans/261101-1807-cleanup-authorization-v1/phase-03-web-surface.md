# Phase 03 — Dọn web surface và tách chat contracts

## Mục tiêu

Loại code UI không có runtime reference, tách type contract khỏi `ChatDrawer.tsx` chết, giữ coverage chat hiện hành.

## Evidence

Không có runtime reference ngoài chính file cho: `RosterView`, `StaffDrawer`, `AddShiftModal`, `TwoColumnGrid`, `VisualTimeline`, `MobileBottomNav`, `AiCopilotBar`, `AiCopilotModal`, `PromptChips`, `MetricCards`. Tổng khoảng 1.680 dòng. `ChatDrawer.tsx` có 918 dòng, không có `<ChatDrawer>` mount; `ChatPageView` chỉ import type.

## Việc cần làm

1. Tạo `apps/web/src/types/chat.ts` và chuyển `Citation`, `ProposedAction`, `Attachment` sang đó.
2. Chuyển các import type của `ChatPageView.tsx` sang file mới.
3. Chốt xóa `ChatDrawer.tsx` component và retarget `apps/web/test/chat-drawer.test.mjs` thành test contract/render của `ChatPageView`; không xóa coverage attachments/citations/error states.
4. Xóa 10 component không có consumer runtime. Trước mỗi xóa chạy grep exact symbol và kiểm dynamic import.
5. Không thay layout/style/behavior của `ChatPageView`, `CrmDashboardView`, auth hoặc authorization views.
6. Nếu một component tưởng dead được phát hiện là design evidence chứ không phải runtime source, giữ file tại `previews/` và không import vào app.

## Acceptance

```powershell
pnpm --filter web typecheck
pnpm --filter web build
pnpm --filter web test
node apps/web/test/e2e-revamp-flow.test.mjs
```

- Không còn import tới component đã xóa.
- `ChatPageView` vẫn render citations, attachments, proposedAction state và error state.
- Không tạo thêm component thay thế một component không được dùng.
