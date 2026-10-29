# Phase 06 — Agent loop ‖ Tools/RAG/deps

Hai worker song song, file rời nhau.

---

## 06A — `apps/ai-service/app/agent/loop.py` (P1-14, P2-7, J-3)

**P1-14 — gate tự xác nhận vòng tròn.** Intent do LLM/Jev sinh, `proposedAction` cũng do LLM sinh, rồi code chỉ
kiểm `decision.intent == expected_intent` — cả hai vế cùng nguồn nên "khớp" không chứng minh gì.
- Thêm kiểm tra **độc lập với LLM**: action type phải hợp lệ với `plan` (rule router) hoặc với quyền của user;
  nếu LLM đề xuất action mà rule router không thấy dấu hiệu tương ứng ⇒ từ chối (`ACTION_INTENT_MISMATCH`) thay
  vì tin LLM.
- Ghi rõ trong code: đây là **hai nguồn độc lập**, không phải tự tham chiếu.

**P2-7 — `except (LLMUnavailable, ProviderError, ValueError, TypeError, KeyError, AttributeError)`** gộp mọi lỗi
thành `LLM_UNAVAILABLE`. Hệ quả: lỗi logic (policy sai, citation không tồn tại) bị báo là "mất kết nối" ⇒ không
bao giờ được sửa vì trông như lỗi hạ tầng.
- Tách nhánh: lỗi transport/LLM → `LLM_UNAVAILABLE` (retryable); lỗi dữ liệu/logic → `AGENT_LOGIC_ERROR`
  (non-retryable, log kèm claim id) và **không** nuốt stacktrace.

**J-3 — cache turn degraded.** `QUERY_CACHE` TTL 300s lưu cả turn `degraded=True`, mà lookup (`:367`) đứng
trước gate (`:382`) ⇒ câu trả lời suy giảm được phát lại 5 phút dù Jev đã hồi phục.
- `if not turn.degraded: QUERY_CACHE.set(...)` — và không đọc cache khi `jev_configured` vừa bật lại.
- Test: turn degraded không được `get()` trả về.

**Acceptance**
```bash
cd apps/ai-service && python -m unittest discover -s tests -p "test_loop.py"
# test mới: action không khớp rule router → từ chối; ValueError từ policy → AGENT_LOGIC_ERROR (không phải LLM_UNAVAILABLE)
#           turn degraded không vào cache
```

---

## 06B — tools / retrieval / deps (P2-4, P2-6, P2-8)

**P2-4** `apps/ai-service/app/agent/tools.py:579` — `ThreadPoolExecutor(...)` + `shutdown(wait=True)` làm
timeout tool vô hiệu: gọi xong mới trả, treo tới khi tool xong.
- Dùng `future.result(timeout=...)` + `shutdown(wait=False, cancel_futures=True)`; ghi rõ tool nào không
  cancel được (thread Python không kill được) ⇒ đặt trần cứng ở tầng gọi.

**P2-6** `apps/ai-service/app/rag/retrieval.py:89` — chunk **không có** `department_ids` được coi là công khai
(`if not scope or not chunk.department_ids: return True`). Với dữ liệu HR, mặc định phải là **đóng**.
- Đổi sang: thiếu `department_ids` ⇒ chỉ hiển thị khi `scope` rỗng **và** chunk được đánh dấu `visibility: public`;
  còn lại coi là restricted. Đây là thay đổi hành vi — phải có test cho cả hai chiều.

**P2-8** `apps/ai-service/requirements.txt` — không pin version ⇒ build không tái lập được.
- Pin toàn bộ (`==`) theo version đang chạy thật; ghi lại lệnh `pip freeze` đã dùng.

**Acceptance**
```bash
cd apps/ai-service && python -m unittest discover -s tests -p "test_retrieval.py"
# test mới: chunk không department_ids + scope Employee → KHÔNG trả về (mặc định đóng)
python -c "import re;print(len([l for l in open('requirements.txt') if '==' not in l and l.strip() and not l.startswith('#')]))"   # 0
```
