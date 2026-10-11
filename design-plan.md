# Design plan

task_id: db-preview-hrbot-20261007
mode: artifact
task_type: mockup
subject_kind: real-system
copy_touched: no
meaning_touched: no
evidence_root: design-evidence/

type: mockup
subject: Trang khám phá database hr_bot.db — sơ đồ quan hệ (ERD) tương tác, schema và dữ liệu mẫu của 12 bảng
audience: Nhóm 3 sinh viên khóa luận KLCN133 và GVHD — mở file HTML trực tiếp từ đĩa để xem cấu trúc và quan hệ dữ liệu GUTA khi thảo luận
job: Cho người xem trả lời trong 10 giây "bảng nào nối bảng nào, bảng nào có bao nhiêu dòng" mà không cần mở SQLite client
constraints: Một file HTML self-contained, offline 100% (mở qua file://), tiếng Việt, dữ liệu thật nhúng từ db/hr_bot.db (extract 07/10/2026), không có server, không thay đổi dữ liệu

direction: finance-ledger
direction_reason: Chủ đề là dữ liệu quan hệ dạng bảng dày đặc (schema, số dòng, khóa) — finance-ledger cho độ chính xác, bảng aligned và số tabular mà chủ đề cần
accent: keep
accent_reason: direction default — Klein-blue hệ ledger, không có brand color riêng của đề tài

headline: hr_bot.db — 12 bảng, một sơ đồ quan hệ
primary_action: Xem báo cáo quan hệ
bold_moment: Sơ đồ ERD SVG tương tác chiếm toàn chiều ngang giữa trang — click bảng sẽ sáng các cạnh nối và làm mờ phần còn lại

sections:
- Header + hàng 5 .stat: tổng bảng (12), tổng ô gốc (33.198), nhân viên (2.456), ca làm việc (3.283), alias đã nối (23/24) — mỗi stat có dòng so sánh muted
- ERD tương tác: 12 nút bảng xếp 3 cột theo tầng (danh mục / sự kiện / đối chiếu), 10 cạnh quan hệ 3 kiểu nét (FK khai báo, logic, qua bridge), legend + nút reset
- Panel chi tiết bảng: cột + kiểu + PK, khóa ngoại, index, toàn bộ dòng dữ liệu thật (phân trang 25/50/100/200 + lọc mọi cột) trong .table-wrap, trạng thái rỗng khi tìm kiếm không kết quả

layout:
```
┌────────┬──────────────────────────────────────────────┐
│sidebar │ hr_bot.db — 12 bảng…        [Xem báo cáo]    │
│tìm kiếm│ [stat][stat][stat][stat][stat]               │
│─danh mụ│ ┌──────────────────────────────────────────┐ │
│─sự kiện│ │        ERD SVG (click = highlight)       │ │
│─đối ch │ └──────────────────────────────────────────┘ │
│ 12 bảng│ ┌─ chi tiết bảng ─────────────────────────┐ │
│ +count │ │ cột · khóa · index                       │ │
│        │ │ .table-wrap > bảng 5 dòng mẫu            │ │
└────────┴──────────────────────────────────────────────┘
```

mobile_layout:
```
┌───────────────────────┐
│ hr_bot.db — 12 bảng   │
│ [☰ Bảng] (disclosure) │
│ [stat][stat]          │
│ [stat]                │
│ ┌───────────────────┐ │
│ │ ERD (scroll →)    │ │
│ └───────────────────┘ │
│ chi tiết bảng 1 cột   │
│ bảng mẫu (.table-wrap)│
└───────────────────────┘
```

tablet_layout:
```
┌──────────┬────────────────────────────┐
│ sidebar  │ header + stats (3+2)       │
│ 240px    │ ERD full width             │
│          │ chi tiết bảng (2 cột nội bộ)│
└──────────┴────────────────────────────┘
```

responsive:
- nav: ở narrow sidebar (danh sách 12 nút + ô tìm) xếp xuống DƯỚI nội dung chính (flex order), luôn hiển thị đầy đủ, không toggle — h1 + nút primary nằm trong fold đầu tiên
- stats: 5 cột → 2 cột ở medium → 1–2 cột ở narrow, không drop nội dung
- erd: giữ toàn bộ node/cạnh, bọc trong scroller có nhãn "cuộn ngang để xem hết sơ đồ →" ở narrow
- Panel chi tiết bảng: khối "cột" và "dữ liệu mẫu" xếp dọc ở narrow; bảng mẫu nằm trong .table-wrap có fade cạnh phải
- detail: khối "cột" và "dữ liệu mẫu" xếp dọc; bảng mẫu nằm trong .table-wrap có fade cạnh phải

generic_check: No — nếu chủ đề khác (ví dụ bán hàng) tôi sẽ không dựng ERD 12 bảng với 3 kiểu nét cạnh (FK/logic/bridge) gắn chú thích verify 115/115; layout và các stat đều dẫn từ dữ liệu thật của hr_bot.db.

not_doing:
- Không dùng 3 card icon + hàng số lớn kiểu landing (anti-pattern §8)
- Không vẽ ERD bằng hình ảnh rastơ hay ảnh chụp — toàn bộ SVG vector dùng token màu
- Không bịa dữ liệu mẫu — mọi ô đều lấy từ db/hr_bot.db extract 07/10/2026
