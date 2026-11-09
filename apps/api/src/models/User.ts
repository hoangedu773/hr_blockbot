import mongoose, { Schema, Document } from "mongoose";
import { AuthorizationStateSchema, type AuthorizationState } from "@hr-blockbot/contracts";

/**
 * Định danh đăng nhập là `username` (mã nhân viên cấp sẵn), KHÔNG phải email:
 * 2.439 nhân viên không có email và việc cấp phát hàng loạt không được phụ thuộc
 * vào việc thu thập email của từng người.
 */
export interface IUser extends Document {
  username: string;
  email?: string | null;
  emailVerifiedAt?: Date | null;
  passwordChangeOtp?: {
    id: string;
    email: string;
    digest: string;
    expiresAt: Date;
    resendAt: Date;
    attempts: number;
    securityVersion: number;
    delivered: boolean;
  };
  passwordHash: string;
  role: "Admin" | "Employee";
  status: "active" | "disabled" | "pending_activation";
  provisioningRequestId?: mongoose.Types.ObjectId | null;
  lifecycleAppliedRequestId?: string | null;
  securityAudit?: any[];
  passwordRecovery?: any;
  legacyImportActivation?: any;
  legacyImportApprovalId?: mongoose.Types.ObjectId | null;
  securityVersion: number;
  authorization?: AuthorizationState | null;
  /** Legacy display label only; not an authorization profile or a capability grant. */
  businessRole?: string | null;
  employeeId?: mongoose.Types.ObjectId | null;
  /**
   * Legacy CRM flag, retained until route cutover. It does not assign system_admin,
   * HR authority or any capability in the new policy engine.
   */
  isGlobalAdmin: boolean;
  /** True khi mật khẩu vẫn là mật khẩu tạm do quản lý phát. */
  mustChangePassword: boolean;
  passwordChangedAt?: Date | null;
  createdAt: Date;
  /** Lần cuối bị quản trị viên sửa (role, liên kết hồ sơ, đặt lại mật khẩu). */
  updatedAt?: Date | null;
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
    // Email liên hệ; đăng nhập vẫn dùng mã nhân viên.
    email: {
      type: String,
      required: false,
      lowercase: true,
      trim: true,
      default: undefined,
    },
    emailVerifiedAt: { type: Date },
    passwordChangeOtp: { type: Schema.Types.Mixed, select: false },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["Admin", "Employee"], required: true },
    status: { type: String, enum: ["active", "disabled", "pending_activation"], default: "active" },
    provisioningRequestId: { type: Schema.Types.ObjectId, default: null },
    lifecycleAppliedRequestId: { type: String, default: null },
    securityAudit: { type: [Schema.Types.Mixed], default: [] },
    passwordRecovery: { type: Schema.Types.Mixed, default: null },
    legacyImportActivation: { type: Schema.Types.Mixed, default: null },
    legacyImportApprovalId: { type: Schema.Types.ObjectId, default: null },
    securityVersion: { type: Number, min: 0, default: 0, validate: Number.isSafeInteger },
    // No automatic role/title migration. Null means the new policy is NOT configured.
    authorization: { type: Schema.Types.Mixed, default: null,
      validate: (value: unknown) => value == null || AuthorizationStateSchema.safeParse(value).success },
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
    updatedAt: { type: Date, default: null },
  },
  {
    collection: "users",
    timestamps: false,
  }
);

// Email unique nhưng phải sparse: gần như toàn bộ tài khoản không có email.
UserSchema.index({ email: 1 }, { unique: true, sparse: true });
UserSchema.index({ "passwordRecovery.tokenHash": 1 }, { unique: true, partialFilterExpression: { "passwordRecovery.tokenHash": { $type: "string" } } });

// Mỗi hồ sơ nhân viên chỉ được gắn tối đa một tài khoản. Partial (không phải sparse)
// vì admin được ghi `employeeId: null` — sparse vẫn tính null là "có giá trị" và sẽ
// từ chối tài khoản admin thứ hai.
UserSchema.index(
  { employeeId: 1 },
  { unique: true, partialFilterExpression: { employeeId: { $type: "objectId" } } }
);

export const UserModel =
  mongoose.models.User || mongoose.model<IUser>("User", UserSchema);
