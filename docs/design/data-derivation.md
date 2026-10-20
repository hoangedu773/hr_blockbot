# Suy diễn dữ liệu cho ERD (data derivation) — KLCN133

- **Trạng thái:** **ĐÃ CHẠY** cho R1–R4 (2026-10-20) — 01-departments, 02-derive-hr, verify pass. Còn R7 (users) và provenance collection
- **Kết quả đo:** 37 department · 2.439 hồ sơ có `level`/`status`/`departmentId`/`skills`/`activeLoad` · 6/6 assertion PASS · chạy lại `modified=0` (idempotent)
- **Ngày:** 2026-10-20
- **Nguồn dữ liệu thật:** `hr_bot` (Atlas M0, MongoDB 8.0.34) — đo trực tiếp trong phiên 2026-10-20
- **Bối cảnh:** DB hiện có 11 collection nhưng chỉ `employees` (2.439), `stores` (144), `schedule_entries` (3.275) là dữ liệu GUTA thật; 9/11 collection của thiết kế chưa tồn tại

---

## 0. Hợp đồng

- **Outcome:** bộ dữ liệu đủ để F1/F2/F3 chạy end-to-end, trong đó **mọi giá trị suy diễn đều tất định, có công thức công bố, tái lập được bằng một seed**.
- **Constraints:** không sửa dữ liệu gốc; không tạo PII giả; mọi field suy diễn phải truy được về `(field nguồn, ruleId, tham số)`; chạy lại không nhân đôi.
- **Non-goals:** không sinh dữ liệu ngẫu nhiên không nguồn; không bịa số liệu đo lường; không giả lập hành vi người dùng để báo cáo là "đo được".
- **Acceptance:** (1) 100% `level` nằm trong enum 5 giá trị; (2) `departmentId` resolve được về `departments`; (3) chạy script 2 lần cho cùng output; (4) báo cáo phân bố khớp bảng §4; (5) `derivedMeta` có mặt trên mọi field suy diễn.

---

## 1. Bằng chứng (đo từ `hr_bot`, 2026-10-20)

| Sự thật | Số | Dùng để suy ra |
|---|---:|---|
| `employees` | 2.439 | tổng dân số |
| có `hire_date` hợp lệ | 2.439 (0 lỗi parse) | **thâm niên thật** |
| thâm niên p10/p50/p90 | 2 / 13 / 25 tháng | chọn ngưỡng bậc |
| `leave_date` khác null | 1.699 | **status = inactive** (không cần bịa) |
| không `leave_date` | 740 | status = active |
| `profile_status` | ĐÃ HT 2.361 · CHƯA HT 78 | **không** phải trạng thái làm việc → không dùng |
| `job_title` | 18 giá trị phân biệt | bậc quản lý thật |
| `stores` | 144 | phòng ban theo khu vực |
| `store_raw` phân biệt | 144 (khớp `stores`) | khoá nối |
| `bank_account_number` khác null | 1.964 | **PII thật — không chép đi đâu** |

Phân bố `job_title` (thật):

| Nhóm | Title | Số |
|---|---|---:|
| Lãnh đạo | `OD`, `OM` | 1 + 1 |
| Quản lý vùng | `AOM`, `AM` | 5 + 24 |
| Quản lý cửa hàng | `SM`, `SM (Cửa hàng trưởng)`, `Phụ trách cửa hàng` | 78 + 2 + 89 |
| Bếp | `Bếp chính` | 5 |
| Nhân viên | cafe/bánh mì/bếp/bảo vệ/giao hàng | 2.232 |
| Không xác định | `null` | 2 |

---

## 2. Luật suy diễn (mỗi luật là hàm tất định)

| ID | Field | Luật | Nguồn | Số lượng dự kiến |
|---|---|---|---|---|
| **R1** | `status` | `active` nếu `leave_date` null, ngược lại `inactive` | dữ liệu thật | 740 / 1.699 — **không bịa** |
| **R2** | `departmentId` | tách `store_raw` theo mẫu `GUTA CAFE - <Khu vực> - <địa chỉ>` → `departments.code = slug(<Khu vực>)` | dữ liệu thật | ~15 khu vực, phủ 144 cửa hàng |
| **R3** | `level` | 2 tầng: **tầng quản lý theo title**, **tầng nhân viên theo thâm niên** (xem §3) | title thật + hire_date thật | 2 / 203 / 323 / 1.665 / 246 |
| **R4** | `skills` | bảng ánh xạ title → skill set cố định (không random) | bảng soạn tay, công bố | theo title |
| **R5** | `activeLoad` | đếm `projects` đang mở mà người đó là assignee | dữ liệu sinh ra sau | 0 lúc seed |
| **R6** | `phone` | **để null** | — | 0 — không tạo PII giả |
| **R7** | `userId` | chỉ gán cho tài khoản demo (5 người), không cấp 2.439 tài khoản | tài khoản seed | 5 |
| **R8** | `employeeCode` | giữ nguyên từ nguồn | dữ liệu thật | 2.439 |
| **R9** | tie-break | `mulberry32(seed=20261020, hash(employee_code))` — chỉ dùng khi không có tín hiệu thật | seed công bố | — |

Nguyên tắc: **không có R nào dùng random để quyết định một giá trị mà dữ liệu thật đã trả lời được.** R9 chỉ dùng cho thứ không có nguồn (ví dụ thứ tự hiển thị), và luôn kèm seed trong metadata.

---

## 3. Luật R3 — bậc 5 cấp, bám đúng hệ thống bậc thật của GUTA

```text
Lead    ← OD, OM                                            (2)
Senior  ← AOM, AM, SM, SM (Cửa hàng trưởng)                 (5+24+78+2 = 109)
Middle  ← Phụ trách cửa hàng, Bếp chính, nhân viên ≥ 24 tháng (89+5+?)
Junior  ← nhân viên 3–24 tháng                                (?)
Intern  ← nhân viên < 3 tháng                                 (246)
```

Ngưỡng lấy từ phân bố thật (p10 = 2 tháng, p50 = 13, p90 = 25):

| Ngưỡng | Lý do chọn bằng số |
|---|---|
| `< 3 tháng` → Intern | 253 người (10,4%) — đúng nhóm mới vào nghề |
| `3–24 tháng` → Junior | khối đông nhất của chuỗi bán lẻ |
| `≥ 24 tháng` → Middle | 323 người (p90 = 25) — thâm niên cao, không phải quản lý |
| title quản lý → Senior/Lead | 111 người có title quản lý |

**Vì sao không chọn "Middle = mọi nhân viên ≥12 tháng":** sẽ đẩy 1.380 người vào bậc trung — sai bản chất (Middle trong thang 5 bậc là cấp trung, không phải số đông nhân viên). Con số phải giải thích được trước hội đồng, không chỉ đẹp.

Số **thực tế sau khi chạy** (2026-10-20, `scripts/seed/02-derive-hr.py`):

| Bậc | Số người | Nguồn bậc |
|---|---:|---|
| Lead | 2 | title OD, OM |
| Senior | 109 | title AOM, AM, SM, SM (Cửa hàng trưởng) |
| Middle | 322 | 94 theo title + 228 theo thâm niên ≥24 tháng |
| Junior | 1.759 | nhân viên 3–24 tháng |
| Intern | 247 | nhân viên < 3 tháng |
| **Tổng** | **2.439** | khớp 100% nguồn |

Bậc quản lý (205 người) lấy từ title thật; bậc nhân viên (2.234) lấy từ thâm niên thật. Không có bậc nào do random.

---

## 4. Provenance — chứng minh không "bịa ẩu"

### 4.1 Trên từng document

```json
{
  "level": "Junior",
  "derivedMeta": {
    "level":    { "rule": "R3-level-title-tenure-v1", "inputs": ["job_title","hire_date"], "at": "2026-10-20T14:00:00Z" },
    "status":   { "rule": "R1-status-leave-v1",       "inputs": ["leave_date"] },
    "department": { "rule": "R2-region-from-store-v1","inputs": ["store_raw"] }
  }
}
```

### 4.2 Collection `data_provenance` (1 document / lần chạy)

```text
runId, at, seed: 20261020,
rules: [{ ruleId, version, description, inputs[], branchCounts{...}, codeHash }],
totals: { employees: 2439, derived: 3, untouched: 10 },
outputs: [{ collection, field, distribution: {...} }]
```

`codeHash` = sha256 của file script → chứng minh báo cáo ứng với đúng phiên bản luật.

### 4.3 Tái lập

- Chạy 2 lần → so `provenance-report.json`, phải **byte-identical** (trừ `at`).
- Có `--dry-run` in ra phân bố, không ghi.
- Có `--revert` xoá `derivedMeta` + field suy diễn, trả `employees` về đúng 13 field gốc.

---

## 5. Kiểm chứng (assertions, chạy được)

| # | Assertion | Cách đo |
|---|---|---|
| V1 | `level ∈ {Intern,Junior,Middle,Senior,Lead}` cho 100% | count documents sai = 0 |
| V2 | `departmentId` resolve 100% về `departments._id` | left join, đếm orphan = 0 |
| V3 | `status` khớp `leave_date` | đếm lệch = 0 |
| V4 | Phân bố khớp `provenance-report.json` | so 2 lần chạy |
| V5 | Không document nào có `phone` khác null | count = 0 |
| V6 | `derivedMeta` có đủ 3 rule cho 100% | count thiếu = 0 |

---

## 6. Những gì **không** suy diễn (và lý do)

| Thứ | Vì sao không |
|---|---|
| `phone` | không có trong nguồn; tạo số giả = PII giả, vi phạm nguyên tắc tối thiểu dữ liệu |
| `bank_*` | PII thật, không copy sang collection mới; giữ nguyên tại `employees` gốc |
| `password` cho 2.439 người | 2.439 tài khoản giả không phục vụ demo, chỉ tăng bề mặt tấn công |
| KPI/`evaluations` | phải **tính** từ `projects` bằng công thức (ADR-013), không điền tay |
| `policies` | dùng văn bản pháp luật thật + quy chế tự soạn có nhãn, không bịa điều khoản |

---

## 7. Phương án đã cân nhắc

| Phương án | Giả định sống còn | Sập ở đâu | Kết luận |
|---|---|---|---|
| A. Faker/random toàn bộ | không ai hỏi nguồn gốc | câu hỏi đầu tiên của hội đồng về 2.439 hồ sơ | loại |
| B. **Luật tất định + provenance** (đề xuất) | công thức map được chấp nhận là "enrichment hợp lệ" | nếu GVHD đòi 100% dữ liệu gốc cho mọi field | chọn B, rủi ro thấp nhất |
| C. Nhập tay 2.439 hồ sơ | có thời gian | 3 tuần không đủ, sai số cao | loại |

**Better approaches:** none — hướng bạn nêu (suy diễn từ nguồn thật + công bố quy tắc) đúng là hướng tốt nhất trong 3; chỉ bổ sung thêm provenance + assertion để nó đứng được trước hội đồng.

---

## 8. Việc phải làm khi được duyệt

Đã xong (2026-10-20):

- ✅ `scripts/seed/01-departments.py` — 37 department (26 khu vực + 8 group quản lý + 3 unmapped), upsert idempotent
- ✅ `scripts/seed/02-derive-hr.py` — R1, R3, R4, R5, R6 + `derivedMeta`; chạy lại `modified=0`
- ✅ `scripts/seed/verify.py` — V1..V6 PASS

Còn lại:

1. `scripts/seed/03-users.py` — 5 tài khoản demo (2 Admin, 3 Employee), hash Argon2id
2. `scripts/seed/04-provenance.py` — ghi `data_provenance` + `provenance-report.json` (ruleId, codeHash, distribution)
3. `scripts/seed/05-policies.py` — ingest văn bản pháp luật thật + quy chế tự soạn (nhãn rõ)

Mỗi script: idempotent, `--dry-run`, `--revert`, không log PII.
