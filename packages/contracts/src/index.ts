import { z } from "zod";

// ============================================================================
// 1. Core Auth & RBAC Schemas
// ============================================================================

export const UserRoleSchema = z.enum(["Admin", "Employee"]);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const AuthUserSchema = z.object({
  id: z.string(),
  role: UserRoleSchema,
  /** Tên đăng nhập cấp sẵn (mã nhân viên). Optional để token cũ vẫn parse được. */
  username: z.string().optional(),
  /** True khi mật khẩu còn là mật khẩu tạm do quản lý phát. */
  mustChangePassword: z.boolean().optional(),
});
export type AuthUser = z.infer<typeof AuthUserSchema>;

/**
 * Đăng nhập bằng TÊN ĐĂNG NHẬP cấp sẵn (mã nhân viên), KHÔNG dùng email:
 * 2.439 nhân viên không có email và không cần thu thập email của ai.
 */
export const LoginRequestSchema = z.object({
  username: z.string().trim().min(3).max(64),
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

/**
 * Đổi mật khẩu lần đầu (mật khẩu tạm do quản lý phát) hoặc đổi định kỳ.
 * Yêu cầu Access Token hợp lệ; server luôn xác minh mật khẩu hiện tại.
 */
export const ChangePasswordRequestSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8).max(128),
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: "Mật khẩu mới phải khác mật khẩu hiện tại",
    path: ["newPassword"],
  });
export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequestSchema>;

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
  username: z.string().optional(),
  mustChangePassword: z.boolean().optional(),
});
export type MeResponse = z.infer<typeof MeResponseSchema>;

// ============================================================================
// 2. Department Schemas (F1)
// ============================================================================

export const DepartmentSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  code: z.string().min(1),
  managerId: z.string().nullable().optional(),
  description: z.string().optional(),
});
export type Department = z.infer<typeof DepartmentSchema>;

export const DepartmentCreateSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  managerId: z.string().optional(),
  description: z.string().optional(),
});
export type DepartmentCreate = z.infer<typeof DepartmentCreateSchema>;

// ============================================================================
// 3. Employee Public DTOs & Profile Change Approval (FR-003 / FR-004)
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

export const EmployeeCreateSchema = z.object({
  employeeCode: z.string().min(1),
  fullName: z.string().min(1),
  level: EmployeeLevelSchema,
  departmentId: z.string().min(1),
  skills: z.array(z.string()).default([]),
  phone: z.string().optional(),
  hiredAt: z.string().optional(),
});
export type EmployeeCreate = z.infer<typeof EmployeeCreateSchema>;

export const EmployeeUpdateSchema = z.object({
  fullName: z.string().min(1).optional(),
  skills: z.array(z.string()).optional(),
  phone: z.string().optional(),
});
export type EmployeeUpdate = z.infer<typeof EmployeeUpdateSchema>;

/**
 * FR-003 / FR-004: Hàng đợi phê duyệt thay đổi thông tin nhạy cảm.
 * Bounded Embedded array trong Employee document.
 */
export const ProfileChangeRequestStatusSchema = z.enum(["PENDING", "APPROVED", "REJECTED"]);
export type ProfileChangeRequestStatus = z.infer<typeof ProfileChangeRequestStatusSchema>;

export const ProfileTargetFieldsSchema = z.object({
  level: EmployeeLevelSchema.optional(),
  hiredAt: z.string().optional(),
  jobTitle: z.string().optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: "Phải cung cấp ít nhất một trường cần thay đổi" }
);
export type ProfileTargetFields = z.infer<typeof ProfileTargetFieldsSchema>;

export const CreateProfileChangeRequestSchema = z.object({
  targetFields: ProfileTargetFieldsSchema,
  previousRequestId: z.string().optional(),
});
export type CreateProfileChangeRequest = z.infer<typeof CreateProfileChangeRequestSchema>;

export const ReviewProfileChangeRequestSchema = z.object({
  action: z.enum(["APPROVE", "REJECT"]),
  reason: z.string().optional(),
}).refine(
  (data) => data.action !== "REJECT" || (data.reason && data.reason.trim().length > 0),
  { message: "Lý do từ chối (reason) là bắt buộc khi REJECT", path: ["reason"] }
);
export type ReviewProfileChangeRequest = z.infer<typeof ReviewProfileChangeRequestSchema>;

export const ProfileChangeRequestSchema = z.object({
  id: z.string(),
  requestedBy: z.string(),
  requestedAt: z.string(),
  status: ProfileChangeRequestStatusSchema,
  targetFields: ProfileTargetFieldsSchema,
  previousSnapshot: z.record(z.unknown()),
  reviewedBy: z.string().nullable().optional(),
  reviewedAt: z.string().nullable().optional(),
  rejectionReason: z.string().nullable().optional(),
  previousRequestId: z.string().nullable().optional(),
});
export type ProfileChangeRequest = z.infer<typeof ProfileChangeRequestSchema>;

// ============================================================================
// 4. Project & Lifecycle Schemas (F2)
// ============================================================================

export const ProjectStatusSchema = z.enum([
  "DRAFT",
  "ASSIGNED",
  "IN_PROGRESS",
  "PENDING_REVIEW",
  "COMPLETED",
]);
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;

export const ProjectStatusHistoryEntrySchema = z.object({
  from: ProjectStatusSchema.nullable().optional(),
  to: ProjectStatusSchema,
  changedBy: z.string(),
  changedAt: z.string(),
  reason: z.string().optional(),
});
export type ProjectStatusHistoryEntry = z.infer<typeof ProjectStatusHistoryEntrySchema>;

export const ProjectSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  description: z.string().optional(),
  departmentId: z.string(),
  createdBy: z.string(),
  assigneeId: z.string().nullable().optional(),
  status: ProjectStatusSchema,
  progress: z.number().int().min(0).max(100).default(0),
  dueDate: z.string().nullable().optional(),
  version: z.number().int().positive().default(1),
  statusHistory: z.array(ProjectStatusHistoryEntrySchema).default([]),
});
export type Project = z.infer<typeof ProjectSchema>;

export const ProjectCreateSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  departmentId: z.string().min(1),
  assigneeId: z.string().optional(),
  dueDate: z.string().optional(),
});
export type ProjectCreate = z.infer<typeof ProjectCreateSchema>;

export const ProjectUpdateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  dueDate: z.string().optional(),
});
export type ProjectUpdate = z.infer<typeof ProjectUpdateSchema>;

export const ProjectAssignSchema = z.object({
  assigneeId: z.string().min(1),
  expectedVersion: z.number().int().positive(),
});
export type ProjectAssign = z.infer<typeof ProjectAssignSchema>;

export const ProjectTransitionSchema = z.object({
  targetStatus: ProjectStatusSchema,
  expectedVersion: z.number().int().positive(),
  reason: z.string().optional(),
});
export type ProjectTransition = z.infer<typeof ProjectTransitionSchema>;

export const ProjectProgressSchema = z.object({
  progress: z.number().int().min(0).max(100),
  clientMessageId: z.string().optional(),
});
export type ProjectProgress = z.infer<typeof ProjectProgressSchema>;

// ============================================================================
// 5. Report & Review Schemas (F2)
// ============================================================================

export const ReportStatusSchema = z.enum(["PENDING", "APPROVED", "REJECTED"]);
export type ReportStatus = z.infer<typeof ReportStatusSchema>;

export const ReportSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  submittedBy: z.string(),
  submittedAt: z.string(),
  content: z.string().min(1),
  attachments: z.array(z.string()).default([]),
  status: ReportStatusSchema,
  reviewedBy: z.string().nullable().optional(),
  reviewedAt: z.string().nullable().optional(),
  reason: z.string().nullable().optional(),
});
export type Report = z.infer<typeof ReportSchema>;

export const ReportSubmitSchema = z.object({
  projectId: z.string().min(1),
  content: z.string().min(1),
  attachments: z.array(z.string()).default([]),
  expectedVersion: z.number().int().positive(),
});
export type ReportSubmit = z.infer<typeof ReportSubmitSchema>;

export const ReportReviewSchema = z.object({
  action: z.enum(["APPROVE", "REJECT"]),
  reason: z.string().optional(),
  expectedVersion: z.number().int().positive(),
}).refine(
  (data) => data.action !== "REJECT" || (data.reason && data.reason.trim().length > 0),
  { message: "Lý do xem xét (reason) là bắt buộc khi REJECT", path: ["reason"] }
);
export type ReportReview = z.infer<typeof ReportReviewSchema>;

// ============================================================================
// 6. Pagination & Envelope Schemas
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

export const PaginatedProjectsResponseSchema = z.object({
  items: z.array(ProjectSchema),
  paging: PaginationMetaSchema,
});
export type PaginatedProjectsResponse = z.infer<typeof PaginatedProjectsResponseSchema>;

// ============================================================================
// 7. Standard Error Catalog & Envelope
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
  "LLM_UNAVAILABLE",
  "MAX_STEPS",
  "TOOL_TIMEOUT",
  "CONVERSATION_FULL",
  "QUOTA_EXCEEDED",
  "INTERNAL_ERROR",
  "DUPLICATE_REQUEST",
  "MAX_CHANGE_REQUESTS_REACHED",
  "PROFILE_CHANGE_CONFLICT",
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
// 8. LLM Provider Settings (ADR-017)
// ============================================================================

export const LLMProviderTypeSchema = z.enum(["openai_compatible", "gemini", "anthropic"]);
export type LLMProviderType = z.infer<typeof LLMProviderTypeSchema>;

/**
 * Provider đã mask - DTO dùng cho mọi response.
 * TUYỆT ĐỐI KHÔNG chứa keyCipher hoặc key thật; chỉ keyHint (4 ký tự cuối).
 */
export const LLMProviderSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: LLMProviderTypeSchema,
  baseUrl: z.string().min(1),
  model: z.string().min(1),
  maxTokens: z.number().int().positive(),
  timeoutMs: z.number().int().positive(),
  priority: z.number().int().positive(),
  enabled: z.boolean(),
  keyHint: z.string().optional(),
  lastTestAt: z.string().nullable().optional(),
  lastTestOk: z.boolean().nullable().optional(),
  lastTestError: z.string().nullable().optional(),
});
export type LLMProvider = z.infer<typeof LLMProviderSchema>;

/** Payload ghi provider: apiKey là field chỉ-ghi (server mã hoá AES-256-GCM, không đọc lại). */
export const LLMProviderInputSchema = LLMProviderSchema.extend({
  apiKey: z.string().min(1).optional(),
});
export type LLMProviderInput = z.infer<typeof LLMProviderInputSchema>;

export const UpdateLLMProvidersRequestSchema = z.object({
  providers: z.array(LLMProviderInputSchema),
});
export type UpdateLLMProvidersRequest = z.infer<typeof UpdateLLMProvidersRequestSchema>;

export const ProviderTestResultSchema = z.object({
  ok: z.boolean(),
  latencyMs: z.number().int().nonnegative(),
  model: z.string().min(1),
  error: z.string().optional(),
});
export type ProviderTestResult = z.infer<typeof ProviderTestResultSchema>;

// ============================================================================
// 9. Conversation & Citation Schemas (design/conversations-storage.md)
// ============================================================================

/** Trần lưu trữ message/conversation - bất biến §2 của design doc. */
export const CONVERSATION_MAX_MESSAGES = 50;

export const ConversationChannelSchema = z.enum(["web"]);
export type ConversationChannel = z.infer<typeof ConversationChannelSchema>;

export const ConversationStatusSchema = z.enum(["active", "closed", "handoff"]);
export type ConversationStatus = z.infer<typeof ConversationStatusSchema>;

export const ConversationMessageRoleSchema = z.enum(["user", "assistant", "system"]);
export type ConversationMessageRole = z.infer<typeof ConversationMessageRoleSchema>;

/** Citation dùng chung cho RagAnswerResponse và từng message của conversation. */
export const CitationSchema = z.object({
  document: z.string().min(1),
  version: z.string().min(1),
  article: z.string().min(1),
  score: z.number(),
});
export type Citation = z.infer<typeof CitationSchema>;

export const ConversationMessageSchema = z.object({
  id: z.string().min(1),
  role: ConversationMessageRoleSchema,
  content: z.string(),
  intent: z.string().optional(),
  toolCalled: z.string().optional(),
  citations: z.array(CitationSchema).default([]),
  score: z.number().optional(),
  abstain: z.boolean().default(false),
  clientMessageId: z.string().optional(),
  createdAt: z.string(),
});
export type ConversationMessage = z.infer<typeof ConversationMessageSchema>;

export const ConversationContextSummarySchema = z.object({
  text: z.string(),
  coversUpToMessageId: z.string(),
  createdAt: z.string(),
});
export type ConversationContextSummary = z.infer<typeof ConversationContextSummarySchema>;

export const ConversationSchema = z.object({
  id: z.string(),
  userId: z.string(),
  channel: ConversationChannelSchema.default("web"),
  status: ConversationStatusSchema,
  messages: z.array(ConversationMessageSchema).max(CONVERSATION_MAX_MESSAGES),
  messageCount: z.number().int().nonnegative(),
  startedAt: z.string(),
  lastMessageAt: z.string(),
  closedAt: z.string().nullable().optional(),
  contextSummary: ConversationContextSummarySchema.nullable().optional(),
});
export type Conversation = z.infer<typeof ConversationSchema>;

// ============================================================================
// 10. Policy Schemas (F3)
// ============================================================================

export const PolicyChunkMetaSchema = z.object({
  document: z.string().min(1),
  version: z.string().min(1),
  article: z.string().optional(),
  source: z.string().min(1),
  effectiveFrom: z.string().optional(),
});
export type PolicyChunkMeta = z.infer<typeof PolicyChunkMetaSchema>;

/** Chunk chưa bắt buộc embedding: ingest ở Phase 4 mới sinh vector. */
export const PolicyChunkSchema = PolicyChunkMetaSchema.extend({
  text: z.string().min(1),
  order: z.number().int().nonnegative(),
  embedding: z.array(z.number()).optional(),
  model: z.string().optional(),
});
export type PolicyChunk = z.infer<typeof PolicyChunkSchema>;

export const PolicySchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  version: z.string().min(1),
  source: z.string().min(1),
  category: z.string().optional(),
  effectiveFrom: z.string().optional(),
  updatedAt: z.string().optional(),
  chunks: z.array(PolicyChunkSchema).default([]),
});
export type Policy = z.infer<typeof PolicySchema>;

// ============================================================================
// 11. Internal Raw Schemas (MongoDB / Extraction ETL Only)
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
  work_date: z.string(),
  shift_code: z.string(),
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
  // ADR-009: role hệ thống chỉ có 2 giá trị, level là trục riêng
  user_role: UserRoleSchema.default("Employee"),
});
export type RagQueryRequest = z.infer<typeof RagQueryRequestSchema>;

export const RagAnswerResponseSchema = z.object({
  answer: z.string(),
  citations: z.array(CitationSchema),
  abstain: z.boolean().default(false),
});
export type RagAnswerResponse = z.infer<typeof RagAnswerResponseSchema>;

// ============================================================================
// WEBSOCKET EVENTS (docs/06 §4.2 canonical)
// ============================================================================

export const WsEventNameSchema = z.enum([
  "chat:send",
  "chat:accepted",
  "chat:chunk",
  "chat:confirm",
  "chat:done",
  "chat:error",
  "notification:new",
  "project:updated",
  "report:updated",
  "kpi:updated",
]);
export type WsEventName = z.infer<typeof WsEventNameSchema>;

export const WS_CLIENT_EVENTS = {
  "chat:send": "chat:send",
  "chat:confirm": "chat:confirm",
} as const;

export const WS_SERVER_EVENTS = {
  "chat:accepted": "chat:accepted",
  "chat:chunk": "chat:chunk",
  "chat:done": "chat:done",
  "chat:error": "chat:error",
  "notification:new": "notification:new",
  "project:updated": "project:updated",
  "report:updated": "report:updated",
  "kpi:updated": "kpi:updated",
} as const;

export const ChatSendPayloadSchema = z
  .object({
    clientMessageId: z.string().min(1),
    text: z.string().trim().min(1).optional(),
    conversationId: z.string().optional(),
    tool: z.string().optional(),
    args: z.record(z.unknown()).optional(),
    confirm: z
      .object({
        actionId: z.string().min(1),
        approved: z.boolean(),
      })
      .optional(),
  })
  .refine(
    (data) => (Boolean(data.text) !== Boolean(data.confirm)),
    { message: "chat:send requires either text or confirm, but not both or neither" }
  );
export type ChatSendPayload = z.infer<typeof ChatSendPayloadSchema>;

export const ChatAckSchema = z.discriminatedUnion("accepted", [
  z.object({
    accepted: z.literal(true),
    clientMessageId: z.string().min(1),
    conversationId: z.string().min(1),
    messageId: z.string().min(1),
  }),
  z.object({
    accepted: z.literal(false),
    error: z.object({
      code: ErrorCodeSchema,
      message: z.string(),
      retryable: z.boolean(),
    }),
  }),
]);
export type ChatAck = z.infer<typeof ChatAckSchema>;

export const ChatAcceptedPayloadSchema = z.object({
  clientMessageId: z.string().min(1),
  messageId: z.string().min(1),
  conversationId: z.string().min(1),
  acceptedAt: z.string().datetime().or(z.string()),
});
export type ChatAcceptedPayload = z.infer<typeof ChatAcceptedPayloadSchema>;

export const ActionProposalDataSchema = z.object({
  actionId: z.string().min(1),
  type: z.string().min(1),
  args: z.record(z.unknown()).default({}),
  preview: z.string().min(1),
});
export type ActionProposalData = z.infer<typeof ActionProposalDataSchema>;

export const ChatChunkTextPayloadSchema = z.object({
  clientMessageId: z.string().min(1),
  messageId: z.string().min(1),
  seq: z.number().int().nonnegative(),
  kind: z.literal("text"),
  delta: z.string().min(1),
});

export const ChatChunkCitationPayloadSchema = z.object({
  clientMessageId: z.string().min(1),
  messageId: z.string().min(1),
  seq: z.number().int().nonnegative(),
  kind: z.literal("citation"),
  data: CitationSchema,
});

export const ChatChunkActionProposalPayloadSchema = z.object({
  clientMessageId: z.string().min(1),
  messageId: z.string().min(1),
  seq: z.number().int().nonnegative(),
  kind: z.literal("action_proposal"),
  data: ActionProposalDataSchema,
});

export const ChatChunkPayloadSchema = z.discriminatedUnion("kind", [
  ChatChunkTextPayloadSchema,
  ChatChunkCitationPayloadSchema,
  ChatChunkActionProposalPayloadSchema,
]);
export type ChatChunkPayload = z.infer<typeof ChatChunkPayloadSchema>;

export const ChatConfirmPayloadSchema = z.object({
  clientMessageId: z.string().min(1),
  actionId: z.string().min(1),
  approve: z.boolean(),
});
export type ChatConfirmPayload = z.infer<typeof ChatConfirmPayloadSchema>;

export const ChatConfirmAckSchema = z.object({
  accepted: z.boolean(),
  clientMessageId: z.string().min(1),
  actionId: z.string().min(1),
});
export type ChatConfirmAck = z.infer<typeof ChatConfirmAckSchema>;

export const ChatFinishReasonSchema = z.enum(["ANSWER", "TOOL_RESULT", "ABSTAIN", "ERROR"]);
export type ChatFinishReason = z.infer<typeof ChatFinishReasonSchema>;

export const ChatDonePayloadSchema = z.object({
  clientMessageId: z.string().min(1),
  messageId: z.string().min(1),
  finishReason: ChatFinishReasonSchema,
  // P1-9: the socket emits these; without them the schema rejected the real payload
  // and a validating client would drop the answer text entirely.
  reply: z.string().optional(),
  proposedAction: z.record(z.unknown()).nullish(),
  degraded: z.boolean().optional(),
  decisionSource: z.string().optional(),
  citations: z.array(CitationSchema).optional(),
  card: z.record(z.unknown()).optional(),
  score: z.number().optional(),
  usage: z
    .object({
      inputTokens: z.number().optional(),
      outputTokens: z.number().optional(),
    })
    .or(z.record(z.unknown()))
    .optional(),
});
export type ChatDonePayload = z.infer<typeof ChatDonePayloadSchema>;

export const ChatErrorPayloadSchema = z.object({
  clientMessageId: z.string().optional(),
  messageId: z.string().optional(),
  code: ErrorCodeSchema,
  message: z.string(),
  retryable: z.boolean(),
});
export type ChatErrorPayload = z.infer<typeof ChatErrorPayloadSchema>;

export const NotificationNewPayloadSchema = z.object({
  notificationId: z.string().min(1),
  type: z.enum([
    "deadline_3d",
    "deadline_1d",
    "report_submitted",
    "report_approved",
    "report_rejected",
    "kpi_published",
    "system",
  ]),
  title: z.string().min(1),
  body: z.string().min(1),
  channel: z.enum(["ws", "email", "in_app"]).default("ws"),
  createdAt: z.string().datetime().or(z.string()),
});
export type NotificationNewPayload = z.infer<typeof NotificationNewPayloadSchema>;

export const ProjectUpdatedPayloadSchema = z.object({
  projectId: z.string().min(1),
  status: z.enum(["DRAFT", "ASSIGNED", "IN_PROGRESS", "PENDING_REVIEW", "COMPLETED"]),
  version: z.number().int().positive(),
  updatedAt: z.string().datetime().or(z.string()),
  actorId: z.string().min(1),
});
export type ProjectUpdatedPayload = z.infer<typeof ProjectUpdatedPayloadSchema>;

export const ReportUpdatedPayloadSchema = z.object({
  reportId: z.string().min(1),
  projectId: z.string().min(1),
  status: z.enum(["APPROVED", "REJECTED"]),
  reviewReason: z.string().optional(),
  createdAt: z.string().datetime().or(z.string()),
});
export type ReportUpdatedPayload = z.infer<typeof ReportUpdatedPayloadSchema>;

export const KpiUpdatedPayloadSchema = z.object({
  evaluationId: z.string().min(1),
  employeeId: z.string().min(1),
  period: z.string().min(1),
  machineScore: z.number(),
  finalScore: z.number(),
  publishedAt: z.string().datetime().or(z.string()),
});
export type KpiUpdatedPayload = z.infer<typeof KpiUpdatedPayloadSchema>;

