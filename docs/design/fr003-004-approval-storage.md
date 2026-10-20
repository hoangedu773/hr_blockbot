# Đặc Tả Kỹ Thuật: Hàng Đợi Phê Duyệt Hồ Sơ Nhân Sự (FR-003 / FR-004)

- **Trạng thái:** ĐÃ PHÊ DUYỆT (User Approval: 2026-10-12)
- **Mã yêu cầu:** `FR-003`, `FR-004` (thuộc F1 — Hồ sơ nhân sự)
- **Cơ chế lưu trữ:** Bounded Embedded Array trong collection `employees` (bảo vệ baseline 11 collection theo `docs/05-data-model.md`).

---

## 1. Cấu Trúc Dữ Liệu (`employees.profileChangeRequests`)

Mỗi document trong collection `employees` bổ sung trường:

```typescript
interface ProfileChangeRequest {
  id: string; // ObjectId / UUID chuỗi
  requestedBy: string; // employeeId của người tạo yêu cầu
  requestedAt: Date;
  status: "PENDING" | "APPROVED" | "REJECTED";
  targetFields: {
    level?: "Intern" | "Junior" | "Middle" | "Senior" | "Lead";
    hiredAt?: Date;
    jobTitle?: string;
  };
  previousSnapshot: {
    level?: string;
    hiredAt?: Date;
    jobTitle?: string;
  };
  reviewedBy?: string; // employeeId của Admin duyệt
  reviewedAt?: Date;
  rejectionReason?: string; // Bắt buộc khi status = REJECTED
  previousRequestId?: string; // Dùng khi resubmit để giữ chuỗi lịch sử
}
```

---

## 2. Quy Tắc Nghiệp Vụ Bất Biến (Invariants)

1. **Allowlist nghiêm ngặt:** Chỉ cho phép yêu cầu đổi các trường: `level`, `hiredAt`, `jobTitle`. Tuyệt đối cấm các trường lương, tài khoản ngân hàng, CCCD hoặc thông tin cá nhân khác.
2. **Nguyên tử (Single-Document Atomic Update):**
   - **Tạo yêu cầu:** Thêm vào mảng `profileChangeRequests` với trạng thái `PENDING`. Không cập nhật trường thực tế của `employees`.
   - **Phê duyệt:** Dùng `findOneAndUpdate` với điều kiện `profileChangeRequests.id = targetId AND status = PENDING AND snapshot còn khớp`. Cập nhật đồng thời trường chính của employee và đổi trạng thái request sang `APPROVED`.
3. **Chặn tự duyệt (No Self-Approval):** Admin không được phép duyệt hoặc từ chối yêu cầu do chính mình tạo ra (`reviewedBy !== requestedBy`). Vi phạm trả về lỗi `SELF_APPROVAL` (`07 §7.3`).
4. **Từ chối có lý do:** Khi Admin từ chối (`REJECTED`), bắt buộc phải có `rejectionReason` không rỗng.
5. **Resubmit giữ lịch sử:** Nhân viên gửi lại sẽ tạo ra bản ghi request mới liên kết `previousRequestId`. Tuyệt đối không xóa hoặc ghi đè request cũ.
6. **Bảo vệ dung lượng (Bounded Array):** Giới hạn tối đa 20 request trong lịch sử của một nhân viên. Khi đạt trần, từ chối tạo yêu cầu mới với lỗi `MAX_CHANGE_REQUESTS_REACHED`; tuyệt đối không âm thầm xóa lịch sử cũ.
7. **Thứ tự thông báo:** Commit DB thành công -> Lưu bản ghi `notifications` -> Phát sự kiện Socket.IO `notification:new`. Lỗi WebSocket không làm rollback giao dịch DB.
