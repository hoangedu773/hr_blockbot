# Đối soát trước đợt F1–F2

Ngày: 2026-10-11, Asia/Bangkok. Phạm vi phiên: lập kế hoạch; không triển khai, merge, push, deploy hoặc thay đổi DB.

## Kết luận

Tiếp tục F1 hồ sơ nhân sự và F2 vòng đời đề tài theo đề cương. Phải khép khoảng trống baseline tích hợp trước nghiệm thu. Không coi báo cáo 47/47 cũ là bằng chứng E2E hiện tại.

Kế hoạch: [Next delivery](../261011-1515-next-delivery/plan.md). Thư mục do `ak 2.19.0` tạo với timestamp UTC; thời gian trao đổi dùng Asia/Bangkok. Giữ đường dẫn CLI thực tế, không tạo plan trùng theo timestamp hook.

## Bằng chứng đã kiểm tra

| Bề mặt | Bằng chứng | Hệ quả |
|---|---|---|
| Working tree | `feat/pm-agentkit`, HEAD `a03ae0a2a79c4779cb9a0142e74a13973df6fdfc`; sạch trước tạo plan | Chỉ plan/report/journal mới được ghi trong phiên |
| Nhánh dịch vụ | API `a5cb61f`, Web `62a00cf`, AI `3e09159`; `git rev-list --left-right --count HEAD...<branch>` đều `6 4` | Mã bootstrap nằm trên nhánh dịch vụ, chưa có baseline tích hợp tại PM/main |
| Bootstrap | `ak plan status plans/261011-0753-bootstrap-foundation --json --no-interactive`: `status=completed`, `phases_done=1/5`, `done_tasks=9/31`, `progress_pct=29` | 29% chỉ là checkbox; không phải tỷ lệ hoàn thành sản phẩm. Phải đối soát cả năm phase, không check hàng loạt |
| Báo cáo QA cũ | [QA](qa-261011-bootstrap-verification.md):12–18, 73–75 | Ghi 47/47 và nhận định hoàn tất, nhưng không kèm bằng chứng unified Web–API–DB trên một revision |
| F2 chuẩn | `docs/01-requirements.md:49–50`, `docs/04-domain-model.md:165–185`, `docs/06-api-spec.md:110–125` | `DRAFT`, `ASSIGNED`, `IN_PROGRESS`, `PENDING_REVIEW`, `COMPLETED`; không phải `SUBMITTED/APPROVED` của ca kíp |
| Phạm vi GUTA | `docs/backlog-parked.md:53`, `docs/20-project-map-and-direction.md` | Nhân viên là dữ liệu đầu vào; ca/đổi ca không được giả làm project |
| Contracts | `packages/contracts/src/index.ts:66–88` | Đã có summary và own detail. Phone được phép ở own detail, bị cấm ở summary; không ghi “zero PII” chung chung |
| API routes chuẩn | `docs/06-api-spec.md:119,124,163–166` | Dùng `/projects/:id/transition`, `/assign`, `/reports` và `/reports/:id/review` dưới prefix `/api`; không tự thêm `/start`, `/approve`, `/reject` |
| API test an toàn | `git show feat/api-backend:apps/api/test/auth.test.mjs`, hook `before` | Có `RefreshSessionModel.deleteMany({})`; không chạy trên Atlas dùng chung. Test tải dotenv, nên phải chặn nhầm DB trước `connectDB` |
| Web test | `git show feat/frontend-web:apps/web/test/web-integration.test.mjs` | Đọc nguồn bằng `fs.readFileSync`, kiểm tra regex; không thay browser integration |
| AI health test | `git show feat/ai-service:apps/ai-service/tests/test_health_probe.py` | `patch.object(db_client, "ping", return_value=...)`; kiểm thử nhánh logic, không chứng minh kết nối Atlas |
| Vector test | Scout đọc `feat/ai-service:apps/ai-service/tests/test_vector_probe.py` | Probe lexical/Jaccard không chứng minh `$vectorSearch` chạy thật |
| Script API | `feat/api-backend:apps/api/package.json` | Có `build`, `test:auth`; thiếu `test`. Không kết luận root recursive test chắc chắn fail chỉ từ thiếu script; kiểm tra có bỏ sót package không |
| Pipeline contracts | `packages/contracts/package.json` theo scout | `generate:openapi` còn stub. Không báo OpenAPI/client generation hoàn tất |

## Kiểm tra thực sự chạy trong phiên

- Controller chạy Git status, worktree list, diff names, branch divergence và `git diff --check`; chưa chạy suite ứng dụng.
- Controller chạy các lệnh đọc `ak plan list`, `status`, `parse`, live help và preference resolve. CLI đã tạo plan, thêm hai phase, gắn current-plan pointer riêng worktree.
- Scout chạy contracts tại worktree cô lập cùng baseline PM: lần đầu `pnpm --filter @hr-blockbot/contracts test` thất bại `ERR_MODULE_NOT_FOUND` vì thiếu `dist/index.js`; sau `pnpm --filter @hr-blockbot/contracts build`, test pass 10/10. Đây là kết quả scout báo lại, không phải E2E.
- API auth, Web test/build, AI health/vector và `pnpm -r test` **không chạy** trong phiên. Những kết quả pass trong báo cáo QA cũ là bằng chứng lịch sử, không phải kết quả hiện tại.
- Không đọc secrets, gọi DB, import seed, sửa dữ liệu nghiệp vụ, gọi LLM ứng dụng hoặc thực hiện `$vectorSearch` thật trong phiên.
- `ak journal validate plans/journals/2026-10-11-plan-f1-f2-continuation.md --json --no-interactive` trả exit 1 không diagnostic. Dùng filename stem `2026-10-11-plan-f1-f2-continuation` theo help trả `ok: true`; không sửa skill/CLI. BOM do PowerShell stdin được bỏ khỏi body journal.

## Quyết định người dùng

1. Câu hỏi: “Kickoff ghi F2 là vòng đời ca kíp, nhưng backlog cấm dùng project thay ca làm thật. Đợt tiếp theo chốt hướng nghiệp vụ nào?”
   - Các lựa chọn: Khóa luận F1–F2; Nghiệp vụ ca GUTA; Chỉ khép nền móng.
   - Trả lời: **Khóa luận F1–F2**. Hồ sơ nhân sự và vòng đời đề tài; không mở ca/đổi ca/giải trình công.
2. Câu hỏi: “Phản hồi nhận/từ chối công việc đang là đề xuất; tài liệu chưa chốt cách Admin xử lý và chống phản hồi lỗi thời. Đợt F1–F2 này xử lý phần đó thế nào?”
   - Các lựa chọn: Tách gate riêng; Chốt trước mọi F2.
   - Trả lời: **Tách gate riêng**. FR-045/Q-10/D-15/D-16 giữ blocked follow-up; core F2 tiếp tục, không bật endpoint/nút chưa đặc tả.

3. Câu hỏi: “F1 yêu cầu duyệt thay đổi thông tin nhạy cảm, nhưng spec hiện trả lỗi vì chưa có nơi lưu yêu cầu duyệt. Plan nên xử lý khoảng trống này thế nào?”
   - Các lựa chọn: Chốt trong đợt này; Tách gate bị chặn.
   - Trả lời: **Chốt trong đợt này**. FR-003/004 phải có task thiết kế storage/contract rồi triển khai duyệt, từ chối có lý do, gửi lại giữ lịch sử; không tự duyệt. Nếu thay đổi baseline 11 collection phải xin duyệt riêng. Không coi F1 hoàn tất trước gate này.

## Giới hạn và gate còn lại

- Tích hợp nhánh cần phê duyệt riêng, người sở hữu root manifests/lockfile rõ ràng và revision tích hợp được ghi nhận.
- DB test cần biệt lập, quyền truy cập được cấp riêng và backup trước thay đổi schema/data; không dùng dữ liệu sản xuất cho destructive tests.
- UI mới cần skill gate, HTML preview và phê duyệt trước áp dụng; chưa có kiểm tra hình ảnh/tương tác trong phiên planning.
- Mapping dữ liệu GUTA, probe vector thật và metric F4 còn cần bằng chứng; không suy kết quả từ con số lịch sử.
- Không sửa lịch sử QA/bootstrap trong phiên này. Phase 1 phải ghi đính chính có căn cứ, không xóa dấu vết báo cáo cũ.

## Câu hỏi chưa giải quyết

Không còn quyết định sản phẩm chặn việc viết plan core F1–F2. Storage/contract duyệt hồ sơ FR-003/004 phải được chốt trong đợt này trước implementation, không âm thầm thêm collection. FR-045 giữ câu hỏi Q-10/D-15/D-16 ở gate riêng theo lựa chọn của người dùng; chưa coi là yêu cầu đã hoàn tất.
