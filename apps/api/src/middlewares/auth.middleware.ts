import { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import { verifyAccessToken } from "../services/auth.service.js";
import { UserModel } from "../models/User.js";
import { EmployeeModel } from "../models/Employee.js";

/**
 * Lỗi hạ tầng (mất kết nối, server selection timeout, pool cạn) KHÔNG phải lỗi xác
 * thực. Trả 401 cho chúng khiến client coi phiên đã hết, gọi refresh, refresh cũng
 * 401 rồi đăng xuất toàn bộ người dùng đang online vì một sự cố Mongo thoáng qua.
 *
 * Phân loại chỉ dựa trên danh tính lớp lỗi của driver, không dò chuỗi trong message:
 * heuristic "connection"/"pool" khớp cả lỗi nghiệp vụ và biến chúng thành 503.
 */
const INFRASTRUCTURE_ERROR_NAMES = new Set([
  "MongooseServerSelectionError",
  "MongoServerSelectionError",
  "MongoNetworkError",
  "MongoNetworkTimeoutError",
  "MongoOperationTimeoutError",
  "MongoNotConnectedError",
]);

export function isInfrastructureError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (INFRASTRUCTURE_ERROR_NAMES.has(err.name)) return true;

  const { MongoNetworkError, MongoServerSelectionError, MongoNotConnectedError } = mongoose.mongo;
  if (
    err instanceof MongoNetworkError ||
    err instanceof MongoServerSelectionError ||
    err instanceof MongoNotConnectedError ||
    err instanceof mongoose.Error.MongooseServerSelectionError
  ) {
    return true;
  }

  // Lỗi duy nhất cần khớp chuỗi: mongoose ném `MongooseError` với message cố định này
  // khi buffer timeout, không có lớp riêng để instanceof.
  return err.name === "MongooseError" && /^Operation `.*` buffering timed out/.test(err.message);
}

export interface AuthenticatedUser {
  userId: string;
  username: string;
  role: "Admin" | "Employee";
  employeeId?: string | null;
  departmentId?: string | null;
  level?: "Intern" | "Junior" | "Middle" | "Senior" | "Lead" | null;
  skills: string[];
  mustChangePassword: boolean;
  /**
   * Admin không gắn hồ sơ nhân viên -> toàn quyền hệ thống (không giới hạn theo
   * department scope). Admin có hồ sơ vẫn bị giới hạn như cũ.
   */
  isGlobalAdmin: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

/**
 * Middleware: Require Bearer Access Token & resolve user context
 */
export async function authenticateToken(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({
      error: {
        code: "UNAUTHENTICATED",
        message: "Missing or invalid authorization header",
      },
    });
    return;
  }

  const token = authHeader.split(" ")[1];

  let claims: Awaited<ReturnType<typeof verifyAccessToken>>;
  try {
    claims = await verifyAccessToken(token);
  } catch {
    // Chỉ lỗi verify (sai chữ ký, hết hạn, sai format) mới là 401.
    res.status(401).json({
      error: {
        code: "UNAUTHENTICATED",
        message: "Invalid or expired access token",
      },
    });
    return;
  }

  try {
    const user = await UserModel.findById(claims.sub);
    if (!user) {
      res.status(401).json({
        error: {
          code: "UNAUTHENTICATED",
          message: "User not found or deactivated",
        },
      });
      return;
    }

    // Resolve associated employee record (if any)
    const employee = await EmployeeModel.findOne({
      $or: [{ userId: user._id }, { _id: user.employeeId }],
    });

    const deptId =
      employee?.departmentId?.toString() ||
      employee?.department ||
      employee?.store_raw ||
      null;

    req.user = {
      userId: user._id.toString(),
      username: user.username,
      role: user.role,
      employeeId: employee?._id?.toString() || null,
      departmentId: deptId,
      level: employee?.level || null,
      skills: Array.isArray(employee?.skills) ? employee.skills : [],
      mustChangePassword: user.mustChangePassword === true,
      isGlobalAdmin: user.isGlobalAdmin === true,
    };

    next();
  } catch (err) {
    if (isInfrastructureError(err)) {
      // next(err) -> error handler chung trả 503 SERVICE_UNAVAILABLE.
      next(err);
      return;
    }
    res.status(401).json({
      error: {
        code: "UNAUTHENTICATED",
        message: "Invalid or expired access token",
      },
    });
  }
}

/**
 * Middleware: Optional Bearer Access Token
 * Populates req.user if a valid token is provided, but continues if unauthenticated.
 */
export async function optionalAuthenticateToken(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next();
  }

  const token = authHeader.split(" ")[1];
  try {
    const claims = await verifyAccessToken(token);
    const user = await UserModel.findById(claims.sub);
    if (!user) {
      return next();
    }

    const employee = await EmployeeModel.findOne({
      $or: [{ userId: user._id }, { _id: user.employeeId }],
    });

    const deptId =
      employee?.departmentId?.toString() ||
      employee?.department ||
      employee?.store_raw ||
      null;

    req.user = {
      userId: user._id.toString(),
      username: user.username,
      role: user.role,
      employeeId: employee?._id?.toString() || null,
      departmentId: deptId,
      level: employee?.level || null,
      skills: Array.isArray(employee?.skills) ? employee.skills : [],
      mustChangePassword: user.mustChangePassword === true,
      isGlobalAdmin: user.isGlobalAdmin === true,
    };
  } catch (err) {
    // Token hỏng -> tiếp tục như khách. Lỗi hạ tầng thì không: nuốt nó ở đây biến
    // route public thành 200 với dữ liệu thiếu, khó lần hơn nhiều so với 503.
    if (isInfrastructureError(err)) {
      next(err);
      return;
    }
  }

  next();
}

/**
 * Middleware: Require specific system role (e.g. Admin)
 */
export function requireRole(...allowedRoles: ("Admin" | "Employee")[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        error: {
          code: "RBAC_DENIED",
          message: "You do not have permission to perform this action",
        },
      });
      return;
    }
    next();
  };
}
