# Phase 05 — Repo artifact hygiene và final sweep

## Mục tiêu

Giảm noise/tooling cost mà không xóa evidence cần thiết.

## Evidence

Merged HEAD có 1.097 tracked files; `previews/` 202 files; `apps/web/dist-verify/` 44 generated files; `.gitignore` chưa loại các thư mục này. `.git` pack khoảng 37 MiB và loose/worktree state còn garbage warning.

## Việc cần làm

1. Thêm ignore cho build output thực sự generated (`apps/web/dist-verify/`, generated screenshot/report output), sau đó `git rm --cached` **chỉ** artifact đã xác minh generated.
2. Không xóa `previews/` source nếu chưa phân loại. Tách preview source khỏi runtime/build output; giữ những preview được link trong design docs.

   **BLOCKED — sự cố bảo mật phát hiện khi phân loại.** `previews/db-data.json` và `previews/db-preview.html` (2,36 MB + 2,40 MB, cùng commit `d2d074a` ngày 11/10) chứa **dữ liệu nhân sự thật**: 12 bảng, 39.380 dòng, trong đó bảng `employees` có 2.456 người với họ tên, cửa hàng, chức danh và **1.976 số tài khoản ngân hàng**. Repo `hoangedu773/hr_blockbot` trả `"private": false` qua GitHub API và raw URL của file trả HTTP 200 không cần xác thực — tức dữ liệu này đang công khai.
   Không tự untrack: untrack không xóa dữ liệu khỏi lịch sử Git, và `git filter-repo`/force-push là hành động phá hủy cần chủ dự án quyết định. Cần: (a) xác nhận đây là dữ liệu thật và có được phép công khai không; (b) nếu không, lên kế hoạch purge lịch sử + rotate thông tin; (c) thêm guard chặn file chứa `bank_account_number` vào repo.
3. Gộp report mới phát sinh về `plans/reports/` theo repo convention; không tự xóa report lịch sử.
4. Xóa các file temp tracked chỉ khi xác nhận không được import/test: `tmp`, debug harness, generated HTML/data.
5. Cập nhật `README`/runbook nếu đường dẫn artifact thay đổi.
6. Chạy whole-plan sweep: path, import, docs link, `.gitignore`, package scripts.

## Acceptance

```powershell
git status --short
pnpm -r typecheck
pnpm -r run build
pnpm --filter @hr-blockbot/contracts test
pnpm --filter api test
pnpm --filter web test
apps/ai-service/.venv-authz-v1/Scripts/python.exe -m pytest -q
```

- Không có source import tới artifact bị untrack.
- Không có file generated mới bị track sau build.
- Tracked count giảm chủ yếu ở build/temporary output; không xóa domain source hoặc evidence test.
- Plan B chỉ bắt đầu sau khi phase này PASS.
