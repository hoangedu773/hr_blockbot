# Database Cutover & Comparison Runbook

## WHY

Trước khi đổi API sang database thật, đối chiếu baseline `hr_bot_test_363` với DB đích và xác nhận schema, unique indexes, khóa phân tán, legacy-import binding, canonical scope, ACL/vector 3072 chiều và khóa mã hóa settings. Bộ kiểm tra chỉ đọc; mọi khác biệt số lượng collection cần được xem xét trước khi chuyển đổi.

## WHERE

- API chạy script tại `apps/api/scripts/verify-db-cutover-readiness.mjs`; lệnh pnpm phải chạy từ workspace root.
- Trước khi chạy, build API để sinh `apps/api/dist/services/crypto.service.js` mà verifier dùng khi xác thực `SETTINGS_ENCRYPTION_KEY`:

  ```sh
  pnpm --filter api build
  ```
- API dùng `MONGODB_URI` (hoặc `ATLAS_URI`); AI Service chỉ cung cấp `AI_VECTOR_INDEX_NAME` để đối chiếu cấu hình Atlas.
- Kết nối verifier tắt `autoIndex`/`autoCreate`; script không sửa dữ liệu hay index. Không đưa URI hoặc secret vào command line, tài liệu hay log.
- `--baseline-db` đối chiếu presence và estimated counts cho danh sách collection cốt lõi trong script; đây không phải document-level equality, checksum hay migration validation. Rà mọi collection ngoài danh sách riêng trước cutover.

## Trình tự

1. Sao lưu và xác nhận quyền đọc Atlas cho API; đặt `MONGODB_URI` cùng `SETTINGS_ENCRYPTION_KEY` trong môi trường API dùng khi chạy lệnh.
2. Nếu so sánh dữ liệu tham chiếu, truyền baseline `hr_bot_test_363` và tên DB đích rõ ràng:

   ```sh
   pnpm --filter api db:verify-cutover --target-db <db-dich> --baseline-db hr_bot_test_363
   ```

   Dùng `--json` cho báo cáo máy đọc được. Có thể truyền kết nối bằng JSON stdin (`uri`, `targetDb`, `baselineDb`, `vectorIndex`) với cờ `--stdin`; tránh ghi JSON chứa secret vào file.
3. Xử lý mọi `FAIL`, kiểm tra từng collection trong `comparison` và xác nhận chênh lệch số lượng có lý do trước khi chuyển API sang DB đích.
4. Trên Atlas, tạo/kiểm tra Vector Search index `policy_vector_index` (hoặc tên do AI Service cấu hình), trường `chunks.embedding`, kiểu vector, `numDimensions: 3072`, tương thích `gemini-embedding-001`. Truyền tên bằng `--vector-index <name>` hoặc đồng bộ `AI_VECTOR_INDEX_NAME`.
5. Đồng bộ `SETTINGS_ENCRYPTION_KEY` API ↔ AI Service theo môi trường triển khai. API cần đúng khóa giải mã các `settings._id: "llm"` provider có `keyCipher`; không in plaintext hoặc ciphertext khi chẩn đoán.

## Xử lý FAIL

| Mã check | Khắc phục trước cutover |
| --- | --- |
| `CORE_COLLECTION_COMPARISON` | Đối chiếu collection thiếu hoặc count khác với nguồn; xác nhận nguyên nhân và kế hoạch nạp dữ liệu trước khi chấp thuận. |
| `*_INDEX` | Tạo đúng unique index theo schema API trong cửa sổ bảo trì sau khi rà soát duplicate; không bật `autoIndex` để né lỗi. |
| `CRM_WRITERS_LOCK`, `ACCOUNT_SECURITY_LOCK` | Xác định process giữ lock và trạng thái hoạt động; chỉ phục hồi theo quy trình vận hành, không tự mở khóa bằng verifier. |
| `LEGACY_IMPORT_TARGET_DATABASE` | Đối chiếu approval đã tiêu thụ với `targetDatabase` và target DB thật; sửa bằng luồng quản trị có phê duyệt trước khi đổi tên/chuyển DB. |
| `ACTIVE_USER_CANONICAL_EMPLOYEE`, `ACTIVE_OUTLET_SCOPE_APPROVAL`, `ACTIVE_MANAGEMENT_RELATIONS` | Sửa liên kết employee/store/approval và các quan hệ tự trỏ/chu trình qua quy trình HR/authorization có thẩm quyền. |
| `POLICY_ACL_APPROVED` | Rà soát tài liệu thiếu ACL được duyệt hoặc đã revoke; không cấp quyền truy cập bằng cách nới ACL. |
| `POLICY_EMBEDDING_DIMENSION` | Sinh lại embedding sai chiều bằng `gemini-embedding-001` 3072 chiều; kiểm tra chunk thiếu vector riêng. |
| `ATLAS_VECTOR_SEARCH_INDEX` | Tạo/sửa Atlas index đúng tên, path và 3072 chiều; đợi trạng thái READY/queryable. `WARN` nghĩa là deployment không hỗ trợ kiểm tra hoặc index chưa sẵn sàng, cần xác minh thủ công. |
| `SETTINGS_ENCRYPTION_KEY` | Cấp lại đúng secret đã mã hóa provider keys; xác minh giải mã trong môi trường API đích, không thay khóa tùy tiện. |
