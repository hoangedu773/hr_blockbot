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
}

const PosOrderItemSchema = new Schema<IPosOrderItem>(
  {
    productId: { type: String, required: true },
    productName: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPriceVnd: { type: Number, required: true, min: 0 },
    lineTotalVnd: { type: Number, required: true, min: 0 },
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
    subtotalVnd: { type: Number, required: true, min: 0 },
    discountVnd: { type: Number, required: true, min: 0, default: 0 },
    refundVnd: { type: Number, required: true, min: 0, default: 0 },
    netRevenueVnd: { type: Number, required: true, min: 0 },
    items: { type: [PosOrderItemSchema], default: [] },
    source: { type: String, enum: ["demo", "pos_api", "pos_export"], required: true },
  },
  { collection: "pos_orders", timestamps: true }
);

PosOrderSchema.index({ storeId: 1, orderedAt: 1, status: 1 });

export const PosOrderModel =
  mongoose.models.PosOrder || mongoose.model<IPosOrder>("PosOrder", PosOrderSchema);
