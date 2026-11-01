# Phase 01 — Baseline gate và inventory đóng băng

## Mục tiêu

Xác nhận commit `4a6774b` là baseline duy nhất cho cleanup; lưu output gate trước khi sửa.

## Việc cần làm

1. Ghi `git rev-parse HEAD`, `git status --short`, remote divergence với `origin/integration/full-delivery`.
2. Chạy:

```powershell
pnpm install --frozen-lockfile
pnpm --filter @hr-blockbot/contracts build
pnpm -r typecheck
pnpm -r run build
pnpm --filter @hr-blockbot/contracts test
pnpm --filter api test
pnpm --filter web test
apps/ai-service/.venv-authz-v1/Scripts/python.exe -m pytest -q
node apps/web/test/e2e-revamp-flow.test.mjs
```

3. Nếu venv chưa tồn tại, tạo đúng đường dẫn `apps/ai-service/.venv-authz-v1` theo `docs/baseline-development.md`; không dùng credential thật.
4. Lưu output test vào artifact local/CI, không commit log.
5. Inventory các file sẽ chạm ở phase 02–05 và kiểm tra untracked collision trước mỗi mutation.

## Acceptance

- HEAD là `4a6774b`.
- Baseline gate xanh; failure môi trường được phân loại riêng, không sửa source để che failure.
- Không có tracked source change sau phase.

## Failure protocol

Nếu gate fail vì code, dừng cleanup và ghi root cause. Nếu fail vì thiếu venv/mongod/browser, sửa environment theo runbook rồi chạy lại; không đổi test expectation.
