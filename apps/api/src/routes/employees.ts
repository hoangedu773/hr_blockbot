import { Router, Request, Response } from "express";
import mongoose from "mongoose";
import {
  EmployeeSummarySchema,
  EmployeeDetailSchema,
  PaginatedEmployeesResponseSchema,
  PaginationQuerySchema,
} from "@hr-blockbot/contracts";
import { EmployeeModel } from "../models/Employee.js";
import { authenticateToken } from "../middlewares/auth.middleware.js";

const router = Router();

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// GET /api/employees - Admin only within assigned department scope
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

  if (!user.departmentId || user.departmentId.trim() === "") {
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
  if (requestedDept && requestedDept.trim() !== user.departmentId.trim()) {
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
    const adminDept = user.departmentId.trim();

    // Enforce server-injected scope: never trust client to bypass department filter
    const query: Record<string, any> = {
      $or: [
        { departmentId: adminDept },
        { department: adminDept },
        { store_raw: adminDept },
      ],
    };

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

export default router;
