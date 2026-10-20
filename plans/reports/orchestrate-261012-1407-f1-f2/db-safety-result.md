**Nguyên nhân:** `auth.test.mjs` kết nối DB trước khi seed rồi xóa toàn bộ `RefreshSessionModel` ở setup/teardown. Test nạp dotenv và import `app`/DB tĩnh, nên guard đặt trong `before()` là quá muộn. `connectDB()` dùng `MONGODB_URI || ATLAS_URI`; chỉ đặt `NODE_ENV=test` không cô lập DB.

**Đề xuất tối thiểu, không sửa file hay chạy test:**

1. Thêm preload `test/require-isolated-db.mjs`, chạy bằng `node --import` trong script `test:auth`. Preload phải chạy trước khi test module và `app` được nạp:
   - Bắt buộc `NODE_ENV=test` và `TEST_MONGODB_URI`.
   - Từ chối nếu `MONGODB_URI` hoặc `ATLAS_URI` đã được kế thừa từ shell; không nạp `.env`.
   - Parse URI, chỉ cho phép loopback (`localhost`, `127.0.0.1`, `::1`) cùng tên DB có tiền tố test; từ chối Atlas/remote. Sau xác thực, gán URI đã duyệt vào `MONGODB_URI` để `connectDB()` hiện tại dùng đúng DB.
   - Xóa import/config `dotenv` khỏi test. Không đổi public API.

2. Thay hai `RefreshSessionModel.deleteMany({})` bằng xóa theo `userId` của chính các user fixture được tạo trong suite. Thu thập `_id` sau khi tạo `admin@test-phase2.vn` và `emp@test-phase2.vn`; cleanup session theo danh sách đó trước khi xóa user. Giữ cleanup hiện có cho `@test-phase2.vn` và `TEST-P2-` vì đó là fixture selector cụ thể. Không xóa theo `familyId` nếu chưa ghi nhận family nào do fixture tạo.

3. Thêm test offline thuần Node cho hàm kiểm tra URI: chấp nhận URI loopback/test; từ chối Atlas, host ngoài loopback, thiếu URI và URI DB không đúng tiền tố. Chạy riêng được trước mọi kết nối DB; không thêm dependency.

**Bằng chứng nguồn:** `auth.test.mjs:3-14,39-53,95-115,117-124`; `db.ts:2-9,12-16`; `package.json:5-10`; `RefreshSession.ts:2-12,15-37`. Phase 1 yêu cầu fail-closed guard và scoped cleanup (`phase-01-start.md:18,30-33,60-65`).

**Kiểm tra:** test guard thuần offline. Kiểm thử tích hợp cần URI DB loopback cô lập được cấp phép; không chạy ở tác vụ này. Không kết nối DB.

Status: DONE  
Summary: Xác định đường nạp env/kết nối, thao tác xóa toàn cục; đề xuất guard trước import và cleanup theo user fixture.  
Concerns/Blockers: Loopback URI loại trừ kết nối Atlas trực tiếp; không chứng minh được DB cục bộ không bị port-forward tới Atlas.  
Skills loaded: `ak-engineer:ak-agentkit`, `ak-engineer:ak-debug`.
