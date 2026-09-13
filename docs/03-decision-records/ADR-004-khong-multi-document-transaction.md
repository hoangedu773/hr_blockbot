# ADR-004 — Không dựa vào multi-document transaction; dùng atomic conditional update + `statusHistory[]`

- **Status:** Accepted
- **Date:** 13/09/2026
- **Quyết định này ảnh hưởng tới:** `02-architecture.md` §5.2 (`modules/project`), §6 (hệ quả Atlas M0), ADR-005, ADR-011

---

## Context

F2 (vòng đời đề tài) và F7 (nộp báo cáo nghiệm thu) đều là thao tác **ghi nhiều nơi cùng lúc**: đổi
`project.status` + ghi lịch sử + tạo `report` + tạo `notification`. `RESEARCH-PLAN.md` §3 B1 nêu
đúng câu hỏi bắt buộc phải trả lời trước khi thiết kế: "Atlas M0: … có **transactions** không (F2 đổi trạng
thái + F7 ghi report)".

Kết quả research B1 (`NOTES-01.md` dòng 114) về hạ tầng: Atlas Free có **~100 ops/s**, 0.5 GB, tối đa 500
connections, **không backup tự động**. Kết luận về transaction (`NOTES-01.md` dòng 131–132):

> "MongoDB đảm bảo atomic ở single document; multi-document transactions có trên replica set, nhưng MongoDB
> khuyên thiết kế schema để giảm nhu cầu distributed transaction."

Hai chi tiết làm cho transaction liên document trở thành giả định mong manh ở baseline: (a) transaction cần
**replica set**, và NOTES-01 **không xác nhận** M0 cung cấp gì về điểm này; (b) mục "CẦN BỔ SUNG"
 còn treo việc xác nhận năng lực M0; theo nguyên tắc làm việc ở `RESEARCH-PLAN.md` §0.1
("không bịa số liệu, không giả sử ràng buộc"), kiến trúc không được **đặt cược** vào một tính năng chưa xác minh.

State machine F2 (`NOTES-01.md` §B4 dòng 225–231) cũng cho thấy bản chất ghi là **một document**:

```text
DRAFT → ASSIGNED → IN_PROGRESS → PENDING_REVIEW ─┬─ approve ─→ COMPLETED
                      ↑                           │
                      └────── reject ─────────────┘
```

## Decision

**Không thiết kế F2 (hay bất kỳ luồng nào) dựa vào transaction nhiều collection**
(`NOTES-01.md` dòng 142). Thay vào đó, dùng pattern đã chốt ở `NOTES-01.md` dòng 134–140:

```text
project.status
project.version
project.updatedAt
project.statusHistory[]
transition = atomic conditional update
```

Ba quy tắc dẫn xuất từ pattern trên:

1. **Toàn bộ trạng thái chuyển tiếp nằm trong MỘT document** `projects`. `statusHistory[]` là embedded
   array — theo đúng hướng dẫn "embed khi dữ liệu thường đọc cùng nhau, reference khi dữ liệu dùng chung"
   (§B4 dòng 222–223). Vì MongoDB đảm bảo atomic ở single document, một transition là atomic **mà không
   cần transaction**.
2. **Conditional update là hàng rào chống lost update.** Update chỉ được áp dụng khi điều kiện tiền đề còn
   đúng (`status` hiện tại + `version`), nên hai Admin bấm duyệt cùng lúc không tạo hai lịch sử trái nhau.
   `version` tăng đơn điệu là cơ chế optimistic concurrency — đây là cách đọc pattern, không phải tính năng
   mới.
3. **Việc ghi kèm (report, notification) là "sau khi commit", không phải "trong transaction".** Nếu bước
   sau fail, nghiệp vụ không hỏng: `project_events` / `reports` / `notifications` tồn tại độc lập
   (§B4 dòng 218) và có thể tạo lại; notification vốn được **persist phía app** (§B7 dòng 364–365) nên
   mất một lần push không làm mất dữ liệu.

Quy tắc liên quan, cùng họ "không trộn trạng thái": **OVERDUE không phải state** — nó là dẫn xuất
`dueDate < now AND status != COMPLETED` (công thức rút từ §B4; vế `NOT IN {COMPLETED, CANCELLED}` trong nguồn
đã bỏ `CANCELLED` vì chính §B4 không có transition nào tới state đó — chốt ở `04-domain-model.md` 4.5),
tức là **không có write nào** cho trạng thái quá hạn ⇒ scheduler không cần transaction để "đánh dấu quá hạn".

## Alternatives considered

| Phương án | Lý do loại |
|---|---|
| **Multi-document transaction trên replica set** | Được ghi nhận là "có trên replica set" nhưng MongoDB "khuyên thiết kế schema để giảm nhu cầu distributed transaction" (§B1 dòng 131–132); năng lực thực tế trên M0 **chưa xác minh** → `[CẦN NGUỒN]`; và transaction nhiều document ăn thẳng vào trần **~100 ops/s** (dòng 114) |
| Testcontainers / replica set riêng cho môi trường dev | Không có trong NOTES-01; thêm hạ tầng trái danh sách "Không thêm ở baseline" (dòng 530–531) |
| Ghi `statusHistory` vào collection riêng `project_events` rồi join | `project_events` **có** tồn tại trong baseline collections (§B4 dòng 218) cho event log, nhưng lịch sử chuyển trạng thái phục vụ trực tiếp "theo dõi tiến độ" và được đọc cùng document ⇒ phải embed theo luật embed/reference ở §B4 dòng 222–223. Dùng cả hai: array embed cho lifecycle, `project_events` cho log chi tiết |
| Saga/orchestrator tự viết để bù transaction | Thuộc nhóm "microservice phức tạp" bị loại (dòng 530–531); chi phí đúng bằng chi phí thiết kế schema cho tốt |

## Consequences

**Điểm mạnh:**

- **Hoạt động trên mọi deployment**, kể cả khi M0 không cho transaction — quyết định không phụ thuộc vào
  chi tiết hạ tầng chưa xác minh.
- Atomic ở đúng chỗ nghiệp vụ cần: một lần đổi trạng thái + một lần append lịch sử = một document, một write.
- `statusHistory[]` + `version` + `updatedAt` cho **audit trail miễn phí** — khớp nghĩa vụ "audit every
  mutation" (§B6 dòng 318) mà không cần bảng log terpisah cho F2.
- Ít ops hơn ⇒ thân thiện với trần ~100 ops/s và 0.5 GB.
- Test được bằng `mongodb-memory-server` (chạy MongoDB thật trong process test, "có thể dựng replica set" —
  §B10 dòng 398–399) **mà không cần replica set** cho code production.

**Đánh đổi thật:**

- **Có thể vượt trần BSON 16 MB** nếu `statusHistory[]` phình theo thời gian với một đề tài sống lâu.
  NOTES-01 không nêu giới hạn này và cũng không chốt chính sách cắt array → `[CẦN NGUỒN]` cho ngưỡng;
  phải có chiến lược trim/roll-up khi thiết kế `05-data-model.md`.
- **Không còn tính "all-or-nothing" giữa document:** sau khi transition thành công mà bước tạo
  notification fail, hệ thống ở trạng thái "đúng nghiệp vụ, thiếu thông báo" — phải chấp nhận, và dựa vào
  retry idempotent để bù (liên quan ADR-011: job survive restart).
- Cấm `session.startTransaction()` là chuẩn mực kỷ luật của team. Theo luật "mỗi gate phải có lệnh CI"
 (`RESEARCH-PLAN.md` §11), **không có gate riêng cho luật này** vì chưa có lệnh được chốt; chỗ dựa
  hiện tại là dependency-cruiser + integration test chạy trên MongoDB thật.
- `version` phải được truyền đúng từ client đọc gần nhất ⇒ phát sinh xung đột giả khi UI để tab cũ mở;
  UX phải có đường "tải lại và thử lại".

## References

- `docs/research/NOTES-01.md` §B1 dòng 108–143 (trần hạ tầng, quyết định transaction, pattern `statusHistory[]`, câu chốt dòng 142)
- `docs/research/NOTES-01.md` §B4 dòng 213–248 (baseline collections, embed/reference, state machine F2, OVERDUE-derived, index)
- `docs/research/NOTES-01.md` §B10 dòng 397–399 (`mongodb-memory-server`); §B7 dòng 364–365 (durable notification)
- `docs/research/RESEARCH-PLAN.md` §3 B1 (câu hỏi transaction + "Hệ quả phải quyết")
- `docs/research/NOTES-01.md` dòng 553–556 (mục CẦN BỔ SUNG — năng lực M0 chưa xác minh)
- `docs/02-architecture.md` §5.2, §6, §10 (multi-document transaction bị loại ở baseline)
