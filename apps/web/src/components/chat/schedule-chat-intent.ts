export function scheduleText(text: string) {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/đ/g, 'd').trim().replace(/\s+/g, ' ');
}

export function scheduleParts(text: string) {
  const parts = /^(.+?)(?:[\s,;]+(?:lý do|ly do|ghi chú|ghi chu|nội dung|noi dung)\s*[:=]\s*|\s+(?:bởi vì|vì|vi|do)\s+(?!sao\b))(.+)$/is.exec(text);
  return { instruction: (parts?.[1] ?? text).trim(), reason: parts?.[2]?.trim() ?? '' };
}

export type ScheduleIntent =
  | 'mine'
  | 'store-week'
  | 'registrations'
  | 'register'
  | 'add-registration'
  | 'approve-registration'
  | 'remove-registration'
  | 'shifts'
  | 'requests'
  | 'request-change'
  | 'accept-change'
  | 'decline-change'
  | 'cancel-change'
  | 'review-change'
  | 'publish-week'
  | 'create-week'
  | 'help';

const rules: [ScheduleIntent, RegExp][] = [
  ['help', /(?:huong dan|tro giup|cach dung|lam duoc gi).*(?:lich|phan ca|ca lam|doi ca)/],
  ['publish-week', /(?:cong bo|phat hanh| khoa )(?:lich|tuan lich|lich tuan|lich lam)/],
  ['create-week', /(?:tao|khoi tao|lap)\s+(?:ban nhap\s+)?(?:lich tuan|tuan lich)/],
  ['approve-registration', /(?:duyet|chap thuan|dong y)\s+(?:tat ca\s+)?(?:dang ky ca|ca dang ky|bang dang ky)/],
  ['remove-registration', /(?:xoa|bo|huy)\s+(?:dang ky ca|ca dang ky)/],
  ['add-registration', /(?:them|xep)\s+ca.*(?:cho nhan vien|vao bang dang ky)/],
  ['registrations', /(?:xem|mo|kiem tra|liet ke|cho xem)?\s*bang dang ky ca|(?:danh sach|ai da)\s+dang ky ca|^dang ky ca tuan/],
  ['register', /(?:dang ky|xin dang ky|chon)\s+ca(?:\s+lam|\s+truc|\s+sang|\s+chieu|\s+toi|\s+gay|\s+[a-z0-9]{1,6}|\s+ngay|\s+thu|\s+tuan|\b)/],
  ['accept-change', /(?:dong y|chap nhan|xac nhan)\s+(?:nhan ca|doi ca|yeu cau doi ca|ca thay)/],
  ['decline-change', /(?:tu choi|khong nhan|khong dong y)\s+(?:nhan ca|doi ca|ca thay)/],
  ['cancel-change', /(?:huy|rut)\s+(?:yeu cau\s+|de nghi\s+)?(?:doi ca|nhan ca thay)/],
  ['review-change', /(?:duyet|dieu phoi|giao nguoi nhan|tu choi)\s+(?:yeu cau\s+|de nghi\s+)?(?:doi ca|nhan ca thay)/],
  ['requests', /(?:xem|danh sach|co|kiem tra)\s+(?:nhung\s+|cac\s+)?(?:yeu cau|de nghi|don)\s+(?:doi ca|nhan ca thay)|(?:yeu cau|de nghi)\s+doi ca(?:\s+nao|\s+trong tuan|\s+dang cho|\s+cua toi)?$/],
  ['request-change', /(?:xin|muon|de nghi|nho)\s+(?:nguoi\s+|quan ly\s+|dong nghiep\s+)?(?:doi(?:\s+sang)?\s+ca|nhan ca thay|thay ca|truc thay)|^doi(?:\s+sang)?\s+ca\b|^nhan ca thay\b/],
  ['shifts', /(?:danh muc|danh sach|cac|cau hinh|gio)\s+(?:ma\s+)?\bca\b(?:\s+lam|\s+truc|\s+cua hang)?|^danh muc ca$/],
  ['store-week', /(?:lich tuan|lich lam|lich phan ca|xem lich)\s+(?:cua hang|chi nhanh|quan|guta)|lich cửa hàng|lich tuan cua hang/],
  ['mine', /(?:lich lam|lich truc|ca lam|ca truc|lich)\s+(?:viec\s+)?(?:cua\s+)?(?:toi|minh|em|ca nhan)|(?:hom nay|ngay mai|tuan nay|tuan sau)\s+(?:toi|minh|em)\s+lam\s+ca\s+nao|^lich cua toi|^lich lam tuan/],
];

export function detectScheduleIntent(text: string, inContext: boolean): ScheduleIntent | null {
  const command = scheduleText(scheduleParts(text).instruction);
  // Exclude policy/document/KPI/onboarding/opsHr/tasks queries so RAG, KPI & OpsHr handlers process them
  if (/\b(?:bieu mau|quy dinh|quy che|chinh sach|tai lieu|di tre|nghi le|cham cong|tien ket|kpi|doanh thu|hieu suat|tiep nhan|ho so|ung vien|cong viec co thang diem|viec co thang diem|nhiem vu|nghiem thu|bao cao ban hang|uy quyen|danh sach chi nhanh|danh sach cua hang|danh ba nhan su|danh sach nhan su|danh sach nhan vien|so dien thoai|thong bao|xin bo sung nhan su|dieu chuyen)\b/.test(command)) {
    return null;
  }
  const hasScheduleKeyword = /\b(?:lich lam|lich truc|lich tuan|lich cua toi|phan ca|dang ky ca|bang dang ky|doi ca|nhan ca thay|thay ca|danh muc ca|ma ca|ca lam|ca truc|ca sang|ca chieu|ca toi|ca a1|ca a2|ca b1|ca b2)\b/.test(command);
  if (!hasScheduleKeyword && !inContext) return null;

  for (const [intent, pattern] of rules) {
    if (pattern.test(command)) {
      if (intent === 'register' && /^(?:xem|mo|liet ke|kiem tra)\s+(?:bang\s+|danh sach\s+)?dang ky ca/.test(command)) {
        return 'registrations';
      }
      return intent;
    }
  }

  if (inContext) {
    if (/\bcua hang|chi nhanh\b/.test(command)) return 'store-week';
    if (/\bdang ky\b/.test(command)) return 'registrations';
    if (/\bdoi ca|nhan ca\b/.test(command)) return 'requests';
    if (/\bdanh muc|ma ca\b/.test(command)) return 'shifts';
    if (/\btuan nay|tuan sau|tuan truoc|lich\b/.test(command)) return 'mine';
  }
  return hasScheduleKeyword ? 'mine' : null;
}

export function todayLocal(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
}

export function addDays(dateStr: string, days: number): string {
  return new Date(Date.parse(dateStr + 'T00:00:00Z') + days * 86400000).toISOString().slice(0, 10);
}

export function mondayOf(dateStr: string): string {
  const day = new Date(dateStr + 'T00:00:00Z').getUTCDay();
  return addDays(dateStr, -((day + 6) % 7));
}

const WEEKDAY_OFFSETS: [RegExp, number][] = [
  [/\b(?:thu\s*2|thu\s*hai|t2)\b/, 0],
  [/\b(?:thu\s*3|thu\s*ba|t3)\b/, 1],
  [/\b(?:thu\s*4|thu\s*tu|t4)\b/, 2],
  [/\b(?:thu\s*5|thu\s*nam|t5)\b/, 3],
  [/\b(?:thu\s*6|thu\s*sau|t6)\b/, 4],
  [/\b(?:thu\s*7|thu\s*bay|t7)\b/, 5],
  [/\b(?:chu\s*nhat|cn)\b/, 6],
];

export function parseScheduleDate(text: string, fallbackWeekStart?: string): { date: string | null; weekStart: string } {
  const q = scheduleText(text);
  const today = todayLocal();
  const currentMonday = mondayOf(today);
  let baseMonday = fallbackWeekStart ?? currentMonday;

  if (/\btuan\s+(?:sau|toi|ke tiep|ke)\b/.test(q)) {
    baseMonday = addDays(currentMonday, 7);
  } else if (/\btuan\s+(?:truoc|roi|qua)\b/.test(q)) {
    baseMonday = addDays(currentMonday, -7);
  } else if (/\btuan\s+(?:nay|hien tai)\b/.test(q)) {
    baseMonday = currentMonday;
  }

  // Explicit ISO date YYYY-MM-DD
  const iso = q.match(/\b(20\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/);
  if (iso) {
    const d = iso[0];
    return { date: d, weekStart: mondayOf(d) };
  }

  // Explicit DD/MM/YYYY or DD/MM
  const dmy = q.match(/\b(0?[1-9]|[12]\d|3[01])\s*[/-]\s*(0?[1-9]|1[0-2])(?:\s*[/-]\s*(20\d{2}))?\b/);
  if (dmy) {
    const year = dmy[3] || today.slice(0, 4);
    const month = dmy[2].padStart(2, '0');
    const day = dmy[1].padStart(2, '0');
    const d = `${year}-${month}-${day}`;
    return { date: d, weekStart: mondayOf(d) };
  }

  if (/\bhom\s+nay\b/.test(q)) {
    return { date: today, weekStart: mondayOf(today) };
  }
  if (/\bngay\s+mai\b/.test(q)) {
    const d = addDays(today, 1);
    return { date: d, weekStart: mondayOf(d) };
  }
  if (/\bngay\s+mot\b/.test(q)) {
    const d = addDays(today, 2);
    return { date: d, weekStart: mondayOf(d) };
  }

  for (const [pattern, offset] of WEEKDAY_OFFSETS) {
    if (pattern.test(q)) {
      const d = addDays(baseMonday, offset);
      return { date: d, weekStart: baseMonday };
    }
  }

  return { date: null, weekStart: baseMonday };
}

export function matchShiftFromText<T extends { id: string; code: string; name: string; intervals: { startMinute: number; endMinute: number }[] }>(
  text: string,
  shifts: T[]
): T | null {
  if (!shifts.length) return null;
  const q = scheduleText(text);
  // Check explicit shift code (sort longest code first so A1 matches before A)
  const sorted = [...shifts].sort((a, b) => b.code.length - a.code.length);
  for (const s of sorted) {
    const codeNorm = scheduleText(s.code).replace(/[^a-z0-9]/g, '');
    if (!codeNorm) continue;
    const regex = new RegExp(`\\b(?:ca\\s+|ma\\s+ca\\s+)?${codeNorm}\\b`, 'i');
    if (regex.test(q)) return s;
  }
  // Check natural language shift names
  if (/\bca\s+sang\b/.test(q)) {
    return shifts.find((s) => /sang/i.test(scheduleText(s.name)))
      ?? shifts.find((s) => /^a1?$/i.test(s.code))
      ?? shifts.find((s) => s.intervals[0]?.startMinute != null && s.intervals[0].startMinute <= 540)
      ?? shifts[0];
  }
  if (/\bca\s+chieu\b/.test(q)) {
    return shifts.find((s) => /chieu/i.test(scheduleText(s.name)))
      ?? shifts.find((s) => /^b1?$/i.test(s.code))
      ?? shifts.find((s) => s.intervals[0]?.startMinute != null && s.intervals[0].startMinute >= 720 && s.intervals[0].startMinute <= 960)
      ?? shifts[0];
  }
  if (/\bca\s+toi\b/.test(q)) {
    return shifts.find((s) => /toi|dem/i.test(scheduleText(s.name)))
      ?? shifts.find((s) => /^b2?$|^c/i.test(s.code))
      ?? shifts.find((s) => s.intervals[0]?.startMinute != null && s.intervals[0].startMinute >= 960)
      ?? shifts[0];
  }
  if (/\bca\s+gay\b/.test(q)) {
    return shifts.find((s) => s.intervals.length > 1) ?? null;
  }
  return null;
}

export function formatShiftIntervals(intervals: { startMinute: number; endMinute: number }[]): string {
  const fmt = (m: number) => {
    const nextDay = m >= 1440;
    const rem = m % 1440;
    const hh = String(Math.floor(rem / 60)).padStart(2, '0');
    const mm = String(rem % 60).padStart(2, '0');
    return `${hh}:${mm}${nextDay ? ' (+1)' : ''}`;
  };
  return intervals.map((p) => `${fmt(p.startMinute)}–${fmt(p.endMinute)}`).join(', ');
}

export function formatVietnameseDate(dateStr: string): string {
  const names = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  const day = new Date(dateStr + 'T00:00:00Z').getUTCDay();
  return `${names[day]} (${dateStr.slice(8, 10)}/${dateStr.slice(5, 7)}/${dateStr.slice(0, 4)})`;
}
