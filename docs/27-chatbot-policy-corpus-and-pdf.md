# Chatbot — Corpus chính sách, ACL và PDF đính kèm

Ngày: 2026-11-09 · Áp dụng cho `apps/api`, `apps/ai-service`, `apps/web`
Nhánh tham chiếu: `fix/integrate-kpi-notifications-261109` (HEAD `64aee38` tại worktree `C:/work-space/worktrees/hr-blockbot-f4-kpi-notifications`)

Tài liệu này mô tả ba thứ người làm chatbot cần biết nhưng không ghi ở chỗ nào khác: database nào đang chứa corpus thật, ACL tier nào áp cho loại tài liệu nào, và PDF được lấy từ đâu để gửi cho người dùng.

## 1. Hai database trên cùng một cluster

`ATLAS_URI` không chứa tên database, nên tên DB do mỗi service tự quyết:

| Service | Cách chọn DB | Kết quả trước 2026-11-09 |
|---|---|---|
| API (`apps/api/src/db.ts:24-28`) | `MONGODB_DB_NAME` → tên trong URI → mặc định `hr_bot` | theo env |
| AI service (`apps/ai-service/app/db.py:38`) | **hardcode `hr_bot`** | luôn `hr_bot` |

Trên cluster có 2 database nghiệp vụ:

| | `hr_bot` | `hr_bot_test_363` |
|---|---|---|
| policies có ACL | 0 | 213 (`OWNER_APPROVED_TIERED_POLICY_2026-11-03`) |
| evaluations | 0 | 40 (mới nhất 2026-11-09) |
| revenue_kpi_periods / assignments | 0 / 0 | 2 / 18 |
| chat_conversations | 0 | 6 |

**Quy tắc:** mọi dịch vụ chatbot phải đọc cùng một database. AI service giờ đọc `MONGODB_DB_NAME` trước, rồi tên DB trong URI, rồi mới fallback `hr_bot` — cùng độ ưu tiên với API. Khi deploy, đặt `MONGODB_DB_NAME` giống nhau cho cả hai service.

Kiểm tra DB đang đọc: `GET /api/v1/health` → `database.name`.

## 2. ACL tier cho `policies`

`documentAllowed()` (`document-authorization.service.ts:54`) từ chối mọi document thiếu envelope `acl` hợp lệ. Không có ACL = tài liệu không tồn tại với chatbot.

Bốn tier có ràng buộc cứng trong `AclSchema` (`document-authorization.service.ts:9-46`):

| Tier | `allowedProfiles` | `classification` |
|---|---|---|
| `T1_GENERAL` | đúng 9 profile | `operational` |
| `T2_OPERATIONAL` | ≤8, không có `system_admin` | `operational` |
| `T3_HR_SENSITIVE` | đúng 1: `hr` | `operational` |
| `T3_TECHNICAL` | đúng 1: `system_admin` | `technical` |

Hai hệ quả thường bị bỏ qua:

1. **`system_admin` không đọc được policy nào.** `policies.read` là capability scope `organization`, `hasCapability` đòi `allowedStoreIds().length > 0`, mà grant của system_admin là scope `system` không có store. Vậy dù `T1_GENERAL` liệt kê đủ 9 profile, admin kỹ thuật vẫn bị chặn ở cổng capability. Test `apps/api/test/policy-acl.test.mjs` pin hành vi này.
2. **`T3_TECHNICAL` không ai đọc được** vì cùng lý do.

### Phân loại 223 document hiện tại (`hr_bot_test_363`, sau đợt sửa 2026-11-09)

| Nguồn (`provenance`) | Tín hiệu | Tier | Số doc |
|---|---|---|---|
| `public-document` | luật, nghị định | `T1_GENERAL` | 2 (đã sửa từ T3 ngày 2026-11-09, backup `data/backups/acl-preimage-20261109.json`) |
| `authored` | quy chế soạn tay | `T1_GENERAL` | 3 |
| `authored-in-repo` | corpus seed 06 | `T1_GENERAL` | 61 |
| `scraped-knowledge` | tóm tắt trang tra cứu | `T1_GENERAL` | 17 |
| `guta-portal-crawl` + tiêu đề cá nhân (`BỔ NHIỆM` / `ĐIỀU CHUYỂN` / `CHÀO MỪNG` / `SINH NHẬT`) | quyết định nhân sự | `T3_HR_SENSITIVE` | 14 |
| `guta-portal-crawl` còn lại | chính sách, đào tạo, menu | `T1_GENERAL` | 126 |

Công cụ: `scripts/seed/11-policy-acl.py`
- `--self-check` — kiểm phân loại + invariant, không cần DB
- `--db <tên>` — chọn database đích
- mặc định **chỉ vá document thiếu `acl`**, không ghi đè
- `--retier --apply` — hạ văn bản pháp luật công khai từ T3 về T1
- `--revert --approval-ref <ref>` — gỡ ACL theo ref

### Điểm cần biết về dữ liệu trùng

223 document nhưng chỉ 184 tiêu đề khác nhau: **39 cặp trùng**, mỗi cặp gồm bản `authored-in-repo` và bản `guta-portal-crawl`, nội dung khác nhau 39/39 nhóm. Retrieval trả hai kết quả gần giống nhau cho cùng câu hỏi. Chưa có quyết định gộp — xem plan `plans/261109-1653-chatbot-acl-p5-wiring/plan.md` Phase D3.

## 3. PDF đính kèm

### Hiện trạng

- `policies.attachments`: **0/223 document** có field này, ở cả hai DB.
- API luôn trả `attachments: []` (`chat-authorization.service.ts:1251, 1417`) — UI có sẵn khối render (`ChatPageView.tsx:509-520`) nhưng không bao giờ nhận dữ liệu.
- `GET /api/attachments/pdf/<file>` gọi `authorizeAttachment()`, đòi document có `attachments[$elemMatch: {category, filename}]` **và** ACL hợp lệ. Thiếu một trong hai → 404.

### Nguồn PDF

| Nguồn | Số file | Dung lượng | Ghi chú |
|---|---|---|---|
| `data/guta_mau_bien_ban_cho_agent/` | 2 | 298 KB | Biên bản bàn giao công việc / tài sản — route chỉ serve thư mục này |
| `data/guta_portal/documents/folders/**` | 617 | 1495 MB | Có trong `documents-knowledge.jsonl` với `local_path`; **`data/` bị gitignore → không lên Render** |
| `data/guta_rescued_pdf/` | 53 | 30.3 MB | PDF dựng từ Drive preview, do `scripts/seed/12-drive-pdf-rescue.py` tạo, kèm `_manifest.json` |
| Link `drive.google.com/file/d/<id>` | 54 document | — | Chỉ 1/12 tải trực tiếp được; phần còn lại chặn tải |

**14 quy chế nội bộ GUTA không có PDF gốc** — chúng được soạn thẳng trong `scripts/seed/05-policies.py` (`corpus.py:21-177`), không có văn bản nguồn.

### Cơ chế lấy PDF từ Drive bị chặn tải

`crawl-guta-restricted-ocr.py` đã dùng luồng preview để OCR. `12-drive-pdf-rescue.py` dùng lại luồng đó nhưng ghép ảnh thành PDF thay vì OCR:

```
GET /file/d/<id>/preview                        → ds token
GET /viewer/upload?ds=<token>…                  → signed id
GET /viewer/meta?id=<sid>…                      → số trang
GET /viewer/img?id=<sid>…&page=N&w=1400         → PNG từng trang
ghép PyMuPDF, JPEG q70                          → PDF ~200-700 KB/trang
```

Đã chạy thật trên 54 link: 54/54 thành công, 143 trang, 30.3 MB, 198 giây. Đây không phải bypass quyền — chỉ đổi định dạng từ "xem trước" sang "PDF gửi nội bộ", dùng đúng link công khai mà chủ tài liệu đã đăng.

## 4. Việc cần làm để bật PDF cho người dùng

Thứ tự đã ghi trong plan `plans/261109-1653-chatbot-acl-p5-wiring/plan.md` Phase D1:

1. Copy 53 PDF đã cứu vào thư mục được route serve (hoặc thêm thư mục mới vào `CATEGORY_DIRS`).
2. Ghi `attachments: [{category: "pdf", filename: "<tên file>"}]` vào từng document `policies` tương ứng — `authorizeAttachment` cần đúng field này.
3. Bỏ `attachments: []` hardcode ở `chat-authorization.service.ts:1251, 1417`, thay bằng `attachments` của document đã citation.
4. Quyết định PDF nào được deploy: mức 1 (chính sách < 10 MB + 2 biểu mẫu) hay thêm tài liệu đào tạo. 5 file lớn nhất (645, 160, 143, 28, 20 MB) không thể deploy.

## 5. Gợi ý câu hỏi theo role

`ChatPageView.tsx:134` hiện hardcode 3 câu giống nhau cho mọi role; sidebar `TOPICS:94-98` có câu staff không có quyền. Đề xuất thay bằng bảng theo role trong plan Phase D2, mỗi câu map vào intent đã có sẵn trong gateway. Chưa có contract cho suggested questions — cần thêm `ChatSuggestionSchema` nếu muốn server trả thay vì client hardcode.
