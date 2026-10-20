# 23 — Runbook worktree cho 5 phase

- **Ngày:** 2026-10-20
- **Mục đích:** mỗi session agent làm đúng một phase, không giẫm file, không tranh port, không làm hỏng DB demo.

---

## 1. Hiện trạng (đo 2026-10-20)

| Worktree | Branch | HEAD | `.env` | `node_modules` |
|---|---|---|---|---|
| `hr-blockbot` | `main` | `a03ae0a` | ✅ | ✅ |
| `hr-blockbot-pm` | `feat/pm-agentkit` | `05ed889` | ❌ | ✅ |
| `hr-blockbot-api` | `feat/api-backend` | `a5cb61f` | ✅ | ✅ |
| `hr-blockbot-web` | `feat/frontend-web` | `62a00cf` | ❌ | ✅ |
| `hr-blockbot-ai` | `feat/ai-service` | `3e09159` | ✅ | ❌ (**chưa `pnpm install`**) |
| `.claude/worktrees/agent-*` (2 cái) | worktree-agent-* | cũ | — | — |

Hai worktree `.claude/...` là rác từ phiên trước — nên `git worktree remove` khi rảnh.

---

## 2. Bản đồ 5 phase → worktree

| Phase | Worktree | Branch | Được sửa |
|---|---|---|---|
| 1. Contracts & schema | `hr-blockbot-pm` | `feat/pm-agentkit` | `packages/contracts/**`, `docs/**`, `plans/**`, `scripts/seed/**` |
| 2. API | `hr-blockbot-api` | `feat/api-backend` | `apps/api/**` |
| 3. Web | `hr-blockbot-web` | `feat/frontend-web` | `apps/web/**` |
| 4. AI | `hr-blockbot-ai` | `feat/ai-service` | `apps/ai-service/**`, `scripts/embed_policies.py` |
| 5. Tích hợp & deploy | `hr-blockbot-int` (**tạo mới**) | `feat/integration-f1-f3` | root manifests, `render.yaml`, `docs/**` |

Quy tắc bất biến: **1 session = 1 worktree = 1 branch**. Không `cd` sang worktree khác trong cùng session.

---

## 3. Port — tránh đụng khi chạy song song

Mặc định hiện tại đều cứng (`api 3001`, `web 5173`, `ai 8000`) → chạy 2 nhánh cùng lúc sẽ đụng.

| Worktree | API | Web | AI |
|---|---:|---:|---:|
| `hr-blockbot` (main) | 3001 | 5173 | 8000 |
| `-api` | **3002** | — | — |
| `-web` | — | **5174** | — |
| `-ai` | — | — | **8001** |
| `-int` | 3010 | 5180 | 8010 |

Cách đặt:
```bash
# apps/api/.env
PORT=3002
# apps/web/.env
VITE_API_BASE=http://localhost:3002/api
# apps/ai-service/.env
PORT=8001   # start.py phải đọc env thay vì hardcode
```

**Lỗi chặn deploy đã phát hiện:** `apps/web/src/services/auth.ts` hardcode `API_BASE = 'http://localhost:3001/api'` → trên Render sẽ trỏ vào máy người dùng. Phase 3 phải đổi sang `import.meta.env.VITE_API_BASE ?? 'http://localhost:3001/api'`.

---

## 4. Contracts lan truyền thế nào

Contracts nằm trong `packages/contracts` (workspace package), nên nhánh nào cũng build được — nhưng **chỉ đúng phiên bản đang có trên nhánh đó**.

Luồng chuẩn:

```text
Phase 1 (pm)  --commit-->  feat/pm-agentkit
                                   |
                    merge (fast-forward)  ->  main
                                   |
        +--------------------------+--------------------------+
        |                          |                          |
  feat/api-backend           feat/frontend-web           feat/ai-service
   git merge main              git merge main              git merge main
```

Quy tắc:
1. Chỉ PM sửa `packages/contracts/**` và root `package.json` / `pnpm-lock.yaml`.
2. Phase 2/3/4 **không** được `pnpm add` ở root; nếu cần dependency mới → yêu cầu PM.
3. Sau khi Phase 1 land vào `main`, mỗi nhánh `git merge main` **trước khi code** — nếu merge sau sẽ conflict ở `dist/` và lockfile.
4. Phase 5 chỉ merge theo thứ tự: contracts → api → web → ai.

---

## 5. Lệnh chuẩn bị một worktree

```bash
# tổng quát
cd C:/work-space/hr-blockbot-<owner>
git fetch origin
git merge main                 # lấy contracts mới (sau Phase 1)
pnpm install                   # riêng từng worktree, pnpm không chia sẻ node_modules
cp ../hr-blockbot/.env .env    # rồi sửa PORT riêng
pnpm --filter @hr-blockbot/contracts build
```

Worktree `-ai` hiện **chưa có `node_modules`** → phải `pnpm install` trước khi chạy bất cứ lệnh node nào.

Tạo worktree tích hợp (Phase 5):
```bash
git -C C:/work-space/hr-blockbot worktree add C:/work-space/hr-blockbot-int -b feat/integration-f1-f3 main
```

---

## 6. Database

| Môi trường | Dùng cho | Ai được ghi |
|---|---|---|
| Atlas `hr_bot` | demo chung | chỉ Phase 1 (`scripts/seed/**`), Phase 5 (deploy) |
| Atlas `test` | test API | test runner tự tạo/xoá |
| `mongodb://localhost:27017/test-isolated` | E2E local | tùy chọn |

- Test **không** được chạy trên `hr_bot`; guard `require-isolated-db.mjs` đã có — không tắt.
- Phase 2/3/4 không chạy `scripts/seed/**`; cần dữ liệu mới → nhắn PM.

---

## 7. Bí mật

| Biến | Ở đâu | Ghi chú |
|---|---|---|
| `MONGODB_URI` | `apps/api/.env`, `apps/ai-service/.env` | không commit |
| `JWT_SECRET` | `apps/api/.env` | Phase 5 đặt trên Render |
| `SETTINGS_ENCRYPTION_KEY` | `apps/api/.env` | 32 byte base64; mất = phải nhập lại key provider |
| `AI_SERVICE_API_KEY` | cả api và ai | chia sẻ giữa 2 service |
| API key LLM | **DB `settings`** (mã hoá) | không đặt env, không commit |

---

## 8. Giao thức một session

1. Nhận: phase file + `docs/22-erd-overall.md` + port + do-not-touch.
2. `git merge main` → `pnpm install` (nếu cần) → chạy lệnh verify của phase (phải đỏ trước khi code nếu là test-first).
3. Code đúng phạm vi; commit theo khối, message tiếng Anh.
4. Kết thúc: chạy lại toàn bộ lệnh verify trong phase, dán output vào báo cáo cuối; `git push`.
5. Lead review diff; chỉ merge vào `main` khi acceptance của phase đạt.

---

## 9. Dọn dẹp

```bash
git worktree list
git worktree remove C:/work-space/hr-blockbot/.claude/worktrees/agent-aed144e774b6ba2db
git worktree prune
```

Trước khi remove: `git -C <path> status` phải sạch, không có commit chưa push.
