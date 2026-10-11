import { Router, Request, Response } from "express";
import {
  LoginRequestSchema,
  LoginResponseSchema,
  RefreshResponseSchema,
  MeResponseSchema,
} from "@hr-blockbot/contracts";
import { UserModel } from "../models/User.js";
import {
  verifyPassword,
  createLoginSession,
  rotateRefreshToken,
  logoutSession,
  getRefreshTokenCookieOptions,
  getClearCookieOptions,
} from "../services/auth.service.js";
import { authenticateToken } from "../middlewares/auth.middleware.js";

const router = Router();

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

  const { email, password } = parseResult.data;

  try {
    const user = await UserModel.findOne({ email: email.toLowerCase() });
    if (!user) {
      // Generic error response - do not reveal user existence
      res.status(401).json({
        error: {
          code: "UNAUTHENTICATED",
          message: "Invalid email or password",
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
          message: "Invalid email or password",
        },
      });
      return;
    }

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
  });

  res.status(200).json(meData);
});

export default router;
