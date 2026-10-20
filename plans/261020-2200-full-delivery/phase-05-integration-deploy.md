---
title: "Phase 5 — Tích hợp, eval, deploy Render $7"
status: pending
priority: P1
effort: 24h
owner: PM + all
created: 2026-10-20
depends_on: phase-02, phase-03, phase-04
---

# Phase 5 — Integrate, evaluate, deploy

## Goal

Đưa hệ thống lên URL công khai trong ngân sách **Render Starter $7/tháng**, chứng minh 2 vai chạy end-to-end, và đóng băng 09/11 với bộ số eval thật.

## Preconditions

- 3 phase 2/3/4 merge được vào nhánh tích hợp.
- `policies` đã có embedding; index `READY`.
- Có ít nhất 1 provider `openai_compatible` hoạt động (đo bằng Test connection).

## Tasks

### 1. Nhánh tích hợp

- [ ] Tạo worktree `hr-blockbot-int` từ `main`, merge lần lượt: contracts → api → web → ai.
- [ ] Giải quyết xung đột `package.json` / `pnpm-lock.yaml` (chỉ PM sửa root manifest).
- [ ] `pnpm -r build` + `pnpm -r test` xanh trên nhánh tích hợp.

### 2. Render

- [ ] `render.yaml` khai báo 3 service: `web` (static), `api` (Starter), `ai` (Starter).
- [ ] Web: build `pnpm --filter web build`, publish `apps/web/dist`, rewrite SPA.
- [ ] API: build contracts + api, start `node dist/index.js`, health `/api/health`.
- [ ] AI: `pip install -r requirements.txt`, start `uvicorn app.main:app`, health `/health`.
- [ ] Env: `MONGODB_URI`, `JWT_SECRET`, `SETTINGS_ENCRYPTION_KEY`, `AI_SERVICE_API_KEY`, `FRONTEND_URL`, `NODE_ENV=production`.
- [ ] IP Render đã có trong Atlas Network Access (hoặc dùng 0.0.0.0/0 **chỉ trong tuần demo**, ghi chú rủi ro).
- [ ] `FRONTEND_URL` khớp domain thật, CORS không dùng `*`.

### 3. E2E trên môi trường thật

- [ ] Kịch bản 2 vai: Admin đăng nhập → tạo đề tài → giao Employee → Employee nhận, cập nhật, nộp báo cáo → Admin từ chối kèm lý do → Employee nộp lại → Admin duyệt.
- [ ] F1: Employee gửi yêu cầu đổi `level` → Admin duyệt; thử Admin tự duyệt → 403.
- [ ] F3: hỏi 5 câu chính sách (có trích dẫn), 2 câu ngoài phạm vi (abstain), 1 câu hết provider (degraded).
- [ ] Admin đổi provider trên UI → chat dùng provider mới ngay, **không** cần deploy lại.
- [ ] Chụp ảnh từng bước cho phụ lục báo cáo.

### 4. Đo lường cuối

- [ ] Chạy `eval/run_eval.py` trên dữ liệu production (không mock); lưu `eval/report.md`.
- [ ] Đo latency p50/p95 của chat trên Render (ghi rõ 512MB).
- [ ] Ghi `data_provenance` lần cuối + xuất `provenance-report.json`.

### 5. Đóng băng

- [ ] Tắt `AI_AGENT_ENABLED=false` trên production? **Không** — phải bật cho demo; thay bằng rate limit đơn giản.
- [ ] Freeze tag `v1.0-freeze` ngày ≤ 09/11.
- [ ] Cập nhật README: URL, tài khoản demo, cách chạy, giới hạn đã biết.
- [ ] Đồng bộ `docs/22-erd-overall.md` với DB thật lần cuối.

## File ownership

| Ok | File |
|---|---|
| ✅ | `render.yaml`, root manifests, `docs/**`, `plans/**`, `README.md` |
| ❌ | code trong `apps/**` (mỗi owner tự sửa nếu smoke test phát hiện lỗi) |

## Verification

```bash
curl -s https://<api>.onrender.com/api/health | jq .status
curl -s https://<ai>.onrender.com/health | jq .status
curl -sI https://<web>.onrender.com | head -1
# không lộ secret trong bundle
curl -s https://<web>.onrender.com/assets/*.js | grep -c "keyCipher\|sk-" || echo "OK: không lộ key"
```

## Acceptance

1. 3 service `live` trên Render, health xanh.
2. Kịch bản E2E 2 vai chạy trọn không lỗi, có ảnh chụp.
3. Đổi provider trên UI có hiệu lực < 60s, không redeploy.
4. Không có secret nào trong bundle web hoặc response API.
5. `eval/report.md` có bảng B0/B1/B2 + abstain rate.

## Rollback

- Render giữ bản deploy trước; revert = deploy lại commit trước đó (ghi rõ commit SHA vào runbook).
- Nếu AI service OOM trên 512MB: chuyển embedding sang API ngoài hoàn toàn, tắt local model (đã là mặc định).

## Ngân sách

| Service | Gói | Giá |
|---|---|---|
| Web (static) | Free | $0 |
| API | Starter 512MB | $7 |
| AI | Starter 512MB | $7 |
| **Tổng** | | **$14/tháng** |

Nếu bắt buộc $7: gộp API + AI vào 1 container (Dockerfile đa tiến trình) — rủi ro OOM, chỉ làm nếu không xoay được $14.

## Không được làm

- Không commit `.env` hay key.
- Không dùng `0.0.0.0/0` cho Atlas quá tuần demo.
- Không deploy từ worktree chưa merge vào nhánh tích hợp.
