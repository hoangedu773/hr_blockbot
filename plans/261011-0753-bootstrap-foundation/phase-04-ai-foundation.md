---
title: "Phase 4: AI foundation (liveness trung thực, khóa mock)"
status: pending
---

# Phase 4 — AI service

## Outcome, ownership và prerequisites

CWD `C:/work-space/hr-blockbot-ai`, branch `feat/ai-service`. Chỉ sửa `apps/ai-service/**`. Đọc READ-ONLY `packages/contracts/**`, `docs/**`, `plans/**`. Không sửa `apps/api/**`, `apps/web/**`, contracts.
Đọc `apps/ai-service/app/main.py`, `app/rag/policy_engine.py`, `app/agent/tools.py`, `requirements.txt`, `docs/08-algorithms.md`, `docs/04-domain-model.md`.

Có thể bắt đầu phần offline (dọn secret, health trung thực, khóa mock) khi worktree sẵn sàng. DB access chờ human rotation receipt và DB dev được phép; mọi ghi schema/index/data cần backup + quyền cụ thể.

## Thực hiện

1. Bỏ URI fallback trong `app/agent/tools.py`; sửa `apps/ai-service/.env.example` thành placeholders. Không log credential.
2. Health `/health`: bỏ hardcode `status:"ok"` và `rag_engine:"active"`. Thêm ping DB thật. Phân biệt **liveness** (process sống) và **readiness** (DB/index sẵn sàng). DB mất kết nối → `degraded`/`not_ready` trung thực, không báo xanh giả.
3. Khóa mock: `/api/v1/agent/chat` và các mock tool trong `tools.py` phải bị tắt hoặc yêu cầu xác thực; không để mock trả dữ liệu nhân sự giả làm bypass DB.
4. **`$vectorSearch` — không bắt buộc ở phase này.** Reviewer xác nhận `policy_engine.py` chỉ Jaccard trên seed RAM, `requirements.txt` không có thư viện embedding, collection `policies` chưa có trường vector và Atlas Vector Search Index chưa dựng. Nếu thiếu embedding model hoặc index, `$vectorSearch` **không chạy được** — báo BLOCKED cho phần này, không bịa vector rỗng.
   - Nếu và chỉ nếu index + embedding khả dụng (được human xác nhận): chạy probe **read-only**, kiểm định dạng citation (`document`, `version`, `article`, `score` theo BR-15) và abstention (`abstain: True` khi ngoài phạm vi). Không tạo index, không ghi dữ liệu khi chưa được phép + backup.
5. Giữ `requirements.txt` tinh gọn. **Không** cài PyTorch/PhoBERT/Transformers/LLM framework ở bootstrap (hoãn Tuần 9). Không thêm dependency nặng chỉ để "đủ".

## Acceptance và checks

Lệnh hiện có: `python -m uvicorn app.main:app --port 8000` (chạy tay), `curl http://localhost:8000/health`.
Lệnh cần tạo: `python tests/test_health_probe.py` (health đúng khi có/mất DB), và nếu index khả dụng: `python tests/test_vector_probe.py --query "..."` cho citation/abstain.
- [ ] Health phản ánh đúng liveness/readiness; DB down → degraded/not_ready.
- [ ] Mock chat/tool bị khóa hoặc xác thực; không bypass DB nhân sự.
- [ ] Nếu index khả dụng: citation đúng định dạng và abstain đúng; nếu không: ghi BLOCKED rõ lý do, không mock.
- [ ] Không cài thư viện nặng; `requirements.txt` vẫn tinh gọn.
- [ ] Báo command, kết quả và phần chưa kiểm chứng.

## Dừng, rollback và báo cáo

Không có DB dev/quyền: làm phần offline, probe BLOCKED. Atlas lỗi/quota: báo trung thực, không fallback mock. Rollback bằng đảo patch của mình; không reset/checkout phá hủy. Báo trong chat cho PM. Không commit/push/merge khi chưa được phép riêng.
