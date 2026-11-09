import { Router, Request, Response } from "express";
import crypto from "crypto";
import { z } from "zod";
import { endpoint } from "../lib/endpoint.js";
import { issuePasswordChangeOtp, passwordChangeOtpFilter } from "../services/password-change-otp.service.js";
import { deliverableAccountEmail } from "../services/account-mail.service.js";
import {
  LoginRequestSchema,
  LoginResponseSchema,
  RefreshResponseSchema,
  MeResponseSchema,
  ChangePasswordRequestSchema,
} from "@hr-blockbot/contracts";
import { UserModel, type IUser } from "../models/User.js";
import { consumeGoogleIdentity, googleAccountUnavailable, googleLoginAccount, issueGoogleChallenge } from "../services/google-sign-in.service.js";
import { WorkflowError } from "../services/project-workflow.service.js";
import { RefreshSessionModel } from "../models/RefreshSession.js";
import {
  verifyPassword,
  hashPassword,
  createLoginSession,
  rotateRefreshToken,
  logoutSession,
  getRefreshTokenCookieOptions,
  getClearCookieOptions,
} from "../services/auth.service.js";
import { authenticateToken } from "../middlewares/auth.middleware.js";
import { loadAccount, resolvePrincipal, securityVersion, securityVersionFilter, PrincipalUnavailableError } from "../services/principal.service.js";
import { authorizationSummary } from "../services/authorization-summary.service.js";
import {
  registerLoginAttempt,
  clearLoginAttempts,
} from "../services/login-attempt-limiter.js";

const router = Router();
function loginAttemptKey(req: Request, username: string): string {
  return `${req.ip || "unknown"}|${username.toLowerCase()}`;
}

async function sendLoginSession(req: Request, res: Response, user: IUser) {
  const { accessToken, rawRefreshToken } = await createLoginSession(user, {
    ip: req.ip, userAgent: req.headers["user-agent"],
  });
  const principal = await resolvePrincipal({ sub: String(user._id), role: user.role, securityVersion: securityVersion(user) });
  const responseBody = LoginResponseSchema.parse({
    accessToken,
    user: { id: String(user._id), role: user.role, username: user.username,
      mustChangePassword: user.mustChangePassword === true, authorization: authorizationSummary(principal) },
  });
  res.cookie("refreshToken", rawRefreshToken, getRefreshTokenCookieOptions());
  res.status(200).json(responseBody);
}

const googleCredential = z.object({
  credential: z.string().min(1).max(8192),
  nonce: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
const googleLink = googleCredential.extend({ currentPassword: z.string().min(1).max(128) }).strict();
const googleRateLimit = () => new WorkflowError(429, "TOO_MANY_ATTEMPTS", "Bạn đã thử quá nhiều lần. Vui lòng thử lại sau.");

router.get("/auth/google/challenge", endpoint(async (req, res) => {
  if (registerLoginAttempt("google-challenge|" + req.ip)) throw googleRateLimit();
  res.set("Cache-Control", "no-store").json(await issueGoogleChallenge());
}));

router.post("/auth/google/login", endpoint(async (req, res) => {
  const { credential, nonce } = googleCredential.parse(req.body);
  const key = "google-login|" + req.ip;
  if (registerLoginAttempt(key)) throw googleRateLimit();
  const subject = await consumeGoogleIdentity(credential, nonce);
  const user = await googleLoginAccount(subject);
  try { await sendLoginSession(req, res, user); }
  catch (error) {
    if (error instanceof PrincipalUnavailableError) throw googleAccountUnavailable();
    throw error;
  }
  clearLoginAttempts(key);
  clearLoginAttempts("google-challenge|" + req.ip);
}));

router.get("/auth/google/link", authenticateToken, endpoint(async (req, res) => {
  if (registerLoginAttempt("google-link-challenge|" + req.user!.userId)) throw googleRateLimit();
  res.set("Cache-Control", "no-store").json(await issueGoogleChallenge(req.user!));
}));

router.post("/auth/google/link", authenticateToken, endpoint(async (req, res) => {
  const { credential, nonce, currentPassword } = googleLink.parse(req.body);
  const principal = req.user!;
  const key = "google-link|" + principal.userId;
  if (registerLoginAttempt(key)) throw googleRateLimit();
  const user = await UserModel.findById(principal.userId);
  if (!user || !await verifyPassword(user.passwordHash, currentPassword)) {
    throw new WorkflowError(400, "CURRENT_PASSWORD_INCORRECT", "Mật khẩu hiện tại không đúng.");
  }
  const subject = await consumeGoogleIdentity(credential, nonce, principal);
  const version = securityVersion(principal);
  try {
    await UserModel.init();
    const indexes = await UserModel.collection.indexes();
    if (!indexes.some(index => index.unique && index.key.googleSubject === 1)) {
      throw new WorkflowError(503, "GOOGLE_LINK_UNAVAILABLE", "Chưa thể liên kết Google lúc này.");
    }
    const changed = await UserModel.updateOne({
      _id: user._id, status: "active", passwordHash: user.passwordHash,
      ...securityVersionFilter(version), mustChangePassword: { $ne: true },
      $or: [{ googleSubject: null }, { googleSubject: subject }],
    }, { $set: { googleSubject: subject } });
    if (!changed.matchedCount) throw new WorkflowError(409, "GOOGLE_LINK_CONFLICT", "Tài khoản HRM đã liên kết Google khác hoặc đã thay đổi.");
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === 11000) {
      throw new WorkflowError(409, "GOOGLE_LINK_CONFLICT", "Tài khoản Google đã được liên kết với tài khoản HRM khác.");
    }
    throw error;
  }
  clearLoginAttempts(key);
  clearLoginAttempts("google-link-challenge|" + principal.userId);
  res.status(204).end();
}));

// A throwaway hash so the "user not found" branch costs the same as a wrong password.
let dummyHashPromise: Promise<string> | null = null;
function dummyHash(): Promise<string> {
  if (dummyHashPromise === null) {
    dummyHashPromise = hashPassword(crypto.randomBytes(16).toString("hex"));
  }
  return dummyHashPromise;
}

// POST /api/auth/login
router.post("/auth/login", async (req: Request, res: Response) => {
  const parseResult = LoginRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      error: {
        code: "VALIDATION_FAILED",
        message: "Invalid login payload",
        details: parseResult.error.flatten(),
      },
    });
    return;
  }

  const { username, password } = parseResult.data;
  const normalizedUsername = username.toLowerCase();
  const attemptKey = loginAttemptKey(req, normalizedUsername);

  if (registerLoginAttempt(attemptKey)) {
    res.status(429).json({
      error: {
        code: "TOO_MANY_ATTEMPTS",
        message: "Too many login attempts. Try again in a few minutes.",
      },
    });
    return;
  }

  try {
    const user = await UserModel.findOne({ username: normalizedUsername });
    if (!user) {
      // P1-4: burn comparable CPU on a dummy hash so "unknown username" and "wrong
      // password" take the same time. Response body stays identical either way.
      await verifyPassword(await dummyHash(), password).catch(() => false);
      res.status(401).json({
        error: {
          code: "UNAUTHENTICATED",
          message: "Invalid username or password",
        },
      });
      return;
    }

    const isValid = await verifyPassword(user.passwordHash, password);
    let accountAvailable = false;
    try { await loadAccount(String(user._id)); accountAvailable = true; }
    catch (err) { if (!(err instanceof PrincipalUnavailableError)) throw err; }
    if (!isValid || !accountAvailable) {
      // Generic error response
      res.status(401).json({
        error: {
          code: "UNAUTHENTICATED",
          message: "Invalid username or password",
        },
      });
      return;
    }

    clearLoginAttempts(attemptKey);

    await sendLoginSession(req, res, user);
  } catch (err) {
    console.error("[Auth] Login error:", err instanceof Error ? err.message : "internal error");
    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "An internal server error occurred during login",
      },
    });
  }
});

// POST /api/auth/refresh
router.post("/auth/refresh", async (req: Request, res: Response) => {
  const rawRefreshToken = req.cookies?.refreshToken;
  if (!rawRefreshToken || typeof rawRefreshToken !== "string") {
    res.status(401).json({
      error: {
        code: "UNAUTHENTICATED",
        message: "Refresh token is missing",
      },
    });
    return;
  }

  const sessionCtx = {
    ip: req.ip,
    userAgent: req.headers["user-agent"],
  };

  try {
    const result = await rotateRefreshToken(rawRefreshToken, sessionCtx);
    if (!result.success) {
      res.clearCookie("refreshToken", getClearCookieOptions());
      res.status(401).json({
        error: {
          code: result.error.code,
          message: result.error.message,
        },
      });
      return;
    }

    // Set new rotated refresh token in cookie
    res.cookie("refreshToken", result.newRefreshToken, getRefreshTokenCookieOptions());

    const responseBody = RefreshResponseSchema.parse({
      accessToken: result.accessToken,
    });

    res.status(200).json(responseBody);
  } catch (err) {
    console.error("[Auth] Refresh error:", err instanceof Error ? err.message : "internal error");
    res.clearCookie("refreshToken", getClearCookieOptions());
    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "An internal server error occurred during token refresh",
      },
    });
  }
});

// POST /api/auth/logout
router.post("/auth/logout", async (req: Request, res: Response) => {
  const rawRefreshToken = req.cookies?.refreshToken;
  try {
    await logoutSession(rawRefreshToken);
  } catch (err) {
    console.error("[Auth] Logout error:", err instanceof Error ? err.message : "internal error");
  } finally {
    res.clearCookie("refreshToken", getClearCookieOptions());
    res.status(204).send();
  }
});

// GET /api/auth/me
router.get("/auth/me", authenticateToken, (req: Request, res: Response) => {
  const user = req.user!;
  const meData = MeResponseSchema.parse({
    userId: user.userId,
    role: user.role,
    employeeId: user.employeeId ?? null,
    departmentId: user.departmentId ?? null,
    level: user.level ?? null,
    skills: user.skills,
    username: user.username,
    mustChangePassword: user.mustChangePassword,
    isGlobalAdmin: user.isGlobalAdmin,
    authorization: authorizationSummary(user),
  });

  res.status(200).json(meData);
});

const passwordOtpRequest = z.object({ currentPassword: z.string().min(1).max(128) }).strict();
router.post("/auth/change-password/otp", authenticateToken, endpoint(async (req, res) => {
  const { currentPassword } = passwordOtpRequest.parse(req.body);
  const key = "password-otp|" + req.user!.userId;
  if (registerLoginAttempt(key)) {
    res.status(429).json({ error: { code: "PASSWORD_OTP_COOLDOWN", message: "Quá nhiều lần thử. Vui lòng đợi rồi thử lại." } });
    return;
  }
  const issued = await issuePasswordChangeOtp(req.user!.userId, securityVersion(req.user!), currentPassword, req.app.locals.accountMail);
  await clearLoginAttempts(key);
  res.status(200).json(issued);
}));

router.post("/auth/change-password", authenticateToken, async (req: Request, res: Response) => {
  const parsed = ChangePasswordRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: {
        code: "VALIDATION_FAILED",
        message: "Invalid change-password payload",
        details: parsed.error.flatten(),
      },
    });
    return;
  }

  const { currentPassword, newPassword, challengeId, otp } = parsed.data;

  try {
    const user = await UserModel.findById(req.user!.userId);
    if (!user || securityVersion(user) !== securityVersion(req.user!)) {
      res.status(401).json({
        error: { code: "UNAUTHENTICATED", message: "User not found or deactivated" },
      });
      return;
    }

    const temporaryWithoutEmail = user.mustChangePassword && (!user.emailVerifiedAt || !deliverableAccountEmail(user.email));
    if (!temporaryWithoutEmail && (!challengeId || !otp)) {
      res.status(403).json({ error: { code: "PASSWORD_OTP_REQUIRED", message: "Hãy xác nhận mã gửi qua email để đổi mật khẩu." } });
      return;
    }
    if (challengeId && newPassword.length < 12) {
      res.status(400).json({ error: { code: "VALIDATION_FAILED", message: "Mật khẩu mới phải có ít nhất 12 ký tự." } });
      return;
    }
    const isValid = await verifyPassword(user.passwordHash, currentPassword);
    if (!isValid) {
      res.status(401).json({
        error: { code: "UNAUTHENTICATED", message: "Current password is incorrect" },
      });
      return;
    }

    const otpFilter = challengeId && otp ? await passwordChangeOtpFilter(String(user._id), securityVersion(user), challengeId, otp, user.email) : {};
    const passwordHash = await hashPassword(newPassword);
    const changed = await UserModel.updateOne(
      { _id: user._id, passwordHash: user.passwordHash, status: { $ne: "disabled" },
        ...securityVersionFilter(securityVersion(user)), ...otpFilter,
        ...(challengeId ? { "passwordChangeOtp.expiresAt": { $gt: new Date() } } : {}),
        email: user.email ?? null, emailVerifiedAt: user.emailVerifiedAt ?? null,
        ...(temporaryWithoutEmail && !challengeId ? { mustChangePassword: true } : {}) },
      { $set: { passwordHash, mustChangePassword: false, passwordChangedAt: new Date() }, $unset: { passwordChangeOtp: 1 },
        $inc: { securityVersion: 1 } }
    );
    if (!changed.modifiedCount) {
      res.status(409).json({ error: { code: "ACCOUNT_VERSION_CONFLICT", message: "Account changed; sign in again" } });
      return;
    }

    // Mọi Refresh Token cũ bị thu hồi: mật khẩu đổi thì phiên cũ không được sống tiếp.
    await RefreshSessionModel.updateMany(
      { userId: user._id, revokedAt: null },
      { $set: { revokedAt: new Date() } }
    );

    res.clearCookie("refreshToken", getClearCookieOptions());
    res.status(204).send();
  } catch (err) {
    if (err instanceof Error && "status" in err && "code" in err && typeof err.status === "number") {
      res.status(err.status).json({ error: { code: err.code, message: err.message } });
      return;
    }
    console.error(
      "[Auth] Change password error:",
      err instanceof Error ? err.message : "internal error"
    );
    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "An internal server error occurred while changing the password",
      },
    });
  }
});

export default router;
