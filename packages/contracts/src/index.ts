import { z } from "zod";

// --- Employee Schema ---
export const EmployeeSchema = z.object({
  _id: z.string().optional(),
  employee_code: z.string(),
  full_name: z.string(),
  job_title: z.string(),
  store_raw: z.string(),
  bank_name: z.string().nullable().optional(),
  bank_account_number: z.string().nullable().optional(),
  bank_account_raw: z.string().nullable().optional(),
  hire_date: z.string().nullable().optional(),
  leave_date: z.string().nullable().optional(),
  leave_reason: z.string().nullable().optional(),
  profile_status: z.string().default("ĐÃ HOÀN TẤT"),
  source_row: z.number().optional(),
});
export type Employee = z.infer<typeof EmployeeSchema>;

// --- Store Schema ---
export const StoreSchema = z.object({
  _id: z.string().optional(),
  store_name: z.string(),
  employee_count: z.number().default(0),
});
export type Store = z.infer<typeof StoreSchema>;

// --- Schedule Entry Schema ---
export const ScheduleEntrySchema = z.object({
  _id: z.string().optional(),
  id: z.number().optional(),
  employee_code: z.string(),
  employee_name: z.string(),
  block_code: z.string(),
  block_index: z.number().default(0),
  work_date: z.string(), // YYYY-MM-DD
  shift_code: z.string(), // A, A1.749, B, B2, etc.
  schedule_type: z.string().default("actual"),
  sheet_name: z.string().optional(),
  source_row: z.number().optional(),
  row_kind: z.string().default("employee"),
});
export type ScheduleEntry = z.infer<typeof ScheduleEntrySchema>;

// --- Schedule Week Schema ---
export const ScheduleWeekSchema = z.object({
  _id: z.string().optional(),
  sheet_name: z.string(),
  week_start: z.string(),
  week_end: z.string(),
});
export type ScheduleWeek = z.infer<typeof ScheduleWeekSchema>;

// --- Attendance Correction Schema ---
export const AttendanceCorrectionSchema = z.object({
  _id: z.string().optional(),
  id: z.number().optional(),
  employee_code: z.string(),
  employee_name: z.string().nullable().optional(),
  store_name: z.string(),
  work_date: z.string(),
  shift_code: z.string(),
  period_banner: z.string().default("CHẤM THEO KỲ LƯƠNG 6/5-5/6/2026"),
  note: z.string(),
  status: z.enum(["PENDING", "APPROVED", "REJECTED"]).default("PENDING"),
  reviewed_by: z.string().optional(),
  reviewed_at: z.string().optional(),
  source_row: z.number().optional(),
});
export type AttendanceCorrection = z.infer<typeof AttendanceCorrectionSchema>;

// --- Cash Count Schema ---
export const CashCountSchema = z.object({
  _id: z.string().optional(),
  id: z.number().optional(),
  store_name: z.string(),
  cash_total_vnd: z.number(),
  walkin_total_vnd: z.number(),
  grand_total_vnd: z.number(),
  source_row: z.number().optional(),
});
export type CashCount = z.infer<typeof CashCountSchema>;

// --- Cash Denomination Schema ---
export const CashDenominationSchema = z.object({
  _id: z.string().optional(),
  id: z.number().optional(),
  denomination_vnd: z.number(),
  note_count: z.number(),
  subtotal_vnd: z.number(),
  source_row: z.number().optional(),
});
export type CashDenomination = z.infer<typeof CashDenominationSchema>;

// --- Cash Summary Schema ---
export const CashSummarySchema = z.object({
  _id: z.string().optional(),
  id: z.number().optional(),
  cash_total_vnd: z.number(),
  denom_total_vnd: z.number(),
  walkin_total_vnd: z.number(),
  grand_total_vnd: z.number(),
  source_row: z.number().optional(),
});
export type CashSummary = z.infer<typeof CashSummarySchema>;

// --- Chat & Copilot Messages ---
export const ChatMessageSchema = z.object({
  id: z.string(),
  sender: z.enum(["user", "bot", "system"]),
  content: z.string(),
  timestamp: z.string(),
  intent: z.string().optional(),
  tool_called: z.string().optional(),
  citations: z.array(z.string()).optional(),
  status: z.enum(["sent", "received", "processing", "error"]).default("sent"),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

// --- RAG Query & Answer ---
export const RagQueryRequestSchema = z.object({
  question: z.string(),
  store_name: z.string().optional(),
  user_role: z.enum(["employee", "store_manager", "admin"]).default("employee"),
});
export type RagQueryRequest = z.infer<typeof RagQueryRequestSchema>;

export const RagAnswerResponseSchema = z.object({
  answer: z.string(),
  citations: z.array(z.object({
    document: z.string(),
    version: z.string(),
    article: z.string(),
    score: z.number(),
  })),
  abstain: z.boolean().default(false),
});
export type RagAnswerResponse = z.infer<typeof RagAnswerResponseSchema>;
