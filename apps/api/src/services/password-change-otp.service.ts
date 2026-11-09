import { createHmac, randomInt, randomUUID } from "node:crypto";
import { UserModel } from "../models/User.js";
import { getJwtSecret, verifyPassword } from "./auth.service.js";
import { securityVersion, securityVersionFilter } from "./principal.service.js";
import { WorkflowError } from "./project-workflow.service.js";
import { deliverableAccountEmail, type AccountMail } from "./account-mail.service.js";

const LIFETIME = 5 * 60_000;
const COOLDOWN = 60_000;
const MAX_ATTEMPTS = 5;
const digest = (id: string, code: string) => createHmac("sha256", getJwtSecret()).update(`password-change:${id}:${code}`).digest("hex");
const invalid = () => new WorkflowError(400, "PASSWORD_OTP_INVALID", "Mã xác nhận sai, hết hạn hoặc đã dùng. Bạn có thể yêu cầu mã mới.");

export async function issuePasswordChangeOtp(userId: string, version: number, currentPassword: string, send?: AccountMail) {
  const user = await UserModel.findById(userId);
  if (!user || securityVersion(user) !== version || user.status === "disabled") throw new WorkflowError(401, "UNAUTHENTICATED", "Phiên đăng nhập không còn hiệu lực.");
  if (!await verifyPassword(user.passwordHash, currentPassword)) throw new WorkflowError(400, "CURRENT_PASSWORD_INCORRECT", "Mật khẩu hiện tại không đúng.");
  const email = deliverableAccountEmail(user.email);
  if (!email || !user.emailVerifiedAt) throw new WorkflowError(422, "ACCOUNT_EMAIL_REQUIRED", "Tài khoản chưa có email đã xác minh để nhận mã. Liên hệ quản lý tài khoản để cập nhật.");
  if (!send) throw new WorkflowError(503, "ACCOUNT_MAIL_UNAVAILABLE", "Kênh gửi mã chưa sẵn sàng. Vui lòng thử lại sau.");

  const now = Date.now();
  const id = randomUUID();
  const code = String(randomInt(1_000_000)).padStart(6, "0");
  const otp = { id, email, digest: digest(id, code), expiresAt: new Date(now + LIFETIME), resendAt: new Date(now + COOLDOWN), attempts: 0, securityVersion: version, delivered: false };
  const changed = await UserModel.updateOne({
    _id: user._id, email, emailVerifiedAt: user.emailVerifiedAt, passwordHash: user.passwordHash, status: { $ne: "disabled" },
    ...securityVersionFilter(version),
    $or: [{ "passwordChangeOtp.resendAt": { $exists: false } }, { "passwordChangeOtp.resendAt": { $lte: new Date(now) } }],
  }, { $set: { passwordChangeOtp: otp } });
  if (!changed.modifiedCount) throw new WorkflowError(429, "PASSWORD_OTP_COOLDOWN", "Vui lòng đợi ít nhất 60 giây trước khi yêu cầu mã mới.");
  try {
    await send({ to: email, subject: "Mã đổi mật khẩu GUTA Workspace", body: `Mã xác nhận đổi mật khẩu: ${code}\nMã chỉ dùng một lần trong 5 phút.` });
  } catch {
    throw new WorkflowError(503, "ACCOUNT_MAIL_UNAVAILABLE", "Chưa gửi được mã xác nhận. Vui lòng thử lại sau.");
  }
  const delivered = await UserModel.updateOne({ _id: user._id, "passwordChangeOtp.id": id, ...securityVersionFilter(version) }, { $set: { "passwordChangeOtp.delivered": true } });
  if (!delivered.modifiedCount) throw invalid();
  const [local, domain] = email.split("@");
  return { challengeId: id, destination: `${local[0]}***@${domain}`, expiresInSeconds: LIFETIME / 1000 };
}

export async function passwordChangeOtpFilter(userId: string, version: number, challengeId: string, code: string, email?: string | null) {
  const filter = {
    _id: userId, ...securityVersionFilter(version),
    "passwordChangeOtp.id": challengeId, "passwordChangeOtp.securityVersion": version, "passwordChangeOtp.email": email ?? null,
    "passwordChangeOtp.delivered": true, "passwordChangeOtp.expiresAt": { $gt: new Date() },
    "passwordChangeOtp.attempts": { $lt: MAX_ATTEMPTS },
  };
  const otpDigest = digest(challengeId, code);
  const rejected = await UserModel.updateOne({ ...filter, "passwordChangeOtp.digest": { $ne: otpDigest } }, { $inc: { "passwordChangeOtp.attempts": 1 } });
  const verified = { ...filter, "passwordChangeOtp.digest": otpDigest };
  if (rejected.modifiedCount || !await UserModel.exists(verified)) throw invalid();
  return verified;
}
