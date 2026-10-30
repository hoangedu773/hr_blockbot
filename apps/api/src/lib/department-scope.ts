import mongoose from "mongoose";

/**
 * `employees.departmentId` và `projects.departmentId` được seed bằng BSON ObjectId,
 * nhưng `req.user.departmentId` (auth.middleware) mang dạng string hex. Query thẳng
 * bằng string trả 0 document ⇒ mọi Admin không global thấy rỗng trên dữ liệu thật.
 * Fixture test cũ seed string ("DEPT_TECH") nên lỗi này không lộ ra.
 *
 * Trả về giá trị dùng trực tiếp trong query:
 * - `$in` khi là ObjectId hex (match cả document lưu ObjectId lẫn string hex),
 * - string nguyên bản cho dữ liệu cũ/fixture,
 * - `null` khi rỗng/không có scope.
 *
 * `null` chứ không `""`: `{ departmentId: null }` chỉ match document có
 * `departmentId` null hoặc thiếu field — fail-closed. `{ departmentId: "" }` sẽ
 * match department code rỗng nếu dữ liệu bẩn sinh ra giá trị đó.
 *
 * Nhận cả `null`/`undefined` để call site không phải tự guard: một call site quên
 * guard sẽ ra `TypeError` → 500, và client không phân biệt được 500 với sự cố hạ tầng.
 *
 * Regex 24-hex thay cho `mongoose.Types.ObjectId.isValid()`: `isValid` chấp nhận cả
 * chuỗi 12 byte ở một số phiên bản, regex thì không — tránh biến một department code
 * 12 ký tự thành ObjectId rồi match nhầm.
 */
export function departmentIdMatch(value: string | null | undefined): unknown {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (trimmed === "") return null;
  if (!/^[a-f0-9]{24}$/i.test(trimmed)) return trimmed;
  return { $in: [trimmed, new mongoose.Types.ObjectId(trimmed)] };
}
