# Chatbot models, Jev và xoay key — audit 2026-10-29

## Kết luận

**Chưa đạt end-to-end.** Gemini và UseJevAI thực sự trả lời được; UseJevAI dùng đủ bốn key ở smoke. Đường API hiện tại bị native Node fetch chặn bởi header `Keep-Alive`. Pool Gemini có round-robin nhưng cooldown không nhận đủ metadata lỗi từ AgentLoop. Các test mock fetch không phát hiện lỗi transport này.

Phạm vi read-only: source, tests hiện có, smoke tổng hợp offline/live. Không sửa source/tests/config; không commit/push/deploy; không ghi DB nghiệp vụ. Các live inference tạo run/tiêu quota upstream. Tiến trình FastAPI tạm đã dừng, cổng 18973 đã đóng. Không kiểm tra UI hoặc deployment Render.

Checkout lúc bắt đầu: `main...origin/main [ahead 1]`; có thay đổi user trong `apps/ai-service/tests/test_loop.py`, web và plans. Kết quả Python dùng bản test_loop.py đang sửa; không chứng nhận riêng HEAD sạch.

## Trade-offs và quyết định

| Hướng | Giả định chính | Điểm thất bại trước tiên | Khuyến nghị |
|---|---|---|---|
| Giữ Jev + Gemini, sửa các boundary hiện tại | Jev bổ sung chất lượng quyết định đủ bù latency | Deadline, quota, cache làm sai route/model | Ưu tiên sửa correctness; chưa đổi kiến trúc |
| Bỏ Jev bắt buộc trên mọi câu hỏi, dùng rule + một generation call | Phân loại trong generation đủ tốt | Intent/action sai trên câu mơ hồ | Chỉ quyết định sau paired evaluation |
| Thay bằng RAG/framework mới | Corpus tăng hoặc in-context thực sự không đủ | Chi phí migration che lỗi transport/cache đang có | Chưa có evidence cần làm |

Phương án tốt hơn việc rewrite ngay: sửa transport, deadline xuyên luồng, cache isolation, forwarding context và provenance; đo lại cùng dataset. Chưa có evidence ủng hộ thay stack.

## Evidence đã chạy

| Kiểm tra | Kết quả | Giới hạn |
|---|---|---|
| `pnpm --filter api build` | Pass `tsc` | Không chứng minh HTTP chạy được |
| `node --test --test-concurrency=1 test/gemini-key-pool.test.mjs test/chat-gateway.test.mjs` tại apps/api | 20 pass | Fetch được mock |
| Python pytest chọn 8 file: test_jev_usejevai, test_jev_approval, test_providers, test_loop, test_api, test_router, test_tools, test_agent_attachments | 81 pass, 7 fail, 14 subtests pass | Đã tắt dotenv, bỏ credential/DB env để test offline |
| Chẩn đoán 7 failures | test_api không cung cấp service key; nhận SERVICE_KEY_NOT_CONFIGURED trước hành vi cần test | Không sửa fixture hoặc nới authentication |
| FastAPI boundary độc lập bằng TestClient, key tổng hợp | Thiếu key 401; có key + provider fake 200 với citation; whitespace 422 | Không phải provider live |
| `python scripts/jev_gateway_live_check.py` | 4/4 intent đúng; 4 key mỗi key dùng một lần; 4375/5359/5969/5172ms | Bốn mẫu không phải benchmark; script không fail exit code khi in MISS |
| AgentLoop trực tiếp + Jev/Gemini live | 8703ms, policy_query, jev_usejevai, google-gemini-1, 1 citation, không degraded; trả đúng mốc 4 tiếng | Bỏ qua API gateway |
| API client thật + FastAPI local + native fetch | TypeError, UND_ERR_INVALID_ARG, invalid keep-alive header | Request chưa tới AI Service |
| Chẩn đoán downstream: bỏ Keep-Alive trong bộ nhớ, nạp key từ env AI và shared key tổng hợp | Low 9031ms; medium 9303ms; high degraded sau 15020ms | Không sửa source; không được gọi là gateway hiện tại pass; ba câu khác nhau để tránh cache |
| Live models low/medium trong chẩn đoán | HTTP 200 cho gemini-3.1-flash-lite và gemini-3.5-flash | High timeout chưa chứng minh model không tồn tại |
| Cấu hình local, chỉ in boolean/count | Root/API không có key LLM; apps/api/.env không tồn tại; AI env có 10 Gemini key, 4 Jev key; AI_SERVICE_API_KEY không có trong các file đã xét | Không suy ra cấu hình Render; DB Settings thật chưa kiểm tra |

Không có số p95, throughput hoặc accuracy tổng quát từ những lượt smoke này.

## Findings ưu tiên

1. **High — native fetch bị chặn.** `apps/api/src/services/ai-client.service.ts:295-308` tự đặt `Keep-Alive`. Node v24.11.1 trả `UND_ERR_INVALID_ARG: invalid keep-alive header` trước network. Test dùng mock fetch nên vẫn xanh.
2. **High — model/key failover vượt deadline.** API timeout toàn request 15s (`ai-client.service.ts:215-219`), mỗi Gemini provider 30s (`:267,281`), chain thử tuần tự (`apps/ai-service/app/llm/chain.py:120-137`). Jev chạy trước generation. High tier đã timeout ở smoke chẩn đoán; chưa có shared deadline/cancellation xuyên sidecar.
3. **High — Gemini cooldown mất nguyên nhân lỗi.** `AgentLoop.run`, `apps/ai-service/app/agent/loop.py:574-577`, thay lỗi provider cụ thể bằng `providerId=agent, code=LLM_UNAVAILABLE`. Smoke provider 429 xác nhận metadata này. `ai-client.service.ts:92-110` cần providerId/code gốc để đánh dấu key. Khi một provider fail nhưng provider sau thành công, chain cũng không trả lỗi trước đó (`chain.py:127-147`). Tất cả key đang cooldown còn bị đưa trở lại pool (`ai-client.service.ts:79-80`).
4. **High — context SM/store bị bỏ.** Route thêm `businessRole/storeName` (`apps/api/src/routes/chat.ts:35-39`) nhưng payload chỉ giữ bốn trường khác (`ai-client.service.ts:312-317`). Wire probe xác nhận chỉ role=Employee được gửi ở input SM tổng hợp. AI không nhận role nghiệp vụ/store để viết hướng dẫn tương ứng.
5. **High — cache không cách ly model/store.** `_QueryCache._make_key`, `loop.py:160-163`, chỉ dùng role + text. Smoke đổi Store A sang Store B và provider-A sang provider-new vẫn nhận provider-A, một lần gọi provider. Cache copy còn bỏ `decision_source` (`:175-191`). Chưa chứng minh rò dữ liệu cá nhân; đã chứng minh sai isolation/provenance.
6. **High — citation guard bị bypass.** Nhánh Jev yêu cầu generation JSON không có intent (`loop.py:455`), nhưng kiểm tra thiếu citation bằng `answer.intent` optional (`:59,566-567`). Smoke decision=policy_query, reply không citation, không intent vẫn trả `abstain=false, degraded=false`.
7. **High — Jev budget 6s không phải toàn giao dịch.** `jev_usejevai.py:182-183,212-214`: deadline bắt đầu sau submit; từng HTTP nhận toàn timeout. Fake clock chứng minh POST 5.5s + GET 5.5s được nhận success với budget 6s.
8. **High — stale success xóa cooldown Jev.** `jev_usejevai.py:85-89`: report_ok xóa cooldown do request khác vừa nhận 429. Smoke report_failure(rate) rồi report_ok cũ làm cooldown 60s thành 0; key được acquire lại. Pool chưa giữ slot in-flight để áp trần ba run/account.
9. **High — malformed upstream không vào fallback.** Poll `{data:null}` gây AttributeError, không phải UseJevError (`jev_usejevai.py:224-230`). Strict AgentLoop re-raise lỗi này (`loop.py:586-592`); không được degrade theo outage contract. Poll 402/403 cũng chưa cập nhật disable key (`jev_usejevai.py:215-222`).
10. **High — provenance do LLM điều khiển được.** Gateway fallback validate thẳng JSON thành TypedDecision (`jev_gateway.py:186-200`); schema cho source và probabilities (`:35-37`). Smoke chạy nhánh LLM nhưng model payload được nhận là jev_systemone, probability -1.0. Nguồn quyết định phải do ứng dụng gán; chưa phải auth bypass.

## Scenario Report — one-shot

Đã phân tích cả 12 dimensions. Không bỏ dimension nào: tải, locale/runtime, PII và outage đều có thể xuất hiện trong vòng đời chatbot. UI visual/a11y không thuộc audit source/backend lần này; không có kết luận giao diện.

Các mức severity dưới đây là **tác động của scenario**, không đồng nghĩa mọi scenario đã là vulnerability được chứng minh.

| # | Dimension | Scenario / trigger | Severity | Invariant và expected behavior | Test target / evidence |
|---|---|---|---|---|---|
| 1 | User Types | SM có auth role Employee hỏi hướng dẫn duyệt | High | businessRole/store phải tới AI; hướng dẫn đúng thẩm quyền | routes/chat:35-39; ai-client:312-317; wire probe xác nhận mất context |
| 2 | Input Extremes | Message chỉ whitespace | Medium | Reject trước model, không tiêu quota | FastAPI boundary smoke: 422 |
| 3 | Timing | Submit 5.5s rồi poll 5.5s, budget 6s | High | Một deadline cho toàn transaction; không success sau budget | UseJevClient fake-clock smoke: 11s vẫn success |
| 4 | Scale | Bốn request dùng một key Jev cùng lúc | High | Không vượt giới hạn upstream ba concurrent run/account | acquire không giữ slot; chưa load-test live |
| 5 | State Transitions | Request cũ success sau request mới 429 | High | Success cũ không hủy cooldown mới | report_failure/report_ok smoke: 60s thành 0 |
| 6 | Environment | API chạy native fetch trên Node v24.11.1 | High | HTTP request tới sidecar, không header forbidden | Native smoke: invalid keep-alive header |
| 7 | Error Cascades | Upstream trả HTTP 200 với data=null | High | Lỗi contract thành upstream failure, fallback minh bạch | Poll smoke: AttributeError; mapping hiện thiếu |
| 8 | Authorization | Shared service key thiếu/sai | High | Fail-closed 503/401; test nghiệp vụ phải dùng key tổng hợp hợp lệ | test_api 7 fail do fixture; boundary smoke có key pass |
| 9 | Data Integrity | Cùng câu/role, đổi store hoặc model config | High | Không trả cache từ scope/config cũ | Smoke provider-new nhận provider-A; cache key thiếu scope/config |
| 10 | Integration | Gemini 429 đi qua AgentLoop tới API | High | Giữ providerId/code để cooldown đúng key | Smoke chỉ còn agent/LLM_UNAVAILABLE |
| 11 | Compliance | Người dùng chèn PII thật vào tin nhắn gửi Jev/Google | Critical | Chỉ chuyển dữ liệu được phép, có retention/data-processing policy | Cần kiểm chứng chính sách và data-flow; CHƯA chạy bằng PII, không khẳng định đã có breach |
| 12 | Business Logic | Jev policy_query; generator thiếu intent/citation | High | Policy không evidence phải abstain | Smoke policy_query, citations=[], abstain=false |
| 13 | Integration | LLM fallback tự trả source=jev_systemone | High | Provenance do code gán, probability hữu hạn 0..1 | Gateway smoke chấp nhận nguồn giả và probability -1 |
| 14 | Timing | High model chậm trong chain có Jev trước | High | Đủ budget cho generation/fallback hoặc trả lỗi đúng trước deadline | Diagnostic live high timeout 15020ms |
| 15 | State Transitions | Lặp câu hỏi vừa được Jev/rule phân loại, cache hit | Medium | Cache giữ nguồn gốc thực; không nhận là quyết định mới | decisionSource từ rule thành null ở smoke |

Tổng: **15 scenarios / 12 dimensions: 1 Critical, 12 High, 2 Medium, 0 Low.** Critical là risk cần đánh giá, không phải phát hiện exfiltration.

## Research/optimize nên làm

1. Sửa các lỗi boundary đã chứng minh trước khi benchmark. Không dùng kết quả hiện tại để biện minh cho rewrite.
2. Paired evaluation cùng câu hỏi/role/store: rule + Gemini so với Jev + Gemini. Dùng nhãn người cho policy-vs-action, approval, incident và citation correctness; không tự coi confidence=1.0 là đúng.
3. Đo intent confusion/F1, sai đề xuất hành động, citation correctness/abstention, degraded rate, latency p50/p95 và chi phí/run. Chốt ngưỡng chấp nhận trước phép đo; chưa tự đặt SLA mới.
4. Giữ Jev trong đường bắt buộc chỉ khi gain thực tế bù latency/quota. Nếu không, cân nhắc chỉ dùng cho intent hành động/mơ hồ; đây là lựa chọn cần data, chưa triển khai.
5. `eval/run_eval.py:183-184` đang chạy retrieval + answer_policy, không gọi AgentLoop/Jev; số eval lexical không chứng minh chất lượng phối hợp chatbot hiện tại.

## Vận hành, bảo mật và ảnh hưởng đội

- Theo dõi latency riêng decision/generation, quota/cooldown, fallback reason, cache hit và model thực dùng. Không ghi key, raw upstream body hoặc tin nhắn PII vào log.
- Key rotation hiện là bộ nhớ cục bộ; không đồng nghĩa hot-reload/secret revocation toàn hệ thống. Chưa kiểm chứng thay credential khi đang chạy hoặc phân phối state đa worker.
- Không dùng Jev approval probability để cấp quyền. Quyền nghiệp vụ và confirmation phải do ứng dụng kiểm soát.
- Cache sửa cần bảo vệ business scope, provider/config version và provenance; chưa có evidence cần Redis cho quy mô hiện tại.
- Cập nhật regression ở boundary native HTTP, quota metadata, cache isolation, citation guard, Jev deadline/cooldown. Không pin thêm test source-text/model-name thay cho behavior.
- Đồng bộ ADR-019 và tài liệu eval với số đo thực sau khi sửa; không công bố smoke nhỏ thành benchmark tổng quát.

## Giới hạn / câu hỏi còn mở

- Chưa đánh giá cấu hình Settings DB thật, service-key/provider env trên Render, UI và authentication E2E bằng tài khoản thật.
- Chưa chứng minh tất cả 10 Gemini key live hoạt động; bốn Jev key đã chạy mỗi key một lần. Chưa live-inject 401/402/403/429; các lỗi dùng transport giả và test offline.
- High model chưa hoàn tất trước API deadline, không đủ kết luận model ID sai hay provider không hỗ trợ.
- Chưa có paired dataset để kết luận Jev tăng accuracy hoặc giảm rủi ro; lần low diagnostic có intent shift_operation cho câu hỏi thông tin, cần đưa vào eval.
- Chính sách cho phép gửi dữ liệu nhân sự ra provider, retention và SLA chấp nhận vẫn cần nguồn nghiệp vụ; không thể suy ra từ source.
