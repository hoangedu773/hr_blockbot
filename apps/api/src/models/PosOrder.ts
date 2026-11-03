import mongoose, { Document, Schema } from "mongoose";

export type PosOrderStatus = "COMPLETED" | "CANCELLED" | "REFUNDED";
export type PosOrderChannel = "IN_STORE" | "APP" | "SHOPEEFOOD" | "PARTNER";
export type PosPaymentMethod = "CASH" | "CARD" | "MOMO" | "ZALOPAY" | "VNPAY";

export interface IPosOrderItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPriceVnd: number;
  lineTotalVnd: number;
}

export interface IPosOrder extends Document {
  orderId: string;
  storeId: mongoose.Types.ObjectId;
  orderedAt: Date;
  channel: PosOrderChannel;
  paymentMethod: PosPaymentMethod;
  status: PosOrderStatus;
  subtotalVnd: number;
  discountVnd: number;
  refundVnd: number;
  netRevenueVnd: number;
  items: IPosOrderItem[];
  source: "demo" | "pos_api" | "pos_export";
  ledgerVersion: number;
  batchId?: string;
}

const PosOrderItemSchema = new Schema<IPosOrderItem>(
  {
    productId: { type: String, required: true },
    productName: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
    unitPriceVnd: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    lineTotalVnd: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
  },
  { _id: false }
);

const PosOrderSchema = new Schema<IPosOrder>(
  {
    orderId: { type: String, required: true, unique: true, index: true },
    storeId: { type: Schema.Types.ObjectId, ref: "Store", required: true, index: true },
    orderedAt: { type: Date, required: true, index: true },
    channel: { type: String, enum: ["IN_STORE", "APP", "SHOPEEFOOD", "PARTNER"], required: true },
    paymentMethod: { type: String, enum: ["CASH", "CARD", "MOMO", "ZALOPAY", "VNPAY"], required: true },
    status: { type: String, enum: ["COMPLETED", "CANCELLED", "REFUNDED"], required: true, index: true },
    subtotalVnd: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    discountVnd: { type: Number, required: true, min: 0, default: 0, validate: Number.isSafeInteger },
    refundVnd: { type: Number, required: true, min: 0, default: 0, validate: Number.isSafeInteger },
    netRevenueVnd: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    items: { type: [PosOrderItemSchema], default: [] },
    source: { type: String, enum: ["demo", "pos_api", "pos_export"], required: true },
    ledgerVersion: { type: Number, required: true, enum: [1], default: 1 },
    batchId: { type: String, maxlength: 100 },
  },
  { collection: "pos_orders", timestamps: true }
);

PosOrderSchema.index({ storeId: 1, orderedAt: 1, status: 1 });
PosOrderSchema.pre('validate', function () {
  const itemTotal = this.items.reduce((total, item) => total + item.lineTotalVnd, 0);
  const remainder = this.subtotalVnd - this.discountVnd;
  if (!this.items.length || itemTotal !== this.subtotalVnd || this.items.some(item => item.lineTotalVnd !== item.quantity * item.unitPriceVnd)
    || remainder < 0 || this.refundVnd > remainder
    || this.netRevenueVnd !== (this.status === 'CANCELLED' ? 0 : remainder - this.refundVnd)
    || this.status === 'REFUNDED' && this.refundVnd !== remainder)
    this.invalidate('netRevenueVnd', 'Order amounts/items/status are inconsistent');
});

export const PosOrderModel =
  mongoose.models.PosOrder || mongoose.model<IPosOrder>("PosOrder", PosOrderSchema);
