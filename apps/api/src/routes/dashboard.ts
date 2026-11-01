import { Router } from "express";
import { DashboardOverviewSchema } from "@hr-blockbot/contracts";
import { EmployeeModel } from "../models/Employee.js";
import { authenticateToken } from "../middlewares/auth.middleware.js";
import { workflowEndpoint as endpoint } from "./projects.js";
import { allowedStoreIds, employeeScopeQuery } from "../services/authorization-scope.service.js";
const router = Router();
router.get("/dashboard/overview", authenticateToken, endpoint(async (req, res) => {
  const user = req.user!, scope = employeeScopeQuery(user, "dashboard.read");
  const ids = allowedStoreIds(user, "dashboard.read");
  const [total, active, inactive] = await Promise.all([EmployeeModel.countDocuments(scope), EmployeeModel.countDocuments({ $and: [scope, { status: "active" }] }), EmployeeModel.countDocuments({ $and: [scope, { status: "inactive" }] })]);
  const unavailable = (reason: string) => ({ value: null, reason, source: "none", asOf: null });
  res.json(DashboardOverviewSchema.parse({
    stores: { outlets: ids.length, groups: 0, support: 0 },
    employees: { total, active, inactive, unknown: total - active - inactive },
    profileCompletionRate: unavailable("Chưa có nguồn xác minh hoàn tất hồ sơ trong phạm vi V1; không dùng nhãn ETL như kết quả nghiệp vụ."),
    managersCovered: unavailable("Danh mục quyền và quan hệ quản lý không được coi là chỉ số KPI."),
    employeesPerOutlet: ids.length ? { value: Math.round(total / ids.length * 10) / 10, source: "canonical employees/storeId", reason: null, asOf: null } : unavailable("Chưa có cửa hàng canonical."),
    revenue: unavailable("KPI/doanh thu ngoài phạm vi Authorization V1."),
    onTimeRate: unavailable("Chấm công chưa có dữ liệu canonical được phép."),
    latestScheduleDate: null, generatedAt: new Date().toISOString(),
  }));
}));
export default router;
