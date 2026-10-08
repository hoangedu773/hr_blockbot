import mongoose, { Schema, Document } from "mongoose";

// --- CashCount ---
export interface ICashCount extends Document {
  id?: number;
  store_name: string;
  cash_total_vnd: number;
  walkin_total_vnd: number;
  grand_total_vnd: number;
  source_row?: number;
}

const CashCountSchema = new Schema<ICashCount>(
  {
    id: { type: Number },
    store_name: { type: String, required: true, index: true },
    cash_total_vnd: { type: Number, required: true },
    walkin_total_vnd: { type: Number, required: true },
    grand_total_vnd: { type: Number, required: true },
    source_row: { type: Number },
  },
  { collection: "cash_counts", timestamps: false }
);

export const CashCountModel =
  mongoose.models.CashCount ||
  mongoose.model<ICashCount>("CashCount", CashCountSchema);

// --- CashDenomination ---
export interface ICashDenomination extends Document {
  id?: number;
  denomination_vnd: number;
  note_count: number;
  subtotal_vnd: number;
  source_row?: number;
}

const CashDenominationSchema = new Schema<ICashDenomination>(
  {
    id: { type: Number },
    denomination_vnd: { type: Number, required: true, index: true },
    note_count: { type: Number, required: true },
    subtotal_vnd: { type: Number, required: true },
    source_row: { type: Number },
  },
  { collection: "cash_denominations", timestamps: false }
);

export const CashDenominationModel =
  mongoose.models.CashDenomination ||
  mongoose.model<ICashDenomination>(
    "CashDenomination",
    CashDenominationSchema
  );

// --- CashSummary ---
export interface ICashSummary extends Document {
  id?: number;
  cash_total_vnd: number;
  denom_total_vnd: number;
  walkin_total_vnd: number;
  grand_total_vnd: number;
  source_row?: number;
}

const CashSummarySchema = new Schema<ICashSummary>(
  {
    id: { type: Number },
    cash_total_vnd: { type: Number, required: true },
    denom_total_vnd: { type: Number, required: true },
    walkin_total_vnd: { type: Number, required: true },
    grand_total_vnd: { type: Number, required: true },
    source_row: { type: Number },
  },
  { collection: "cash_summary", timestamps: false }
);

export const CashSummaryModel =
  mongoose.models.CashSummary ||
  mongoose.model<ICashSummary>("CashSummary", CashSummarySchema);
