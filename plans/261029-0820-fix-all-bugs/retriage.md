# Re-triage 21 claim DRIFT/FAIL — 2026-10-29 08:30

Phương pháp: đọc code tại chỗ (không suy luận từ anchor). Mỗi kết luận kèm `file:line` + dòng code.

## Kết quả

| Claim | Verdict | Bằng chứng |
|---|---|---|
| P0-1 | **FIXED** | `grep "sk-" apps/ai-service/tests/test_live_db_chat.py` → 0 |
| P0-3 | **FIXED** | `main.py:80-90` raise `503 SERVICE_KEY_NOT_CONFIGURED` khi thiếu key |
| P0-4 | **FIXED** | `chain.py:4-5,84` hash toàn payload; `configVersion` chỉ là prefix |
| P0-5 | **STILL-BUG** | `projects.ts:309` `if (targetStatus === "IN_PROGRESS" && role === "Employee")` — vẫn chỉ chặn 1 nhánh |
| P0-6 | **FIXED** | `web/services/api.ts:337-345` gọi `/reports` + comment "no nested route" |
| P0-7 | **FIXED** | `AdminSettingsView.tsx:95-96` `if (apiKey.length > 0) input.apiKey = apiKey;` + `apiKeyById` giữ key cũ |
| P1-1 | **FIXED** | `reports.ts:149,189` gọi `assertReportScope`; deny → 404 |
| P1-2 | **FIXED** | `projects.ts:203-211` `assertProjectScope(user, p)` → 404 |
| P1-5 | **STILL-BUG** | `reports.ts:94-110`: `ReportModel.create` **trước** `transitionProject`; fail transition không xoá report |
| P1-6 | **STILL-BUG** | `socket.ts:142-150` vẫn "đã được ghi nhận và xác nhận thực thi an toàn vào hệ thống", không gọi service nào |
| P1-11 | **FIXED** | `apps/api/package.json` liệt kê đủ 6 file test (anchor xanh là false positive) |
| P1-12 | **FIXED** | `openai_compatible.py:28` import `validate_base_url`; thiếu baseUrl → `ProviderInvalidConfig` |
| P1-13 | **STILL-BUG** | `main.py:50-51` `allow_origins=["*"]` + `allow_credentials=True` |
| P1-14 | **STILL-BUG** | `loop.py:473-474` `expected_intent` suy từ `draft.type` — cùng nguồn LLM |
| P1-17 | **STILL-BUG** | `grep EmployeeProfileView apps/web/src` → chỉ có file khai báo, không mount |
| P2-1 | **FIXED** | `reports.ts:189` review route dùng chung `assertReportScope` |
| P2-2 | **FIXED** | `projects.ts:261,319` `expectedVersion` được truyền vào update |
| P2-3 | **FIXED** | `auth.test.mjs:411-418` assert `successes <= 1` + `successes + rejections == 2` (không còn luôn đúng) |
| P2-5 | **PARTIAL** | `main.py:144-145` vẫn fallback `hashing_embed(t, settings.embedding_dim)`; đã dùng đúng chiều cấu hình nhưng vẫn lặng lẽ trả vector khác nguồn so với vector đã lưu ⇒ cần chặn khi corpus đã có vector thật |
| P2-7 | **STILL-BUG** | `loop.py:505` `except (LLMUnavailable, ProviderError, ValueError, TypeError, KeyError, AttributeError)` |
| P2-12 | **STILL-BUG** | `RosterView.tsx:60-66` `setDetail(result)` không so `employeeId` đang mở |
| P2-13 | **FIXED** | `ChatPageView.tsx:170` `safeUrl(item.url)` thay cho check `typeof` |

## Tổng hợp

- **FIXED: 12** — P0-1, P0-3, P0-4, P0-6, P0-7, P1-1, P1-2, P1-11, P1-12, P2-1, P2-2, P2-3, P2-13 (13 dòng, P1-11 là false-positive của anchor).
- **STILL-BUG: 9** — P0-5, P1-5, P1-6, P1-13, P1-14, P1-17, P2-7, P2-12 (+ P2-5 partial).
- **Còn 16 claim VERIFIED** (anchor còn nguyên, chưa đọc lại): P0-2, P1-3, P1-4, P1-7, P1-8, P1-9, P1-10, P1-15, P1-16, P2-4, P2-6, P2-8, P2-9, P2-10, P2-11, P2-14.

## Danh sách fix thật (sau re-triage)

**P0:** P0-2, P0-5
**P1:** P1-3, P1-4, P1-5, P1-6, P1-7, P1-8, P1-9, P1-10, P1-13, P1-14, P1-15, P1-16, P1-17
**P2:** P2-4, P2-5, P2-6, P2-7, P2-8, P2-9, P2-10, P2-11, P2-12, P2-14
**Jev:** J-1, J-2, J-3, J-4, J-5, J-6

→ **31 mục** (giảm từ 44 nếu fix theo danh sách cũ). Bỏ khỏi plan: P0-1, P0-3, P0-4, P0-6, P0-7, P1-1, P1-2, P1-11, P1-12, P2-1, P2-2, P2-3, P2-13.
