import { F4SuggestionsSchema, NotificationInboxSchema, type NotificationGroup, type NotificationInboxItem } from '@hr-blockbot/contracts';
import type {
  AdminUser,
  AssignmentNotice, AssignmentAudit,
  AdminUserListResponse,
  AdminUserWithPassword,
  AttendanceCorrection,
  CashCount,
  CreateAdminUser,
  ResetPasswordResponse,
  UpdateAdminUser,
  Conversation,
  CreateProfileChangeRequest,
  DashboardOverview, DashboardRevenue,
  KpiEvaluation,
  KpiDashboard,
  NotificationItem,
  EmployeeDetail,
  EmployeeLevel,
  EmployeeSummary,
  EmployeeCreate, EmployeeUpdate, EmployeeManagement, Department, DepartmentCreate, DepartmentUpdate,
  LLMProvider,
  LLMProviderInput,
  MeResponse,
  PaginatedEmployeesResponse,
  PaginatedProjectsResponse,
  Project,
  ProjectAssign,
  ProjectCreate,
  ProjectProgress,
  ProjectStatus,
  ProjectTransition,
  ProjectUpdate,
  Report,
  ProfileChangeRequest,
  ProviderTestResult,
  ReportReview,
  ReportStatus,
  ReviewProfileChangeRequest,
  ScheduleEntry,
  Store,
  StoreCreate,
  StoreKind,
  StoreListResponse,
  StoreStatus,
  StoreSummary,
  StoreUpdate,
  UpdateLLMProvidersRequest,
} from '@hr-blockbot/contracts';
import { API_BASE, apiFetch } from './auth';
export * from './revenue-kpi-api';

// Legacy ca kíp DTOs stay re-exported only so the not-yet-removed legacy
// components still compile; no client below calls their 503 endpoints anymore.
export type {
  AttendanceCorrection,
  CashCount,
  EmployeeDetail,
  EmployeeSummary,
  MeResponse,
  PaginatedEmployeesResponse,
  ScheduleEntry,
  Store,
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code = 'UNKNOWN') {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export function newClientMessageId(): string {
  const c = typeof globalThis !== 'undefined' && globalThis.crypto ? globalThis.crypto : (typeof crypto !== 'undefined' ? crypto : undefined);
  if (typeof c?.randomUUID === 'function') {
    return c.randomUUID();
  }
  if (typeof c?.getRandomValues === 'function') {
    const bytes = c.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  throw new Error('Web Crypto API is not available; secure client request ID cannot be generated.');
}

async function toApiError(res: Response, fallbackMessage: string): Promise<ApiError> {
  let message = fallbackMessage;
  let code = 'UNKNOWN';
  try {
    const body = (await res.json()) as { error?: { code?: unknown; message?: unknown } };
    if (typeof body?.error?.message === 'string' && body.error.message.length > 0) {
      message = body.error.message;
    }
    if (typeof body?.error?.code === 'string' && body.error.code.length > 0) {
      code = body.error.code;
    }
  } catch {
    // Non-JSON error body: keep the HTTP-status fallback message.
  }
  return new ApiError(message, res.status, code);
}

export async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(`${API_BASE}${path}`, init);
  if (!res.ok) {
    throw await toApiError(res, `Yêu cầu ${path} thất bại (HTTP ${res.status})`);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

function postJson(payload: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  };
}

function patchJson(payload: unknown): RequestInit {
  return {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  };
}

function putJson(payload: unknown): RequestInit {
  return {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  };
}

// ---------------------------------------------------------------------------
// Auth / identity
// ---------------------------------------------------------------------------

export async function fetchMe(): Promise<MeResponse> {
  return requestJson<MeResponse>('/auth/me');
}

export function isEmployeeDetail(value: EmployeeDetail | EmployeeSummary): value is EmployeeDetail {
  return 'profileVersion' in value && typeof value.employeeCode === 'string';
}

// ---------------------------------------------------------------------------
// F1 - Employees & profile change approval (FR-003 / FR-004)
// ---------------------------------------------------------------------------

export interface EmployeeListParams {
  jobTitle?: string;
  departmentId?: string;
  storeId?: string;
  level?: EmployeeLevel;
  /** Phase 2 adds this filter; older API builds ignore it. */
  status?: 'active' | 'inactive' | 'UNKNOWN';
  q?: string;
  page?: number;
  limit?: number;
}

/**
 * Admin employee list (allowlist DTO only). Department scope is enforced
 * server-side from the verified JWT - the client cannot widen it.
 */
export async function fetchEmployees(params?: EmployeeListParams): Promise<PaginatedEmployeesResponse> {
  const query = new URLSearchParams();
  if (params?.departmentId) query.set('departmentId', params.departmentId);
  if (params?.storeId) query.set('storeId', params.storeId);
  if (params?.level) query.set('level', params.level);
  if (params?.jobTitle) query.set('jobTitle', params.jobTitle);
  if (params?.status) query.set('status', params.status);
  if (params?.q) query.set('q', params.q);
  if (params?.page) query.set('page', String(params.page));
  if (params?.limit) query.set('limit', String(params.limit));

  const qs = query.toString();
  const json = await requestJson<PaginatedEmployeesResponse>(`/employees${qs ? `?${qs}` : ''}`);
  if (!Array.isArray(json.items) || !json.paging) {
    throw new ApiError('Phản hồi danh sách nhân sự sai hợp đồng (thiếu items/paging)', 500, 'INVALID_RESPONSE');
  }
  return json;
}

/** Own profile for Employee role; allowlist summary for Admin. */
export async function fetchEmployeeById(
  employeeId: string
): Promise<EmployeeDetail | EmployeeSummary> {
  return requestJson<EmployeeDetail | EmployeeSummary>(`/employees/${encodeURIComponent(employeeId)}`);
}

export async function fetchMyProfile(): Promise<EmployeeDetail> {
  const me = await fetchMe();
  if (!me.employeeId) {
    throw new ApiError(
      'Tài khoản chưa được liên kết với hồ sơ nhân sự (thiếu employeeId)',
      409,
      'EMPLOYEE_NOT_LINKED'
    );
  }
  const detail = await fetchEmployeeById(me.employeeId);
  if (!isEmployeeDetail(detail)) {
    throw new ApiError('Phản hồi hồ sơ không đúng allowlist EmployeeDetail', 500, 'INVALID_RESPONSE');
  }
  return detail;
}

/** Non-sensitive own fields only (phone, skills). Sensitive fields go through change requests. */
export async function updateEmployeeFields(
  employeeId: string,
  payload: { phone?: string; skills?: string[]; expectedVersion: number }
): Promise<EmployeeDetail | EmployeeSummary> {
  return requestJson<EmployeeDetail | EmployeeSummary>(
    `/employees/${encodeURIComponent(employeeId)}`,
    patchJson({ ...payload, clientMessageId: newClientMessageId() })
  );
}

export async function createPersonnel(payload: EmployeeCreate): Promise<EmployeeSummary> {
  return requestJson<EmployeeSummary>('/employees', postJson(payload));
}
export async function fetchPersonnelManagement(id: string): Promise<EmployeeManagement> {
  return requestJson<EmployeeManagement>(`/employees/${encodeURIComponent(id)}/management`);
}
export async function editPersonnel(id: string, payload: EmployeeUpdate): Promise<EmployeeSummary | EmployeeDetail> {
  return requestJson<EmployeeSummary | EmployeeDetail>(`/employees/${encodeURIComponent(id)}`, patchJson(payload));
}
export async function createDepartment(payload: DepartmentCreate): Promise<Department> {
  return requestJson<Department>('/departments', postJson(payload));
}
export async function fetchDepartment(id: string): Promise<Department> {
  return requestJson<Department>(`/departments/${encodeURIComponent(id)}`);
}
export async function editDepartment(id: string, payload: DepartmentUpdate): Promise<Department> {
  return requestJson<Department>(`/departments/${encodeURIComponent(id)}`, patchJson(payload));
}

export async function createProfileChangeRequest(
  employeeId: string,
  payload: CreateProfileChangeRequest
): Promise<ProfileChangeRequest> {
  return requestJson<ProfileChangeRequest>(
    `/employees/${encodeURIComponent(employeeId)}/change-requests`,
    postJson({ ...payload, clientMessageId: newClientMessageId() })
  );
}

/**
 * Admin approval queue shape (Phase 2 contract, agreed after phase-01):
 * `GET /api/change-requests?status=PENDING` →
 * `{ items: [{ employeeId, employeeName, request: ProfileChangeRequest }] }`.
 * Not exported by `@hr-blockbot/contracts` yet, so the envelope lives here.
 */
export interface PendingChangeRequestItem {
  employeeId: string;
  employeeName: string;
  request: ProfileChangeRequest;
}

export async function fetchPendingProfileChangeRequests(): Promise<PendingChangeRequestItem[]> {
  const json = await requestJson<PendingChangeRequestItem[] | { items?: PendingChangeRequestItem[] }>(
    '/change-requests?status=PENDING'
  );
  const items = Array.isArray(json) ? json : json.items;
  if (!Array.isArray(items)) {
    throw new ApiError(
      'Phản hồi hàng đợi duyệt sai hợp đồng (thiếu mảng items)',
      500,
      'INVALID_RESPONSE'
    );
  }
  return items;
}
export const fetchProfileApprovalPage = (page: number, status: string) => requestJson<{ items: PendingChangeRequestItem[]; paging: { hasNext: boolean; hasPrev: boolean; totalItems: number } }>(`/change-requests?status=${encodeURIComponent(status)}&page=${page}&limit=20`);

/** Own (or Admin-in-scope) change requests for one employee. */
export async function fetchEmployeeChangeRequests(employeeId: string): Promise<ProfileChangeRequest[]> {
  const json = await requestJson<ProfileChangeRequest[] | { items?: ProfileChangeRequest[] }>(
    `/employees/${encodeURIComponent(employeeId)}/change-requests`
  );
  const items = Array.isArray(json) ? json : json.items;
  if (!Array.isArray(items)) {
    throw new ApiError('Phản hồi yêu cầu thay đổi sai hợp đồng (thiếu mảng items)', 500, 'INVALID_RESPONSE');
  }
  return items;
}

export async function reviewProfileChangeRequest(
  employeeId: string,
  requestId: string,
  payload: ReviewProfileChangeRequest
): Promise<ProfileChangeRequest> {
  return requestJson<ProfileChangeRequest>(
    `/employees/${encodeURIComponent(employeeId)}/change-requests/${encodeURIComponent(requestId)}/review`,
    postJson({ ...payload, clientMessageId: newClientMessageId() })
  );
}

// ---------------------------------------------------------------------------
// F2 - Project lifecycle
// ---------------------------------------------------------------------------

export interface ProjectListParams {
  storeId?: string;
  assigneeId?: string;
  dueFrom?: string;
  dueTo?: string;
  assignmentView?: string;
  status?: ProjectStatus;
  overdue?: boolean;
  page?: number;
  limit?: number;
  q?: string;
  departmentId?: string;
  mine?: boolean;
}

export async function fetchProjects(params?: ProjectListParams): Promise<PaginatedProjectsResponse> {
  const query = new URLSearchParams();
  for (const key of ['storeId', 'assigneeId', 'dueFrom', 'dueTo'] as const) if (params?.[key]) query.set(key, params[key]!);
  if (params?.status) query.set('status', params.status);
  if (params?.overdue) query.set('overdue', 'true');
  if (params?.q) query.set('q', params.q);
  if (params?.departmentId) query.set('departmentId', params.departmentId);
  if (params?.mine) query.set('mine', 'true');
  if (params?.assignmentView) query.set('assignmentView', params.assignmentView);
  if (params?.page) query.set('page', String(params.page));
  if (params?.limit) query.set('limit', String(params.limit));

  const qs = query.toString();
  const json = await requestJson<PaginatedProjectsResponse>(`/projects${qs ? `?${qs}` : ''}`);
  if (!Array.isArray(json.items) || !json.paging) {
    throw new ApiError('Phản hồi danh sách đề tài sai hợp đồng (thiếu items/paging)', 500, 'INVALID_RESPONSE');
  }
  return json;
}

export async function fetchProjectById(projectId: string): Promise<Project> {
  return requestJson<Project>(`/projects/${encodeURIComponent(projectId)}`);
}

export type AssignmentSummary = { total: number; completed: number; pendingReview: number; awaitingAcceptance: number; inProgress: number; pendingRequests: number; pendingHandover: number; overdue: number };
export const fetchAssignmentSummary = () => requestJson<AssignmentSummary>('/assignment/summary');
export const fetchAssignmentNotices = (page = 1) => requestJson<{ items: AssignmentNotice[]; totalItems: number; unreadCount: number; paging: { page: number; hasNext: boolean; hasPrev: boolean } }>('/assignment/notifications?page=' + page + '&limit=20');
export const readAssignmentNotice = (projectId: string, noticeId: string) => requestJson<void>(`/assignment/notifications/${encodeURIComponent(projectId)}/${encodeURIComponent(noticeId)}/read`, postJson({}));
export const respondAssignment = (projectId: string, payload: { action: 'ACCEPT' | 'DECLINE' | 'REQUEST_CHANGE'; expectedVersion: number; reason?: string }) =>
  requestJson<Project>(`/projects/${encodeURIComponent(projectId)}/assignment/respond`, postJson(payload));
export const reviewAssignmentRequest = (projectId: string, requestId: string, payload: { action: 'APPROVE' | 'REJECT' | 'CANCEL_HANDOVER'; reason: string; expectedVersion: number; replacementId?: string; handoverNote?: string }) =>
  requestJson<Project>(`/projects/${encodeURIComponent(projectId)}/assignment/requests/${encodeURIComponent(requestId)}/review`, postJson(payload));
export const confirmAssignmentHandover = (projectId: string, requestId: string, payload: { action: 'CONFIRM' | 'DECLINE'; reason: string; expectedVersion: number }) =>
  requestJson<Project>(`/projects/${encodeURIComponent(projectId)}/assignment/requests/${encodeURIComponent(requestId)}/handover`, postJson(payload));
export const discussAssignment = (projectId: string, requestId: string, payload: { message: string; expectedVersion: number }, escalate = false) =>
  requestJson<Project>(`/projects/${encodeURIComponent(projectId)}/assignment/requests/${encodeURIComponent(requestId)}/${escalate ? 'escalate' : 'comments'}`, postJson(payload));
export const fetchReplacementCandidates = async (projectId: string) => F4SuggestionsSchema.parse(await requestJson<unknown>(`/projects/${encodeURIComponent(projectId)}/assignment/candidates`));
export const fetchAssignmentAudit = (projectId: string) => requestJson<{ valid: boolean; events: AssignmentAudit[]; warning: string }>(`/projects/${encodeURIComponent(projectId)}/assignment/audit`);
export type DecisionProof = { eventId: string; decisionHash: string; transactionHash: string; status: 'VERIFIED' | 'PENDING'; chainId: string; registryAddress: string; matchesCurrentEvent?: boolean };
export const fetchDecisionProofs = (projectId: string) => requestJson<{ items: DecisionProof[]; configured: boolean; auditValid: boolean; warning: string }>(`/projects/${encodeURIComponent(projectId)}/assignment/proofs`);
export const prepareDecisionProof = (projectId: string, eventId: string) => requestJson<{ status: string; registrar: string; transaction: { to: string; data: string; chainId: string; value: string }; warning: string }>(`/projects/${encodeURIComponent(projectId)}/assignment/audit/${encodeURIComponent(eventId)}/prepare`, postJson({}));
export const verifyDecisionProof = (projectId: string, eventId: string, transactionHash: string) => requestJson<DecisionProof>(`/projects/${encodeURIComponent(projectId)}/assignment/audit/${encodeURIComponent(eventId)}/verify`, postJson({ transactionHash }));

export interface CrmDepartment { id: string; name: string; code: string }
export async function fetchDepartments(): Promise<CrmDepartment[]> {
  const result = await requestJson<{ items: CrmDepartment[] }>('/departments');
  if (!Array.isArray(result.items)) throw new ApiError('Không tải được danh mục phòng ban.', 500, 'INVALID_RESPONSE');
  return result.items;
}

export async function editProject(projectId: string, payload: ProjectUpdate): Promise<Project> {
  return requestJson<Project>(`/projects/${encodeURIComponent(projectId)}`, patchJson(payload));
}

export async function fetchProjectReports(projectId: string): Promise<Report[]> {
  const items: Report[] = [];
  let page = 1;
  // New projects are bounded to 100 reports; legacy history may span more pages.
  while (true) {
    const result = await requestJson<{ items: Report[]; paging: { hasNext: boolean } }>(`/reports?projectId=${encodeURIComponent(projectId)}&limit=100&page=${page}`);
    if (!Array.isArray(result.items) || !result.paging || typeof result.paging.hasNext !== 'boolean') throw new ApiError('Không tải được báo cáo.', 500, 'INVALID_RESPONSE');
    items.push(...result.items);
    if (!result.paging.hasNext) return items;
    if (!result.items.length) throw new ApiError('Phân trang báo cáo không hợp lệ.', 500, 'INVALID_RESPONSE');
    page++;
  }
}

export interface ProjectMutationResult {
  id: string;
  status: ProjectStatus;
  version: number;
}

export async function createProject(
  payload: ProjectCreate
): Promise<{ id: string; status: ProjectStatus; version: number }> {
  return requestJson<{ id: string; status: ProjectStatus; version: number }>(
    '/projects',
    postJson({ ...payload, clientMessageId: newClientMessageId() })
  );
}

export async function assignProject(
  projectId: string,
  payload: ProjectAssign
): Promise<ProjectMutationResult> {
  return requestJson<ProjectMutationResult>(
    `/projects/${encodeURIComponent(projectId)}/assign`,
    postJson({ ...payload, clientMessageId: newClientMessageId() })
  );
}

export async function transitionProject(
  projectId: string,
  payload: ProjectTransition
): Promise<ProjectMutationResult> {
  return requestJson<ProjectMutationResult>(
    `/projects/${encodeURIComponent(projectId)}/transition`,
    postJson({ ...payload, clientMessageId: newClientMessageId() })
  );
}

export async function updateProjectProgress(
  projectId: string,
  payload: ProjectProgress
): Promise<{ id: string; progress: number; version: number }> {
  return requestJson<{ id: string; progress: number; version: number }>(
    `/projects/${encodeURIComponent(projectId)}/progress`,
    postJson({ ...payload, clientMessageId: payload.clientMessageId ?? newClientMessageId() })
  );
}

export interface SubmitReportResult {
  reportId: string;
  projectId: string;
  status: string;
  version: number;
}

/**
 * Server exposes a flat `POST /api/reports`; `projectId` travels in the body
 * (`ReportSubmitSchema`), there is no nested `/projects/:id/reports` route.
 */
export async function submitReport(
  projectId: string,
  payload: { content: string; attachments?: string[]; expectedVersion: number }
): Promise<SubmitReportResult> {
  return requestJson<SubmitReportResult>(
    '/reports',
    postJson({
      projectId,
      content: payload.content,
      attachments: payload.attachments ?? [],
      expectedVersion: payload.expectedVersion,
    })
  );
}

export interface ReviewReportResult {
  reportId: string;
  projectId: string;
  projectStatus: ProjectStatus;
  version: number;
}

export async function reviewReport(
  reportId: string,
  payload: ReportReview
): Promise<ReviewReportResult> {
  return requestJson<ReviewReportResult>(
    `/reports/${encodeURIComponent(reportId)}/review`,
    postJson(payload)
  );
}

export type { ReportStatus };

// ---------------------------------------------------------------------------
// Conversations (design/conversations-storage.md)
// ---------------------------------------------------------------------------

/** Creates a `web` conversation owned by the current user; returns its `id`. */
export async function createConversation(): Promise<Conversation> {
  return requestJson<Conversation>('/conversations', postJson({ channel: 'web' }));
}

// ---------------------------------------------------------------------------
// Admin settings - LLM providers (ADR-017)
// ---------------------------------------------------------------------------

export interface LLMProvidersResponse {
  configVersion: number;
  providers: LLMProvider[];
}

export async function fetchLLMProviders(): Promise<LLMProvidersResponse> {
  const json = await requestJson<{ configVersion?: number; providers?: LLMProvider[] }>(
    '/admin/llm-providers'
  );
  if (!Array.isArray(json.providers)) {
    throw new ApiError('Phản hồi cấu hình provider thiếu mảng providers', 500, 'INVALID_RESPONSE');
  }
  return { configVersion: json.configVersion ?? 0, providers: json.providers };
}

/**
 * Write-only API: `apiKey` is accepted when present and never echoed back.
 * Responses only ever contain `keyHint`, never the key or its ciphertext.
 */
export async function saveLLMProviders(
  payload: UpdateLLMProvidersRequest
): Promise<LLMProvidersResponse> {
  const res = await apiFetch(`${API_BASE}/admin/llm-providers`, putJson(payload));
  if (!res.ok) {
    throw await toApiError(res, `Lưu cấu hình provider thất bại (HTTP ${res.status})`);
  }
  if (res.status === 204) {
    return fetchLLMProviders();
  }
  const json = (await res.json()) as { configVersion?: number; providers?: LLMProvider[] };
  if (Array.isArray(json.providers)) {
    return { configVersion: json.configVersion ?? 0, providers: json.providers };
  }
  return fetchLLMProviders();
}

export async function testLLMProvider(providerId: string): Promise<ProviderTestResult> {
  return requestJson<ProviderTestResult>(
    `/admin/llm-providers/${encodeURIComponent(providerId)}/test`,
    postJson({})
  );
}

export type {
  LLMProvider,
  LLMProviderInput,
  UpdateLLMProvidersRequest,
};

// ---------------------------------------------------------------------------
// Admin - account management (CRUD + hạ/nâng role)
// ---------------------------------------------------------------------------

export interface AdminUserListParams {
  q?: string;
  role?: 'Admin' | 'Employee';
  businessRole?: string;
  page?: number;
  limit?: number;
}

export async function fetchAdminUsers(
  params?: AdminUserListParams
): Promise<AdminUserListResponse> {
  const query = new URLSearchParams();
  if (params?.q) query.set('q', params.q);
  if (params?.role) query.set('role', params.role);
  if (params?.businessRole) query.set('businessRole', params.businessRole);
  if (params?.page) query.set('page', String(params.page));
  query.set('limit', String(params?.limit ?? 50));
  const suffix = query.toString();
  return requestJson<AdminUserListResponse>(`/admin/users?${suffix}`);
}

/** Trả về `temporaryPassword` đúng một lần khi server tự sinh mật khẩu. */
export async function createAdminUser(
  payload: CreateAdminUser
): Promise<AdminUserWithPassword> {
  return requestJson<AdminUserWithPassword>('/admin/users', postJson(payload));
}

export async function updateAdminUser(
  userId: string,
  payload: UpdateAdminUser
): Promise<AdminUser> {
  return requestJson<AdminUser>(`/admin/users/${encodeURIComponent(userId)}`, patchJson(payload));
}

export async function resetAdminUserPassword(userId: string): Promise<ResetPasswordResponse> {
  return requestJson<ResetPasswordResponse>(
    `/admin/users/${encodeURIComponent(userId)}/reset-password`,
    postJson({})
  );
}

export async function deleteAdminUser(userId: string): Promise<void> {
  await requestJson<void>(`/admin/users/${encodeURIComponent(userId)}`, { method: 'DELETE' });
}

export type { AdminUser, AdminUserWithPassword, CreateAdminUser, ResetPasswordResponse, UpdateAdminUser };

// ---------------------------------------------------------------------------
// Store directory + dashboard overview (CRM real data)
// ---------------------------------------------------------------------------

export interface StoreListParams {
  q?: string;
  kind?: StoreKind;
  district?: string;
  status?: StoreStatus;
  page?: number;
  limit?: number;
}

export async function fetchStores(params?: StoreListParams): Promise<StoreListResponse> {
  const query = new URLSearchParams();
  if (params?.q) query.set('q', params.q);
  if (params?.kind) query.set('kind', params.kind);
  if (params?.district) query.set('district', params.district);
  if (params?.status) query.set('status', params.status);
  if (params?.page) query.set('page', String(params.page));
  if (params?.limit) query.set('limit', String(params.limit));

  const qs = query.toString();
  const json = await requestJson<StoreListResponse>(`/stores${qs ? `?${qs}` : ''}`);
  if (!Array.isArray(json.items) || !json.paging) {
    throw new ApiError('Phản hồi danh sách cửa hàng sai hợp đồng (thiếu items/paging)', 500, 'INVALID_RESPONSE');
  }
  return json;
}

export async function fetchStoreById(id: string): Promise<StoreSummary> {
  return requestJson<StoreSummary>(`/stores/${encodeURIComponent(id)}`);
}

export async function fetchStoreSmAppointments<T>(storeId: string, page: number): Promise<T> {
  return requestJson<T>(`/stores/${encodeURIComponent(storeId)}/sm-appointments?page=${page}&limit=10`);
}

export async function createStore(body: StoreCreate): Promise<StoreSummary> {
  return requestJson<StoreSummary>('/stores', postJson(body));
}

export async function updateStore(id: string, body: StoreUpdate): Promise<StoreSummary> {
  return requestJson<StoreSummary>(`/stores/${encodeURIComponent(id)}`, patchJson(body));
}

export async function deleteStore(id: string): Promise<void> {
  await requestJson<void>(`/stores/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function fetchDashboardOverview(): Promise<DashboardOverview> {
  return requestJson<DashboardOverview>('/dashboard/overview');
}
export async function fetchStoreRevenue(storeId: string): Promise<DashboardRevenue> {
  return requestJson<DashboardRevenue>(`/dashboard/revenue?storeId=${encodeURIComponent(storeId)}`);
}

export type { StoreCreate, StoreKind, StoreListResponse, StoreStatus, StoreSummary, StoreUpdate };

export async function fetchMyKpi(period: string): Promise<{ items: KpiEvaluation[] }> {
  return requestJson<{ items: KpiEvaluation[] }>(`/kpi/me?period=${encodeURIComponent(period)}`);
}
export async function fetchDepartmentKpi(period: string): Promise<{ period: string; items: KpiEvaluation[] }> {
  return requestJson<{ period: string; items: KpiEvaluation[] }>(`/kpi/department?period=${encodeURIComponent(period)}`);
}
export async function fetchKpiDashboard(period: string): Promise<KpiDashboard> {
  return requestJson<KpiDashboard>(`/kpi/dashboard?period=${encodeURIComponent(period)}`);
}
export async function openKpiPeriod(period: string): Promise<{ period: string; employees: number; created: number; existing: number }> {
  return requestJson('/kpi/periods/open', postJson({ period }));
}
export async function saveKpiSelfReview(id: string, text: string, expectedVersion: number): Promise<KpiEvaluation> {
  return requestJson<KpiEvaluation>(`/kpi/${encodeURIComponent(id)}/self-review`, postJson({ text, expectedVersion }));
}
export async function saveKpiManagerReview(id: string, text: string, managerScore: number, expectedVersion: number): Promise<KpiEvaluation> {
  return requestJson<KpiEvaluation>(`/kpi/${encodeURIComponent(id)}/manager-review`, postJson({ text, managerScore, expectedVersion }));
}
export async function analyzeKpi(id: string, expectedVersion: number): Promise<KpiEvaluation> {
  return requestJson<KpiEvaluation>(`/kpi/${encodeURIComponent(id)}/analyze`, postJson({ expectedVersion }));
}
export async function publishKpi(id: string, expectedVersion: number, finalScore?: number, overrideReason?: string): Promise<KpiEvaluation> {
  return requestJson<KpiEvaluation>(`/kpi/${encodeURIComponent(id)}/publish`, postJson({ expectedVersion, ...(finalScore === undefined ? {} : { finalScore }), ...(overrideReason ? { overrideReason } : {}) }));
}
export async function overrideKpi(id: string, expectedVersion: number, finalScore: number, reason: string): Promise<KpiEvaluation> {
  return requestJson<KpiEvaluation>(`/kpi/${encodeURIComponent(id)}/override`, postJson({ expectedVersion, finalScore, reason }));
}
export async function fetchNotifications(limit = 30, entityKind?: 'schedule' | 'revenue_kpi' | 'performance_kpi' | 'task', before?: string): Promise<{ items: NotificationItem[]; unread: number }> {
  return requestJson(`/notifications?limit=${limit}${entityKind ? '&entityKind=' + entityKind : ''}${before ? '&before=' + encodeURIComponent(before) : ''}`);
}
export async function fetchNotificationInbox(options: {
  limit: number;
  group?: NotificationGroup;
  unreadOnly?: boolean;
  cursor?: Pick<NotificationInboxItem, 'createdAt' | 'id' | 'source'>;
  signal?: AbortSignal;
}) {
  const query = new URLSearchParams({ limit: String(options.limit) });
  if (options.group) query.set('group', options.group);
  if (options.unreadOnly) query.set('unread', 'true');
  if (options.cursor) {
    query.set('before', options.cursor.createdAt);
    query.set('beforeId', options.cursor.id);
    query.set('beforeSource', options.cursor.source);
  }
  return NotificationInboxSchema.parse(await requestJson('/notifications/inbox?' + query, { signal: options.signal }));
}
export async function markNotificationRead(id: string): Promise<void> {
  await requestJson(`/notifications/${encodeURIComponent(id)}/read`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
}
export async function markAllNotificationsRead(): Promise<{ updated: number }> {
  return requestJson('/notifications/read-all', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
}
