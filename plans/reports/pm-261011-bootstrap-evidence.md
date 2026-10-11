# Bootstrap — bằng chứng trước triển khai

Ngày: 2026-10-11, Asia/Bangkok. Worktree: `C:/work-space/hr-blockbot-pm`, branch `feat/pm-agentkit`, baseline `33bb63c`.

## Phạm vi đã được người dùng đồng ý

Lập plan và prompt theo nhánh: bảo mật trước, contracts chung, auth đầy đủ + đọc nhân sự có phân quyền, Web nối thật, AI foundation độc lập. Chưa triển khai toàn bộ F1–F7. Không sửa application code, kết nối DB, commit, push, merge hoặc deploy trong phiên planning.

## Bằng chứng đã kiểm tra

| Hạng mục | Quan sát | Nguồn |
|---|---|---|
| Branch/worktree | Ba nhánh dev cùng baseline `33bb63c`; worktree dev dự kiến chưa được tạo. Worktree nội bộ tạm của agent không phải worktree giao dev. | `git worktree list`, `git log -1` từng nhánh |
| Lệnh root | Có `dev:api`, `dev:web`, `dev:ai`, `build`, `lint`, `test`. | `package.json` |
| Kiểm thử | Manifest API/Web/contracts chưa có test/lint scripts; Glob không thấy `*test*`/`*spec*` TS/JS/Python trong apps. Chưa chạy lệnh, không kết luận exit code. | `apps/api/package.json`, `apps/web/package.json`, `packages/contracts/package.json` |
| API | Mount `/api`; mặc định port `3001`, health `/api/health`; chưa có auth guard tại entrypoint. README ghi port `5000` và `/health`, cần đồng bộ khi triển khai. | `apps/api/src/index.ts:21`, `:25`, `:35`; `README.md` |
| Nhân sự | List trả `{data,pagination}`, detail theo `:code`; query `.lean()` không projection allowlist. | `apps/api/src/routes/employees.ts:6`, `:29`, `:49` |
| Docs contract | Auth login/refresh/logout/me; list chỉ Admin; Employee đọc own; DTO/error khác source hiện tại. | `docs/06-api-spec.md:48`, `:62`; `docs/07-auth-rbac.md` |
| Scope chưa chốt | Chỗ lưu scope Admin và mapping dữ liệu không được tự đoán. | `docs/07-auth-rbac.md:340` |
| Web | API base hardcoded `3001/api`; App hiện tải stores/schedules/corrections/cash, chưa có luồng đọc danh sách nhân sự. | `apps/web/src/services/api.ts:52`; `apps/web/src/App.tsx:52` |
| Thành công giả | Từ chối phiếu và tạo ca chỉ sửa state; số liệu có fallback; chưa được dùng làm nghiệm thu. | `apps/web/src/App.tsx:85`, `:98`, `:105`, `:136` |
| Contracts | EmployeeSchema chứa trường nhạy cảm; RAG request có 3 role lowercase; không được dùng nguyên schema dữ liệu làm public DTO. | `packages/contracts/src/index.ts:3`, `:121` |
| AI | Health trả `rag_engine: active` vô điều kiện; routes import mock engine/tools. | `apps/ai-service/app/main.py:4`, `:54` |
| Secrets | Regex chỉ trả counts xác nhận 4 URI có user/password trong 4 file; không thử credential, không ghi giá trị. Cần human rotation/revocation receipt trước DB thật. | `apps/api/src/db.ts`, `apps/api/.env.example`, `apps/ai-service/app/agent/tools.py`, `apps/ai-service/.env.example` |

## Giới hạn và bàn giao

Đây là kiểm chứng tĩnh, không phải bằng chứng runtime. Không chạy ứng dụng, unit test, build, browser hay DB query. Không xác nhận credential còn hiệu lực. Báo cáo không chứa secrets, dữ liệu nhân sự hoặc dump DB.

Plan kế thừa roadmap hiện có, không đánh dấu các checkbox roadmap đã hoàn tất. Tiến độ implementation bắt đầu ở pending; chốt mapping, DB dev, baseline và UI approval ở gate tương ứng.
