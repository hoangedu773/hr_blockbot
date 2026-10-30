# Fix sweep 261030 — Jev System One, API test harness, doc drift

**Ngày:** 2026-10-30 · **Nhánh:** `main` · **Scope:** `apps/ai-service`, `apps/api`, `apps/web/test`, instruction docs

## Kết quả

| # | Defect | Trạng thái | Bằng chứng |
|---|---|---|---|
| P0 | `JevGateway._system_one` — `answers` chưa bao giờ được gán ⇒ `NameError` ngoài `except` tuple ⇒ mọi call Jev thật crash 500 | **Fixed** | `apps/ai-service/app/agent/jev_gateway.py:359` |
| P1 | `apps/api` test suite treo vô hạn (`spawnSync` chặn event loop ⇒ pipe stdout của mongod không drain) | **Fixed** | `pnpm --filter api test` → 100/100 trong 41s |
| P1 | `--test-force-exit` abort libuv trên Node 24 sau khi test đã pass ⇒ file xanh exit 1 | **Fixed** | `chat-gateway` trước: 12 pass + exit 1 |
| P1 | `MONGODB_DB_NAME` override đánh bại isolation guard trong test mode | **Fixed** | `apps/api/src/db.ts::resolveDbName` |
| P2 | `qa_*.py` bị pytest collect, chạy bằng credential thật từ `.env` ⇒ 3 fail giả | **Fixed** | `pytest.ini` + neutralise env trong script |
| P2 | `pnpm -r lint` là gate xanh giả (`ERR_PNPM_RECURSIVE_RUN_NO_SCRIPT` + exit 0) | **Fixed** | script `lint` đã gỡ, thay bằng `typecheck` |
| P2 | `package.json` field `pnpm.onlyBuiltDependencies` bị pnpm 11 bỏ qua | **Fixed** | `pnpm install` không còn warning |
| P2 | E2E so sánh float `getBoundingClientRect` (44.000030517578125) | **Fixed** | 50/50 hai lần liên tiếp |
| P3 | Doc drift: `AGENTS.md`, `CLAUDE.md`, `README.md`, `docs/AGENT-GUIDELINES.md`, `docs/15` | **Fixed** | xem §Doc |

## Nguyên nhân từng defect

### P0 — Jev System One không bao giờ trả về quyết định

Commit `e6828ff` ("hermetic suite, key-cabinet rotation") thay block validate của `_system_one` bằng bản sao
từ `_usejevai`. Bản sao dùng biến `answers` nhưng dòng gán `answers = body["data"]["result"]["answers"]`
không được copy sang. Hệ quả: mọi response `code == 0` đều chạm `isinstance(answers, dict)` → `NameError`,
và `NameError` **không** nằm trong `except (httpx.HTTPError, ValueError, KeyError, TypeError, AttributeError)`
nên nó thoát ra `AgentLoop`, nơi chỉ bắt `LLMUnavailable` → 500 thay vì 503.

Đường `_usejevai` (pool trial key) không bị ảnh hưởng, nên lỗi chỉ lộ khi `JEV_API_KEY` được đặt — đúng cấu
hình production trong `render.yaml`.

Regression test: `tests/test_jev_usejevai.py::SystemOneTests` (3 case). Đã chứng minh đỏ khi revert fix
(`NameError: name 'answers' is not defined` tại `jev_gateway.py:359`) và xanh sau khi áp lại.

### P1 — API suite treo

`test/with-memory-mongo.mjs` dùng `spawnSync` để chạy từng file test. `spawnSync` chặn event loop của
process cha, mà process cha đang giữ pipe stdout của `mongod` in-memory. Khi pipe đầy (sau vài chục KB log),
`mongod` block ở `write()` → mọi query từ process con treo. `db-guard.test.mjs` không chạm DB nên là file
duy nhất "pass"; 8 file còn lại treo tới timeout.

Bằng chứng đo được: chạy `auth.test.mjs` qua `spawnSync` → assertions pass 29/29 ở giây thứ 7, rồi process
sống thêm 53s không làm gì và bị kill. Chạy cùng file qua `spawn` async → exit 0 sau 6.8s.

Đổi sang `spawn` async + bỏ `--test-force-exit` (crash libuv trên Node 24 sau khi test đã pass, biến file
xanh thành exit 1).

### P1 — `MONGODB_DB_NAME` đánh bại isolation

`require-isolated-db.mjs` validate `TEST_MONGODB_URI` là loopback + prefix `test`, rồi copy vào `MONGODB_URI`.
Nhưng `connectDB()` lại truyền `dbName: process.env.MONGODB_DB_NAME || "hr_bot"` cho mongoose — tham số này
**ghi đè** path trong URI. Với `MONGODB_DB_NAME=hr_bot` trong shell, suite chạy trên `hr_bot`, đúng database
mà guard tồn tại để bảo vệ. Log `[MongoDB] Connected successfully to: hr_bot` là bằng chứng.

Fix giới hạn trong test mode: `resolveDbName()` cho URI path thắng khi `NODE_ENV === "test"`, giữ nguyên
precedence documented ở production (`MONGODB_DB_NAME` thắng, để một cluster chứa dev/demo/test). Runner và
`test:guard` cũng `delete env.MONGODB_DB_NAME` để không phụ thuộc shell state.

### P2 — `qa_*.py` chạy như test hermetic nhưng không hermetic

`qa_adversarial_test.py` và `qa_portal_audit_test.py` nằm ở root package `apps/ai-service/`, nên `pytest`
collect chúng. Nhưng `tests/conftest.py` (neutralise env + block network) chỉ áp dụng cho `tests/`. Kết quả:
script chạy với `JEV_USEJEVAI_KEYS` thật từ `.env`, gọi network thật, và `TestClient` trả 503 vì
`AI_SERVICE_API_KEY` rỗng. Ba fail đều là artefact của môi trường, không phải regression.

Fix hai lớp: `pytest.ini` với `testpaths = tests` (script vẫn chạy được bằng `python qa_*.py`), và script tự
neutralise env trước khi import `app.*` để không phụ thuộc pytest.

## Verification

| Gate | Kết quả |
|---|---|
| `pnpm -r typecheck` | 0 error (api, web, contracts) |
| `pnpm -r build` | pass (contracts + api + web) |
| `pnpm --filter api test` | **100/100 pass**, 41s (trước: treo vô hạn) |
| `pnpm --filter web test` | **50/50 pass** × 2 lần liên tiếp |
| `pnpm --filter @hr-blockbot/contracts test` | 40/40 pass |
| `cd apps/ai-service && python -m pytest -q` | **177 passed, 1 skipped, 34 subtests** |
| `python qa_adversarial_test.py` | CASE 1–4 PASS, AUDIT CONCLUSION: PASS |
| `python qa_portal_audit_test.py` | OVERALL VERDICT: PASS |
| `pnpm install --frozen-lockfile` | sạch, không còn warning `pnpm` field |

## Doc reconciliation

| File | Sửa |
|---|---|
| `AGENTS.md` | §1: `ak 3.0.0-beta.36`, 160 skill, plugin `ak-engineer@agentkit-local` v0.2.0, không `.agentkit/`. §4: bỏ claim sai "chỉ contracts có test" — api 11 file, web 10 file, ai-service 19 file; ghi `lint` không tồn tại. §5: single workspace thắng mô tả worktree cũ (mâu thuẫn trực tiếp với `CLAUDE.md` §1) |
| `CLAUDE.md` | PhoBERT → `gemini-embedding-001` + `matching.py` skill-overlap; PhoBERT là yêu cầu đề cương chưa triển khai. Gate thêm `pnpm -r typecheck`, `pnpm --filter api test`, `pytest`; bỏ claim "lint" |
| `README.md` | Bỏ toàn bộ hướng dẫn checkout `feat/*` (nhánh không còn trên `origin`) + worktree 3 nhánh; thay bằng single workspace. Bảng branch → bảng service. PhoBERT ở 3 chỗ |
| `docs/AGENT-GUIDELINES.md` | §5 đánh dấu historical, lệnh test thật ở HEAD, `test:auth` không tồn tại. §1 PhoBERT |
| `docs/15-engineering-conventions.md` | §6.2 ghi rõ gate nào có lệnh chạy được ở HEAD (1,3,4,6,8) và gate nào chưa khai báo (2,5,7,9,10,11) |

## Không làm (cần quyết định)

- **`ak init` / `ak projects add`**: `ak init --dry-run` là no-op (`files_tracked: 0`, chỉ tạo
  `.agentkit/ownership.json`), nhưng `AGENTS.md` §1 cấm tự chạy vì là thay đổi registry global. Cần user
  quyết trước. Nếu làm: thêm `.agentkit/` vào `.gitignore` trước để không commit policy kèm path tuyệt đối.
- **`~/.codex/config.toml` hook `Interrupt`**: `ak doctor` báo command bị quote theo kiểu PowerShell. File do
  `codex-chatgpt-web` quản lý (có comment "Managed by"), không sửa để tránh bị ghi đè. Đã strip BOM khỏi
  `~/.codex/hooks.json` (backup: `hooks.json.bak.20261030`) — đó là nửa còn lại của cùng warning.
- **`plans/261030-1024-crm-real-data/`**: untracked, không phải file của sweep này (tạo 10:09 bởi session khác).

## Ghi chú vận hành

- `pnpm --filter api test` trước đây "xanh" chỉ vì không ai chờ nó xong. Bất kỳ CI nào chạy lệnh này sẽ treo
  tới timeout, và mọi báo cáo "API 98/98 pass" trước 2026-10-30 đều là kết quả của một lần chạy khác.
- `mongod` mồ côi tích tụ khi runner bị kill giữa lượt (`taskkill /F /IM mongod-x64-win32-8.2.6.exe` để dọn).
  Với `spawn` async + teardown sạch, hiện tượng này không còn tái diễn.
