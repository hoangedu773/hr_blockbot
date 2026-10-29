import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../services/auth.service.js";
import { UserModel } from "../models/User.js";
import { EmployeeModel } from "../models/Employee.js";

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
  try {
    const claims = await verifyAccessToken(token);

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
  } catch (_err) {
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
  } catch {
    // Invalid or expired token: gracefully proceed as unauthenticated guest
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
