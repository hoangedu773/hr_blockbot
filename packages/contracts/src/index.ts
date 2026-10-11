import { z } from "zod";

// ============================================================================
// 1. Core Auth & RBAC Schemas
// ============================================================================

export const UserRoleSchema = z.enum(["Admin", "Employee"]);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const AuthUserSchema = z.object({
  id: z.string(),
  role: UserRoleSchema,
});
export type AuthUser = z.infer<typeof AuthUserSchema>;

export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

/**
 * Login response body - chứa Access Token và user identity.
 * Refresh Token TUYỆT ĐỐI KHÔNG có trong body, chỉ được truyền qua cookie HttpOnly.
 */
export const LoginResponseSchema = z.object({
  accessToken: z.string(),
  user: AuthUserSchema,
});
export type LoginResponse = z.infer<typeof LoginResponseSchema>;
export type AuthTokens = LoginResponse;

/**
 * Refresh response body - chứa Access Token mới.
 * Refresh Token mới TUYỆT ĐỐI KHÔNG có trong body, chỉ được set qua cookie HttpOnly.
 */
export const RefreshResponseSchema = z.object({
  accessToken: z.string(),
});
export type RefreshResponse = z.infer<typeof RefreshResponseSchema>;

export const EmployeeLevelSchema = z.enum(["Intern", "Junior", "Middle", "Senior", "Lead"]);
export type EmployeeLevel = z.infer<typeof EmployeeLevelSchema>;

export const MeResponseSchema = z.object({
  userId: z.string(),
  role: UserRoleSchema,
  employeeId: z.string().nullable().optional(),
  departmentId: z.string().nullable().optional(),
  level: EmployeeLevelSchema.nullable().optional(),
  skills: z.array(z.string()).default([]),
});
export type MeResponse = z.infer<typeof MeResponseSchema>;

// ============================================================================
// 2. Employee Public DTOs (Data Minimization / Allowlist Only)
// ============================================================================

export const EmployeeStatusSchema = z.enum(["active", "inactive"]);
export type EmployeeStatus = z.infer<typeof EmployeeStatusSchema>;

/**
 * Public Employee Summary - Allowlist tối thiểu (Admin list / cross-user query).
 * TUYỆT ĐỐI KHÔNG chứa: bank, phone, CCCD, salary, hiredAt, leave_reason, internal reviews.
 */
export const EmployeeSummarySchema = z.object({
  employeeId: z.string(),
  fullName: z.string(),
  level: EmployeeLevelSchema,
  department: z.string(),
  skills: z.array(z.string()),
  activeLoad: z.number().int().nonnegative().nullable().optional(),
  status: EmployeeStatusSchema,
});
export type EmployeeSummary = z.infer<typeof EmployeeSummarySchema>;

/**
 * Own Employee Detail - Allowlist cho hồ sơ chính chủ.
 * Cho phép xem phone, hiredAt, employeeCode của chính mình.
 * TUYỆT ĐỐI KHÔNG chứa: bank_name, bank_account_number, bank_account_raw, leave_reason, salary, CCCD.
 */
export const EmployeeDetailSchema = EmployeeSummarySchema.extend({
  employeeCode: z.string(),
  departmentId: z.string().optional(),
  phone: z.string().nullable().optional(),
  hiredAt: z.string().nullable().optional(),
});
export type EmployeeDetail = z.infer<typeof EmployeeDetailSchema>;

// ============================================================================
// 3. Pagination & Envelope Schemas
// ============================================================================

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

export const PaginationMetaSchema = z.object({
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
  hasNext: z.boolean(),
  hasPrev: z.boolean(),
});
export type PaginationMeta = z.infer<typeof PaginationMetaSchema>;

export const PaginatedEmployeesResponseSchema = z.object({
  items: z.array(EmployeeSummarySchema),
  paging: PaginationMetaSchema,
});
export type PaginatedEmployeesResponse = z.infer<typeof PaginatedEmployeesResponseSchema>;

// ============================================================================
// 4. Standard Error Catalog & Envelope
// ============================================================================

export const ErrorCodeSchema = z.enum([
  "VALIDATION_FAILED",
  "UNAUTHENTICATED",
  "TOKEN_REUSED",
  "RBAC_DENIED",
  "NOT_ASSIGNEE",
  "SELF_APPROVAL",
  "CONFIRMATION_REQUIRED",
  "ILLEGAL_STATE_TRANSITION",
  "PROJECT_VERSION_CONFLICT",
  "DUPLICATE_KEY",
  "RESOURCE_NOT_FOUND",
  "LOW_CONFIDENCE_ABSTENTION",
  "AI_SERVICE_UNAVAILABLE",
  "AI_SERVICE_TIMEOUT",
  "QUOTA_EXCEEDED",
  "INTERNAL_ERROR",
  "DUPLICATE_REQUEST",
]);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const ApiErrorPayloadSchema = z.object({
  code: ErrorCodeSchema.or(z.string()),
  message: z.string(),
  details: z.record(z.unknown()).optional(),
  correlationId: z.string().optional(),
});
export type ApiErrorPayload = z.infer<typeof ApiErrorPayloadSchema>;

export const ApiErrorResponseSchema = z.object({
  error: ApiErrorPayloadSchema,
});
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;

// ============================================================================
// 5. Internal Raw Schemas (MongoDB / Extraction ETL Only - CẤM dùng làm public API response)
// ============================================================================

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

export const StoreSchema = z.object({
  _id: z.string().optional(),
  store_name: z.string(),
  employee_count: z.number().default(0),
});
export type Store = z.infer<typeof StoreSchema>;

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

export const ScheduleWeekSchema = z.object({
  _id: z.string().optional(),
  sheet_name: z.string(),
  week_start: z.string(),
  week_end: z.string(),
});
export type ScheduleWeek = z.infer<typeof ScheduleWeekSchema>;

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

export const CashDenominationSchema = z.object({
  _id: z.string().optional(),
  id: z.number().optional(),
  denomination_vnd: z.number(),
  note_count: z.number(),
  subtotal_vnd: z.number(),
  source_row: z.number().optional(),
});
export type CashDenomination = z.infer<typeof CashDenominationSchema>;

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
