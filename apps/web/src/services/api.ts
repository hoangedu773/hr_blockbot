import type {
  Store,
  ScheduleEntry,
  AttendanceCorrection,
  CashCount,
  EmployeeSummary,
  EmployeeDetail,
  PaginatedEmployeesResponse,
  MeResponse,
} from '@hr-blockbot/contracts';
import { apiFetch, API_BASE } from './auth';

export type {
  Store,
  ScheduleEntry,
  AttendanceCorrection,
  CashCount,
  EmployeeSummary,
  EmployeeDetail,
  PaginatedEmployeesResponse,
  MeResponse,
};

export async function fetchStores(): Promise<Store[]> {
  const res = await apiFetch(`${API_BASE}/stores`);
  if (!res.ok) {
    throw new Error(`Lỗi tải danh sách điểm bán (HTTP ${res.status})`);
  }
  const json = await res.json();
  if (Array.isArray(json)) return json;
  if (Array.isArray(json.data)) return json.data;
  return [];
}

export async function fetchSchedules(store?: string): Promise<ScheduleEntry[]> {
  const url = store
    ? `${API_BASE}/schedules?store_name=${encodeURIComponent(store)}`
    : `${API_BASE}/schedules`;
  const res = await apiFetch(url);
  if (!res.ok) {
    throw new Error(`Lỗi tải lịch phân ca (HTTP ${res.status})`);
  }
  const json = await res.json();
  if (Array.isArray(json)) return json;
  if (Array.isArray(json.data)) return json.data;
  return [];
}

export async function fetchCorrections(): Promise<AttendanceCorrection[]> {
  const res = await apiFetch(`${API_BASE}/corrections`);
  if (!res.ok) {
    throw new Error(`Lỗi tải phiếu giải trình công (HTTP ${res.status})`);
  }
  const json = await res.json();
  if (Array.isArray(json)) return json;
  if (Array.isArray(json.data)) return json.data;
  return [];
}

export async function approveCorrection(id: number | string): Promise<boolean> {
  const res = await apiFetch(`${API_BASE}/corrections/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'APPROVED' }),
  });
  if (!res.ok) {
    throw new Error(`Không thể duyệt phiếu giải trình #${id} (HTTP ${res.status})`);
  }
  return true;
}

export async function rejectCorrection(id: number | string): Promise<boolean> {
  const res = await apiFetch(`${API_BASE}/corrections/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'REJECTED' }),
  });
  if (!res.ok) {
    throw new Error(`Không thể từ chối phiếu giải trình #${id} (HTTP ${res.status})`);
  }
  return true;
}

export async function fetchCashCounts(): Promise<CashCount[]> {
  const res = await apiFetch(`${API_BASE}/cash`);
  if (!res.ok) {
    throw new Error(`Lỗi tải bảng kê tiền két (HTTP ${res.status})`);
  }
  const json = await res.json();
  if (json.counts && Array.isArray(json.counts)) return json.counts;
  if (Array.isArray(json.data)) return json.data;
  if (Array.isArray(json)) return json;
  return [];
}

/**
 * Lấy danh sách nhân sự cho Admin theo EmployeeSummary allowlist.
 * CẤM trả về PII nhạy cảm (bank, lương, CCCD, leave_reason).
 */
export async function fetchEmployees(params?: {
  departmentId?: string;
  level?: string;
  skill?: string;
  q?: string;
  page?: number;
  limit?: number;
}): Promise<PaginatedEmployeesResponse> {
  const query = new URLSearchParams();
  if (params?.departmentId) query.set('departmentId', params.departmentId);
  if (params?.level) query.set('level', params.level);
  if (params?.skill) query.set('skill', params.skill);
  if (params?.q) query.set('q', params.q);
  if (params?.page) query.set('page', String(params.page));
  if (params?.limit) query.set('limit', String(params.limit));

  const qs = query.toString();
  const url = qs ? `${API_BASE}/employees?${qs}` : `${API_BASE}/employees`;
  const res = await apiFetch(url);
  if (!res.ok) {
    throw new Error(`Lỗi tải danh sách nhân sự (HTTP ${res.status})`);
  }
  const json = await res.json();

  if (json.items && json.paging) {
    return json as PaginatedEmployeesResponse;
  }

  // Chuẩn hóa format từ raw backend nếu đang ở dạng { data, pagination }
  const rawItems = Array.isArray(json.data) ? json.data : Array.isArray(json) ? json : [];
  const items: EmployeeSummary[] = rawItems.map((emp: Record<string, unknown>) => ({
    employeeId: String(emp.employeeId || emp._id || emp.employee_code || ''),
    fullName: String(emp.fullName || emp.full_name || 'Nhân Viên'),
    level: (emp.level as EmployeeSummary['level']) || 'Junior',
    department: String(emp.department || emp.store_raw || 'Chưa phân bổ'),
    skills: Array.isArray(emp.skills) ? (emp.skills as string[]) : [],
    activeLoad: typeof emp.activeLoad === 'number' ? emp.activeLoad : null,
    status: (emp.status as EmployeeSummary['status']) || 'active',
  }));

  const paging = json.paging || {
    page: json.pagination?.page || 1,
    limit: json.pagination?.limit || 20,
    totalItems: json.pagination?.total || items.length,
    totalPages: json.pagination?.totalPages || 1,
    hasNext: false,
    hasPrev: false,
  };

  return { items, paging };
}

/**
 * Lấy hồ sơ chính chủ EmployeeDetail cho tài khoản Employee đăng nhập.
 * Cho phép xem employeeCode, phone, hiredAt của chính mình.
 * TUYỆT ĐỐI KHÔNG chứa: bank_name, bank_account, salary, CCCD.
 */
export async function fetchMyProfile(): Promise<EmployeeDetail> {
  const meRes = await apiFetch(`${API_BASE}/auth/me`);
  if (!meRes.ok) {
    throw new Error(`Không thể lấy danh tính phiên đăng nhập (HTTP ${meRes.status})`);
  }
  const me: MeResponse = await meRes.json();

  const targetId = me.employeeId || me.userId;
  if (targetId) {
    const detailRes = await apiFetch(`${API_BASE}/employees/${targetId}`);
    if (detailRes.ok) {
      const detailJson = await detailRes.json();
      const raw = (detailJson.data || detailJson) as Record<string, unknown>;
      return {
        employeeId: String(raw.employeeId || raw._id || targetId),
        employeeCode: String(raw.employeeCode || raw.employee_code || ''),
        fullName: String(raw.fullName || raw.full_name || 'Nhân Viên'),
        level: (raw.level as EmployeeDetail['level']) || me.level || 'Junior',
        department: String(raw.department || raw.store_raw || 'GUTA CAFE'),
        departmentId: raw.departmentId ? String(raw.departmentId) : me.departmentId || undefined,
        skills: Array.isArray(raw.skills) ? (raw.skills as string[]) : me.skills || [],
        activeLoad: typeof raw.activeLoad === 'number' ? raw.activeLoad : null,
        status: (raw.status as EmployeeDetail['status']) || 'active',
        phone: raw.phone ? String(raw.phone) : null,
        hiredAt: raw.hiredAt ? String(raw.hiredAt) : raw.hire_date ? String(raw.hire_date) : null,
      };
    }
  }

  return {
    employeeId: me.employeeId || me.userId,
    employeeCode: me.employeeId || 'OWN-ID',
    fullName: 'Nhân Viên ' + (me.role || 'Guta'),
    level: me.level || 'Junior',
    department: me.departmentId || 'GUTA CAFE',
    departmentId: me.departmentId || undefined,
    skills: me.skills || [],
    activeLoad: null,
    status: 'active',
    phone: null,
    hiredAt: null,
  };
}
