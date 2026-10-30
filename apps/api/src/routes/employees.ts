import { Router, Request, Response } from "express";
import mongoose from "mongoose";
import {
  EmployeeSummarySchema,
  EmployeeDetailSchema,
  PaginatedEmployeesResponseSchema,
  PaginationQuerySchema,
  CreateProfileChangeRequestSchema,
} from "@hr-blockbot/contracts";
import { EmployeeModel } from "../models/Employee.js";
import { authenticateToken } from "../middlewares/auth.middleware.js";
import { departmentIdMatch } from "../lib/department-scope.js";

const router = Router();

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// GET /api/employees - Admin only within assigned department scope (global admin: toàn bộ)
router.get("/employees", authenticateToken, async (req: Request, res: Response) => {
  const user = req.user!;

  if (user.role !== "Admin") {
    res.status(403).json({
      error: {
        code: "RBAC_DENIED",
        message: "Only Admin can list employees",
      },
    });
    return;
  }

  if (!user.isGlobalAdmin && (!user.departmentId || user.departmentId.trim() === "")) {
    res.status(403).json({
      error: {
        code: "RBAC_DENIED",
        message: "Admin has no assigned department scope (unmapped)",
      },
    });
    return;
  }

  // Validate filter scope against Admin scope
  const requestedDept = (req.query.departmentId || req.query.department) as string | undefined;
  if (!user.isGlobalAdmin && requestedDept && requestedDept.trim() !== user.departmentId!.trim()) {
    res.status(403).json({
      error: {
        code: "RBAC_DENIED",
        message: "Admin cannot query employees outside assigned department scope",
      },
    });
    return;
  }

  const paginationParse = PaginationQuerySchema.safeParse(req.query);
  const { page, limit } = paginationParse.success
    ? paginationParse.data
    : { page: 1, limit: 20 };

  try {
    const adminDept = user.departmentId?.trim() ?? "";
    const adminDeptMatch = departmentIdMatch(adminDept);

    // Enforce server-injected scope: never trust client to bypass department filter.
    // Global admin không có department scope -> đọc toàn bộ, vẫn lọc được theo query.
    const query: Record<string, any> = user.isGlobalAdmin
      ? {}
      : {
          $or: [
            { departmentId: adminDeptMatch },
            { department: adminDept },
            { store_raw: adminDept },
          ],
        };

    if (requestedDept && user.isGlobalAdmin) {
      query.$or = [
        { departmentId: departmentIdMatch(requestedDept) },
        { department: requestedDept.trim() },
        { store_raw: requestedDept.trim() },
      ];
    }

    if (req.query.level && typeof req.query.level === "string") {
      query.level = req.query.level;
    }

    if (req.query.skill && typeof req.query.skill === "string") {
      query.skills = req.query.skill;
    }

    if (req.query.q && typeof req.query.q === "string") {
      const escaped = escapeRegex(req.query.q.trim().slice(0, 50));
      query.$and = [
        {
          $or: [
            { employeeCode: { $regex: escaped, $options: "i" } },
            { employee_code: { $regex: escaped, $options: "i" } },
            { fullName: { $regex: escaped, $options: "i" } },
            { full_name: { $regex: escaped, $options: "i" } },
          ],
        },
      ];
    }

    const skip = (page - 1) * limit;

    const [rawDocs, totalItems] = await Promise.all([
      EmployeeModel.find(query).skip(skip).limit(limit).lean(),
      EmployeeModel.countDocuments(query),
    ]);

    const items = rawDocs.map((doc: any) => {
      const summaryRaw = {
        employeeId: doc._id.toString(),
        fullName: doc.fullName || doc.full_name || "",
        level: doc.level || "Junior",
        department:
          doc.department ||
          doc.store_raw ||
          (doc.departmentId ? doc.departmentId.toString() : adminDept),
        skills: Array.isArray(doc.skills) ? doc.skills : [],
        activeLoad: typeof doc.activeLoad === "number" ? doc.activeLoad : null,
        status: doc.status === "inactive" ? "inactive" : "active",
      };
      return EmployeeSummarySchema.parse(summaryRaw);
    });

    const response = PaginatedEmployeesResponseSchema.parse({
      items,
      paging: {
        page,
        limit,
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
        hasNext: page * limit < totalItems,
        hasPrev: page > 1,
      },
    });

    res.status(200).json(response);
  } catch (err) {
    console.error("[Employees] List error:", err instanceof Error ? err.message : "internal error");
    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Failed to fetch employees",
      },
    });
  }
});

// GET /api/employees/:id - Own profile for Employee, Summary for Admin in scope
router.get("/employees/:id", authenticateToken, async (req: Request, res: Response) => {
  const { id } = req.params;
  const user = req.user!;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400).json({
      error: {
        code: "VALIDATION_FAILED",
        message: "Invalid employee ID format",
      },
    });
    return;
  }

  try {
    const employee: any = await EmployeeModel.findById(id).lean();
    if (!employee) {
      res.status(404).json({
        error: {
          code: "RESOURCE_NOT_FOUND",
          message: "Employee not found",
        },
      });
      return;
    }

    const targetDept =
      (employee.departmentId ? employee.departmentId.toString() : null) ||
      employee.department ||
      employee.store_raw ||
      "";

    const isOwn =
      (user.employeeId && user.employeeId === employee._id.toString()) ||
      (employee.userId && employee.userId.toString() === user.userId);

    // Rule 1: Employee role - strictly OWN profile only
    if (user.role === "Employee") {
      if (!isOwn) {
        res.status(403).json({
          error: {
            code: "RBAC_DENIED",
            message: "Employees cannot access other employee profiles",
          },
        });
        return;
      }

      // Own profile: return EmployeeDetailSchema (allowlist only)
      const detail = EmployeeDetailSchema.parse({
        employeeId: employee._id.toString(),
        fullName: employee.fullName || employee.full_name || "",
        level: employee.level || "Junior",
        department: targetDept,
        skills: Array.isArray(employee.skills) ? employee.skills : [],
        activeLoad: typeof employee.activeLoad === "number" ? employee.activeLoad : null,
        status: employee.status === "inactive" ? "inactive" : "active",
        employeeCode: employee.employeeCode || employee.employee_code || "",
        departmentId: targetDept || undefined,
        phone: employee.phone ?? null,
        hiredAt: employee.hiredAt
          ? new Date(employee.hiredAt).toISOString()
          : employee.hire_date || null,
      });

      res.status(200).json(detail);
      return;
    }

    // Rule 2: Admin role - strictly within assigned department scope
    if (user.role === "Admin") {
      if (!user.departmentId || user.departmentId.trim() === "") {
        res.status(403).json({
          error: {
            code: "RBAC_DENIED",
            message: "Admin has no assigned department scope (unmapped)",
          },
        });
        return;
      }

      if (user.departmentId.trim() !== targetDept.trim()) {
        res.status(403).json({
          error: {
            code: "RBAC_DENIED",
            message: "Admin cannot access employee outside assigned department scope",
          },
        });
        return;
      }

      // Admin reading employee profile: return EmployeeSummarySchema (allowlist only, no PII)
      const summary = EmployeeSummarySchema.parse({
        employeeId: employee._id.toString(),
        fullName: employee.fullName || employee.full_name || "",
        level: employee.level || "Junior",
        department: targetDept,
        skills: Array.isArray(employee.skills) ? employee.skills : [],
        activeLoad: typeof employee.activeLoad === "number" ? employee.activeLoad : null,
        status: employee.status === "inactive" ? "inactive" : "active",
      });

      res.status(200).json(summary);
      return;
    }

    res.status(403).json({
      error: {
        code: "RBAC_DENIED",
        message: "Access denied",
      },
    });
  } catch (err) {
    console.error("[Employees] Detail error:", err instanceof Error ? err.message : "internal error");
    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Failed to fetch employee",
      },
    });
  }
});

// --- Profile change requests (P1-8) -------------------------------------------
// The Employee model, the contracts and the web client already spoke this contract;
// only the routes were missing, so the profile screen called a 404. Requests are
// embedded in the employee document on purpose (ADR-018: no new collection).

function canActOnEmployee(user: { role: string; employeeId?: string | null; departmentId?: string | null; isGlobalAdmin?: boolean }, employee: any): boolean {
  if (user.role !== "Admin") {
    return Boolean(user.employeeId) && String(user.employeeId) === String(employee._id);
  }
  if (user.isGlobalAdmin === true) {
    return true;
  }
  const employeeDept = employee.departmentId ? String(employee.departmentId) : "";
  return Boolean(user.departmentId) && user.departmentId === employeeDept;
}

function toProfileChangeRequest(raw: any) {
  return {
    id: String(raw.id ?? raw._id ?? ""),
    requestedBy: String(raw.requestedBy ?? ""),
    requestedAt: new Date(raw.requestedAt ?? Date.now()).toISOString(),
    status: raw.status,
    targetFields: raw.targetFields ?? {},
    previousSnapshot: raw.previousSnapshot ?? {},
    reviewedBy: raw.reviewedBy ?? null,
    reviewedAt: raw.reviewedAt ? new Date(raw.reviewedAt).toISOString() : null,
    rejectionReason: raw.rejectionReason ?? null,
    previousRequestId: raw.previousRequestId ?? null,
  };
}

// POST /api/employees/:id/change-requests - employee asks to change level/hiredAt/jobTitle
router.post("/employees/:id/change-requests", authenticateToken, async (req: Request, res: Response) => {
  const user = req.user!;
  const { id } = req.params;
  const parsed = CreateProfileChangeRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: { code: "VALIDATION_FAILED", message: "Invalid change request", details: parsed.error.flatten() },
    });
    return;
  }
  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400).json({ error: { code: "VALIDATION_FAILED", message: "Invalid employee ID format" } });
    return;
  }

  try {
    const employee: any = await EmployeeModel.findById(id);
    if (!employee) {
      res.status(404).json({ error: { code: "RESOURCE_NOT_FOUND", message: "Employee not found" } });
      return;
    }
    if (!canActOnEmployee(user, employee)) {
      // 404, not 403: do not confirm that an out-of-scope employee exists.
      res.status(404).json({ error: { code: "RESOURCE_NOT_FOUND", message: "Employee not found" } });
      return;
    }

    const previousSnapshot = {
      level: employee.level,
      hiredAt: employee.hiredAt,
      jobTitle: employee.jobTitle ?? employee.job_title,
    };
    const request = {
      id: new mongoose.Types.ObjectId().toString(),
      requestedBy: String(user.employeeId || user.userId),
      requestedAt: new Date(),
      status: "PENDING" as const,
      targetFields: parsed.data.targetFields,
      previousSnapshot,
      previousRequestId: parsed.data.previousRequestId,
    };

    employee.profileChangeRequests = [...(employee.profileChangeRequests ?? []), request];
    await employee.save();

    res.status(201).json(toProfileChangeRequest(request));
  } catch (err) {
    console.error("[Employees] Change request error:", err instanceof Error ? err.message : "internal error");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to create change request" } });
  }
});

// GET /api/employees/:id/change-requests - own history (or Admin in scope)
router.get("/employees/:id/change-requests", authenticateToken, async (req: Request, res: Response) => {
  const user = req.user!;
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400).json({ error: { code: "VALIDATION_FAILED", message: "Invalid employee ID format" } });
    return;
  }

  try {
    const employee: any = await EmployeeModel.findById(id).lean();
    if (!employee || !canActOnEmployee(user, employee)) {
      res.status(404).json({ error: { code: "RESOURCE_NOT_FOUND", message: "Employee not found" } });
      return;
    }
    const items = (employee.profileChangeRequests ?? []).map(toProfileChangeRequest);
    res.status(200).json({ items });
  } catch (err) {
    console.error("[Employees] Change request list error:", err instanceof Error ? err.message : "internal error");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to fetch change requests" } });
  }
});

// GET /api/change-requests?status=PENDING - Admin approval queue, department-scoped
// (global admin: toàn bộ hàng đợi của mọi phòng ban)
router.get("/change-requests", authenticateToken, async (req: Request, res: Response) => {
  const user = req.user!;
  if (user.role !== "Admin") {
    res.status(403).json({ error: { code: "RBAC_DENIED", message: "Only Admin can list change requests" } });
    return;
  }
  // Quyết định RBAC, không phải guard null: department chỉ có whitespace cũng là
  // unmapped. Không chặn ở đây thì `departmentIdMatch` trả `null` và scope
  // `{ departmentId: null }` match employee thiếu department của phòng khác.
  const adminDept = user.departmentId?.trim() ?? "";
  if (!user.isGlobalAdmin && adminDept === "") {
    res.status(403).json({
      error: { code: "RBAC_DENIED", message: "Admin has no assigned department scope (unmapped)" },
    });
    return;
  }

  const statusFilter = typeof req.query.status === "string" ? req.query.status : "PENDING";
  if (!["PENDING", "APPROVED", "REJECTED"].includes(statusFilter)) {
    res.status(400).json({ error: { code: "VALIDATION_FAILED", message: "Invalid status filter" } });
    return;
  }

  try {
    const scopeFilter = user.isGlobalAdmin
      ? {}
      : { departmentId: departmentIdMatch(user.departmentId) };
    const employees: any[] = await EmployeeModel.find(scopeFilter)
      .select("fullName full_name profileChangeRequests")
      .lean();

    const items = employees.flatMap((employee) =>
      (employee.profileChangeRequests ?? [])
        .filter((request: any) => request.status === statusFilter)
        .map((request: any) => ({
          employeeId: String(employee._id),
          employeeName: String(employee.fullName ?? employee.full_name ?? ""),
          request: toProfileChangeRequest(request),
        }))
    );

    res.status(200).json({ items });
  } catch (err) {
    console.error("[Employees] Queue error:", err instanceof Error ? err.message : "internal error");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to fetch change request queue" } });
  }
});

export default router;
