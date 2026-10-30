import { Router, Request, Response } from "express";
import mongoose from "mongoose";
import {
  PaginationQuerySchema,
  StoreCreateSchema,
  StoreListResponseSchema,
  StoreSummarySchema,
  StoreUpdateSchema,
  type StoreKind,
} from "@hr-blockbot/contracts";
import {
  StoreModel,
  classifyStoreKind,
  storeKindExpression,
  storeStatusExpression,
  type IStore,
  type StoreStatus,
} from "../models/Store.js";
import { EmployeeModel } from "../models/Employee.js";
import { authenticateToken } from "../middlewares/auth.middleware.js";
import { resolveUserScope } from "../services/user-scope.service.js";
import { redactSecrets } from "../lib/redact.js";

const router = Router();

/** Field tối thiểu để dựng `StoreSummary`; mọi query đều project đúng bộ này. */
type StoreRow = Pick<IStore, "store_name" | "code" | "kind" | "district" | "status"> & {
  _id: unknown;
};

/** Lease đổi tên: đủ dài cho cascade 1k–20k employee, đủ ngắn để không chặn lâu. */
const RENAME_LEASE_MS = 15_000;

const STORE_PROJECTION = {
  store_name: 1,
  code: 1,
  kind: 1,
  district: 1,
  status: 1,
} as const;

/**
 * `err.message` của driver Mongo đã được redact một phần nhưng vẫn có thể chứa
 * host/user của cluster — chỉ log message đã làm sạch, không log object `err`.
 */
function describeError(err: unknown): string {
  if (!(err instanceof Error)) return `UNKNOWN: ${String(err)}`;
  const code = "code" in err && err.code !== undefined ? String(err.code) : err.name;
  return `${code}: ${redactSecrets(err.message)}`;
}

/** Unique index `store_name` là chốt chặn cuối khi 2 request ghi chạy song song. */
function isDuplicateKeyError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && err.code === 11000;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Phạm vi đọc của caller trên collection `stores`.
 * - `all`: global admin.
 * - `names`: tập tên cửa hàng được phép thấy (Employee: cửa hàng của mình; Admin
 *   không global: mọi cửa hàng có nhân sự thuộc department của họ).
 * - `forbidden`: Admin không global nhưng không có department scope (unmapped) — fail-closed.
 */
type StoreScope =
  | { mode: "all" }
  | { mode: "names"; names: string[] }
  | { mode: "forbidden" };

/**
 * `stores` không có `departmentId`: quan hệ department ↔ cửa hàng chỉ tồn tại qua
 * `employees.store_raw`. Vì vậy scope của Admin được dịch thành danh sách tên cửa
 * hàng bằng đúng bộ $or mà `routes/employees.ts` dùng, rồi áp lên `store_name`.
 */
async function storeNamesInDepartmentScope(scopeValue: string): Promise<string[]> {
  // `employees.departmentId` được seed bằng ObjectId nhưng JWT/middleware mang nó
  // dưới dạng string. Match cả hai dạng, nếu không distinct trả rỗng và mọi Admin
  // không global thấy 0 cửa hàng (fail-closed nhưng tính năng chết).
  const departmentIdMatch = mongoose.Types.ObjectId.isValid(scopeValue)
    ? { $in: [scopeValue, new mongoose.Types.ObjectId(scopeValue)] }
    : scopeValue;

  const [employeeStoreNames, directStoreNames] = await Promise.all([
    EmployeeModel.distinct("store_raw", {
      $or: [
        { departmentId: departmentIdMatch },
        { department: scopeValue },
        { store_raw: scopeValue },
      ],
    }),
    StoreModel.distinct("store_name", { store_name: scopeValue }),
  ]);

  const names = new Set<string>();
  for (const value of [...employeeStoreNames, ...directStoreNames]) {
    if (typeof value === "string" && value.trim() !== "") names.add(value);
  }
  return [...names];
}

async function resolveStoreScope(req: Request): Promise<StoreScope> {
  const user = req.user!;

  if (user.role === "Employee") {
    const scope = await resolveUserScope(user.userId, user.role);
    const storeName = scope.storeName?.trim() ?? "";
    return storeName === "" ? { mode: "names", names: [] } : { mode: "names", names: [storeName] };
  }

  if (user.isGlobalAdmin === true) return { mode: "all" };

  const department = user.departmentId?.trim() ?? "";
  if (department === "") return { mode: "forbidden" };

  return { mode: "names", names: await storeNamesInDepartmentScope(department) };
}

function scopeMatch(scope: StoreScope): Record<string, unknown> {
  if (scope.mode === "all") return {};
  if (scope.mode === "forbidden") return { store_name: { $in: [] } };
  return { store_name: { $in: scope.names } };
}

function canReadStore(scope: StoreScope, storeName: string): boolean {
  if (scope.mode === "all") return true;
  if (scope.mode === "forbidden") return false;
  return scope.names.includes(storeName);
}

interface StoreFilters {
  q?: string;
  kind?: StoreKind;
  district?: string;
  status?: StoreStatus;
}

const KIND_VALUES = new Set<string>(["outlet", "group", "support"]);
const STATUS_VALUES = new Set<string>(["ACTIVE", "INACTIVE"]);

function isStoreKind(value: unknown): value is StoreKind {
  return typeof value === "string" && KIND_VALUES.has(value);
}

function isStoreStatus(value: unknown): value is StoreStatus {
  return typeof value === "string" && STATUS_VALUES.has(value);
}

function readFilters(req: Request): StoreFilters {
  const filters: StoreFilters = {};

  if (typeof req.query.q === "string") {
    const q = req.query.q.trim().slice(0, 50);
    if (q !== "") filters.q = q;
  }
  if (isStoreKind(req.query.kind)) filters.kind = req.query.kind;
  if (typeof req.query.district === "string" && req.query.district.trim() !== "") {
    filters.district = req.query.district.trim().slice(0, 60);
  }
  if (isStoreStatus(req.query.status)) filters.status = req.query.status;

  return filters;
}

function buildStoreQuery(scope: StoreScope, filters: StoreFilters): Record<string, unknown> {
  const query: Record<string, unknown> = {
    ...scopeMatch(scope),
    // `null` khớp cả document legacy không có field `deleted_at`.
    deleted_at: null,
  };

  if (filters.district) query.district = filters.district;

  if (filters.q) {
    const escaped = escapeRegex(filters.q);
    query.$or = [
      { store_name: { $regex: escaped, $options: "i" } },
      { code: { $regex: escaped, $options: "i" } },
      { district: { $regex: escaped, $options: "i" } },
    ];
  }

  // `kind`/`status` phải so trên biểu thức: doc legacy không có field, filter thường
  // sẽ bỏ sót 144 cửa hàng hiện hữu.
  const expressions: Record<string, unknown>[] = [];
  if (filters.kind) expressions.push({ $expr: { $eq: [storeKindExpression(), filters.kind] } });
  if (filters.status) expressions.push({ $expr: { $eq: [storeStatusExpression(), filters.status] } });
  if (expressions.length > 0) query.$and = expressions;

  return query;
}

interface StoreCounts {
  total: number;
  active: number;
}

/**
 * Đếm nhân sự theo `employees.store_raw` — `stores.employee_count` là số chụp lúc
 * ETL và trôi ngay sau CRUD đầu tiên. `status` thiếu (doc legacy) được coi là active,
 * giống `routes/employees.ts`.
 */
async function employeeCountsByStore(storeNames: string[]): Promise<Map<string, StoreCounts>> {
  if (storeNames.length === 0) return new Map();

  const rows = await EmployeeModel.aggregate<{ _id: string } & StoreCounts>([
    { $match: { store_raw: { $in: storeNames } } },
    {
      $group: {
        _id: "$store_raw",
        total: { $sum: 1 },
        active: { $sum: { $cond: [{ $eq: ["$status", "inactive"] }, 0, 1] } },
      },
    },
  ]);

  return new Map(rows.map((row) => [row._id, { total: row.total, active: row.active }]));
}

interface StoreManager {
  id: string;
  name: string;
}

const MANAGER_ROLES = ["sm", "ptch"];

async function managersByStore(storeNames: string[]): Promise<Map<string, StoreManager>> {
  if (storeNames.length === 0) return new Map();

  const candidates = await EmployeeModel.find(
    {
      store_raw: { $in: storeNames },
      status: { $ne: "inactive" },
      businessRole: { $in: MANAGER_ROLES },
    },
    { store_raw: 1, businessRole: 1, fullName: 1, full_name: 1 }
  ).lean();

  const byStore = new Map<string, Array<{ id: string; name: string; role: string }>>();
  for (const employee of candidates) {
    const storeName = String(employee.store_raw ?? "");
    if (storeName === "") continue;
    const bucket = byStore.get(storeName) ?? [];
    bucket.push({
      id: String(employee._id),
      name: String(employee.fullName ?? employee.full_name ?? ""),
      role: String(employee.businessRole ?? ""),
    });
    byStore.set(storeName, bucket);
  }

  const managers = new Map<string, StoreManager>();
  for (const [storeName, bucket] of byStore) {
    bucket.sort((a, b) => {
      const rank = (role: string) => (role === "sm" ? 0 : 1);
      return rank(a.role) - rank(b.role) || a.name.localeCompare(b.name, "vi");
    });
    const chosen = bucket[0];
    managers.set(storeName, { id: chosen.id, name: chosen.name });
  }
  return managers;
}

/**
 * Một điểm duy nhất dựng `StoreSummary` để list và single-resource không lệch nhau.
 * Counts/manager luôn được truyền vào từ aggregate, không đọc từ document.
 */
function toStoreSummary(
  store: StoreRow,
  counts: StoreCounts | undefined,
  manager: StoreManager | undefined
) {
  return StoreSummarySchema.parse({
    id: String(store._id),
    code: typeof store.code === "string" && store.code.trim() !== "" ? store.code : null,
    name: String(store.store_name ?? ""),
    // Doc legacy chỉ có `store_name`: dùng chung một hàm phân loại với `?kind=`
    // để filter và payload không bao giờ nói hai điều khác nhau về cùng cửa hàng.
    kind: classifyStoreKind(store.store_name, store.kind),
    district:
      typeof store.district === "string" && store.district.trim() !== "" ? store.district : null,
    managerName: manager?.name ?? null,
    managerEmployeeId: manager?.id ?? null,
    employeeCount: counts?.total ?? 0,
    activeEmployeeCount: counts?.active ?? 0,
    status: store.status === "INACTIVE" ? "INACTIVE" : "ACTIVE",
  });
}

async function summarizeStores(docs: StoreRow[]) {
  const names = docs.map((doc) => String(doc.store_name ?? ""));
  const [counts, managers] = await Promise.all([
    employeeCountsByStore(names),
    managersByStore(names),
  ]);
  return docs.map((doc) =>
    toStoreSummary(doc, counts.get(String(doc.store_name)), managers.get(String(doc.store_name)))
  );
}

// GET /api/stores - danh sách cửa hàng trong phạm vi của caller
router.get("/stores", authenticateToken, async (req: Request, res: Response) => {
  try {
    const scope = await resolveStoreScope(req);
    if (scope.mode === "forbidden") {
      res.status(403).json({
        error: {
          code: "RBAC_DENIED",
          message: "Admin has no assigned department scope (unmapped)",
        },
      });
      return;
    }

    const pagination = PaginationQuerySchema.safeParse(req.query);
    const { page, limit } = pagination.success ? pagination.data : { page: 1, limit: 20 };
    const query = buildStoreQuery(scope, readFilters(req));

    const [docs, totalItems, kindCounts] = await Promise.all([
      StoreModel.find(query)
        .sort({ store_name: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select(STORE_PROJECTION)
        .lean<StoreRow[]>(),
      StoreModel.countDocuments(query),
      // summary phản ánh thành phần thư mục trong scope, không phụ thuộc filter của trang.
      StoreModel.aggregate<{ _id: string; n: number }>([
        { $match: { ...scopeMatch(scope), deleted_at: null } },
        { $group: { _id: storeKindExpression(), n: { $sum: 1 } } },
      ]),
    ]);

    const summary = { totalOutlets: 0, totalGroups: 0 };
    for (const row of kindCounts) {
      if (row._id === "outlet") summary.totalOutlets = row.n;
      if (row._id === "group") summary.totalGroups = row.n;
    }

    const response = StoreListResponseSchema.parse({
      items: await summarizeStores(docs),
      paging: {
        page,
        limit,
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
        hasNext: page * limit < totalItems,
        hasPrev: page > 1,
      },
      summary,
    });

    res.status(200).json(response);
  } catch (err) {
    console.error("[Stores] List error:", describeError(err));
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Failed to fetch stores" },
    });
  }
});

// GET /api/stores/:id - chi tiết một cửa hàng trong phạm vi của caller
router.get("/stores/:id", authenticateToken, async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400).json({
      error: { code: "VALIDATION_FAILED", message: "Invalid store ID format" },
    });
    return;
  }

  try {
    const scope = await resolveStoreScope(req);
    const store = await StoreModel.findOne({ _id: id, deleted_at: null })
      .select(STORE_PROJECTION)
      .lean<StoreRow | null>();

    if (!store) {
      res.status(404).json({
        error: { code: "RESOURCE_NOT_FOUND", message: "Store not found" },
      });
      return;
    }

    if (!canReadStore(scope, String(store.store_name ?? ""))) {
      res.status(403).json({
        error: { code: "RBAC_DENIED", message: "Store is outside your access scope" },
      });
      return;
    }

    const [summary] = await summarizeStores([store]);
    res.status(200).json(summary);
  } catch (err) {
    console.error("[Stores] Detail error:", describeError(err));
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Failed to fetch store" },
    });
  }
});

function denyRbac(res: Response, message: string): void {
  res.status(403).json({ error: { code: "RBAC_DENIED", message } });
}

/**
 * Quyết định quyền ghi trên MỘT cửa hàng cụ thể, KHÔNG gửi response. Caller gửi —
 * nhánh rename cần hoãn response tới sau khi nhả lease (xem `staged` bên dưới).
 *
 * `role === "Admin"` một mình là chưa đủ: Admin gắn department hẹp vẫn là Admin, nên
 * nếu chỉ check role thì họ PATCH/DELETE được cửa hàng ngoài department — đúng lỗ
 * cross-tenant mà GET đã chặn từ đầu.
 */
async function resolveWriteDenial(req: Request, storeName: string): Promise<string | null> {
  if (req.user?.role !== "Admin") return "Only Admin can modify stores";

  const scope = await resolveStoreScope(req);
  if (scope.mode === "forbidden") return "Admin has no assigned department scope (unmapped)";
  if (!canReadStore(scope, storeName)) return "Store is outside your access scope";
  return null;
}

/**
 * Tạo cửa hàng chỉ dành cho global admin: cửa hàng mới chưa có nhân sự nên không thể
 * thuộc department nào. Cho Admin scoped tạo sẽ sinh ra cửa hàng họ không đọc được
 * ngay sau đó — quyền tạo và quyền đọc phải nhất quán.
 */
function requireGlobalAdminForCreate(req: Request, res: Response): boolean {
  if (req.user?.role !== "Admin") {
    denyRbac(res, "Only Admin can modify stores");
    return false;
  }
  if (req.user.isGlobalAdmin !== true) {
    denyRbac(
      res,
      "Only a full-authority admin (isGlobalAdmin) can create stores; scoped admins manage stores within their department"
    );
    return false;
  }
  return true;
}

function duplicateKeyResponse(res: Response, name: string, archived: boolean): void {
  res.status(409).json({
    error: {
      code: "STORE_EXISTS",
      message: archived
        ? `Cửa hàng '${name}' đã tồn tại ở trạng thái đã xoá; khôi phục thay vì tạo mới`
        : `Cửa hàng '${name}' đã tồn tại`,
    },
  });
}

// POST /api/stores - tạo cửa hàng
router.post("/stores", authenticateToken, async (req: Request, res: Response) => {
  if (!requireGlobalAdminForCreate(req, res)) return;

  const parsed = StoreCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: {
        code: "VALIDATION_FAILED",
        message: "Invalid store payload",
        details: parsed.error.flatten(),
      },
    });
    return;
  }

  const name = parsed.data.name;

  try {
    // Soft-deleted store vẫn giữ unique index: phải báo rõ để client khôi phục,
    // không để họ nhận 409 vô nghĩa khi danh sách không còn dòng đó.
    const existing = await StoreModel.findOne({ store_name: name })
      .select({ deleted_at: 1 })
      .lean<{ deleted_at?: Date | null }>();
    if (existing) {
      duplicateKeyResponse(res, name, existing.deleted_at != null);
      return;
    }

    const created = await StoreModel.create({
      store_name: name,
      employee_count: 0,
      code: parsed.data.code ?? null,
      kind: parsed.data.kind,
      district: parsed.data.district ?? null,
      status: parsed.data.status,
      manager_employee_id: null,
      deleted_at: null,
    });

    const [summary] = await summarizeStores([
      {
        _id: created._id,
        store_name: created.store_name,
        code: created.code,
        kind: created.kind,
        district: created.district,
        status: created.status,
      },
    ]);
    res.status(201).json(summary);
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      duplicateKeyResponse(res, name, false);
      return;
    }
    console.error("[Stores] Create error:", describeError(err));
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Failed to create store" },
    });
  }
});

// PATCH /api/stores/:id - sửa cửa hàng; đổi tên thì cascade sang employees.store_raw
router.patch("/stores/:id", authenticateToken, async (req: Request, res: Response) => {
  if (req.user?.role !== "Admin") {
    denyRbac(res, "Only Admin can modify stores");
    return;
  }

  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400).json({
      error: { code: "VALIDATION_FAILED", message: "Invalid store ID format" },
    });
    return;
  }

  const parsed = StoreUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: {
        code: "VALIDATION_FAILED",
        message: "Invalid store payload",
        details: parsed.error.flatten(),
      },
    });
    return;
  }

  const patch = parsed.data;
  if (Object.keys(patch).length === 0) {
    res.status(400).json({
      error: { code: "VALIDATION_FAILED", message: "Empty update payload" },
    });
    return;
  }

  const nextName = typeof patch.name === "string" ? patch.name : undefined;

  try {
    const otherFields: Record<string, unknown> = {};
    if (patch.code !== undefined) otherFields.code = patch.code;
    if (patch.kind !== undefined) otherFields.kind = patch.kind;
    if (patch.district !== undefined) otherFields.district = patch.district;
    if (patch.status !== undefined) otherFields.status = patch.status;

    // Nhánh không đổi tên: một update duy nhất, không acquire lease, không chạm
    // `employees.store_raw`. Giữ đường nóng này tách khỏi nhánh rename để lease
    // không bao giờ chặn một thao tác không liên quan.
    if (nextName === undefined) {
      const existing = await StoreModel.findOne({ _id: id, deleted_at: null })
        .select({ store_name: 1 })
        .lean<{ store_name: string }>();
      if (!existing) {
        res.status(404).json({
          error: { code: "RESOURCE_NOT_FOUND", message: "Store not found" },
        });
        return;
      }
      const denial = await resolveWriteDenial(req, existing.store_name);
      if (denial !== null) {
        denyRbac(res, denial);
        return;
      }

      const updated = await StoreModel.findOneAndUpdate(
        { _id: id, deleted_at: null },
        { $set: otherFields },
        { new: true }
      )
        .select(STORE_PROJECTION)
        .lean<StoreRow | null>();

      if (!updated) {
        res.status(404).json({
          error: { code: "RESOURCE_NOT_FOUND", message: "Store not found" },
        });
        return;
      }

      const [summary] = await summarizeStores([updated]);
      res.status(200).json(summary);
      return;
    }

    /**
     * Nhánh đổi tên. CAS trên `store_name` một mình KHÔNG đủ: nó chỉ bảo vệ bước
     * rename, không bảo vệ cascade. Hai request cùng store có thể nối đuôi nhau
     * (A: orig→A, B: A→B) khiến A cascade `orig→A` sau khi B đã đổi document sang
     * `B`, để lại toàn bộ nhân sự mồ côi ở tên `A`. Vì cascade không nằm trong
     * transaction được (Atlas M0 / standalone), thứ tự hoá bằng lease trên chính
     * store document.
     *
     * Giới hạn đã biết: lease 15s là best-effort, không phải distributed lock.
     * Process chết giữa chừng thì lease tự hết hạn; request sau chờ tối đa 15s.
     * Hướng bền: thêm `store_id` (ObjectId) vào `employees` để bỏ hẳn cascade theo
     * tên — xem ADR-020.
     */
    const leaseToken = new mongoose.Types.ObjectId().toString();
    const now = new Date();
    const leaseUntil = new Date(now.getTime() + RENAME_LEASE_MS);

    const leased = await StoreModel.findOneAndUpdate(
      {
        _id: id,
        deleted_at: null,
        $or: [
          { rename_lease_until: null },
          { rename_lease_until: { $exists: false } },
          { rename_lease_until: { $lt: now } },
        ],
      },
      { $set: { rename_lease_until: leaseUntil, rename_lease_token: leaseToken } },
      { new: true }
    )
      .select(STORE_PROJECTION)
      .lean<StoreRow | null>();

    if (!leased) {
      const existing = await StoreModel.findOne({ _id: id, deleted_at: null })
        .select({ rename_lease_until: 1 })
        .lean<{ rename_lease_until?: Date | null }>();

      if (!existing) {
        res.status(404).json({
          error: { code: "RESOURCE_NOT_FOUND", message: "Store not found" },
        });
        return;
      }

      res.status(409).json({
        error: {
          code: "STORE_RENAME_BUSY",
          message: "Cửa hàng đang được người khác đổi tên, thử lại sau",
        },
      });
      return;
    }

    const previousName = leased.store_name;

    /**
     * Response của nhánh rename được HOÃN tới sau `finally`: `res.json()` đẩy byte
     * xuống socket ngay, nên client có thể gửi request kế tiếp khi lease vẫn còn giữ
     * và nhận 409 STORE_RENAME_BUSY dù không có ai tranh chấp. Thao tác kế tiếp của
     * chính người dùng (sửa tiếp field khác, mở lại form) rơi đúng cửa sổ đó.
     */
    let staged: { send?: () => void } = {};
    const respond = (fn: () => void): void => {
      staged = { send: fn };
    };

    try {
      // Scope check trên tên hiện tại của cửa hàng. Đặt sau khi lease đã giữ được
      // document để `previousName` chắc chắn là tên đang tồn tại; lease sẽ được
      // giải phóng trong `finally` ở mọi nhánh return.
      const denial = await resolveWriteDenial(req, previousName);
      if (denial !== null) {
        respond(() => denyRbac(res, denial));
        return;
      }

      // Tên không đổi nhưng vẫn có field khác: phải ghi `otherFields`, nếu không
      // người dùng thấy 200 "đã cập nhật" mà DB không đổi gì.
      if (previousName === nextName) {
        if (Object.keys(otherFields).length === 0) {
          const [summary] = await summarizeStores([leased]);
          respond(() => res.status(200).json(summary));
          return;
        }

        const updated = await StoreModel.findOneAndUpdate(
          { _id: id, store_name: previousName },
          { $set: otherFields },
          { new: true }
        )
          .select(STORE_PROJECTION)
          .lean<StoreRow | null>();

        if (!updated) {
          respond(() =>
            res.status(404).json({
              error: { code: "RESOURCE_NOT_FOUND", message: "Store not found" },
            })
          );
          return;
        }

        const [summary] = await summarizeStores([updated]);
        respond(() => res.status(200).json(summary));
        return;
      }

      const clash = await StoreModel.findOne({ store_name: nextName, _id: { $ne: id } })
        .select({ deleted_at: 1 })
        .lean<{ deleted_at?: Date | null }>();
      if (clash) {
        respond(() => duplicateKeyResponse(res, nextName, clash.deleted_at != null));
        return;
      }

      let claimed: StoreRow | null;
      try {
        claimed = await StoreModel.findOneAndUpdate(
          { _id: id, deleted_at: null, store_name: previousName },
          { $set: { store_name: nextName } },
          { new: true }
        )
          .select(STORE_PROJECTION)
          .lean<StoreRow | null>();
      } catch (err) {
        if (isDuplicateKeyError(err)) {
          respond(() => duplicateKeyResponse(res, nextName, false));
          return;
        }
        throw err;
      }

      if (!claimed) {
        respond(() =>
          res.status(409).json({
            error: {
              code: "STORE_RENAME_CONFLICT",
              message: `Cửa hàng '${previousName}' vừa được đổi tên bởi người khác; tải lại rồi thử lại`,
            },
          })
        );
        return;
      }

      try {
        await EmployeeModel.updateMany(
          { store_raw: previousName },
          { $set: { store_raw: nextName } }
        );
      } catch (cascadeError) {
        // Rollback best-effort: đưa tên về cũ để nhân sự và store không lệch nhau.
        // Nếu chính rollback hỏng, trạng thái lệch lộ ra qua `employeeCount: 0` và
        // phải xử lý bằng một PATCH đổi tên nữa — không tự khỏi.
        await StoreModel.updateOne(
          { _id: id, store_name: nextName },
          { $set: { store_name: previousName } }
        ).catch(() => undefined);
        throw cascadeError;
      }

      const employeeCount = await EmployeeModel.countDocuments({ store_raw: nextName });
      const updated = await StoreModel.findOneAndUpdate(
        { _id: id, store_name: nextName },
        { $set: { ...otherFields, employee_count: employeeCount } },
        { new: true }
      )
        .select(STORE_PROJECTION)
        .lean<StoreRow | null>();

      if (!updated) {
        // Store bị xoá mềm giữa cascade và bước này. Không rollback: nhân sự đã ở
        // tên mới, rollback sẽ trỏ họ về một cửa hàng đã xoá.
        respond(() =>
          res.status(404).json({
            error: { code: "RESOURCE_NOT_FOUND", message: "Store not found" },
          })
        );
        return;
      }

      const [summary] = await summarizeStores([updated]);
      respond(() => res.status(200).json(summary));
    } finally {
      // Điều kiện `rename_lease_token` để không giải phóng lease của request khác
      // (lease cũ đã hết hạn và bị người khác chiếm).
      await StoreModel.updateOne(
        { _id: id, rename_lease_token: leaseToken },
        { $set: { rename_lease_until: null, rename_lease_token: null } }
      ).catch(() => undefined);
      // Chỉ gửi response SAU khi lease đã nhả: ngược lại client nhận 200 trong khi
      // request kế tiếp của chính họ vẫn thấy lease và bị 409 giả.
      staged.send?.();
    }
  } catch (err) {
    console.error("[Stores] Update error:", describeError(err));
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Failed to update store" },
    });
  }
});

// DELETE /api/stores/:id - soft delete; chặn khi còn nhân sự tham chiếu
router.delete("/stores/:id", authenticateToken, async (req: Request, res: Response) => {
  if (req.user?.role !== "Admin") {
    denyRbac(res, "Only Admin can modify stores");
    return;
  }

  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400).json({
      error: { code: "VALIDATION_FAILED", message: "Invalid store ID format" },
    });
    return;
  }

  try {
    const store = await StoreModel.findOne({ _id: id, deleted_at: null })
      .select({ store_name: 1 })
      .lean<{ store_name: string }>();
    if (!store) {
      res.status(404).json({
        error: { code: "RESOURCE_NOT_FOUND", message: "Store not found" },
      });
      return;
    }

    const denial = await resolveWriteDenial(req, store.store_name);
    if (denial !== null) {
      denyRbac(res, denial);
      return;
    }

    // Đếm cả nhân sự inactive: xoá cửa hàng còn giữ họ sẽ tạo bản ghi mồ côi.
    const employeeCount = await EmployeeModel.countDocuments({ store_raw: store.store_name });
    if (employeeCount > 0) {
      res.status(409).json({
        error: {
          code: "STORE_HAS_EMPLOYEES",
          message: `Không thể xoá cửa hàng '${store.store_name}': còn ${employeeCount} nhân sự tham chiếu`,
          details: { employeeCount },
        },
      });
      return;
    }

    // CAS trên `store_name`: rename chen giữa countDocuments và bước này sẽ làm count
    // đo trên tên cũ (0 nhân sự) trong khi nhân sự đã trỏ tên mới — xoá mù sẽ để lại
    // họ mồ côi. Ghi có điều kiện buộc phải khớp đúng tên đã đọc.
    const deleted = await StoreModel.updateOne(
      { _id: id, deleted_at: null, store_name: store.store_name },
      { $set: { deleted_at: new Date() } }
    );

    if (deleted.modifiedCount === 0) {
      res.status(409).json({
        error: {
          code: "STORE_DELETE_CONFLICT",
          message: "Cửa hàng vừa thay đổi, thử lại",
        },
      });
      return;
    }

    res.status(204).send();
  } catch (err) {
    console.error("[Stores] Delete error:", describeError(err));
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Failed to delete store" },
    });
  }
});

export default router;
