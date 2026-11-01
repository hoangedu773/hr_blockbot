---
title: "Plan A — Cleanup và chuẩn hóa sau Authorization V1"
description: "Dọn code chết, chuẩn hóa boundary và giảm drift sau khi fast-forward baseline Authorization V1; không đổi behavior nghiệp vụ."
status: pending
priority: P1
branch: integration/full-delivery
baseCommit: 4a6774b
strategy: zero-behavior-change
created: 2026-11-01
blockedBy: []
blocks: [plan-b-f5-f7-expansion]
tags: [refactor, cleanup, authorization, api, web, ai]
---

# Plan A — Cleanup và chuẩn hóa sau Authorization V1

## Outcome

Sau phase này, code ở commit `4a6774b` có các boundary rõ ràng để xây F5/F7 và các mở rộng tiếp theo:

- một error-wrapper dùng chung cho API;
- types chat tách khỏi component chết;
- legacy AI được cô lập khỏi runtime V1 nhưng vẫn giữ regression evidence;
- build output/preview artifact không còn là source code mặc định;
- mọi gate baseline vẫn xanh với behavior và error envelope không đổi.

**Không triển khai F5, F6, F7, ACL provisioning, attachment delivery, conversation persistence trong Plan A.**

## Constraints

- Target commit: `4a6774b` đã fast-forward local; chưa push/deploy.
- Không đổi public API, Zod schema, capability policy, Mongo schema, HTTP status/code/message, Socket.IO event, business state machine.
- Không xóa legacy regression evidence; chỉ tách khỏi đường mặc định.
- Không reset, force-push, xóa dữ liệu thật hoặc chạy migration Atlas.
- Mỗi phase phải chạy lại gate liên quan trước khi phase tiếp theo bắt đầu.

## Non-goals

- Không sửa `kpi.write`/`chatbot.execute`.
- Không thêm collection `evaluations`, `notifications`, `conversations`.
- Không nâng `authorizationSummary.enforcement` khỏi `MIGRATING`.
- Không chuyển retrieval, ACL, attachments hoặc scheduler sang implementation mới.
- Không sửa nội dung tài liệu GUTA và không provision `approvalRef`.

## Acceptance contract

1. `pnpm -r typecheck` PASS.
2. `pnpm -r run build` PASS.
3. `pnpm --filter @hr-blockbot/contracts test` PASS.
4. `pnpm --filter api test` PASS.
5. `pnpm --filter web test` PASS.
6. `apps/ai-service/.venv-authz-v1/Scripts/python.exe -m pytest -q` PASS.
7. `node apps/web/test/e2e-revamp-flow.test.mjs` PASS.
8. API error envelope trước/sau giữ nguyên trên test matrix của routes đã chạm.
9. Không còn route production nào import error wrapper từ `routes/projects.ts`.
10. Không có component web chết bị xóa mà vẫn còn import/runtime reference.

## Trade-offs

| Lựa chọn | Lợi | Rủi ro | Quyết định |
|---|---|---|---|
| Xóa hẳn legacy AI | Giảm ~4.621 LOC | Mất offline regression và evidence F3/F4 cũ; trái `baseline-development.md` | Không chọn |
| **Cô lập legacy AI + marker test** | Runtime V1 sạch; giữ khả năng đối chiếu | Hai test lane phải duy trì | **Chọn** |
| Giữ nguyên mọi legacy | Không có diff | F5/F7 dev tiếp tục nhầm entrypoint/corpus cũ | Không chọn |
| Xóa toàn bộ preview | Repo nhẹ | Mất artifact design đã review | Không chọn |
| **Untrack build output, giữ source preview có chủ đích** | Giảm bloat mà không mất evidence thiết kế | Cần link/đường dẫn chuẩn hóa | **Chọn** |

## Phase map

| Phase | Mục tiêu | Ownership | File |
|---|---|---|---|
| 01 | Baseline gate + inventory đóng băng | Root/gates | [`phase-01-baseline-gate.md`](phase-01-baseline-gate.md) |
| 02 | API boundary/error wrapper | `apps/api/src/lib`, routes | [`phase-02-api-boundary.md`](phase-02-api-boundary.md) |
| 03 | Web dead surface + chat types | `apps/web/src`, web tests | [`phase-03-web-surface.md`](phase-03-web-surface.md) |
| 04 | AI legacy quarantine + test lanes | `apps/ai-service` | [`phase-04-ai-boundary.md`](phase-04-ai-boundary.md) |
| 05 | Repo artifact hygiene + final sweep | root/docs/ignore | [`phase-05-repo-hygiene.md`](phase-05-repo-hygiene.md) |

## Sequence

01 → 02 → 03 → 04 → 05. Phases không chạy song song vì cùng sửa test gates, package output và boundary conventions.

## Handoff sang Plan B

Chỉ bắt đầu plan F5/F7 sau khi toàn bộ acceptance trên PASS. Plan B target vẫn là `4a6774b` sau cleanup; không quay lại `8471b98` và không dùng `apps/ai-service/app/main.py` làm runtime production.

## Unresolved decisions

- Xóa `ChatDrawer` component và retarget test sang `ChatPageView`, hay chỉ tách types rồi giữ component làm compatibility surface. Khuyến nghị xóa vì hiện không có `<ChatDrawer>` runtime reference.
- Preview HTML nào cần giữ làm design evidence; mặc định chỉ untrack generated build output (`dist-verify`), không tự xóa preview source.
