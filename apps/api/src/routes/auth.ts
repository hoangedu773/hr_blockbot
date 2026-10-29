import { Router, Request, Response } from "express";
import crypto from "crypto";
import {
  LoginRequestSchema,
  LoginResponseSchema,
  RefreshResponseSchema,
  MeResponseSchema,
  ChangePasswordRequestSchema,
} from "@hr-blockbot/contracts";
import { UserModel } from "../models/User.js";
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

const router = Router();

// P1-4: login had no rate limit (unlimited password guessing) and returned early for
// unknown accounts (timing oracle for user enumeration). Both are handled here.
// In-memory is a deliberate limit of this single-instance deployment (ADR-010).
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 5 * 60 * 1000;
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function loginAttemptKey(req: Request, username: string): string {
  return `${req.ip || "unknown"}|${username.toLowerCase()}`;
}

function registerLoginAttempt(key: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry || entry.resetAt <= now) {
    loginAttempts.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > LOGIN_MAX_ATTEMPTS;
}

function clearLoginAttempts(key: string): void {
  loginAttempts.delete(key);
}

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
    if (!isValid) {
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

    const sessionCtx = {
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    };

    const { accessToken, rawRefreshToken } = await createLoginSession(user, sessionCtx);

    // Set Refresh Token in secure cookie
    res.cookie("refreshToken", rawRefreshToken, getRefreshTokenCookieOptions());

    const responseBody = LoginResponseSchema.parse({
      accessToken,
      user: {
        id: user._id.toString(),
        role: user.role,
        username: user.username,
        mustChangePassword: user.mustChangePassword === true,
      },
    });

    res.status(200).json(responseBody);
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
  });

  res.status(200).json(meData);
});

// POST /api/auth/change-password - bắt buộc với mật khẩu tạm do quản lý phát
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

  const { currentPassword, newPassword } = parsed.data;

  try {
    const user = await UserModel.findById(req.user!.userId);
    if (!user) {
      res.status(401).json({
        error: { code: "UNAUTHENTICATED", message: "User not found or deactivated" },
      });
      return;
    }

    const isValid = await verifyPassword(user.passwordHash, currentPassword);
    if (!isValid) {
      res.status(401).json({
        error: { code: "UNAUTHENTICATED", message: "Current password is incorrect" },
      });
      return;
    }

    user.passwordHash = await hashPassword(newPassword);
    user.mustChangePassword = false;
    user.passwordChangedAt = new Date();
    await user.save();

    // Mọi Refresh Token cũ bị thu hồi: mật khẩu đổi thì phiên cũ không được sống tiếp.
    await RefreshSessionModel.updateMany(
      { userId: user._id, revokedAt: null },
      { $set: { revokedAt: new Date() } }
    );

    res.status(204).send();
  } catch (err) {
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
