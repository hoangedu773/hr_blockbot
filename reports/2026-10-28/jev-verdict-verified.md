# Kiểm định lại: có nên thêm `dzhng/jevgrep` vào hr-blockbot?

- **Thời điểm điều tra:** 2026-10-28 22:43 (GMT+7)
- **Nguồn ngoài:** README + `docs/architecture.md` của `dzhng/jevgrep`; trang giá Jev trên Vercel AI Gateway; UseJevAI pricing; bài kỹ thuật về payload `noul/choice/score`
- **Nguồn nội bộ:** `apps/ai-service/app/agent/jev_gateway.py`, `agent/loop.py`, `config.py`, `rag/retrieval.py`, `eval/run_eval.py`, `.env`, `.env.example`
- **Bản này thay thế** `reports/2026-10-28/jev-grep-architecture-eval.md` (bản trước kết luận đúng nhưng bỏ sót ràng buộc "không có tiền" của bạn, và khuyên một việc bạn không làm được).

---

## TL;DR

**Không thêm `jevgrep`.** Nhưng lý do không phải "repo dở" — mà vì nó **không mang Jev đến**, và **bài toán của nó không phải bài toán của bạn**.

Quan trọng hơn: **"không có tiền dùng Jev" là tiền đề sai**. Jev trên Vercel AI Gateway giá **$0,04 / 1M input token**, có credit miễn phí, và mỗi lần gate chỉ tốn ~300 token → **~$0,00001/lần**. Toàn bộ khóa luận dùng thật chỉ tốn vài cent. Vấn đề của bạn **không phải tiền, mà là `.env` chưa có key nào cả** — kể cả key LLM.

---

## 1. Bằng chứng kiểm chứng được (không suy đoán)

| # | Kiểm tra | Kết quả thật |
|---|---|---|
| 1 | `POST https://thejevai.com/v1/systemone` với body rỗng | **HTTP 401** trong 0,47s → endpoint **sống**, chỉ thiếu auth. Đây không phải URL bịa. |
| 2 | Key trong `.env` (chỉ đọc tên biến) | Chỉ có `ATLAS_URI`. **Không có `JEV_API_KEY`, không có `LLM_API_KEY`.** |
| 3 | Key trong `apps/ai-service/.env.example` | `PORT`, `MONGODB_URI`, `API_BACKEND_URL`, `AI_AGENT_ENABLED`, `AI_SERVICE_API_KEY` — **không có biến LLM nào**. |
| 4 | `config.py:71-72` | `jev_api_key: str = ""`, `jev_model = "typesafe/jev-1.14"` |
| 5 | `loop.py:373-375` | `if active_jev_key: decision = self.gateway.decide(text)` — **không key thì không bao giờ gọi gate** |
| 6 | `jev_gateway.py:80-96` | Có key → `_system_one()`; không key → LLM ép JSON 3 khóa (nhánh "fake") |

**Suy ra chính xác cái đang chạy hôm nay:** không có `JEV_API_KEY` → rơi xuống nhánh fallback; nhưng fallback cần `ProviderChain`, mà chain rỗng vì không có `LLM_API_KEY` (`default_chain()` trả `ProviderChain([])`) → cuối cùng chỉ còn `classify()` rule-based ở `matching`/router. **"Jev fake cùi" thực chất là rule-based, chưa từng chạm tới LLM.** Đây là lỗi cấu hình, không phải lỗi kiến trúc, và cũng không phải thứ `jevgrep` sửa được.

---

## 2. Vì sao `jevgrep` không port được (lệch domain, không phải lệch chất lượng)

`jevgrep` là CLI `jg "mô tả hành vi" ./repo` cho **coding agent tìm file trong codebase lạ**. Giá trị thật của nó nằm ở:

- Duyệt cây thư mục theo metadata + preview nội dung;
- **tree-sitter WASM** để cắt declaration cho Python/Go/Rust/TS (không cần cài Python);
- Giữ nguyên byte gốc, không tái tạo code từ AST;
- Ngân sách byte cho navigation, báo cáo "discovery chưa đầy đủ" một cách trung thực.

Đối chiếu với hr-blockbot:

| | `jevgrep` | hr-blockbot |
|---|---|---|
| Đơn vị tri thức | file / declaration / call-site trong source code | `PolicyChunk` (điều khoản quy chế) trong `policies` |
| Cách truy hồi | LLM chấm relevance theo cây thư mục | BM25 (thuần Python) + `$vectorSearch` + RRF, `retrieval.py` |
| "Jev" ở đâu | Model thuê bao, gọi qua Vercel AI Gateway / TypeSafe / OpenRouter | Cùng model đó, gọi qua `thejevai.com/v1/systemone` |
| Đầu ra | excerpt verbatim cho agent đọc | câu trả lời có citation cho nhân viên |

Thêm `jevgrep` vào repo này = thêm Node 22 CLI + gửi source code lên cloud + một tính năng **không phục vụ nghiệp vụ nào**. Giám khảo sẽ hỏi đúng một câu: *"tính năng này giải quyết vấn đề gì của chuỗi Guta Cafe?"* — và không có câu trả lời. Đó là **trừ điểm**, không phải cộng điểm.

Điểm chí mạng: `jevgrep` **là khách hàng của Jev, không phải nhà cung cấp Jev**. Cài nó không làm bạn "có Jev thật" — bạn đã có đường gọi Jev thật rồi (và nó trả 401, tức là sống).

---

## 3. Chi phí thật của Jev — "không có tiền" không phải ràng buộc

| Kênh | Giá | Ghi chú |
|---|---|---|
| Vercel AI Gateway (`typesafe-ai/jev`, `jev-1.14.0`) | **$0,04 / 1M input token**, context 32K | Có cột **Free AI Gateway Credit** → dùng credit free là đủ cho demo/khóa luận |
| UseJevAI | **$10 one-time** mua token, $0,21–0,42 / 1M | Có **trial token miễn phí** để test trước khi trả tiền; token mua không hết hạn |
| Tự gọi `thejevai.com` (như code hiện tại) | chưa rõ bảng giá công khai | Endpoint sống (401), nhưng **hợp đồng payload chưa đối chiếu tài liệu chính thức** |

Tính toán cho đúng bài toán của bạn — một lần gate gồm `state` (tin nhắn nhân viên, ~100 token) + `questions` (3 câu, ~200 token) ≈ **300 token**:

```
$0,04 / 1.000.000 token  ×  300 token  ≈  $0,000012 / lần gate
→ 1.000 lượt hỏi  ≈ $0,012
→ 100.000 lượt hỏi ≈ $1,2
```

**Kết luận:** chi phí để "có Jev thật" trong khóa luận nằm ở mức **một ly cà phê**, và có đường **$0** (credit Vercel / trial token). Ràng buộc thật là bạn chưa đăng ký key, không phải bạn không đủ tiền.

---

## 4. Cái *thực sự* cộng điểm — 3 lựa chọn xếp theo ROI

### A. Bật gate thật, rồi **đo calibration** (khuyến nghị số 1, ~$0)

Jev trả **xác suất** cho `noul`, nhãn cho `choice`, điểm cho `score`. Đó là nguyên liệu để làm một phần đánh giá mà hầu hết đồ án chatbot không có:

- `choice` (intent): **top-label ECE** + negative log-likelihood + confusion matrix 4 lớp;
- `noul` (needs_manager_approval): **Brier score** + reliability diagram;
- `score` (incident_urgency): **MAE** + tỉ lệ bỏ sót mức khẩn cấp.

Đây là đóng góp học thuật thật: *"cổng quyết định có xác suất, đã hiệu chuẩn, đo được"* — mạnh hơn hẳn một CLI tìm code. Chi phí: ~40–60 mẫu gán nhãn tay (`eval/dataset.jsonl` hiện có 40 mẫu nhưng là cho RAG, cần bộ riêng cho gate) + một script chấm điểm. Không cần sửa kiến trúc, chỉ cần key.

### B. Nếu tuyệt đối không đăng ký key: làm fallback cho **trung thực**, đừng giả vờ

Hiện trạng tệ nhất không phải "fake cùi", mà là **báo cáo có thể đang mô tả một hệ thống không chạy**. Nếu giữ fallback:

1. Trả `degraded: true` + `decisionSource: "rule" | "llm_fallback" | "jev"` trong response;
2. Ghi thẳng trong báo cáo: *"gate chạy rule-based vì chưa cấp credential; đã đo X% accuracy trên Y mẫu"*;
3. Tuyệt đối không viết "hệ thống dùng System One Decision Model" khi `JEV_API_KEY` rỗng — đó là điểm trừ nặng nếu giám khảo mở `.env` hoặc hỏi demo trực tiếp.

### C. (Tuỳ chọn, ưu tiên thấp) Mượn *kỷ luật truy hồi* của `jevgrep` cho RAG

Đây là phần duy nhất của `jevgrep` có giá trị chuyển giao, và nó **không cần cài `jevgrep`**:

| Pattern trong `jevgrep` | `retrieval.py` hiện tại |
|---|---|
| "Giữ mọi file **vượt tiêu chí relevance**, không cắt top-N cố định" | Cắt cứng `top_k` (`settings.top_k`) — chunk đúng nhưng xếp hạng 6 sẽ bị bỏ |
| "Relevance và scope là hai phán đoán tách biệt" | Có `_in_scope()` — đã tách đúng |
| "Báo cáo partial/unknown trung thực" | Có `abstained` + `reason` — đã có, nhưng chỉ theo ngưỡng điểm, không có phán đoán ngữ nghĩa |
| "Nguồn truy hồi là dữ liệu, không phải chỉ dẫn" | Đã có trong system prompt của gate |

Nếu muốn thêm đúng **một** điểm mới: thêm một **relevance gate** (LLM/Jev chấm từng chunk có trả lời được câu hỏi không, giữ tất cả chunk đạt, bỏ top-N cứng). Đo được ngay bằng harness có sẵn (`recall@1/3/5`, `citation_hit`, `abstain_rate`, `false_answer_rate` trong `eval/run_eval.py`). Jev có sẵn template **"RAG context relevance"** cho đúng việc này — dùng chung key với cổng quyết định.

Nhưng đây là **feature riêng**, không phải "thêm jevgrep", và nên làm **sau** khi A xong.

---

## 5. Chưa kiểm chứng / rủi ro còn mở

- **Chưa test `jg` thật** và chưa gọi Jev thật (không có key) — mọi con số chi phí là tính từ bảng giá công khai, không phải hoá đơn thực tế.
- **Hợp đồng payload của `thejevai.com` chưa đối chiếu tài liệu chính thức.** Từ vựng `type: choice | noul | score` khớp với tài liệu công khai (chỉ chấp nhận chữ thường `noul/choice/score`), nhưng host chính thức được tài liệu hoá là Vercel AI Gateway / TypeSafe. Đã xác nhận host trả envelope `{code, message, data}` đúng như code kỳ vọng (`body["code"] != 0` → lỗi), và key sai trả `{"code":-1,"message":"Invalid API key."}`. **Chưa** xác nhận được shape của response thành công (`data.result.answers`) vì chưa có key hợp lệ.
- `_system_one` dùng `criteria` dạng dict cho `choice` và list 2 mốc cho `score`; shape này chưa được kiểm chứng bằng response thật.
- Chưa đo latency thật của gate (~100ms là con số trong tài liệu, không phải số đo trên máy bạn).

---

## 6. Việc nên làm, theo thứ tự

1. **Đăng ký key** (Vercel AI Gateway free credit hoặc trial token UseJevAI) → set `JEV_API_KEY` → chạy **một** lần `decide()` thật, xác nhận `code == 0` + 3 answer đúng type. Nếu 400: sửa `_system_one` theo payload chính thức, không sửa gì khác.
2. **Gán nhãn 40–60 mẫu** cho gate (intent + approval + urgency) → viết script chấm Brier/ECE/MAE → đưa bảng vào báo cáo. Đây là điểm cộng thật.
3. **Thêm `decisionSource` + `degraded`** vào response để không bao giờ mô tả sai hệ thống đang chạy.
4. **Không cài `jevgrep`.** Nếu vẫn thích ý tưởng, làm mục 4C (relevance gate cho RAG) như một feature độc lập, sau khi 1–3 xong.

---

## 7. Đăng ký ở đâu, "free hay auth"? (kiểm chứng 28/10 22:50)

**Trả lời ngắn: là auth.** Không phải thiếu quyền gì kỳ lạ — chỉ thiếu bearer token. Bằng chứng: gửi key rác `sk_bogus...` → `HTTP 401 {"code":-1,"message":"Invalid API key."}`. Envelope `{code, message}` khớp đúng thứ `_system_one` đang parse.

Nhưng **key phải do đúng host cấp**. Key của Vercel (`vck_...`) hay UseJevAI **không** dùng được cho `thejevai.com` — 3 cửa này là 3 API khác nhau, không phải 3 cách thanh toán của một API:

| Cửa | Miễn phí? | Wire format | Khớp code hiện tại? |
|---|---|---|---|
| **thejevai.com** | Playground **free** (không cần thẻ). API cần credit: Starter **$10 = 100k credit không hết hạn**, nhưng trang giá ghi "API access" ở gói **$100** → phải hỏi support trước khi trả tiền | `POST /v1/systemone`, `questions` là **object có `criteria`**, model `typesafe/jev-1.14`, env `JEV_API_KEY` | **Khớp 100%** — repo rõ ràng được viết theo tài liệu site này |
| **usejevai.com** | **Có trial token thật** (`funding: "prefer_trial"`): 3 run song song, 20 attempt/phút, 10k token/run | `POST /api/v1/runs` rồi poll `GET /api/v1/runs/{id}`; `questions` là **array có `id` + `options`** | **Không khớp** — cần adapter ~50 dòng |
| **Vercel AI Gateway** | Có **Free AI Gateway Credit**, giá rẻ nhất ($0,04/1M) | `experimental_decide` của AI SDK (TS); Python phải tự dựng REST, **chưa có tài liệu xác nhận** | **Không khớp**, và rủi ro nhất cho deadline |

### Việc nên làm, đúng thứ tự (10 phút, $0)

1. **Chơi playground thejevai.com trước, chưa trả đồng nào.** Dán 3 câu hỏi của bạn (`intent` / `needs_manager_approval` / `incident_urgency`) với ~10 tin nhắn tiếng Việt thật của nhân viên. Câu hỏi cần trả lời trước khi bỏ tiền **không phải "Jev có free không"** mà là **"Jev phân loại tiếng Việt F&B có tốt hơn `classify()` không"**. Nếu playground trả sai bét → dừng, không đáng đi tiếp.
2. **Nếu playground ổn:** xem gói $10 có bật API không. Có → mua, đây là đường ít sửa code nhất. Không (chỉ $100) → **đừng mua**, sang trial token của UseJevAI và viết adapter.
3. **Chạy smoke test trước khi sửa bất cứ dòng code nào:**
   ```bash
   python scripts/jev_smoke.py --dry-run          # xem payload gửi đi
   JEV_API_KEY=sk_... python scripts/jev_smoke.py # gọi thật, in status + chẩn đoán
   ```
   Script phân biệt rõ 401 (key sai) / 402-403 (hết credit) / 400 (sai shape) / 200-nhưng-code≠0 (Jev từ chối), và kiểm tra hợp đồng 3 answer đúng `choice/noul/score` — đúng thứ `_system_one` sẽ vấp.

### Bẫy hạ tầng phát hiện được khi test (quan trọng)

`thejevai.com` nằm sau **Cloudflare** và chặn theo User-Agent:

```
curl (UA mặc định)        → 401  ✅ qua được
curl -A "Python-urllib/*" → 403  ❌ "error code: 1010"
curl -A "python-httpx/*"  → 401  ✅ qua được
```

App dùng `httpx` nên **không bị**, nhưng mọi script bạn tự viết bằng `urllib` hay `requests` với UA mặc định sẽ nhận 403 khó hiểu, rồi `_system_one` nuốt thành `LLMUnavailable(DECISION_UNAVAILABLE)` và bạn sẽ tưởng là key sai. `scripts/jev_smoke.py` đã set UA giống client thật để tránh đúng cái bẫy này.

---

## 8. Đã setup lặp key UseJevAI và đo thật (28/10 23:05)

4 key trial đã được cấu hình vào `apps/ai-service/.env` (gitignored), không nằm trong file tracked nào.

### Trạng thái dịch vụ & key

```
GET /api/jev/status → {"inferenceEnabled":true,"publicApiEnabled":true,"trialEnabled":true}
GET /api/v1/runs?limit=1 → 200 với cả 4/4 key  (646–1107ms)
```

### Một run thật (trial, $0)

| Trường | Giá trị |
|---|---|
| model | `typesafe/jev-1.13-20260917` |
| funding | `trial` |
| input tokens | 474 |
| cost | **$0,0000199** |
| elapsed (server) | 423ms |
| kết quả | `intent=shift_operation` (p=1.0), `needs_manager_approval=0.81`, `incident_urgency=0.05` |

Jev trả **xác suất đầy đủ** (`probabilities` cho choice/score, `confidence`), đúng nguyên liệu để tính Brier/ECE/MAE ở §4A.

### Kiểm tra qua code thật (`JevGateway.decide` → `_usejevai`)

```
ok    intent=shift_operation  approval=0.75 urgency=0.01  2437ms
ok    intent=policy_query     approval=0.42 urgency=0.00  2578ms
ok    intent=cash_audit       approval=0.60 urgency=0.09  2594ms
ok    intent=general_chat     approval=0.24 urgency=0.00  2578ms
```

4/4 phân loại đúng; mỗi key được dùng đúng 1 lần → **rotation chạy đúng round-robin**.

### Số đo trung thực — đừng trích "~100ms"

Đường trial là **API xếp hàng**: `POST` (202) → poll `GET /api/v1/runs/{id}` → `succeeded`. Tổng thời gian thực tế **~2,5s/lần quyết định** (server báo 423ms, phần còn lại là chờ hàng đợi). Giảm `poll_interval` từ 1,2s xuống 0,5s **không** cải thiện (2,44s vs 2,59s) → nút thắt ở phía hàng đợi, không phải vòng poll. Con số "~100ms" trong tài liệu là thời gian suy luận, không phải end-to-end.

Hệ quả cho demo: mỗi lượt chat cộng ~2,5s. Chấp nhận được, và `QUERY_CACHE` trong `loop.py` đã chặn phần lặp lại. Nếu cần nhanh hơn: dùng `JEV_API_KEY` (thejevai.com, gọi đồng bộ) thay vì pool trial.

### Files đã thêm/sửa

| File | Thay đổi |
|---|---|
| `app/agent/jev_usejevai.py` | **mới** — transport + `UseJevKeyPool` (round-robin, disable khi 401/hết quota, cooldown khi 429) + poll tới `succeeded` |
| `app/agent/jev_gateway.py` | thêm `pool`, `enabled`, `_usejevai()`, `usejevai_questions()`; `decide()` ưu tiên `JEV_API_KEY` → pool → fallback |
| `app/agent/loop.py` | cổng gate bật khi có **một trong hai** loại key (`jev_configured`) |
| `app/config.py` | 4 setting mới: `jev_usejevai_keys/base_url/timeout_ms/cooldown_seconds` |
| `start.py` | load `.env` bằng `python-dotenv` (trước đây app **không** đọc `.env`, chỉ test đọc) |
| `tests/test_jev_usejevai.py` | **mới** — 15 test (rotation, 401/quota/429, poll, timeout, 202) |
| `.env.example` | khai báo 6 biến `JEV_*` (không có giá trị thật) |
| `scripts/jev_usejevai_probe.py`, `scripts/jev_gateway_live_check.py` | **mới** — chẩn đoán key và kiểm tra live qua code thật |

**Test:** `python -m unittest tests.test_jev_approval tests.test_jev_usejevai` → **18/18 OK**.

### Bẫy đã gặp (ghi lại để không mất thời gian lần nữa)

- Submit trả **`202 Accepted`**, không phải `200`. Client đầu tiên chỉ nhận 200/201 → coi là lỗi server và xoay hết 4 key vô ích. Đã có test hồi quy.
- Response **không** phải `data.result.answers` như `thejevai.com`; nó là `data.result.response.answers` → `{type, choice|noul|score, probabilities, confidence}`.
- `questions` ở đây là **array có `id`/`options`**, khác `object + criteria` của `thejevai.com`.
- Trial: 3 run song song, 20 attempt/phút **mỗi tài khoản**, 10.000 input token/run, và dùng chung ngân sách toàn site → 4 key ≈ 12 run song song, 80 attempt/phút.

---

## 9. Rà cấu trúc tích hợp + đồng bộ docs & diagram (23:30)

### 9.1 Bốn lỗ hổng tích hợp tìm thấy và đã sửa

| # | Lỗ hổng | Hậu quả nếu để nguyên | Sửa |
|---|---|---|---|
| 1 | `TypedDecision` **vứt bỏ xác suất** Jev trả về | Không thể tính Brier/ECE — mất đúng thứ làm Jev có giá trị học thuật | thêm `intent_probabilities`, `intent_confidence`, `source` |
| 2 | Không có **provenance**: response không nói quyết định đến từ đâu | Báo cáo/demo có thể nói "dùng Jev" khi thực tế chạy rule | `TypedDecision.source` → `AgentTurn.decision_source` → `decisionSource` |
| 3 | Hết trial key ⇒ `decide()` raise ⇒ **cả lượt chat 503** | Demo chết giữa buổi vì cạn quota 4 key | bắt `LLMUnavailable` trong `loop.py`, rơi về đường 3 với `degraded=True` |
| 4 | `apps/api` dùng Zod object (strip unknown) ⇒ **`decisionSource` bị bỏ** ở biên | Field mới không bao giờ tới web client | thêm vào `chatResultSchema` + `ChatResult` + route + socket emit |

Điểm 4 là loại lỗi chỉ lộ khi chạy thật: ai-service trả field, TypeScript vẫn compile sạch, nhưng client không bao giờ thấy.

### 9.2 Docs đã cập nhật

| File | Thay đổi |
|---|---|
| `docs/03-decision-records/ADR-019-...md` | `Status` ghi revised 2026-10-28; §2.2 thay "~100ms" bằng **bảng 3 đường gọi** + quy tắc xoay key + suy giảm có khai báo; thêm **§3.3 Đo lường & giới hạn đã biết** |
| `docs/21-chatbot-architecture.md` | D-21.1 hết claim "~100ms"; §6.1 viết lại thành "ba đường gọi, không phải một" + 6.1.1 primitive + 6.1.2 xoay key + 6.1.3 suy giảm có khai báo + 6.1.4 số đo |
| `docs/09-ai-evaluation.md` | thêm **§6.5 Cổng quyết định Jev**: Brier/ECE cho `choice`, Brier cho `noul`, MAE cho `score`, cảnh báo `intent_confidence` bão hoà 1.0, cấm gộp dòng `llm_fallback`/`rule` với `jev_*` |

### 9.3 Diagram

- `scripts/generate-chatbot-architecture-diagram.mjs`: node `s-jev` → sub `DECISION GATE`, desc `System One · sync key / trial key pool / degraded fallback`; narrative chapter 1 viết lại (2 chỗ: mảng `views` và template HTML) — bỏ "~100ms", thêm 3 đường + số đo.
- Regenerate → `docs/diagrams/chatbot-architecture.{json,svg,html}`; đã kiểm: `"100ms structured"` = 0 lần, `"degraded fallback"` = 3 file.
- **`apps/web/public/diagrams/chatbot-architecture.html` KHÔNG được sinh bởi script này** — nó mang thêm protocol iframe (`TOGGLE_MOTION`, `FIT_VIEW`, `DIAGRAM_READY`) mà generator hiện tại không phát ra. Copy đè từ `docs/` sẽ **làm hỏng** landing test và mất protocol. Nên đã patch tại chỗ đúng 2 chuỗi (desc + narrative), giữ nguyên toàn bộ code protocol.

### 9.4 Kiểm chứng sau khi sửa

| Lệnh | Kết quả |
|---|---|
| `python -m unittest tests.test_jev_approval tests.test_jev_usejevai` | **21/21 OK** (thêm 3 test: map xác suất, primitive sai, `NO_KEY_AVAILABLE`) |
| `npx tsc --noEmit` (apps/api) | **exit 0** |
| `node --test test/chat-gateway.test.mjs` (apps/api) | **6/6 pass** |
| `node --test apps/web/test/landing-workflow.test.mjs` | **4/4 pass** |
| `python scripts/jev_gateway_live_check.py` | 4/4 intent đúng, `src=jev_usejevai`, `p=1.00` |

---

## 10. Kịch bản biên của cổng quyết định (rà soát trước khi demo)

Chỉ các chiều áp dụng được cho một cổng gọi mạng có xoay key; chiều bỏ qua ghi rõ lý do.

| # | Chiều | Kịch bản | Mức | Hành vi mong đợi | Trạng thái |
|---|---|---|---|---|---|
| 1 | Error cascade | Cạn cả 4 trial key giữa phiên | **Critical** | Không 503: rơi về `llm_fallback`/`rule`, `degraded=true`, `decisionSource` khác `jev_*` | ✅ có test `test_exhausted_keys_raise_no_key_available` + nhánh bắt trong `loop.py` |
| 2 | Timing | Jev trả `queued` mãi (hàng đợi tắc) | High | Hết `JEV_USEJEVAI_TIMEOUT_MS` → `timeout` → suy giảm như #1, không treo request | ✅ test `test_poll_timeout`; ⚠️ timeout 15s > `decision_timeout_ms` 5s, cần cân nhắc khi demo |
| 3 | Integration | Submit trả `202` chứ không `200` | High | Nhận 202 là thành công | ✅ test `test_submit_accepts_202_accepted` (đã từng fail thật) |
| 4 | Data integrity | Key bị 401 giữa lúc poll (bị thu hồi) | High | Disable key, raise `auth` → suy giảm; **không** đổi key giữa một run (run thuộc tài khoản đó) | ✅ code; ⚠️ chưa có test riêng cho nhánh poll-401 |
| 5 | Timing | 2 request đồng thời cùng key, vượt 3 run song song | Medium | 429 → cooldown 60s → key khác nhận | ✅ `test_rate_limit_cools_down_then_recovers`; ⚠️ chưa test đồng thời thật (thread) |
| 6 | Input extremes | Tin nhắn > `request_max_chars` (2000) | Medium | `ValueError` trước khi gọi mạng | ✅ guard có sẵn trong `decide()` |
| 7 | Business logic | `choice` trả nhãn ngoài 4 intent | High | `ValidationError` → `DECISION_INVALID` → suy giảm | ✅ `Literal` + test `test_invalid_primitive_type_is_rejected` |
| 8 | Data integrity | `noul`/`score` trả `bool` hoặc ngoài [0,1] | Medium | `strict=True` + `ge/le` chặn | ✅ `TypedDecision` + `test_jev_approval` |
| 9 | Compliance | Log lộ key | **Critical** | Chỉ log dạng mask `sk_Dxl…smLQ`; body lỗi không chứa key | ✅ `snapshot()` mask + test `test_snapshot_masks_keys` |
| 10 | Environment | Chạy sau proxy/UA lạ → Cloudflare 403 `1010` | Medium | Chẩn đoán đúng là UA, không phải key | ✅ `scripts/jev_smoke.py`; ⚠️ `jev_usejevai.urllib_transport` đã set UA, nhưng nếu đổi sang `requests` phải nhớ |
| 11 | State transition | Đổi `JEV_USEJEVAI_KEYS` lúc đang chạy | Low | Pool mới theo chuỗi key mới; pool cũ còn trong `_POOLS` (rò rỉ nhỏ, không ảnh hưởng hành vi) | ⚠️ chưa dọn cache — chấp nhận |
| 12 | Scale | 60 câu eval liên tiếp | High | 60 × ~3s ≈ 3 phút; 4 key × 20 attempt/phút ⇒ ~5 phút là sát trần | ⚠️ **chưa chạy**; nếu eval 60 mẫu phải bật `timeout` và chạy theo lô |

**Ba việc nên làm trước khi bảo vệ:** (a) hạ `JEV_USEJEVAI_TIMEOUT_MS` xuống ~8s cho khớp cảm giác chờ của
người dùng, (b) chạy thử một lô 20 câu để biết 429 xuất hiện ở đâu, (c) in `decisionSource` lên UI demo để
người xem thấy Jev đang chạy thật.

---

*Báo cáo dựa trên: đọc mã nguồn trực tiếp, gọi HTTP thật (curl + 3 script), đọc bảng giá 3 nhà cung cấp, 3 lần chạy Jev thật qua trial token, và 4 bộ test đã chạy sau khi sửa. Không có key nào bị in ra ngoài dạng mask.*
