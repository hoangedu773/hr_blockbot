import { randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import type { AuthenticatedUser } from "../middlewares/auth.middleware.js";
import { GoogleSignInChallengeModel } from "../models/GoogleSignInChallenge.js";
import { UserModel } from "../models/User.js";
import { WorkflowError } from "./project-workflow.service.js";
import { securityVersion } from "./principal.service.js";

const keys = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const invalid = () => new WorkflowError(400, "GOOGLE_CREDENTIAL_INVALID", "Xác thực Google đã hết hạn hoặc không hợp lệ. Hãy mở lại và thử lại.");
const noAccount = () => new WorkflowError(403, "GOOGLE_ACCOUNT_UNAVAILABLE", "Google chưa liên kết với tài khoản HRM đang hoạt động. Đăng nhập bằng mã nhân viên để liên kết.");

export function googleClientId() {
  return process.env.GOOGLE_SIGN_IN_CLIENT_ID?.trim() || null;
}

function binding(user?: AuthenticatedUser) {
  return { userId: user?.userId ?? null, sessionId: user?.sid ?? null, securityVersion: user ? securityVersion(user) : null };
}

export async function issueGoogleChallenge(user?: AuthenticatedUser) {
  const clientId = googleClientId();
  if (!clientId) return { enabled: false as const };
  const nonce = randomBytes(32).toString("hex");
  await GoogleSignInChallengeModel.create({ _id: nonce, ...binding(user), expiresAt: new Date(Date.now() + 5 * 60_000) });
  return { enabled: true as const, clientId, nonce };
}

export async function verifyGoogleIdentity(credential: string, nonce: string, clientId: string, getKey: JWTVerifyGetKey = keys) {
  try {
    const { payload } = await jwtVerify(credential, getKey, {
      audience: clientId, issuer: ["https://accounts.google.com", "accounts.google.com"],
      algorithms: ["RS256"], requiredClaims: ["sub", "iat", "exp"], maxTokenAge: "5 minutes",
    });
    if (payload.nonce !== nonce || payload.email_verified !== true || !payload.sub || payload.sub.length > 255 ||
        (payload.azp !== undefined && payload.azp !== clientId)) throw invalid();
    return payload.sub;
  } catch {
    throw invalid();
  }
}

export async function consumeGoogleIdentity(credential: string, nonce: string, user?: AuthenticatedUser, getKey: JWTVerifyGetKey = keys) {
  const clientId = googleClientId();
  if (!clientId) throw new WorkflowError(503, "GOOGLE_SIGN_IN_DISABLED", "Đăng nhập Google chưa được bật.");
  const filter = { _id: nonce, ...binding(user), expiresAt: { $gt: new Date() } };
  if (!await GoogleSignInChallengeModel.exists(filter)) throw invalid();
  const subject = await verifyGoogleIdentity(credential, nonce, clientId, getKey);
  if (!await GoogleSignInChallengeModel.findOneAndDelete({ ...filter, expiresAt: { $gt: new Date() } })) throw invalid();
  return subject;
}

export async function googleLoginAccount(subject: string) {
  const user = await UserModel.findOne({ googleSubject: subject, status: "active", mustChangePassword: { $ne: true } });
  if (!user) throw noAccount();
  return user;
}

export { noAccount as googleAccountUnavailable };
