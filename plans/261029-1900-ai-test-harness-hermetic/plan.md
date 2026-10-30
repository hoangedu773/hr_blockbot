---
plan: ai-test-harness-hermetic
created: 2026-10-29 19:05 (+07)
status: ready-for-execution
owner: lead
mode: fast
scope: apps/ai-service/tests/**, apps/ai-service/app/config.py, apps/ai-service/app/agent/loop.py (_self_check only)
---

# Plan: Bộ test ai-service hermetic — test_api env-harness + self-check protocol

## 1. Bối cảnh (đã kiểm chứng bằng lệnh)

- `py -3 -m pytest tests/test_api.py` → **2 failed / 16 passed** (con số dao động 7 fail khi mạng chậm vì test cố ra mạng thật rồi mới bị chặn).
- **Root cause A** — `tests/conftest.py:13-19` đã strip mọi env `AI_*/JEV_*` và set `PYTHON_DOTENV_DISABLED=1`, nhưng `app/config.py:22` gọi `_load_dotenv(.env)` **vô điều kiện** (thêm từ J-4) ⇒ key Jev thật trong `.env` (log: `key=sk_Dxl…smLQ`) được nạp lại SAU khi conftest strip ⇒ `JevGateway` cố gọi `usejevai.com` ⇒ conftest chặn bằng `AssertionError("Live network is forbidden…")` ⇒ `test_chat_fails_closed_without_provider_config` fail.
- **Root cause B** — cùng nguyên nhân: key Jev còn sống khiến `test_chat_expired_deadline_returns_provider_timeout` nhận thêm entry `{"providerId": "jev-usejevai", "code": "DECISION_TIMEOUT"}` trong danh sách providers (kỳ vọng chỉ `[{providerId: fake, code: LLM_TIMEOUT}]`).
- **Root cause C** — `python -m app.agent.loop` (self-check) fail từ trước (đã verify trên baseline): protocol của nó **giả định Jev configured** (đẩy cặp JSON decision+answer vào hàng đợi mock). Sau khi neutralize Jev (bản vá 16:30 tránh gọi mạng), gateway không consume JSON decision ⇒ lệch hàng đợi ⇒ sai intent. Thêm nữa: sample "đổi ca" có `proposedAction` nhưng router map "đổi ca" vào intent **policy** (`router.py:102`, text `hỏi quy trình nghiệp vụ`) ⇒ cổng P1-14 (loop.py:495 `plan.intent != expected_intent`) sẽ luôn từ chối action này — sample cũ bất khả thi theo hợp đồng mới.

## 2. Outcome / Non-goals / Acceptance

- **Outcome**: `pytest tests/test_api.py` 18/18 xanh offline tuyệt đối (không đọc `.env`, không chạm mạng); `python -m app.agent.loop` tự chạy xanh và phản ánh đúng hợp đồng hiện tại (P1-14 fail-closed).
- **Non-goals**: không đổi behavior production của loop/main (chỉ `_self_check`); không sửa conftest (nó đã đúng); không đụng `RUN_LIVE_TESTS=1` path.
- **Acceptance**:
  1. `py -3 -m pytest tests/test_api.py -q` → 18 passed, 0 failed, tổng thời gian < 10s (hết 16s timeout của đường Jev).
  2. `py -3 -m app.agent.loop` → exit 0, in các dòng MOCK HTTP PASS, không có request ra mạng (chỉ MockTransport).
  3. `py -3 -m pytest tests/test_loop.py tests/test_providers.py tests/test_retrieval.py tests/test_agent_attachments.py -q` → 47/47 (không hồi quy).

## 3. Phase

| Phase | Nội dung | File sở hữu |
|---|---|---|
| 01 | `config.py` tôn trọng `PYTHON_DOTENV_DISABLED` — chỉ `_load_dotenv` khi cờ không được set. Giữ nguyên runtime (uvicorn/start.py không set cờ ⇒ vẫn nạp `.env` như J-4 yêu cầu). | `app/config.py` |
| 02 | Viết lại `_self_check` theo protocol jev-off: (a) hàng đợi chỉ còn answer JSON **có thêm `"intent"`**; (b) sample đổi-ca chuyển thành assert **P1-14 từ chối action** (`AGENT_LOGIC_ERROR`, không có proposedAction) thay vì assert action thành công; (c) giữ greeting/invalid JSON/empty/oversize/degraded asserts. | `app/agent/loop.py` (chỉ khối `_self_check`) |
| 03 | Chạy 3 lệnh acceptance, ghi output vào chính plan này (mục §5). | — |

## 4. Rủi ro

| Rủi ro | Né |
|---|---|
| `PYTHON_DOTENV_DISABLED` vô tình set trên máy chạy thật ⇒ mất key | Cờ chỉ set trong `tests/conftest.py`; name space riêng, không ai export |
| Sample 2 chuyển thành assert-from-chối làm mất kiểm thử đường action thành công | Đường action thành công đã có test riêng: `test_loop.py::test_policy_path_*`, `tests/test_api.py::test_chat_policy_path_with_mock_provider` (scripted action) |
| Self-check lệch sau này khi đổi contract | Thêm comment: self-check phải chạy được với `.env` thật trên máy (đây chính là mục đích của nó) |

## 5. Bằng chứng thực thi (19:15)

| Acceptance | Kết quả |
|---|---|
| `py -3 -m pytest tests/test_api.py -q` | **18 passed in 1.90s** (trước: 16 pass + 2 fail, 17s — hết timeout đường Jev) |
| `py -3 -m app.agent.loop` | **exit 0** — 3 MOCK HTTP PASS (policy_query / P1-14 rejection AGENT_LOGIC_ERROR / general_chat) + invalid inputs pass; chỉ MockTransport |
| Hồi quy `pytest test_loop+providers+retrieval+attachments+api` | **65 passed** |
| `unittest test_jev*.py` | **34 tests OK** |

Phát hiện phụ (đã xử lý trong phase 03): test `test_answer_pipeline_degrades_when_all_providers_fail` fail trên main vì fake `_Broken` thiếu `.config`/`.timeout` mà deadline-grouping (J-1, commit `bed646e`) đọc ở `chain.py:127-136`. Lần "47/47" trước đó chạy nhầm trên cây `integration/full-delivery` (checkpoint 16:08 đã switch branch) với chain.py cũ — đã sửa fake theo đúng provider protocol.

## 6. Phát hiện bổ sung khi chạy full suite (19:40) — 2 bug thật, đều đã sửa

1. **`load_db_chunks` limit=100 làm rơi corpus** (`app/rag/corpus.py:302`): chỉ đọc 100 docs đầu — với 223 docs, hơn nửa corpus **invisible với cả runtime RAG** (main.py build PolicyEngine qua hàm này) lẫn seed script ⇒ seed chỉ thấy 17/145 chunk mới. Sửa: ceiling 1000 (~vài MB vector 3072-dim).
2. **`_llm_keys()` đọc `os.getenv` trực tiếp** (`app/agent/jev_gateway.py:105`): bypass frozen `settings` — module-level `load_dotenv()` của `tests/test_live_db_chat.py` (chạy lúc collection) tái vũ trang keys SAU khi conftest strip ⇒ full-suite gọi mạng thật. Fix đúng hợp đồng conftest: `PYTHON_DOTENV_DISABLED=1` ⇒ pool rỗng. Kết quả: **full suite 172 passed + 1 skipped trong 3.1s** (trước: fail 2 test, 37s).
3. **429 embedding post-mortem**: KHÔNG phải hạn mức ngày — là per-minute token bucket: batch 16 × chunk 63K chars ≈ 1MB/request, xoay 10 key trong vài giây ⇒ cạn bucket toàn pool. Fix: pack batch theo char budget (≤32K) + gap 2s giữa request + tôn trọng `retry-after`. Chạy thật: **123/123 chunk embed trong 2 phút, 272/272 chunk toàn corpus có vector 3072, 0 thiếu.**
