export interface Employee {
  _id?: string;
  employee_code: string;
  full_name: string;
  job_title: string;
  store_raw: string;
  bank_name?: string;
  bank_account_number?: string;
  hire_date?: string;
  profile_status?: string;
}

export interface Store {
  _id?: string;
  store_name: string;
  employee_count: number;
}

export interface ScheduleEntry {
  _id?: string;
  id?: number;
  employee_code: string;
  employee_name: string;
  block_code: string;
  work_date: string;
  shift_code: string;
  schedule_type: string;
}

export interface AttendanceCorrection {
  _id?: string;
  id?: number;
  employee_code: string;
  employee_name?: string | null;
  store_name: string;
  work_date: string;
  shift_code: string;
  period_banner: string;
  note: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
}

export interface CashCount {
  _id?: string;
  id?: number;
  store_name: string;
  cash_total_vnd: number;
  walkin_total_vnd: number;
  grand_total_vnd: number;
}

const API_BASE = 'http://localhost:3001/api';

// Initial seed data from hr_bot MongoDB
export const SEED_STORES: Store[] = [
  { store_name: 'GUTA CAFE - Quận 1 - 120 Hai Bà Trưng', employee_count: 45 },
  { store_name: 'GUTA CAFE - Quận 3 - 100 Nguyễn Thị Minh Khai', employee_count: 36 },
  { store_name: 'GUTA CAFE - Thủ Đức - 133 Chương Dương', employee_count: 28 },
  { store_name: 'GUTA CAFE - Gò Vấp - 238 Nguyễn Oanh', employee_count: 32 },
  { store_name: 'GUTA CAFE - Phú Nhuận - 1B Nguyễn Kiệm', employee_count: 24 },
  { store_name: 'GUTA CAFE - Phú Nhuận - 749 Nguyễn Kiệm', employee_count: 18 }
];

export const SEED_EMPLOYEES: Employee[] = [
  {
    employee_code: 'GT-CH25036607',
    full_name: 'BÙI VIỆT HÙNG',
    job_title: 'BẾP - Bếp nấu',
    store_raw: 'BẾP - Quận 1 - 120 Hai Bà Trưng',
    bank_name: 'Vietcombank',
    bank_account_number: '1012398451',
    profile_status: 'ĐÃ HOÀN TẤT'
  },
  {
    employee_code: 'GT-CH18030009',
    full_name: 'NGUYỄN THỊ THANH THÚY',
    job_title: 'BẾP - Bếp nấu',
    store_raw: 'BẾP - Quận 1 - 120 Hai Bà Trưng',
    bank_name: 'ACB',
    bank_account_number: '261411259',
    profile_status: 'ĐÃ HOÀN TẤT'
  },
  {
    employee_code: 'GT-CH26047865',
    full_name: 'VŨ ANH TÚ',
    job_title: 'PHA CHẾ - Barista',
    store_raw: 'PHA CHẾ - Quận 1 - 120 Hai Bà Trưng',
    bank_name: 'MB Bank',
    bank_account_number: '0834190834',
    profile_status: 'ĐÃ HOÀN TẤT'
  },
  {
    employee_code: 'GT-CH26047890',
    full_name: 'NGUYỄN MINH HẢI',
    job_title: 'THU NGÂN',
    store_raw: 'THU NGÂN - Quận 1 - 120 Hai Bà Trưng',
    bank_name: 'Techcombank',
    bank_account_number: '1903348123',
    profile_status: 'ĐÃ HOÀN TẤT'
  }
];

export const SEED_SCHEDULES: ScheduleEntry[] = [
  {
    employee_code: 'GT-CH25036607',
    employee_name: 'BÙI VIỆT HÙNG',
    block_code: '1BNK',
    work_date: '2026-10-05',
    shift_code: 'A1.749',
    schedule_type: 'actual'
  },
  {
    employee_code: 'GT-CH18030009',
    employee_name: 'NGUYỄN THỊ THANH THÚY',
    block_code: '1BNK',
    work_date: '2026-10-05',
    shift_code: 'A',
    schedule_type: 'actual'
  },
  {
    employee_code: 'GT-CH26047865',
    employee_name: 'VŨ ANH TÚ',
    block_code: '1BNK',
    work_date: '2026-10-05',
    shift_code: 'B',
    schedule_type: 'actual'
  },
  {
    employee_code: 'GT-CH26047890',
    employee_name: 'NGUYỄN MINH HẢI',
    block_code: '1BNK',
    work_date: '2026-10-05',
    shift_code: 'B',
    schedule_type: 'actual'
  }
];

export const SEED_CORRECTIONS: AttendanceCorrection[] = [
  {
    id: 1,
    employee_code: 'GT-CH22102995',
    employee_name: 'TRẦN VĂN AN',
    store_name: 'GUTA CAFE - 238 Nguyễn Oanh',
    work_date: '2026-05-11',
    shift_code: 'A',
    period_banner: 'CHẤM THEO KỲ LƯƠNG 6/5-5/6/2026',
    note: 'Dạ IT chưa thêm mã ca nên mấy bạn không vào ca được ạ',
    status: 'PENDING'
  },
  {
    id: 2,
    employee_code: 'GT-CH26057943',
    employee_name: 'LÊ THỊ MAI',
    store_name: 'GUTA CAFE - 30 Phạm Văn Đồng',
    work_date: '2026-05-06',
    shift_code: 'B2',
    period_banner: 'CHẤM THEO KỲ LƯƠNG 6/5-5/6/2026',
    note: 'NVM (Nhân viên mới nhận việc chưa kịp cấp mã vân tay)',
    status: 'PENDING'
  }
];

export const SEED_CASH_COUNTS: CashCount[] = [
  { id: 1, store_name: '1B Nguyễn Kiệm', cash_total_vnd: 1745000, walkin_total_vnd: 215000, grand_total_vnd: 1960000 },
  { id: 2, store_name: '749 Nguyễn Kiệm', cash_total_vnd: 580000, walkin_total_vnd: 58000, grand_total_vnd: 638000 },
  { id: 3, store_name: '120 Hai Bà Trưng', cash_total_vnd: 2310000, walkin_total_vnd: 190000, grand_total_vnd: 2500000 }
];

export async function fetchStores(): Promise<Store[]> {
  try {
    const res = await fetch(`${API_BASE}/stores`);
    if (!res.ok) throw new Error('API error');
    return await res.json();
  } catch {
    return SEED_STORES;
  }
}

export async function fetchSchedules(store?: string): Promise<ScheduleEntry[]> {
  try {
    const url = store ? `${API_BASE}/schedules?store=${encodeURIComponent(store)}` : `${API_BASE}/schedules`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('API error');
    return await res.json();
  } catch {
    return SEED_SCHEDULES;
  }
}

export async function fetchCorrections(): Promise<AttendanceCorrection[]> {
  try {
    const res = await fetch(`${API_BASE}/corrections`);
    if (!res.ok) throw new Error('API error');
    return await res.json();
  } catch {
    return SEED_CORRECTIONS;
  }
}

export async function approveCorrection(id: number | string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/corrections/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'APPROVED' })
    });
    return res.ok;
  } catch {
    return true;
  }
}

export async function fetchCashCounts(): Promise<CashCount[]> {
  try {
    const res = await fetch(`${API_BASE}/cash`);
    if (!res.ok) throw new Error('API error');
    return await res.json();
  } catch {
    return SEED_CASH_COUNTS;
  }
}
