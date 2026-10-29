/**
 * Quy luật cấp tài khoản cho nhân viên (nguồn duy nhất — script và test dùng chung).
 *
 *   username = mã nhân viên, viết thường            vd  GT-CH18030009 -> gt-ch18030009
 *   password = "Guta@" + 8 ký tự suy ra từ HMAC-SHA256(secret, username)
 *
 * Vì sao không dùng luật "Guta@ + mã nhân viên": mã nhân viên nằm trên bảng lương,
 * bảng chấm công, sổ ca — đồng nghiệp biết mã của nhau. Mật khẩu suy trực tiếp từ mã
 * nghĩa là ai biết mã cũng đăng nhập được tài khoản đó cho tới lần đổi đầu tiên.
 *
 * HMAC giữ được cả hai tính chất cần thiết:
 * - tất định: cùng secret + cùng username luôn ra cùng mật khẩu, nên không cần giữ
 *   file 2.439 mật khẩu làm nguồn sự thật, in lại phiếu lúc nào cũng được;
 * - không đoán được: thiếu secret thì không suy ra được mật khẩu của người khác.
 *
 * Secret nằm trong biến môi trường `ACCOUNT_PASSWORD_SECRET` (>= 32 ký tự), không
 * commit. Mất secret = phải cấp lại toàn bộ, giống như mất file mật khẩu.
 */

import crypto from "node:crypto";

export const PASSWORD_PREFIX = "Guta@";
export const PASSWORD_LENGTH = 8;
/** 32 ký tự, bỏ I/O/0/1 để không đọc nhầm khi in phiếu. */
export const PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const MIN_SECRET_LENGTH = 32;

export function normalizeUsername(employeeCode) {
  return String(employeeCode ?? "").trim().toLowerCase();
}

export function assertSecret(secret) {
  if (!secret || String(secret).trim().length < MIN_SECRET_LENGTH) {
    throw new Error(
      `ACCOUNT_PASSWORD_SECRET phải có ít nhất ${MIN_SECRET_LENGTH} ký tự (fail-closed: không có secret thì không suy ra mật khẩu)`
    );
  }
  return String(secret).trim();
}

/**
 * Suy ra mật khẩu tạm từ username + secret. 32 chia hết 256 nên `% 32` không lệch
 * phân phối; 8 ký tự = 40 bit, đủ cho một mật khẩu tạm bắt buộc đổi ở lần đầu.
 */
export function derivePassword(username, secret) {
  const key = assertSecret(secret);
  const normalized = normalizeUsername(username);
  if (normalized.length < 3) {
    throw new Error(`username không hợp lệ: '${username}'`);
  }
  const digest = crypto.createHmac("sha256", key).update(normalized).digest();
  let out = "";
  for (let index = 0; index < PASSWORD_LENGTH; index += 1) {
    out += PASSWORD_ALPHABET[digest[index] % PASSWORD_ALPHABET.length];
  }
  return `${PASSWORD_PREFIX}${out}`;
}

/** Mô tả quy luật để in ra CLI/tài liệu — không chứa secret. */
export function describeRule() {
  return [
    `username = mã nhân viên viết thường (vd gt-ch18030009)`,
    `password = "${PASSWORD_PREFIX}" + ${PASSWORD_LENGTH} ký tự HMAC-SHA256(ACCOUNT_PASSWORD_SECRET, username)`,
    `bảng ký tự: ${PASSWORD_ALPHABET}`,
  ].join("\n");
}
