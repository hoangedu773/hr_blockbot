# Phase 04 — Cô lập AI legacy khỏi runtime V1

## Mục tiêu

Giữ legacy evaluation nhưng làm rõ production boundary: `authorization_gateway:app` là runtime duy nhất; legacy không được import nhầm vào V1.

## Evidence

`authorization_gateway.py` chỉ import `app.deadline`, `app.jev_shadow`, `app.llm.base`, `app.llm.chain`. Các module legacy gồm khoảng 4.621 dòng: `app.main`, `agent/loop.py`, `agent/tools.py`, `agent/router.py`, `in_context_policy.py`, `rag/*`, JEV legacy và `app/db.py`.

## Việc cần làm

1. ~~Tạo namespace `apps/ai-service/legacy/` và di chuyển module~~ — **Bỏ, ghi deviation.** Đã đo: 13 test file + `qa_*.py` + `_verify_phase02.py` + `scripts/seed/06-policies-to-atlas.py` + `eval/run_eval.py` import trực tiếp `app.main`/`app.agent`/`app.rag`/`app.db` (24 điểm). Các script QA chạy bằng `python qa_*.py` với `sys.path` là thư mục script, nên di chuyển sẽ phá cách gọi hiện tại — đó là behavior change, trái invariant Plan A.
   Thay bằng cách rẻ hơn và **kiểm chứng được**: `pytest.ini` khai báo lane, `tests/conftest.py` gắn marker `legacy` theo tên module, và `tests/test_v1_runtime_boundary.py` fail nếu `app.authorization_gateway` kéo `app.main`/`app.agent`/`app.rag`/`app.db` vào `sys.modules`. Boundary giờ được **cưỡng chế bằng test**, không chỉ bằng quy ước thư mục.
2. ~~Di chuyển các module legacy và các QA script~~ — **Bỏ** cùng lý do trên. `qa_*.py`/`_verify_phase02.py` giữ nguyên vị trí và vẫn chạy được bằng lệnh hiện có; `pytest.ini` đã loại chúng khỏi collection (`testpaths = tests`) từ trước.
3. Tách pytest markers:
   - `v1`: authorization gateway, JEV shadow, F4 gateway;
   - `legacy`: app.main/agent/rag regression;
   - `eval`: benchmark cần model/dataset.
4. Default gate chạy `-m "not legacy and not eval"`; legacy gate chạy riêng và vẫn được ghi trong runbook.
5. Không xóa `app.main`/agent/rag trong phase này. Không đổi provider behavior, F4 scoring, JEV mode hoặc policy text.
6. Cập nhật `apps/ai-service/README.md` và `docs/baseline-development.md` để không ai dùng `app.main` làm production start command.

## Acceptance

```powershell
python -c "import app.authorization_gateway"
apps/ai-service/.venv-authz-v1/Scripts/python.exe -m pytest -q -m "not legacy and not eval"
apps/ai-service/.venv-authz-v1/Scripts/python.exe -m pytest -q -m legacy
```

- Import `authorization_gateway` không import `agent`, `rag`, `app.main`.
- V1 tests pass; legacy tests pass ở lane riêng.
- `render.yaml` vẫn chỉ trỏ `app.authorization_gateway:app`.
