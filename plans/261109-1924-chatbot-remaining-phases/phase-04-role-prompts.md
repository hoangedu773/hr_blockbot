# Phase 4 — D2: Gợi ý câu hỏi theo role

## Mục tiêu

Mỗi role thấy các nút gợi ý riêng, bấm nhận câu trả lời có dữ liệu thật — không "chưa có dữ liệu".

## Hiện trạng

`ChatPageView.tsx:94-98` (`TOPICS` — 3 câu sidebar) và `:134` (`quickReplies` — 3 câu hero) đều hardcode giống nhau cho mọi role. Có câu staff không có quyền ("Tổng hợp doanh thu két sáng toàn chuỗi").

## Files

| File | Sửa gì |
|---|---|
| `apps/web/src/components/chat/ChatPageView.tsx` | Thay `TOPICS` + `quickReplies` bằng bảng theo `user.authorization.profile` |

## Thiết kế

```ts
const ROLE_PROMPTS: Record<string, { label: string; prompt: string }[]> = {
  staff: [
    { label: "Việc nào sắp đến hạn?", prompt: "Việc nào của tôi sắp đến hạn?" },
    { label: "Lịch làm tuần này", prompt: "Lịch làm của tôi tuần này" },
    { label: "Quy định đi trễ", prompt: "Quy định đi trễ quá 15 phút" },
    { label: "Biểu mẫu bàn giao ca", prompt: "Cho tôi biểu mẫu bàn giao ca" },
  ],
  sm_am: [
    { label: "Việc nào chờ tôi xử lý?", prompt: "Việc nào đang chờ tôi xử lý?" },
    { label: "KPI doanh thu cửa hàng", prompt: "KPI doanh thu của cửa hàng tháng này" },
    { label: "Ai phù hợp nhiệm vụ này?", prompt: "Ai phù hợp cho nhiệm vụ này?" },
    { label: "Quy trình xử lý két lệch", prompt: "Quy trình xử lý két tiền lệch" },
  ],
  hr: [
    { label: "Kỳ KPI chờ chốt?", prompt: "Kỳ KPI nào đang chờ chốt?" },
    { label: "Yêu cầu điều chỉnh chờ quyết định", prompt: "Yêu cầu điều chỉnh KPI nào đang chờ quyết định?" },
    { label: "Giao KPI doanh thu", prompt: "Giao KPI doanh thu cho cửa hàng" },
    { label: "Quy chế chấm công", prompt: "Quy chế chấm công hiện hành" },
  ],
  system_admin: [
    { label: "Tài liệu kỹ thuật đang lưu", prompt: "Tài liệu kỹ thuật đang lưu" },
    { label: "Trạng thái dịch vụ", prompt: "Trạng thái dịch vụ" },
  ],
};

function roleKey(profile: string | undefined): keyof typeof ROLE_PROMPTS {
  if (profile === "staff" || profile === "ptch") return "staff";
  if (profile === "sm" || profile === "am") return "sm_am";
  if (profile === "hr") return "hr";
  return "system_admin";
}

const quickReplies = ROLE_PROMPTS[roleKey(user?.authorization?.profile)];
```

Sidebar `TOPICS` xoá hoặc dùng chung nguồn `ROLE_PROMPTS`.

## Ràng buộc nghiệp vụ

Mỗi prompt phải map vào intent đã có trong gateway:

| Câu | Intent | Tool |
|---|---|---|
| Việc nào sắp đến hạn | `get_upcoming_deadlines` | có |
| Lịch làm tuần này | `get_my_schedule` | có |
| Quy định đi trễ | `query_policy` | có |
| Biểu mẫu bàn giao ca | `query_policy` + attachments | có (sau Phase 3) |
| Việc nào đang chờ tôi xử lý | `list_my_pending_actions` | có |
| KPI doanh thu cửa hàng | `get_my_revenue_kpi` / `get_department_kpi` | có |
| Ai phù hợp nhiệm vụ này | **chưa có intent** — chỉ có tool `suggest_suitable_candidates` trong allowlist nhưng gateway không gọi | Phase C |
| Kỳ KPI chờ chốt | `list_my_pending_actions` | có |
| Yêu cầu điều chỉnh chờ quyết định | `list_my_pending_actions` | có |
| Giao KPI doanh thu | **chưa có intent** | Phase C |
| Quy chế chấm công | `query_policy` | có |

→ Phase 4 làm sau hoặc song song Phase 3; hai câu "Ai phù hợp" / "Giao KPI doanh thu" chỉ hiện khi Phase C đã wire tương ứng, hoặc lọc bỏ nếu chưa wire.

## Acceptance

- User `staff` thấy 4 câu khác user `hr`.
- Bấm câu nào nhận câu trả lời có dữ liệu, không "chưa có dữ liệu" (trừ 2 câu Phase C chưa wire — lọc bỏ).
- Test source-shape: không còn string hardcode ở `:94-98` và `:134`.

## Verify commands

```bash
pnpm --filter web test -- test/web-integration.source-shape.test.mjs
pnpm --filter web test -- test/e2e-revamp-flow.test.mjs
```
