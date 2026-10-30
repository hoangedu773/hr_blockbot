import { Router, Request, Response } from "express";
import { DashboardOverviewSchema, type DashboardMetric } from "@hr-blockbot/contracts";
import { StoreModel, classifyStoreKind } from "../models/Store.js";
import { EmployeeModel } from "../models/Employee.js";
import { ScheduleEntryModel } from "../models/ScheduleEntry.js";
import { CashCountModel } from "../models/Cash.js";
import { authenticateToken } from "../middlewares/auth.middleware.js";
import { redactSecrets } from "../lib/redact.js";

const router = Router();

function describeError(err: unknown): string {
  if (!(err instanceof Error)) return `UNKNOWN: ${String(err)}`;
  const code = "code" in err && err.code !== undefined ? String(err.code) : err.name;
  return `${code}: ${redactSecrets(err.message)}`;
}

function metric(value: number | null, source: string, reason: string | null = null): DashboardMetric {
  return { value, reason, source, asOf: null };
}

const MANAGER_ROLES = ["sm", "ptch"];
const percent = (part: number, whole: number) => Math.round((part / whole) * 1000) / 10;
const perUnit = (part: number, whole: number) => Math.round((part / whole) * 10) / 10;

/**
 * `GET /api/dashboard/overview` — mọi con số derive từ DB. KPI nào nguồn dữ liệu
 * không đủ phủ thì trả `value: null` kèm `reason` đọc được, không trả 0.
 */
router.get("/dashboard/overview", authenticateToken, async (_req: Request, res: Response) => {
  try {
    const [
      storeDocs,
      employeeCounts,
      profileCompleted,
      profileCoverage,
      managerStores,
      managerRoleCoverage,
      latestSchedule,
      cash,
    ] = await Promise.all([
        StoreModel.find({ deleted_at: null })
          .select({ store_name: 1, kind: 1 })
          .lean<Array<{ store_name?: string; kind?: string }>>(),
        EmployeeModel.aggregate<{ _id: string; n: number }>([
          {
            $group: {
              _id: { $cond: [{ $eq: ["$status", "inactive"] }, "inactive", "active"] },
              n: { $sum: 1 },
            },
          },
        ]),
        EmployeeModel.countDocuments({ profile_status: "ĐÃ HOÀN TẤT" }),
        // Coverage: `profile_status` đến từ một cột ETL có thể null. Nếu cả collection
        // không có giá trị nào thì 0% là bịa — phải trả null kèm lý do.
        EmployeeModel.countDocuments({ profile_status: { $exists: true, $nin: [null, ""] } }),
        EmployeeModel.aggregate<{ _id: string }>([
          {
            $match: {
              status: { $ne: "inactive" },
              businessRole: { $in: MANAGER_ROLES },
              store_raw: { $type: "string", $ne: "" },
            },
          },
          { $group: { _id: "$store_raw" } },
        ]),
        // `businessRole` do backfill riêng; thiếu hoàn toàn thì managersCovered = 0 là bịa.
        EmployeeModel.countDocuments({ businessRole: { $exists: true, $nin: [null, ""] } }),
        ScheduleEntryModel.findOne()
          .sort({ work_date: -1 })
          .select({ work_date: 1 })
          .lean<{ work_date?: string }>(),
        CashCountModel.aggregate<{
          stores: Array<{ n: number }>;
          periods: Array<{ n: number }>;
          latest: Array<{ at: unknown }>;
        }>([
          {
            $facet: {
              stores: [{ $group: { _id: "$store_name" } }, { $count: "n" }],
              // Nguồn hiện tại không có cột ngày: 9 dòng của một lần kê quỹ rơi vào
              // cùng bucket null nên đếm là 1 kỳ. Nếu ETL sau này thêm `period`/
              // `report_date`, số kỳ tự tăng mà không phải sửa code.
              periods: [
                {
                  $group: {
                    _id: {
                      $ifNull: ["$period", { $ifNull: ["$report_date", { $ifNull: ["$snapshot_date", null] }] }],
                    },
                  },
                },
                { $count: "n" },
              ],
              latest: [
                { $match: { report_date: { $type: "date" } } },
                { $group: { _id: null, at: { $max: "$report_date" } } },
              ],
            },
          },
        ]),
      ]);

    // Dùng đúng hàm phân loại của `stores.ts` để `stores.outlets` và `managersCovered`
    // luôn nói về cùng một tập cửa hàng, kể cả với 144 doc legacy không có `kind`.
    const stores = { outlets: 0, groups: 0, support: 0 };
    const outletNames = new Set<string>();
    for (const store of storeDocs) {
      const kind = classifyStoreKind(store.store_name, store.kind);
      if (kind === "outlet") {
        stores.outlets += 1;
        outletNames.add(String(store.store_name));
      } else if (kind === "group") stores.groups += 1;
      else stores.support += 1;
    }

    const employees = { total: 0, active: 0, inactive: 0 };
    for (const row of employeeCounts) {
      employees.total += row.n;
      if (row._id === "inactive") employees.inactive = row.n;
      else employees.active = row.n;
    }

    const coveredOutlets = managerStores.filter((row) => outletNames.has(row._id)).length;

    const cashFacet = cash[0];
    const cashStoreCount = cashFacet?.stores[0]?.n ?? 0;
    const cashPeriodCount = cashFacet?.periods[0]?.n ?? 0;
    const cashLatest = cashFacet?.latest[0]?.at;
    const cashAsOf = cashLatest instanceof Date ? cashLatest.toISOString() : null;

    const overview = DashboardOverviewSchema.parse({
      stores,
      employees,
      profileCompletionRate: metric(
        employees.total === 0 || profileCoverage === 0
          ? null
          : percent(profileCompleted, employees.total),
        "employees",
        employees.total === 0
          ? "Chưa có bản ghi nhân sự để tính tỷ lệ hoàn tất hồ sơ"
          : profileCoverage === 0
            ? "Chưa có dữ liệu profile_status (ETL chưa chạy hoặc cột nguồn rỗng)"
            : null
      ),
      managersCovered: metric(
        stores.outlets === 0 || managerRoleCoverage === 0
          ? null
          : percent(coveredOutlets, stores.outlets),
        "employees",
        stores.outlets === 0
          ? "Chưa có cửa hàng outlet để tính độ phủ quản lý"
          : managerRoleCoverage === 0
            ? "Chưa có dữ liệu businessRole (backfill chưa chạy) — không xác định được quản lý cửa hàng"
            : null
      ),
      employeesPerOutlet: metric(
        stores.outlets === 0 ? null : perUnit(employees.total, stores.outlets),
        "employees",
        stores.outlets === 0 ? "Chưa có cửa hàng outlet để tính bình quân nhân sự" : null
      ),
      revenue: {
        value: null,
        reason: `Chỉ ${cashStoreCount}/${stores.outlets} cửa hàng có dữ liệu cash_counts trong ${cashPeriodCount} kỳ — không đủ để tính doanh thu toàn chuỗi`,
        source: "cash_counts",
        asOf: cashAsOf,
      },
      onTimeRate: metric(
        null,
        "none",
        "Nguồn dữ liệu không có bản ghi chấm công/punch — không thể tính tỷ lệ đúng giờ"
      ),
      latestScheduleDate: latestSchedule?.work_date ?? null,
      generatedAt: new Date().toISOString(),
    });

    res.status(200).json(overview);
  } catch (err) {
    console.error("[Dashboard] Overview error:", describeError(err));
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Failed to build dashboard overview" },
    });
  }
});

export default router;
