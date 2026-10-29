import { Router, Request, Response } from "express";
import mongoose from "mongoose";
import {
  AdminUserSchema,
  AdminUserListResponseSchema,
  CreateAdminUserSchema,
  UpdateAdminUserSchema,
  ResetPasswordResponseSchema,
  PaginationQuerySchema,
} from "@hr-blockbot/contracts";
import { UserModel } from "../models/User.js";
import { EmployeeModel } from "../models/Employee.js";
import { RefreshSessionModel } from "../models/RefreshSession.js";
import { hashPassword, generateTemporaryPassword } from "../services/auth.service.js";
import { authenticateToken } from "../middlewares/auth.middleware.js";

const router = Router();

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Quản trị tài khoản là quyền của Admin **toàn quyền** (`isGlobalAdmin`): người tạo
 * được tài khoản Admin khác thì cũng hạ được quyền người khác, nên không thể mở cho
 * Admin bị giới hạn theo phòng ban. Admin thiếu cờ này nhận 403 như Employee.
 */
function requireGlobalAdmin(req: Request, res: Response): boolean {
  if (!req.user || req.user.role !== "Admin") {
    res.status(403).json({
      error: { code: "RBAC_DENIED", message: "Only Admin can manage accounts" },
    });
    return false;
  }
  if (req.user.isGlobalAdmin !== true) {
    res.status(403).json({
      error: {
        code: "RBAC_DENIED",
        message: "Only a full-authority admin (isGlobalAdmin) can manage accounts",
      },
    });
    return false;
  }
  return true;
}

function toIso(value: unknown): string | null {
  return value instanceof Date ? value.toISOString() : null;
}

function serializeUser(user: any, employeeName: string | null = null) {
  return AdminUserSchema.parse({
    id: String(user._id),
    username: String(user.username ?? ""),
    email: user.email ?? null,
    role: user.role,
    businessRole: user.businessRole ?? null,
    employeeId: user.employeeId ? String(user.employeeId) : null,
    employeeName,
    isGlobalAdmin: user.isGlobalAdmin === true,
    mustChangePassword: user.mustChangePassword === true,
    createdAt: toIso(user.createdAt),
    updatedAt: toIso(user.updatedAt),
  });
}

async function employeeNamesByIds(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const employees = await EmployeeModel.find(
    { _id: { $in: ids } },
    { full_name: 1, fullName: 1 }
  ).lean();
  return new Map(
    employees.map((employee: any) => [
      String(employee._id),
      String(employee.full_name ?? employee.fullName ?? ""),
    ])
  );
}

/** Số tài khoản Admin toàn quyền còn lại — dùng để chặn tự khoá mình khỏi hệ thống. */
async function countGlobalAdmins(excludeId?: string): Promise<number> {
  const filter: Record<string, unknown> = { role: "Admin", isGlobalAdmin: true };
  if (excludeId) filter._id = { $ne: excludeId };
  return UserModel.countDocuments(filter);
}

async function revokeSessions(userId: mongoose.Types.ObjectId | string): Promise<void> {
  await RefreshSessionModel.updateMany(
    { userId, revokedAt: null },
    { $set: { revokedAt: new Date() } }
  );
}

// GET /api/admin/users - danh sách tài khoản (không bao giờ trả passwordHash)
router.get("/admin/users", authenticateToken, async (req: Request, res: Response) => {
  if (!requireGlobalAdmin(req, res)) return;

  const paginationParse = PaginationQuerySchema.safeParse(req.query);
  const { page, limit } = paginationParse.success ? paginationParse.data : { page: 1, limit: 20 };

  const roleFilter = typeof req.query.role === "string" ? req.query.role : undefined;
  const businessRoleFilter =
    typeof req.query.businessRole === "string" ? req.query.businessRole : undefined;
  const search = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 50) : "";

  if (roleFilter && !["Admin", "Employee"].includes(roleFilter)) {
    res.status(400).json({ error: { code: "VALIDATION_FAILED", message: "Invalid role filter" } });
    return;
  }

  const query: Record<string, any> = {};
  if (roleFilter) query.role = roleFilter;
  if (businessRoleFilter) query.businessRole = businessRoleFilter;

  try {
    if (search) {
      const pattern = new RegExp(escapeRegex(search), "i");
      const matchedEmployees = await EmployeeModel.find(
        { $or: [{ full_name: pattern }, { fullName: pattern }, { employee_code: pattern }] },
        { _id: 1 }
      )
        .limit(500)
        .lean();
      query.$or = [
        { username: pattern },
        { email: pattern },
        { employeeId: { $in: matchedEmployees.map((employee: any) => employee._id) } },
      ];
    }

    const [users, totalItems] = await Promise.all([
      UserModel.find(query)
        .sort({ role: 1, username: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      UserModel.countDocuments(query),
    ]);

    const names = await employeeNamesByIds(
      users.filter((user: any) => user.employeeId).map((user: any) => String(user.employeeId))
    );

    const body = AdminUserListResponseSchema.parse({
      items: users.map((user: any) =>
        serializeUser(user, user.employeeId ? names.get(String(user.employeeId)) ?? null : null)
      ),
      paging: {
        page,
        limit,
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
        hasNext: page * limit < totalItems,
        hasPrev: page > 1,
      },
    });

    res.status(200).json(body);
  } catch (err) {
    console.error("[AdminUsers] List error:", err instanceof Error ? err.message : "internal error");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to list accounts" } });
  }
});

// POST /api/admin/users - tạo tài khoản (mật khẩu tạm trả về đúng một lần)
router.post("/admin/users", authenticateToken, async (req: Request, res: Response) => {
  if (!requireGlobalAdmin(req, res)) return;

  const parsed = CreateAdminUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: {
        code: "VALIDATION_FAILED",
        message: "Invalid account payload",
        details: parsed.error.flatten(),
      },
    });
    return;
  }

  const username = parsed.data.username.toLowerCase();
  const role = parsed.data.role;
  const requestedBusinessRole = parsed.data.businessRole;

  if (role === "Employee" && requestedBusinessRole === "admin") {
    res.status(400).json({
      error: {
        code: "VALIDATION_FAILED",
        message: "businessRole 'admin' chỉ dùng cho tài khoản Admin",
      },
    });
    return;
  }

  try {
    const existing = (await UserModel.findOne({ username }).lean()) as any;
    if (existing) {
      res.status(409).json({
        error: { code: "DUPLICATE_KEY", message: `Tên đăng nhập '${username}' đã tồn tại` },
      });
      return;
    }

    let employee: any = null;
    if (parsed.data.employeeId) {
      if (!mongoose.Types.ObjectId.isValid(parsed.data.employeeId)) {
        res.status(400).json({
          error: { code: "VALIDATION_FAILED", message: "Invalid employeeId" },
        });
        return;
      }
      employee = await EmployeeModel.findById(parsed.data.employeeId).lean();
      if (!employee) {
        res.status(404).json({
          error: { code: "RESOURCE_NOT_FOUND", message: "Employee not found" },
        });
        return;
      }
      const linked = (await UserModel.findOne({ employeeId: employee._id }).lean()) as any;
      if (linked) {
        res.status(409).json({
          error: {
            code: "DUPLICATE_KEY",
            message: `Hồ sơ này đã có tài khoản '${linked.username}'`,
          },
        });
        return;
      }
    }

    const generatedPassword = parsed.data.password ? null : generateTemporaryPassword();
    const plainPassword = parsed.data.password ?? generatedPassword!;

    const businessRole =
      role === "Admin"
        ? "admin"
        : requestedBusinessRole ?? employee?.businessRole ?? "staff";

    const created = await UserModel.create({
      username,
      passwordHash: await hashPassword(plainPassword),
      role,
      businessRole,
      employeeId: employee?._id ?? null,
      isGlobalAdmin: role === "Admin" ? parsed.data.isGlobalAdmin === true : false,
      // Mật khẩu do quản trị viên đặt luôn là mật khẩu tạm.
      mustChangePassword: true,
      passwordChangedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    if (employee) {
      await EmployeeModel.updateOne({ _id: employee._id }, { $set: { userId: created._id } });
    }

    res.status(201).json({
      ...serializeUser(created.toObject(), employee ? String(employee.full_name ?? employee.fullName ?? "") : null),
      ...(generatedPassword ? { temporaryPassword: generatedPassword } : {}),
    });
  } catch (err) {
    console.error("[AdminUsers] Create error:", err instanceof Error ? err.message : "internal error");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to create account" } });
  }
});

// PATCH /api/admin/users/:id - đổi role / hạ quyền / liên kết hồ sơ
router.patch("/admin/users/:id", authenticateToken, async (req: Request, res: Response) => {
  if (!requireGlobalAdmin(req, res)) return;

  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400).json({ error: { code: "VALIDATION_FAILED", message: "Invalid account ID" } });
    return;
  }

  const parsed = UpdateAdminUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: {
        code: "VALIDATION_FAILED",
        message: "Invalid account update",
        details: parsed.error.flatten(),
      },
    });
    return;
  }

  const patch = parsed.data;
  const isSelf = String(req.user!.userId) === id;

  try {
    const user = await UserModel.findById(id);
    if (!user) {
      res.status(404).json({ error: { code: "RESOURCE_NOT_FOUND", message: "Account not found" } });
      return;
    }

    const nextRole = patch.role ?? user.role;
    const nextIsGlobalAdmin =
      nextRole === "Admin" ? patch.isGlobalAdmin ?? user.isGlobalAdmin === true : false;

    // 1. Tự hạ quyền mình: chặn, để một cú click không khoá đường quay lại.
    if (isSelf) {
      if (nextRole !== "Admin") {
        res.status(403).json({
          error: {
            code: "RBAC_DENIED",
            message: "Không thể tự hạ quyền tài khoản đang đăng nhập",
          },
        });
        return;
      }
      if (user.isGlobalAdmin === true && nextIsGlobalAdmin === false) {
        res.status(403).json({
          error: {
            code: "RBAC_DENIED",
            message: "Không thể tự bỏ quyền toàn hệ thống của chính mình",
          },
        });
        return;
      }
    }

    // 2. Không được để hệ thống hết Admin toàn quyền.
    const losingGlobalAdmin =
      user.role === "Admin" && user.isGlobalAdmin === true && !(nextRole === "Admin" && nextIsGlobalAdmin);
    if (losingGlobalAdmin && (await countGlobalAdmins(String(user._id))) === 0) {
      res.status(403).json({
        error: {
          code: "RBAC_DENIED",
          message: "Phải còn ít nhất một Admin toàn quyền trong hệ thống",
        },
      });
      return;
    }

    if (nextRole === "Employee" && patch.businessRole === "admin") {
      res.status(400).json({
        error: {
          code: "VALIDATION_FAILED",
          message: "businessRole 'admin' chỉ dùng cho tài khoản Admin",
        },
      });
      return;
    }

    // 3. Liên kết hồ sơ nhân viên (null = bỏ liên kết).
    if (patch.employeeId !== undefined) {
      if (patch.employeeId === null) {
        if (user.employeeId) {
          await EmployeeModel.updateOne({ _id: user.employeeId }, { $set: { userId: null } });
        }
        user.employeeId = null;
      } else {
        if (!mongoose.Types.ObjectId.isValid(patch.employeeId)) {
          res.status(400).json({ error: { code: "VALIDATION_FAILED", message: "Invalid employeeId" } });
          return;
        }
        const employee = (await EmployeeModel.findById(patch.employeeId).lean()) as any;
        if (!employee) {
          res.status(404).json({ error: { code: "RESOURCE_NOT_FOUND", message: "Employee not found" } });
          return;
        }
        const linked = (await UserModel.findOne({
          employeeId: employee._id,
          _id: { $ne: user._id },
        }).lean()) as any;
        if (linked) {
          res.status(409).json({
            error: { code: "DUPLICATE_KEY", message: `Hồ sơ này đã có tài khoản '${linked.username}'` },
          });
          return;
        }
        await EmployeeModel.updateOne({ _id: employee._id }, { $set: { userId: user._id } });
        user.employeeId = employee._id;
      }
    }

    const roleChanged = nextRole !== user.role || nextIsGlobalAdmin !== (user.isGlobalAdmin === true);
    user.role = nextRole;
    user.isGlobalAdmin = nextIsGlobalAdmin;

    if (nextRole === "Admin") {
      user.businessRole = "admin";
    } else if (patch.businessRole) {
      user.businessRole = patch.businessRole;
    } else if (user.businessRole === "admin" || !user.businessRole) {
      // Hạ từ Admin xuống Employee: lấy lại bậc từ hồ sơ, không giữ nhãn 'admin'.
      const employee = user.employeeId
        ? ((await EmployeeModel.findById(user.employeeId, { businessRole: 1 }).lean()) as any)
        : null;
      user.businessRole = (employee as any)?.businessRole ?? "staff";
    }

    if (patch.email !== undefined) {
      if (patch.email === null) {
        user.set("email", undefined);
      } else {
        user.email = patch.email.toLowerCase();
      }
    }
    if (patch.mustChangePassword !== undefined) {
      user.mustChangePassword = patch.mustChangePassword;
    }
    user.updatedAt = new Date();
    await user.save();

    // Access token mang role cũ nhưng middleware đọc role từ DB, nên hiệu lực tức thì;
    // thu hồi refresh session để phiên cũ không sống tiếp sau khi bị đổi quyền.
    if (roleChanged || patch.employeeId !== undefined) {
      await revokeSessions(user._id);
    }

    const employee = user.employeeId
      ? ((await EmployeeModel.findById(user.employeeId, { full_name: 1, fullName: 1 }).lean()) as any)
      : null;

    res.status(200).json(
      serializeUser(user.toObject(), employee ? String((employee as any).full_name ?? (employee as any).fullName ?? "") : null)
    );
  } catch (err) {
    console.error("[AdminUsers] Update error:", err instanceof Error ? err.message : "internal error");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to update account" } });
  }
});

// POST /api/admin/users/:id/reset-password - cấp lại mật khẩu tạm
router.post("/admin/users/:id/reset-password", authenticateToken, async (req: Request, res: Response) => {
  if (!requireGlobalAdmin(req, res)) return;

  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400).json({ error: { code: "VALIDATION_FAILED", message: "Invalid account ID" } });
    return;
  }

  try {
    const user = await UserModel.findById(id);
    if (!user) {
      res.status(404).json({ error: { code: "RESOURCE_NOT_FOUND", message: "Account not found" } });
      return;
    }

    const temporaryPassword = generateTemporaryPassword();
    user.passwordHash = await hashPassword(temporaryPassword);
    user.mustChangePassword = true;
    user.passwordChangedAt = null;
    user.updatedAt = new Date();
    await user.save();
    await revokeSessions(user._id);

    res.status(200).json(
      ResetPasswordResponseSchema.parse({
        id: String(user._id),
        username: user.username,
        temporaryPassword,
        mustChangePassword: true,
      })
    );
  } catch (err) {
    console.error("[AdminUsers] Reset error:", err instanceof Error ? err.message : "internal error");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to reset password" } });
  }
});

// DELETE /api/admin/users/:id - xoá tài khoản, thu hồi phiên, bỏ liên kết hồ sơ
router.delete("/admin/users/:id", authenticateToken, async (req: Request, res: Response) => {
  if (!requireGlobalAdmin(req, res)) return;

  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400).json({ error: { code: "VALIDATION_FAILED", message: "Invalid account ID" } });
    return;
  }
  if (String(req.user!.userId) === id) {
    res.status(403).json({
      error: { code: "RBAC_DENIED", message: "Không thể xoá tài khoản đang đăng nhập" },
    });
    return;
  }

  try {
    const user = await UserModel.findById(id);
    if (!user) {
      res.status(404).json({ error: { code: "RESOURCE_NOT_FOUND", message: "Account not found" } });
      return;
    }

    if (user.role === "Admin" && user.isGlobalAdmin === true && (await countGlobalAdmins(id)) === 0) {
      res.status(403).json({
        error: {
          code: "RBAC_DENIED",
          message: "Phải còn ít nhất một Admin toàn quyền trong hệ thống",
        },
      });
      return;
    }

    await revokeSessions(user._id);
    if (user.employeeId) {
      await EmployeeModel.updateOne({ _id: user.employeeId }, { $set: { userId: null } });
    }
    await UserModel.deleteOne({ _id: user._id });

    res.status(204).send();
  } catch (err) {
    console.error("[AdminUsers] Delete error:", err instanceof Error ? err.message : "internal error");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to delete account" } });
  }
});

export default router;
