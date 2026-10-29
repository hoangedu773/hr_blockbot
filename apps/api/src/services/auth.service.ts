import crypto from "crypto";
import argon2 from "argon2";
import { SignJWT, jwtVerify } from "jose";
import { UserModel, IUser } from "../models/User.js";
import { RefreshSessionModel, IRefreshSession } from "../models/RefreshSession.js";

// Argon2id configuration per OWASP / KLCN133 spec: ~19 MiB memory, 2 iterations, parallelism 1
export const ARGON2_CONFIG: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19456, // 19 * 1024 KiB = 19 MiB
  timeCost: 2,       // 2 iterations
  parallelism: 1,    // 1 thread
};

const JWT_SECRET_MIN_LENGTH = 32;
let ephemeralDevSecret: Uint8Array | null = null;

/**
 * Resolve the JWT signing secret at call time (never at module scope) so the
 * value reflects the environment after dotenv has loaded.
 *
 * Fail-closed everywhere: a missing secret is an error, never a built-in
 * constant. A constant in a public repo is a published signing key — anyone
 * could mint an Admin token for any deployment that forgot to set the env var,
 * and `NODE_ENV` is not a reliable guard because it is often unset on hosts.
 *
 * For local development set `ALLOW_DEV_JWT_SECRET=1`: a random per-process
 * secret is generated instead (tokens die on restart, which is fine locally).
 */
export function getJwtSecret(): Uint8Array {
  const configured = process.env.JWT_SECRET?.trim();
  if (configured) {
    if (configured.length < JWT_SECRET_MIN_LENGTH) {
      throw new Error(`JWT_SECRET must be at least ${JWT_SECRET_MIN_LENGTH} characters`);
    }
    return new TextEncoder().encode(configured);
  }

  if (process.env.ALLOW_DEV_JWT_SECRET === "1") {
    if (ephemeralDevSecret === null) {
      ephemeralDevSecret = crypto.randomBytes(48);
      console.warn(
        "[auth] JWT_SECRET is not set; using an ephemeral per-process secret (ALLOW_DEV_JWT_SECRET=1). Tokens will not survive a restart."
      );
    }
    return ephemeralDevSecret;
  }

  throw new Error(
    "JWT_SECRET is not configured. Set it (>= 32 chars) or set ALLOW_DEV_JWT_SECRET=1 for local development."
  );
}

export const ACCESS_TOKEN_TTL = process.env.ACCESS_TOKEN_TTL || "15m";
export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface TokenClaims {
  sub: string;
  role: "Admin" | "Employee";
}

/**
 * Hash plain password using Argon2id
 */
export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, ARGON2_CONFIG);
}

/**
 * Verify plain password against Argon2id hash
 */
export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

// Bỏ các ký tự dễ đọc nhầm khi in phiếu mật khẩu (0/O, 1/l/I).
const TEMP_PASSWORD_ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Mật khẩu tạm do quản trị viên phát tay; người dùng buộc đổi ở lần đăng nhập đầu. */
export function generateTemporaryPassword(length = 12): string {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += TEMP_PASSWORD_ALPHABET[crypto.randomInt(TEMP_PASSWORD_ALPHABET.length)];
  }
  return out;
}

/**
 * Sign Access Token using jose (memory-only on client)
 */
export async function signAccessToken(claims: TokenClaims): Promise<string> {
  return new SignJWT({ role: claims.role, sub: claims.sub })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_TTL)
    .sign(getJwtSecret());
}

/**
 * Verify Access Token using jose
 */
export async function verifyAccessToken(token: string): Promise<TokenClaims> {
  const { payload } = await jwtVerify(token, getJwtSecret(), {
    algorithms: ["HS256"],
  });

  if (!payload.sub || typeof payload.sub !== "string") {
    throw new Error("Invalid sub claim");
  }

  if (payload.role !== "Admin" && payload.role !== "Employee") {
    throw new Error("Invalid role claim");
  }

  return {
    sub: payload.sub,
    role: payload.role,
  };
}

/**
 * Hash raw token with SHA-256 for secure storage
 */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Hash client IP with SHA-256 to avoid storing raw IP
 */
export function hashIp(ip?: string): string {
  if (!ip) return "";
  return crypto.createHash("sha256").update(ip).digest("hex");
}

/**
 * Cookie options for Refresh Token
 */
export function getRefreshTokenCookieOptions() {
  const isProd = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProd,
    // Render serves the web and API on separate sites; secure cross-site cookies
    // are required there. The API's origin allowlist still guards cookie requests.
    sameSite: isProd ? "none" as const : "strict" as const,
    path: "/api/auth",
    maxAge: REFRESH_TOKEN_TTL_MS,
  };
}

export function getClearCookieOptions() {
  const isProd = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" as const : "strict" as const,
    path: "/api/auth",
  };
}

export interface SessionContext {
  ip?: string;
  userAgent?: string;
}

/**
 * Create initial login session (generates familyId and first Refresh Token)
 */
export async function createLoginSession(
  user: IUser,
  ctx: SessionContext
): Promise<{ accessToken: string; rawRefreshToken: string; familyId: string }> {
  const familyId = crypto.randomUUID();
  const rawRefreshToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawRefreshToken);
  const now = new Date();

  await RefreshSessionModel.create({
    userId: user._id,
    familyId,
    tokenHash,
    expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS),
    revokedAt: null,
    userAgent: ctx.userAgent || null,
    ipHash: hashIp(ctx.ip),
    createdAt: now,
  });

  const accessToken = await signAccessToken({
    sub: user._id.toString(),
    role: user.role,
  });

  return { accessToken, rawRefreshToken, familyId };
}

export type RotateResult =
  | {
      success: true;
      accessToken: string;
      newRefreshToken: string;
      user: { id: string; role: "Admin" | "Employee" };
    }
  | {
      success: false;
      error: { code: "UNAUTHENTICATED" | "TOKEN_REUSED"; message: string };
    };

/**
 * Refresh Token Rotation (RTR) with atomic conditional update & replay detection
 */
export async function rotateRefreshToken(
  rawToken: string,
  ctx: SessionContext
): Promise<RotateResult> {
  const tokenHash = hashToken(rawToken);
  const now = new Date();

  const nextRawToken = crypto.randomBytes(32).toString("hex");
  const nextTokenHash = hashToken(nextRawToken);

  // 1. Conditional atomic update: only an active (revokedAt: null) token can be rotated
  const updatedSession = await RefreshSessionModel.findOneAndUpdate(
    { tokenHash, revokedAt: null },
    { $set: { revokedAt: now, replacedBy: nextTokenHash } },
    { new: true }
  );

  if (!updatedSession) {
    // Either token does not exist OR was already revoked
    const existing = await RefreshSessionModel.findOne({ tokenHash });
    if (existing && existing.revokedAt != null) {
      // REPLAY ATTACK DETECTED!
      // Immediately revoke ENTIRE family
      await RefreshSessionModel.updateMany(
        { userId: existing.userId, familyId: existing.familyId, revokedAt: null },
        { $set: { revokedAt: now, reusedDetectedAt: now } }
      );

      return {
        success: false,
        error: {
          code: "TOKEN_REUSED",
          message: "Token has already been consumed. Session family revoked.",
        },
      };
    }

    return {
      success: false,
      error: {
        code: "UNAUTHENTICATED",
        message: "Invalid refresh token",
      },
    };
  }

  // 2. Expiry check
  if (updatedSession.expiresAt < now) {
    return {
      success: false,
      error: {
        code: "UNAUTHENTICATED",
        message: "Refresh token has expired",
      },
    };
  }

  // 3. Check if family was compromised concurrently
  const compromised = await RefreshSessionModel.findOne({
    familyId: updatedSession.familyId,
    reusedDetectedAt: { $ne: null },
  });
  if (compromised) {
    return {
      success: false,
      error: {
        code: "TOKEN_REUSED",
        message: "Session family has been revoked due to reuse detection",
      },
    };
  }

  // 4. Load user
  const user = await UserModel.findById(updatedSession.userId);
  if (!user) {
    return {
      success: false,
      error: {
        code: "UNAUTHENTICATED",
        message: "User not found",
      },
    };
  }

  // 5. Persist successor session
  try {
    await RefreshSessionModel.create({
      userId: user._id,
      familyId: updatedSession.familyId,
      tokenHash: nextTokenHash,
      expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS),
      revokedAt: null,
      userAgent: ctx.userAgent || null,
      ipHash: hashIp(ctx.ip),
      createdAt: now,
    });
  } catch (err) {
    // Fail-closed: persistence error leaves no active successor
    await RefreshSessionModel.updateOne(
      { _id: updatedSession._id },
      { $set: { revokedAt: now, replacedBy: null } }
    );
    throw err;
  }

  // 6. Post-check for concurrent replay revocation
  const postCompromised = await RefreshSessionModel.findOne({
    familyId: updatedSession.familyId,
    reusedDetectedAt: { $ne: null },
  });
  if (postCompromised) {
    await RefreshSessionModel.updateOne(
      { tokenHash: nextTokenHash },
      { $set: { revokedAt: now } }
    );
    return {
      success: false,
      error: {
        code: "TOKEN_REUSED",
        message: "Session family revoked",
      },
    };
  }

  const accessToken = await signAccessToken({
    sub: user._id.toString(),
    role: user.role,
  });

  return {
    success: true,
    accessToken,
    newRefreshToken: nextRawToken,
    user: { id: user._id.toString(), role: user.role },
  };
}

/**
 * Logout: Revoke entire session family
 */
export async function logoutSession(rawToken?: string): Promise<void> {
  if (!rawToken) return;

  const tokenHash = hashToken(rawToken);
  const now = new Date();

  const session = await RefreshSessionModel.findOne({ tokenHash });
  if (session) {
    await RefreshSessionModel.updateMany(
      { userId: session.userId, familyId: session.familyId, revokedAt: null },
      { $set: { revokedAt: now } }
    );
  }
}
