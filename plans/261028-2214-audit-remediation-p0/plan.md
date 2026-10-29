---
plan: audit-remediation-p0
created: 2026-10-28T22:14+07:00
branch: integration/full-delivery
base_commit: 4b1d209
status: in-progress
owner: lead
source_audits:
  - plans/reports/team-lead-261027-1758-audit-readonly-full-stack.md
  - plans/reports/audit-261028-recheck-verdict.md
  - reports/2026-10-23/pre-demo-readiness-audit.md
---

# Kế hoạch khắc phục audit — sóng P0 + demo blockers

## 1. Bối cảnh (đã kiểm chứng, không suy đoán)

`plans/reports/audit-261028-recheck-verdict.md` kết luận: HEAD `4b1d209` **trùng đúng commit được audit 27/10**, 0 file tracked bị sửa, `verify-claims` 38/38 VERIFIED, 7/7 P0 đọc lại code vẫn còn lỗi. Tức là **chưa có mục nào được fix**.

Kế hoạch này không nhằm đóng cả 38 claim trong một lần. Nó chia thành 7 phase, trong đó **phase 01–06 nằm trong phạm vi thực thi ngay**, phase 07 là backlog có lý do kỹ thuật rõ ràng.

## 2. Phạm vi

**Trong phạm vi (25 claim)**

| Phase | Nội dung | Claim |
|---|---|---|
| 01 | Secret & bootstrap JWT | P0-1, P0-2 |
| 02 | Hardening ai-service | P0-3, P0-4, P1-12 |
| 03 | AuthZ & state machine | P0-5, P1-1, P1-2, P2-1 |
| 04 | Luồng nghiệp vụ chết | P0-6, P0-7, P1-8 |
| 05 | Regression UI tiền demo | AuthContext boot, nav mismatch, chat offline, P2-13 |
| 06 | Hạ tầng test | P1-10, P1-11, P2-3, 5 test e2e lỗi thời |

**Ngoài phạm vi (13 claim → phase 07 backlog)**: P1-3 (cần thiết kế signed URL), P1-4, P1-5, P1-6, P1-7, P1-9, P1-13, P1-14, P1-15, P1-16, P1-17, P2-2, P2-4…P2-12, P2-14.

## 3. Ranh giới file (bất biến — không agent nào được ghi ngoài danh sách của mình)

| Wave | Agent | Được ghi | Tuyệt đối không |
|---|---|---|---|
| W2-A | backend-security | `apps/api/src/**`, `apps/api/test/**`, `apps/api/package.json`, `apps/ai-service/app/**`, `apps/ai-service/tests/test_live_db_chat.py`, `apps/ai-service/.env.example` | `apps/web/**`, `packages/contracts/**` |
| W2-B | web-business | `apps/web/src/services/api.ts`, `apps/web/src/components/AdminSettingsView.tsx`, `apps/web/src/components/RosterView.tsx` | `apps/api/**`, `apps/web/src/components/chat/**` |
| W2-C | web-demo-ui | `apps/web/src/context/AuthContext.tsx`, `apps/web/src/components/CrmDashboardView.tsx`, `apps/web/src/components/chat/ChatPageView.tsx`, `apps/web/test/e2e-revamp-flow.test.mjs` | `apps/api/**`, `apps/web/src/services/api.ts` |
| W3 | qa-adversary | **không ghi file nào** | tất cả |
| W4 | lead | `plans/**`, `reports/**`, `test-results/**` | `apps/**` |

`packages/contracts/**` là read-only trong toàn bộ kế hoạch (AGENTS.md §5). Vì vậy P1-9 (`reply` ngoài `ChatDonePayloadSchema`) **không** được giải bằng cách sửa contract — đẩy sang phase 07.

## 4. Quyết định kiến trúc (ADR rút gọn)

- **ADR-01 (P0-6)**: sửa web client về `POST /reports` với `projectId` trong body, **không** thêm route lồng `POST /projects/:id/reports`. Lý do: server + contract + test đều đã thống nhất ở dạng phẳng; thêm route lồng là mở rộng bề mặt API chỉ để chiều một comment sai trong `api.ts:337-339`.
- **ADR-02 (P0-2)**: secret đọc **lazy** trong hàm sign/verify, không đọc ở module scope. Fail-closed (`throw`) khi `NODE_ENV=production` và thiếu `JWT_SECRET`; ở dev vẫn dùng fallback nhưng log cảnh báo rõ. Lý do: giữ dev chạy được mà không mở đường cho production.
- **ADR-03 (P0-3)**: ai-service fail-closed khi `AI_SERVICE_API_KEY` rỗng → 503 `SERVICE_KEY_NOT_CONFIGURED`. Chấp nhận rủi ro local dev phải set biến; đổi lại không còn đường bypass. **Không** ký `userContext` trong phase này (đó là P1-7/P1-14, phase 07) — nghĩa là trust nội bộ vẫn dựa trên service key, ghi rõ là giảm thiểu chứ không triệt tiêu.
- **ADR-04 (P0-5)**: whitelist chuyển trạng thái đặt trong `transitionProject` (model), nhận thêm `actorRole`; route chỉ truyền role vào, không tự quyết định. Lý do: mọi entrypoint (REST, WS, worker) đều đi qua model.
- **ADR-05 (P1-8)**: 4 endpoint không tồn tại → **ẩn/disable affordance** trên UI thay vì implement route. Lý do: implement 4 route + contract test là scope của một sprint riêng; demo không được bấm vào chỗ 404.

## 5. Điều kiện dừng (Definition of Done)

1. `pnpm --filter api build` (tsc) exit 0 · `pnpm --filter web build` exit 0 · `tsc --noEmit -p packages/contracts` exit 0.
2. `node scripts/verify-claims.mjs` → các claim trong phase 01–06 phải chuyển sang **FAIL** (anchor bị thay đổi) hoặc được ghi rõ "đã vá". Claim nào vẫn VERIFIED mà không có lý do → coi như chưa fix.
3. `node --test apps/web/test/e2e-revamp-flow.test.mjs` → 0 fail (sau khi sửa 5 test lỗi thời).
4. QA độc lập (W3) chạy lại toàn bộ acceptance criteria, verdict PASS mới được coi là xong.
5. Không có secret nào bị in ra report/log/chat.

## 6. Phase index

- [phase-01-secrets-jwt.md](phase-01-secrets-jwt.md)
- [phase-02-ai-service-hardening.md](phase-02-ai-service-hardening.md)
- [phase-03-authz-state-machine.md](phase-03-authz-state-machine.md)
- [phase-04-broken-business-flows.md](phase-04-broken-business-flows.md)
- [phase-05-demo-ui-regressions.md](phase-05-demo-ui-regressions.md)
- [phase-06-test-infra.md](phase-06-test-infra.md)
- [phase-07-backlog.md](phase-07-backlog.md)
