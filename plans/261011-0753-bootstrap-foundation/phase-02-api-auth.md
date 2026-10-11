---
title: "Phase 2: API auth và đọc nhân sự có phân quyền"
status: pending
---

# Phase 2 — API

## Outcome, ownership và prerequisites

CWD `C:/work-space/hr-blockbot-api`, branch `feat/api-backend`. Chỉ sửa `apps/api/**`. Đọc shared docs/contracts/plan sau khi PM làm rõ quyền đọc. Không sửa lockfile/root/docs hoặc app khác.
Đọc `docs/05-data-model.md`, `docs/06-api-spec.md`, `docs/07-auth-rbac.md`, `apps/api/package.json`, `src/index.ts`, `src/routes/employees.ts`, `src/socket.ts`, `src/models/Employee.ts`. File chứa secret chỉ kiểm tra qua công cụ không in giá trị.

Phần offline dọn secret được làm khi worktree sẵn sàng. Phần auth/DTO chờ baseline contracts + mapping/config phase 1. DB access chờ human rotation receipt và DB dev được phép; mọi schema/index/data writes cần backup + quyền cụ thể. Không tự tạo account từ dữ liệu nhân viên, không default password/open signup.

## Thực hiện

1. Bỏ URI fallback trong `src/db.ts`, dùng env validation, sửa `apps/api/.env.example` thành placeholders. Log lỗi không có URI/password/token. Không kết nối DB ở test import vô tình; tách app creation khỏi listen/connect tối thiểu nếu cần test.
2. API owner thêm deps/scripts trong `apps/api/package.json`; gửi delta PM để lockfile được đồng bộ trước cài. Dùng `jose`, Argon2id theo docs và phiên bản Node thực tế; xác minh tài liệu current khi implementation. Không tự thêm framework test nếu Node runner + tsx sẵn có đủ dùng.
3. Tạo module auth phù hợp conventions và model users/refresh_sessions theo schema đã chốt. Hash password; RT chỉ lưu hash, validate expiry trong code, không dựa TTL cleanup. Không coi business level là permission.
4. Triển khai `POST /api/auth/login`, `/refresh`, `/logout`, `GET /api/auth/me`. Zod validate input; login sai trả thông báo chung; access token trong body, RT chỉ HttpOnly cookie. Verify algorithm/issuer/audience/expiry theo cấu hình phase 1. CORS chỉ origin được phép + credentials; bảo vệ cookie endpoints bằng Origin/CSRF policy đã chốt, không tin wildcard CORS là auth.
5. RTR dùng conditional atomic update, chỉ một lần tiêu thụ RT; replay revoke family. Test cả khoảng đua giữa consume RT, tạo successor và family revocation: không được có successor dùng được sau revoke. Nếu schema hiện tại không đảm bảo điều đó, gửi đề xuất nhỏ cho PM trước sửa shared contract; không thêm multi-document transaction trái ADR. Lỗi persist không cấp token và fail-closed. Logout revoke family, xóa cookie cùng flags/path; access đã cấp hết hiệu lực theo TTL, không hứa immediate blacklist.
6. Employee chỉ đọc own; list chỉ Admin; Admin đọc trong scope đã gán từ server. Scope thiếu/unmapped phải deny. Client filter không được mở rộng scope. Không tìm scope bằng regex tên cửa hàng. Detail cross-user của Employee trả 403, **không** trả summary. Admin hợp lệ đọc người khác chỉ summary.
7. Sửa `src/routes/employees.ts` và model/service cần thiết theo canonical route/DTO freeze. Query projection + response schema allowlist; không `.lean()` cả document rồi gửi thẳng. Validate ID/search/pagination; escape regex nếu dùng literal search, giới hạn độ dài/limit. Field thiếu trả theo contract, không bịa dữ liệu.
8. Vô hiệu hóa các routes ngoài bootstrap (`stores`, `schedules`, `corrections`, `cash`) tại mount hoặc bảo vệ cả auth **và** scope nếu đã có sẵn logic. Chỉ thêm auth nhưng cho mọi Employee đọc là chưa đạt. Tắt Socket.IO mock handlers và room joins công khai; không cần xây realtime đầy đủ. Health trả dữ liệu tối thiểu, phân biệt alive/ready và DB outage.

## Acceptance và checks

Lệnh hiện có: `pnpm --filter api build`.
Lệnh cần tạo trong API manifest: `pnpm --filter api test:auth` (Node runner + tsx); dùng DB test được phê duyệt cho integration, pure unit không cần DB. Không dựa vào mock DB để tuyên bố atomic concurrency đã đúng.

- [ ] Thiếu env không dùng credential fallback; không secret trong logs/response.
- [ ] Login hai role, sai password, malformed payload, token hết hạn/sai chữ ký đều đúng contract.
- [ ] Refresh một lần, expiry, replay, concurrent refresh, successor/revocation race và persistence failure đều có assertions; family đã revoke không hồi sinh.
- [ ] Logout xóa cookie; `/auth/me` đọc identity thật, không trả hash/token/session nội bộ.
- [ ] Employee own thành công, cross-user/list bị 403; Admin ngoài scope hoặc unmapped bị 403.
- [ ] Summary không có PII; detail own vẫn theo allowlist, không raw internal fields.
- [ ] Routes/socket cũ bị đóng hoặc có kiểm soát đầy đủ; DB outage báo lỗi thật, không seed fallback.
- [ ] Build và test thực sự chạy; báo command, count, kết quả, baseline SHA và phần chưa kiểm chứng.

## Dừng, rollback và báo cáo

Không có DB dev/quyền ghi: làm phần offline, integration BLOCKED; không dùng DB thật thay thế. Lỗi contract gửi PM, không sửa shared file. Giữ patch khi test fail; chỉ đảo patch của mình sau xem diff, không reset/checkout phá hủy và không phục hồi secret. Báo trong chat, PM lưu report. Không commit/push/merge/deploy khi chưa được user cho phép riêng.
