import { Router } from "express";
import { DashboardOverviewSchema, SalesReportQuerySchema } from "@hr-blockbot/contracts";
import { salesReport } from '../services/sales-report.service.js';
import { z } from 'zod';
import { scopedRevenueMetric } from '../services/pos-reporting.service.js';
import { WorkflowError } from '../services/project-workflow.service.js';
import { EmployeeModel } from "../models/Employee.js";
import { authenticateToken } from "../middlewares/auth.middleware.js";
import { endpoint as endpoint } from "../lib/endpoint.js";
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
    revenue: await scopedRevenueMetric(user),
    onTimeRate: unavailable("Chấm công chưa có dữ liệu canonical được phép."),
    latestScheduleDate: null, generatedAt: new Date().toISOString(),
  }));
}));
router.get('/dashboard/revenue', authenticateToken, endpoint(async (req, res) => {
  const query = z.object({ storeId: z.string().regex(/^[a-f0-9]{24}$/i).transform(s => s.toLowerCase()) }).strict().safeParse(req.query);
  if (!query.success) throw new WorkflowError(400, 'VALIDATION_FAILED', 'Chọn cửa hàng hợp lệ.');
  res.json(await scopedRevenueMetric(req.user!, undefined, query.data.storeId));
}));
router.get('/dashboard/sales', authenticateToken, endpoint(async (req, res) => {
  const query = SalesReportQuerySchema.safeParse(req.query);
  if (!query.success) throw new WorkflowError(400, 'VALIDATION_FAILED', 'Bộ lọc báo cáo không hợp lệ.');
  res.setHeader('Cache-Control', 'no-store');
  res.json(await salesReport(req.user!, query.data));
}));
export default router;
