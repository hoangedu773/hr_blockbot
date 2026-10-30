import mongoose, { Schema, Document } from "mongoose";

export type StoreKind = "outlet" | "group" | "support";
export type StoreStatus = "ACTIVE" | "INACTIVE";

export interface IStore extends Document {
  store_name: string;
  employee_count: number;
  /** Mã cửa hàng do vận hành đặt; legacy rows không có. */
  code?: string | null;
  kind?: StoreKind;
  district?: string | null;
  status?: StoreStatus;
  /** Con trỏ dự phòng cho override thủ công; quyền quản lý vẫn derive từ `employees`. */
  manager_employee_id?: mongoose.Types.ObjectId | null;
  deleted_at?: Date | null;
  /**
   * Lease ngắn hạn cho thao tác đổi tên. Cascade `employees.store_raw` không nằm
   * trong transaction (Atlas M0 / standalone mongod không hỗ trợ), nên hai rename
   * chồng nhau sẽ để lại nhân sự mồ côi. Lease chỉ là best-effort: process chết thì
   * nó tự hết hạn, không cần dọn tay.
   */
  rename_lease_until?: Date | null;
  rename_lease_token?: string | null;
}

const StoreSchema = new Schema<IStore>(
  {
    store_name: { type: String, required: true, unique: true, index: true },
    employee_count: { type: Number, default: 0 },
    // sparse: 133/144 cửa hàng legacy không có mã, index đặc sẽ phình vô ích.
    code: { type: String, index: true, sparse: true },
    kind: { type: String, enum: ["outlet", "group", "support"], default: "outlet" },
    district: { type: String, index: true },
    status: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE" },
    manager_employee_id: { type: Schema.Types.ObjectId, ref: "Employee", default: null },
    deleted_at: { type: Date, default: null, index: true },
    rename_lease_until: { type: Date, default: null },
    rename_lease_token: { type: String, default: null },
  },
  {
    collection: "stores",
    timestamps: false,
  }
);

export const StoreModel =
  mongoose.models.Store || mongoose.model<IStore>("Store", StoreSchema);

/**
 * Phân loại cửa hàng khi document chưa có `kind` (144 doc legacy chỉ có
 * `store_name` + `employee_count`). Tên là nguồn duy nhất còn lại để phân biệt
 * outlet thật với pseudo-entity (`Group AOM …`, `BẾP`, `GIAO HÀNG`).
 */
const OUTLET_NAME_PATTERN =
  /^(GUTA CAFE|GUTA EXPRESS|BÁNH MÌ 365|CƠM CHIÊN GIÒN|CAFE|BẾP BÁNH MÌ)\s-\s/;
const GROUP_NAME_PATTERN = /^Group /;

export function classifyStoreKind(name: unknown, kind: unknown): StoreKind {
  if (kind === "outlet" || kind === "group" || kind === "support") return kind;
  const storeName = typeof name === "string" ? name : "";
  if (OUTLET_NAME_PATTERN.test(storeName)) return "outlet";
  if (GROUP_NAME_PATTERN.test(storeName)) return "group";
  return "support";
}

/**
 * Bản aggregation của `classifyStoreKind` — phải cho cùng kết quả, nếu không thì
 * filter `?kind=` và con số summary sẽ lệch nhau trên đúng những doc legacy.
 * Không dùng được index nên chỉ chấp nhận được ở quy mô dimension (144 doc).
 */
export function storeKindExpression(): Record<string, unknown> {
  return {
    $switch: {
      branches: [
        { case: { $in: ["$kind", ["outlet", "group", "support"]] }, then: "$kind" },
        {
          case: {
            $regexMatch: {
              input: { $ifNull: ["$store_name", ""] },
              regex: OUTLET_NAME_PATTERN.source,
            },
          },
          then: "outlet",
        },
        {
          case: {
            $regexMatch: {
              input: { $ifNull: ["$store_name", ""] },
              regex: GROUP_NAME_PATTERN.source,
            },
          },
          then: "group",
        },
      ],
      default: "support",
    },
  };
}

/** Doc legacy không có `status`; mặc định ACTIVE giống giá trị default của schema. */
export function storeStatusExpression(): Record<string, unknown> {
  return { $cond: [{ $eq: ["$status", "INACTIVE"] }, "INACTIVE", "ACTIVE"] };
}
