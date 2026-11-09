# Bàn giao KPI, chatbot và DB — 09/11/2026

## Nhánh bàn giao

- Nhánh bàn giao: `fix/integrate-kpi-notifications-261109`, dựa trên `deploy/f4-cloud-20261103` tại `82defe2abb6468cdf5b624cec95577985c399fe6`. Nhánh bàn giao có thêm phần thông báo KPI của Phi từ `b3ce637`, chỉnh vùng chạm và fixture kiểm thử. Đây là **candidate chưa merge**, không coi là bản release.
- Nhánh chung đã push: `deploy/f4-cloud-20261103`; [PR #2](https://github.com/hoangedu773/hr_blockbot/pull/2) đã merge tại `82defe2`, gồm commit sửa `0af09c2`. GitHub không có CI check cho PR hoặc Actions run cho merge commit.
- Render test Web/API từng chạy commit mới hơn `ee38debd592e0ab0c4038e12524f56df631563e1` (shared inbox, cha `b3ce637`). Commit này **không nằm trong nhánh chung hoặc candidate bàn giao**; cần phối hợp với Phi trước khi tích hợp. Trạng thái Render thay đổi theo thời gian; kiểm tra lại trước deploy.
- Các checkout `C:/work-space/hr-blockbot-f4` và `C:/work-space/hr-blockbot-kpi-chatbot` còn thay đổi chưa commit. Không reset, stash, checkout, xóa hay ghi đè chúng.

## Bằng chứng đã kiểm thử

Các kết quả dưới đây là chạy **trước bàn giao**, không chạy lại chỉ để đọc tài liệu. Môi trường dùng fixture và MongoDB cách ly, không phải Atlas hoặc provider thật.

| Phạm vi | Kết quả đã quan sát | Giới hạn |
|---|---|---|
| Nhánh chung `82defe2`, tree bằng candidate `0af09c2` | Typecheck/build workspace qua; contracts 66/66; API full suite exit 0; AI hermetic 345 passed, 1 skipped, 149 deselected; Web E2E 36/36; Web suite 88/88. | Không phải GitHub CI; không chứng minh chạy được với DB hoặc provider thật. |
| Revenue KPI/chat API trên candidate trước merge | Assignment/result 24/24; regression xác minh SM yêu cầu điều chỉnh → AM xác minh → HR quyết định; `apps/api/test/revenue-kpi-assignment-actions.test.mjs` và `revenue-kpi-result-actions.test.mjs`. | Test service/route, không chứng minh mọi câu tự nhiên hoặc mọi role trên hệ thống đang deploy. |
| Chat và quyền | Test API streaming, authorization, task suitability, chat history; Web E2E có streaming, hủy, stale action, phân quyền; test authorization UI 6/6 và timeout/refresh 6/6. | Có mock/provider giả ở ranh giới; chưa kiểm thử provider thật trên bản merge. |
| Candidate thông báo KPI, worktree bàn giao | Build; API `tasks.test.mjs` 5/5 và `performance-kpi-storage-grants.test.mjs` 2/2; `performance-kpi.integration.mjs` qua với browser/API/Mongo cách ly sau khi cập nhật fixture SSE; đã xem UI 320/375/768/1440px, thử lọc, xem chi tiết, đánh dấu đọc. | API full suite lần sau gặp `MongoServerError: namespace ... evaluations already exists ... different options`; suite đã bị dừng theo yêu cầu, **không PASS**. Cần xác định nguyên nhân trước merge. |

Chi tiết lịch sử kiểm thử trước: `plans/261109-0502-unify-code-atlas-readiness/phase-02-reconcile-code.md` trong worktree gốc và `plans/reports/lead-261108-1431-render-chatbot-integration-result.md` (báo cáo cũ, trạng thái Git trong báo cáo đó đã lỗi thời).

## Đối chiếu hình và kế hoạch P3–P6

- Hình mô tả các khoảng trống tại `fc4b812`; không thể khẳng định mọi khoảng trống đã đóng chỉ vì service/API có sẵn. Roadmap gốc: `plans/kpi-chatbot/00-MASTER-ROADMAP.md` trên nhánh `feat/revenue-kpi-chat-preview`.
- **P3:** service hỗ trợ publish/accept/refuse/adjustment/HR decision và REST/Socket decision; test service SM → AM → HR đã qua. Gateway câu tự nhiên tại `apps/ai-service/app/authorization_gateway.py:340-358` hiện chỉ nhận diện accept/refuse/adjustment-request và gửi `assignmentId` + `action`, chưa chuyển `reason`/`evidenceRef`; các intent khác chưa được chứng minh nối từ câu tự nhiên đến preview.
- **P4:** service preview/confirm kết quả có trong `apps/api/src/services/revenue-kpi.service.ts` và decision trong `routes/chat.ts`; chưa chứng minh câu tự nhiên từ chat tạo proposal cho toàn bộ compute/reason/confirm/correct/close.
- **P5:** các proposal/API cho tạo kỳ, giao KPI và performance có trong `chat-authorization.service.ts`, `performance-kpi-action.service.ts`, `routes/chat.ts`. Có test route/service; chưa chứng minh mọi role gõ tự nhiên đều tạo đúng card/confirm. Model không được tự chọn điểm.
- **P6:** backend có gửi thông báo adjustment và `suggestSuitableCandidates` deterministic/advisory; chưa chứng minh câu tự nhiên “ai phù hợp” tạo card ở mọi role. Commit thông báo `b3ce637` trong nhánh bàn giao là phần chưa merge; shared inbox `ee38debd592e` chưa được tích hợp.
- Việc ghi qua chatbot phải qua proposal, người dùng xác nhận và server kiểm tra quyền/scope; không phải chatbot tự thay con người hoặc bypass role.

## Phân công KPI doanh thu

Theo `apps/api/src/services/revenue-kpi.service.ts:1037-1065` và test `revenue-kpi-assignment-actions.test.mjs:141-165`: HR phát hành; người được giao SM/AM có quyền trong scope xác nhận hoặc từ chối. Với yêu cầu điều chỉnh **cửa hàng**, SM gửi lý do/bằng chứng → AM độc lập xác minh → HR độc lập quyết định; nếu HR duyệt thì người nhận xác nhận lại. Khi HR duyệt điều chỉnh STORE, code yêu cầu trạng thái đã được AM xác minh. Không diễn giải thành AM duyệt thay HR; các luồng khác có điều kiện riêng.

## Atlas, tài khoản và release

- Git branch không chứa kết nối DB thật; kết nối được cấu hình theo service Render. Trước đó production Web/API đang chạy `fa91cde`, AI `4a05252`, `autoDeploy=no`; chưa deploy `82defe2` hoặc nhánh bàn giao.
- Log lịch sử từng ghi logical DB `hr_bot_test_363`; chưa xác minh Atlas cluster/database đang hiệu lực, dữ liệu còn thiếu hoặc quyền user. Fingerprint SSH Singapore đã khớp tài liệu Render nhưng API test/production trả `Permission denied (publickey)`. Không có URI DB trong môi trường; `mongosh`/`mongodump` không có trên PATH. Không in hoặc gửi secrets vào Git/chat.
- Chưa truy vấn/ghi Atlas, chưa backup hoặc restore. Trước mọi thay đổi dữ liệu/schema: xác nhận chính xác cluster/database, nguồn dữ liệu thật, backup ngoài Atlas và restore/canary; không dùng `scripts/import_to_atlas.py` vì script có thao tác drop collection. Không biến dữ liệu POS/lịch demo thành dữ liệu thật.
- Tài khoản/mật khẩu live và provider thật chưa được xác minh. Password hash không thể đọc ngược; dùng quy trình cấp/khôi phục tài khoản được quản trị viên duyệt.

## Bước tiếp theo cho đồng đội

1. Checkout nhánh bàn giao, xem diff so với `origin/deploy/f4-cloud-20261103`; phối hợp với Phi về commit `ee38debd592e` để tránh mất hoặc chép đè công việc mới.
2. Phân tích lỗi suite Mongo `evaluations already exists` và xác minh lại các phần bị ảnh hưởng; chỉ chạy lại kiểm thử cần thiết khi code, fixture, môi trường hoặc SHA thay đổi.
3. Hoàn thiện P3–P6 theo luồng câu tự nhiên → proposal → confirm → service và scope từng role; không coi test service đơn lẻ là chứng minh end-to-end.
4. Có quyền read-only thì xác nhận Atlas đúng đích và đối chiếu nguồn thật; chỉ ghi sau backup/restore và duyệt phạm vi. Deploy Render là quyết định riêng.
