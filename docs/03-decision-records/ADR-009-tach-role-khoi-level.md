# ADR-009 — Tách `role` (Admin | Employee) khỏi `level` (5 bậc); không dùng CASL ở MVP

- **Status:** Accepted
- **Date:** 13/09/2026
- **Quyết định này ảnh hưởng tới:** `02-architecture.md` §3 (System Context), §5.2 (`modules/auth`, `modules/hr`), §7.1

---

## Context

Đề cương mô tả F1 là "hồ sơ / phòng ban / **5 cấp bậc**" và đồng thời yêu cầu "RBAC Admin/Employee"
(`RESEARCH-PLAN.md` §1). Hai khái niệm này rất dễ bị gộp thành một trường duy nhất khi code —
và `RESEARCH-PLAN.md` §3 B3 đã nêu đúng nỗi lo: "RBAC 2 vai × 5 cấp bậc: permission matrix hay
role hierarchy? Có cần CASL không?"

Ký hiệu `(!)` trong NOTES-01 (dòng 10–11) nghĩa là "chỗ research của nhóm bác bỏ/đảo ngược giả định trong
`RESEARCH-PLAN.md` gốc". Kết luận B3 mang dấu này và phát biểu như sau:

> **(!) RBAC không trộn 2 trục:**
>
> `role = Admin | Employee` → quyền hệ thống
>
> `level = Intern | Junior | Middle | Senior | Lead` → dữ liệu nghiệp vụ
>
> "Không cần CASL ở MVP với chỉ hai role."

`level` xuất hiện ở hai nơi trong nghiệp vụ đã chốt: F1 (mô tả hồ sơ) và F4 (gợi ý phân công theo kỹ năng —
một Lead khác một Intern khi xét giao việc). `role` xuất hiện ở mọi gate quyền: tool catalog của agent quy
định đích danh `assign_project (confirm + Admin)` và `override_kpi (confirm + reason + Admin)`
(`NOTES-01.md` §B6 dòng 327–329).

## Decision

**Hai trục độc lập, hai field độc lập, không suy diễn cái này từ cái kia.**

```text
role  : Admin | Employee      -> dung de quyet dinh quyen he thong (RBAC guard)
level : Intern | Junior | Middle | Senior | Lead
                              -> du lieu nghiep vu trong ho so nhan vien (F1),
                                 dau vao cho matching (F4), khong phai quyen
```

Quy tắc triển khai:

1. RBAC guard chỉ đọc `role`. `02-architecture.md` §7.1 ghi bất biến "RBAC check every tool" — tool
   `assign_project` và `override_kpi` check `role === Admin`, **không bao giờ** check `level`.
2. `level` nằm ở `modules/hr`, là attribute của `employees`, được `modules/project`/matching đọc như dữ
   liệu.
3. Middleware auth attach `userId` + `role` vào request context; `level` muốn dùng thì phải đọc hồ sơ —
   không nhét vào access token làm quyền. *Ghi chú: NOTES-01 không mô tả claims trong token; đây là hệ quả
   của việc tách trục, và danh sách claim chính thức thuộc `07-auth-rbac.md`.*
4. **Không dùng CASL** (hay bất kỳ thư viện permission matrix nào) ở MVP: chỉ hai role thì một enum + một
   guard là đủ.

## Alternatives considered

| Phương án | Lý do loại |
|---|---|
| **Dùng `level` làm role hierarchy** (Lead ≈ Admin, Intern ≈ Employee yếu) | Đúng cái mà B3 bác: "RBAC **không trộn 2 trục**" (`NOTES-01.md` dòng 202). Trộn trục tạo ra quyền không ai định nghĩa: một Senior không phải Admin nhưng lại có quyền "gần bằng"; ngược lại Admin mới vào làm Intern sẽ bị matching coi là người thiếu kỹ năng |
| **CASL / permission matrix thư viện** | "Không cần CASL ở MVP với chỉ hai role" (`NOTES-01.md` dòng 209). Thêm abstraction layer để phục vụ 2 giá trị là trả phí cho tính linh hoạt chưa dùng |
| ABAC theo phòng ban (`departmentId` làm điều kiện quyền) | Đề cương chỉ yêu cầu RBAC Admin/Employee (`RESEARCH-PLAN.md` §1). **Nhưng** note quan trọng: S10 NL→data **có** inject "user/department scope" ở server (`NOTES-01.md` §B15 dòng 491) — đó là **phạm vi dữ liệu (scoping)** do server áp, không phải một trục quyền thứ hai mở cho người dùng. Không được nhân cơ hội đó để biến `departmentId` thành role |
| Nhiều role hơn (Manager, HR, Reviewer…) | UF-02 (nghỉ phép theo cấp), UF-03, UF-07, UF-08 đều bị để ở `docs/backlog-parked.md` chờ GVHD (`NOTES-01.md` §B0 dòng 47) ⇒ chưa có luồng nào cần role thứ ba trong F1–F7 |

## Consequences

**Điểm mạnh:**

- **Không có vùng xám quyền.** Câu hỏi "một Lead có được `override_kpi` không?" có đáp án duy nhất: *không,
  trừ khi `role = Admin`*. Đây là kiểu lỗi mà gộp trục sinh ra và rất khó sửa về sau.
- Thêm `level` mới (hoặc đổi thang bậc) không đụng tới file nào trong `modules/auth`.
- Hai trục này đúng với mô hình ngành mà B0 khảo sát: quyền duyệt thuộc về vai quản trị, cấp bậc thuộc về
  hồ sơ chuyên môn.
- Guard là mã nhỏ, kiểm soát được, và test được bằng Vitest/Supertest trên `mongodb-memory-server`
  (`NOTES-01.md` §B10 dòng 397–399) mà không cần cấu hình permission JSON.

**Đánh đổi thật:**

- **Hai trục, hai chỗ phải nhớ.** Dev mới dễ viết `if (user.level === 'Lead')` để "cho nhanh"; luật hiện có
  không có gate CI riêng (không có lệnh nào được chốt cho nó), nên chỗ dựa là code review + test của
 `modules/auth` — theo đúng luật "không thêm gate nếu chưa có lệnh" ở `RESEARCH-PLAN.md` §11.
- **Chi phí mở rộng:** nếu GVHD duyệt thêm luồng phê duyệt nhiều cấp (UF-02 — multi-step approval là thứ
  Personio có, `NOTES-01.md` §B0 dòng 20–21), hai role sẽ không đủ và lúc đó CASL/permission matrix quay
  lại thành quyết định thật. ADR này phải được supersede **một cách tường minh**, không âm thầm nới enum.
- UI phải hiển thị hai khái niệm phân biệt rõ (nhãn "vai trò" và "cấp bậc") để người dùng không hiểu `level`
  như quyền — thuộc `10-ui-ux-spec.md`.

## References

- `docs/research/NOTES-01.md` §B3 dòng 202–209 (quyết định tách trục, không CASL)
- `docs/research/NOTES-01.md` §B6 dòng 327–329 (`assign_project (confirm + Admin)`, `override_kpi (confirm + reason + Admin)`)
- `docs/research/NOTES-01.md` §B0 dòng 19–21, 47 (multi-step approval; UF-02/03/07/08 bị park); §B15 dòng 491 (server inject user/department scope)
- `docs/research/RESEARCH-PLAN.md` §1; §3 B3; §11
- `docs/02-architecture.md` §3, §5.2, §7.1, §10 (hàng CASL)
