import mongoose, { Schema, Document } from "mongoose";

/**
 * Định danh đăng nhập là `username` (mã nhân viên cấp sẵn), KHÔNG phải email:
 * 2.439 nhân viên không có email và việc cấp phát hàng loạt không được phụ thuộc
 * vào việc thu thập email của từng người.
 */
export interface IUser extends Document {
  username: string;
  email?: string | null;
  passwordHash: string;
  role: "Admin" | "Employee";
  /** Bản sao `employees.businessRole` tại thời điểm cấp phát (admin = "admin"). */
  businessRole?: string | null;
  employeeId?: mongoose.Types.ObjectId | null;
  /**
   * Admin không gắn hồ sơ nhân viên (Ban điều hành / văn phòng) -> toàn quyền hệ thống.
   * Mặc định false: Admin có hồ sơ vẫn bị giới hạn theo department scope.
   */
  isGlobalAdmin: boolean;
  /** True khi mật khẩu vẫn là mật khẩu tạm do quản lý phát. */
  mustChangePassword: boolean;
  passwordChangedAt?: Date | null;
  createdAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    // Email chỉ còn là thông tin tuỳ chọn cho admin; đăng nhập không dùng email.
    email: {
      type: String,
      required: false,
      lowercase: true,
      trim: true,
      default: undefined,
    },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["Admin", "Employee"], required: true },
    businessRole: {
      type: String,
      enum: ["admin", "aom", "sm", "am", "ptch", "staff"],
      default: null,
    },
    employeeId: { type: Schema.Types.ObjectId, ref: "Employee", default: null },
    isGlobalAdmin: { type: Boolean, default: false },
    mustChangePassword: { type: Boolean, default: false },
    passwordChangedAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
  },
  {
    collection: "users",
    timestamps: false,
  }
);

// Email unique nhưng phải sparse: gần như toàn bộ tài khoản không có email.
UserSchema.index({ email: 1 }, { unique: true, sparse: true });

// Mỗi hồ sơ nhân viên chỉ được gắn tối đa một tài khoản. Partial (không phải sparse)
// vì admin được ghi `employeeId: null` — sparse vẫn tính null là "có giá trị" và sẽ
// từ chối tài khoản admin thứ hai.
UserSchema.index(
  { employeeId: 1 },
  { unique: true, partialFilterExpression: { employeeId: { $type: "objectId" } } }
);

export const UserModel =
  mongoose.models.User || mongoose.model<IUser>("User", UserSchema);
