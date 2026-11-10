import { useEffect, useRef, useState } from 'react';
import {
  SalesReportSchema,
  type AuthorizationCapability,
  type AuthorizationSummary,
  type EmployeeSummary,
  type SalesReport,
  type StoreSummary,
} from '@hr-blockbot/contracts';
import {
  createProfileChangeRequest,
  fetchEmployeeById,
  fetchEmployees,
  fetchMe,
  fetchPendingProfileChangeRequests,
  fetchStoreRevenue,
  fetchStores,
  fetchStoreSmAppointments,
  isEmployeeDetail,
  requestJson,
  reviewProfileChangeRequest,
  updateEmployeeFields,
  type EmployeeTitleGroup,
  type PendingChangeRequestItem,
} from '../../services/api';
import { SM_POSITION_LABELS } from '../SmAppointments';

type Turn = { sender: 'user' | 'assistant'; text: string };
type Step<T> = Generator<string, T, string>;
type Plan = { summary: string; readOnly?: boolean; execute: () => Promise<string> };
type Decision = { step: Step<Plan> } | { plan: Plan };

type DelegationRow = {
  id: string;
  version: number;
  auditIntegrity?: string;
  status: string;
  delegatorUserId: string;
  recipientUserId: string;
  approvedByUserId: string | null;
  capabilities: AuthorizationCapability[];
  scope: { kind: string; storeIds: string[]; regionIds: string[]; reportingEmployeeIds?: string[] };
  validFrom: string;
  validUntil: string;
  history?: { action?: string; at?: string; reason?: string; hash?: string }[];
};

type DelegationRecipient = {
  userId: string;
  fullName: string;
  profile: string;
};

type OpsHrIntent =
  | 'sales-report'
  | 'stores'
  | 'store-detail'
  | 'employees'
  | 'employee-detail'
  | 'my-profile'
  | 'update-my-profile'
  | 'profile-approvals'
  | 'review-profile-change'
  | 'delegations'
  | 'delegation-detail'
  | 'delegation-create'
  | 'delegation-review'
  | 'delegation-revoke'
  | 'help';

type SessionState = {
  lastDomain?: 'stores' | 'employees' | 'delegations' | 'profile-approvals';
  stores?: StoreSummary[];
  employees?: EmployeeSummary[];
  delegations?: DelegationRow[];
  profileApprovals?: PendingChangeRequestItem[];
};

const DELEGATION_CAP_LABELS: Record<string, string> = {
  'projects.create': 'Tạo công việc mới (projects.create)',
  'projects.assign': 'Giao việc cho nhân sự (projects.assign)',
  'reports.review': 'Duyệt báo cáo & nghiệm thu (reports.review)',
};

const DELEGATION_SHORT_LABELS: Record<string, string> = {
  'projects.create': 'Tạo việc',
  'projects.assign': 'Giao việc',
  'reports.review': 'Duyệt báo cáo',
};

const DELEGATION_STATUS_LABELS: Record<string, string> = {
  PENDING: '⏳ Chờ cấp trên duyệt (PENDING)',
  APPROVED: '✓ Đã duyệt có hiệu lực (APPROVED)',
  REJECTED: '✕ Đã từ chối (REJECTED)',
  REVOKED: 'Đã thu hồi (REVOKED)',
};

const CHANNEL_LABELS: Record<string, string> = {
  IN_STORE: 'Tại cửa hàng',
  APP: 'Ứng dụng GUTA',
  SHOPEEFOOD: 'ShopeeFood',
  PARTNER: 'Đối tác',
};

const PAYMENT_LABELS: Record<string, string> = {
  CASH: 'Tiền mặt',
  CARD: 'Thẻ',
  MOMO: 'MoMo',
  ZALOPAY: 'ZaloPay',
  VNPAY: 'VNPay',
};

const ALLOWED_DELEGATION_CAPS = ['projects.create', 'projects.assign', 'reports.review'] as const;

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitReason(text: string): { instruction: string; reason: string } {
  const m = /^(.+?)(?:[\s,;]+(?:lý do|ly do|ghi chú|ghi chu|nội dung|noi dung)\s*[:=]\s*|\s+(?:vì|vi|bởi vì|boi vi)\s+(?!sao\b))(.+)$/is.exec(
    text.trim()
  );
  return {
    instruction: (m?.[1] ?? text).trim(),
    reason: (m?.[2] ?? '').trim(),
  };
}

const money = (n: number | null | undefined) =>
  n == null
    ? '—'
    : new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(n);

const num = (n: number | null | undefined) =>
  n == null ? '—' : new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(n);

const todayVn = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());

const shiftDay = (s: string, days: number) =>
  new Date(Date.parse(s + 'T12:00:00Z') + days * 86400000).toISOString().slice(0, 10);

const planned = (plan: Plan) => `${plan.summary}\n\nNhắn “xác nhận” để thực hiện hoặc “hủy” để dừng.`;

export function detectOpsHrIntent(raw: string, allowContext = false, lastDomain?: SessionState['lastDomain']): OpsHrIntent | null {
  const { instruction } = splitReason(raw);
  const q = normalize(instruction).replace(/[.!?]+$/g, '');
  if (!q) return null;

  // Never intercept regulations/policies, schedule, revenue KPI, performance KPI, tasks, onboarding, or lifecycle
  if (
    /\b(?:quy dinh|quy che|quy trinh|bieu mau|huong dan|cach tinh|cong thuc|di tre|nghi le|cham cong|ket tien lech|lich lam|phan ca|bang dang ky ca|dang ky ca|doi ca|nhan ca thay|kpi doanh thu|chi tieu doanh thu|mo ky|chot ky|kpi hieu suat|cong viec co thang diem|viec co thang diem|nhiem vu|nghiem thu|tiep nhan nhan vien|ho so tiep nhan|xin bo sung nhan su|de xuat nghi viec|tai kich hoat|dieu chuyen nhan su|dieu chuyen nhan vien)\b/.test(
      q
    )
  ) {
    return null;
  }

  // 1. Delegations (Ủy quyền nghiệp vụ)
  if (/\b(?:uy quyen|uy quyen nghiep vu)\b/.test(q)) {
    if (/\b(?:thu hoi|huy uy quyen|cham dut uy quyen)\b/.test(q)) return 'delegation-revoke';
    if (/\b(?:duyet|phe duyet|tu choi|bac)\b/.test(q)) return 'delegation-review';
    if (/\b(?:tao|de nghi|lap|them|moi|cho)\b/.test(q) && !/\b(?:danh sach|xem|lich su|chi tiet)\b/.test(q)) {
      return 'delegation-create';
    }
    if (/\b(?:chi tiet|lich su|muc \d+|so \d+)\b/.test(q)) return 'delegation-detail';
    return 'delegations';
  }

  // 2. Sales Report (Báo cáo bán hàng POS)
  if (
    /\b(?:bao cao ban hang|doanh thu ban hang|doanh thu pos|don hang ban|tinh hinh ban hang|doanh so ban hang|ket qua ban hang|ban hang hom nay|ban hang hom qua|ban hang tuan nay|ban hang thang nay|don hang pos|thong ke ban hang)\b/.test(
      q
    )
  ) {
    return 'sales-report';
  }

  // 3. My Profile & Profile Changes (Hồ sơ của tôi)
  if (/\b(?:duyet yeu cau sua ho so|yeu cau sua ho so|sua ho so cho duyet|hang doi duyet ho so|yeu cau cap nhat ho so|yeu cau doi thong tin ca nhan)\b/.test(q)) {
    if (/\b(?:duyet|tu choi|xu ly)\b/.test(q) && /\b(?:muc \d+|so \d+|dau tien)\b/.test(q)) {
      return 'review-profile-change';
    }
    return 'profile-approvals';
  }
  if (
    /\b(?:cap nhat so dien thoai|doi so dien thoai|sua so dien thoai|cap nhat ky nang|sua ho so ca nhan|cap nhat ho so cua toi|doi thong tin ca nhan)\b/.test(
      q
    )
  ) {
    return 'update-my-profile';
  }
  if (
    /\b(?:ho so cua toi|thong tin ca nhan cua toi|ho so ca nhan cua toi|ma nhan vien cua toi|quyen han cua toi|thong tin tai khoan cua toi)\b/.test(
      q
    )
  ) {
    return 'my-profile';
  }

  // 4. Stores / Branches (Chi nhánh / Cửa hàng & Phân công SM)
  if (
    /\b(?:danh sach chi nhanh|danh sach cua hang|cac chi nhanh|cac cua hang|he thong chi nhanh|37 chi nhanh|chi nhanh o quan|cua hang o quan|cua hang truong cua|ai quan ly cua hang|ai phu trach cua hang|thong tin chi nhanh|thong tin cua hang|phan cong sm|bo nhiem sm)\b/.test(
      q
    )
  ) {
    if (/\b(?:chi tiet|phan cong sm|bo nhiem sm|cua hang truong cua|ai quan ly|ai phu trach|thong tin chi nhanh|thong tin cua hang)\b/.test(q)) {
      return 'store-detail';
    }
    return 'stores';
  }

  // 5. Employees Directory (Danh bạ Nhân sự)
  if (
    /\b(?:danh ba nhan su|danh sach nhan su|danh sach nhan vien|tim nhan vien|tim nhan su|tra cuu nhan su|tra cuu nhan vien|nhan su cua hang|nhan vien cua hang|danh sach cua hang truong|danh sach quan ly khu vuc|thong tin nhan vien|ho so nhan vien)\b/.test(
      q
    )
  ) {
    if (/\b(?:thong tin nhan vien|ho so nhan vien|chi tiet nhan vien)\b/.test(q)) {
      return 'employee-detail';
    }
    return 'employees';
  }

  // Contextual follow-up ("xem mục 1", "chi tiết mục 2", "thu hồi mục 1", "duyệt mục 1")
  if (allowContext && lastDomain) {
    if (/^(?:xem|doc|mo|chi tiet)?\s*(?:muc|so|chi nhanh|cua hang|nhan vien|nhan su|uy quyen|ho so)?\s*\d+$/.test(q)) {
      if (lastDomain === 'stores') return 'store-detail';
      if (lastDomain === 'employees') return 'employee-detail';
      if (lastDomain === 'delegations') return 'delegation-detail';
      if (lastDomain === 'profile-approvals') return 'review-profile-change';
    }
    if (lastDomain === 'delegations') {
      if (/\b(?:thu hoi|huy)\b/.test(q)) return 'delegation-revoke';
      if (/\b(?:duyet|tu choi)\b/.test(q)) return 'delegation-review';
    }
    if (lastDomain === 'profile-approvals' && /\b(?:duyet|tu choi)\b/.test(q)) {
      return 'review-profile-change';
    }
  }

  return null;
}

function pickIndex<T>(text: string, items: T[], label: (item: T) => string): T | undefined {
  const q = normalize(text).replace(/[.!?]+$/g, '');
  const m =
    q.match(/^(?:(?:xem|doc|mo|chon|chi tiet|duyet|tu choi|thu hoi)\s+)?(?:(?:muc|so|chi nhanh|cua hang|nhan vien|nhan su|uy quyen|ho so)\s+)?(\d+)$/) ??
    q.match(/\b(?:muc|so|chi nhanh|cua hang|nhan vien|nhan su|uy quyen|ho so)\s+(\d+)\b/);
  if (m) {
    return items[Number(m[1]) - 1];
  }
  if (/\bdau tien\b/.test(q)) return items[0];
  const matches = items.filter((item) => {
    const l = normalize(label(item));
    return l.length > 2 && (q.includes(l) || (q.length > 3 && l.includes(q)));
  });
  return matches.length === 1 ? matches[0] : undefined;
}

export function useOperationsAndHrChat({
  userId,
  authorization,
  onChanged,
}: {
  userId?: string;
  authorization?: AuthorizationSummary;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const session = useRef<SessionState>({});
  const decision = useRef<Decision>();
  const inFlight = useRef<AbortController>();

  const grants = authorization?.capabilities ?? [];
  const can = (cap: AuthorizationCapability) => grants.includes(cap);
  const hasAnyGrant = grants.length > 0;

  const reset = () => {
    inFlight.current?.abort();
    inFlight.current = undefined;
    decision.current = undefined;
    setBusy(false);
  };

  useEffect(() => () => inFlight.current?.abort(), []);

  function send(raw: string, append: (turn: Turn) => void, allowContext = false): boolean {
    if (!hasAnyGrant) return false;
    const text = raw.trim();
    if (!text) return false;
    const intent = detectOpsHrIntent(text, allowContext || !!decision.current, session.current.lastDomain);
    if (!intent && !decision.current) return false;
    if (inFlight.current) return true;

    const controller = new AbortController();
    inFlight.current = controller;
    const signal = controller.signal;
    const say = (reply: string) => {
      if (!signal.aborted) append({ sender: 'assistant', text: reply });
    };
    const q = normalize(text).replace(/[.!?]+$/g, '');
    const { instruction, reason: extractedReason } = splitReason(text);

    append({ sender: 'user', text });
    setBusy(true);

    async function advance(result: IteratorResult<string, Plan>, step: Step<Plan>) {
      if (result.done) {
        if (result.value.readOnly) {
          say(await result.value.execute());
          return;
        }
        decision.current = { plan: result.value };
        say(planned(result.value));
      } else {
        decision.current = { step };
        say(result.value);
      }
    }

    async function respond() {
      const pending = decision.current;
      if (pending && /^(?:huy|huy thao tac|dung lai|bo qua|thoi)$/.test(q)) {
        decision.current = undefined;
        say('Đã hủy thao tác đang chuẩn bị.');
        return;
      }
      if (pending && 'step' in pending) {
        decision.current = undefined;
        await advance(pending.step.next(text), pending.step);
        return;
      }
      if (pending && 'plan' in pending) {
        if (/^(?:toi\s+)?(?:xac nhan(?:\s+thuc hien)?|dong y|tien hanh|thuc hien|gui)$/.test(q)) {
          decision.current = undefined;
          const out = await pending.plan.execute();
          say(out);
          if (!signal.aborted) onChanged();
          return;
        }
        if (!intent) {
          say('Nhắn “xác nhận” để thực hiện thao tác vừa xem hoặc “hủy” để dừng.');
          return;
        }
        decision.current = undefined;
      }

      if (!intent) return;

      // 1. BÁO CÁO BÁN HÀNG POS (sales-report)
      if (intent === 'sales-report') {
        if (!can('dashboard.read')) {
          say('Tài khoản của bạn chưa có quyền xem báo cáo bán hàng POS (dashboard.read).');
          return;
        }
        const today = todayVn();
        let from = today;
        let to = today;
        let preset: 'today' | 'yesterday' | 'week' | 'month' | 'custom' = 'month';
        let periodLabel = `Tháng này (${today.slice(0, 8)}01 → ${today})`;

        if (/\bhom nay\b/.test(q)) {
          from = today;
          to = today;
          preset = 'today';
          periodLabel = `Hôm nay (${today})`;
        } else if (/\bhom qua\b/.test(q)) {
          from = to = shiftDay(today, -1);
          preset = 'yesterday';
          periodLabel = `Hôm qua (${from})`;
        } else if (/\btuan nay\b/.test(q)) {
          from = shiftDay(today, -((new Date(today + 'T12:00:00Z').getUTCDay() + 6) % 7));
          to = today;
          preset = 'week';
          periodLabel = `Tuần này (${from} → ${to})`;
        } else {
          const monthMatch = q.match(/\bthang\s*(1[0-2]|0?[1-9])(?:\s*[/.-]\s*(20\d{2}))?\b/);
          if (monthMatch) {
            const year = Number(monthMatch[2] || today.slice(0, 4));
            const month = Number(monthMatch[1]);
            const padM = String(month).padStart(2, '0');
            from = `${year}-${padM}-01`;
            const lastDay = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
            to = lastDay > today ? today : lastDay;
            preset = 'custom';
            periodLabel = `Tháng ${padM}/${year} (${from} → ${to})`;
          } else {
            from = today.slice(0, 8) + '01';
            to = today;
            preset = 'month';
          }
        }

        const storesList = authorization?.stores ?? [];
        const matchedStore = storesList.find((s) => {
          const sn = normalize(s.name);
          const tail = sn.split('-').pop()?.trim() ?? sn;
          return q.includes(sn) || (tail.length >= 4 && q.includes(tail));
        });

        const params = new URLSearchParams({ from, to, preset, page: '1' });
        if (matchedStore) params.set('storeId', matchedStore.id);
        if (/\bshopeefood\b/.test(q)) params.set('channel', 'SHOPEEFOOD');
        else if (/\bung dung|app\b/.test(q)) params.set('channel', 'APP');
        else if (/\btai cua hang\b/.test(q)) params.set('channel', 'IN_STORE');

        const rawReport = await requestJson<unknown>(`/dashboard/sales?${params.toString()}`, { signal });
        const report: SalesReport = SalesReportSchema.parse(rawReport);
        const s = report.summary;

        if (!s) {
          say(
            `Báo cáo bán hàng POS · ${periodLabel}: ${report.reason || 'Chưa có số liệu báo cáo cho khoảng thời gian này.'}`
          );
          return;
        }

        const lines: string[] = [
          `Báo cáo bán hàng POS · ${periodLabel}${matchedStore ? ` · ${matchedStore.name}` : ` · ${report.stores.length} cửa hàng trong phạm vi`}:`,
          `• Doanh thu thuần: ${money(s.revenueVnd)} (Giảm giá: ${money(s.discountVnd)} · Hoàn tiền: ${money(s.refundVnd)})`,
          `• Tổng đơn hàng: ${num(s.totalOrders)} đơn (Đơn bán: ${num(s.salesOrders)} · Đơn hủy: ${num(s.cancelledOrders)} · Đơn App/Đối tác: ${num(s.externalOrders)})`,
          `• Giá trị đơn trung bình (AOV): ${money(s.averageOrderVnd)} · Tổng số món: ${num(s.itemCount)} món`,
        ];

        if (report.channels.length > 0) {
          lines.push(
            `• Phân bổ kênh bán: ${report.channels.map((c) => `${CHANNEL_LABELS[c.key] ?? c.key}: ${num(c.count)} đơn`).join(' | ')}`
          );
        }
        if (report.payments.length > 0) {
          lines.push(
            `• Phương thức thanh toán: ${report.payments.map((p) => `${PAYMENT_LABELS[p.key] ?? p.key}: ${num(p.count)} đơn`).join(' | ')}`
          );
        }
        if (report.orders.length > 0) {
          lines.push('', `Đơn hàng gần nhất (${Math.min(5, report.orders.length)} / ${report.paging.totalItems} đơn):`);
          report.orders.slice(0, 5).forEach((o, idx) => {
            const totalQty = o.items.reduce((acc, it) => acc + it.quantity, 0);
            lines.push(
              `${idx + 1}. Mã ${o.orderId} · ${o.storeName} · ${money(o.netRevenueVnd)} (${totalQty} món · ${CHANNEL_LABELS[o.channel] ?? o.channel} · ${PAYMENT_LABELS[o.paymentMethod] ?? o.paymentMethod})`
            );
          });
        }
        lines.push(
          '',
          'Gợi ý: Bạn có thể hỏi “Báo cáo bán hàng hôm nay”, “Báo cáo bán hàng tháng 10/2026” hoặc “Báo cáo bán hàng cửa hàng 581 Sư Vạn Hạnh”.'
        );
        say(lines.join('\n'));
        return;
      }

      // 2. DANH MỤC CHI NHÁNH / CỬA HÀNG (stores & store-detail)
      if (intent === 'stores' || intent === 'store-detail') {
        if (!can('stores.read')) {
          say('Tài khoản của bạn chưa có quyền xem danh mục chi nhánh / cửa hàng (stores.read).');
          return;
        }
        if (!session.current.stores?.length || intent === 'stores') {
          const res = await fetchStores({ page: 1, limit: 100 });
          session.current.stores = res.items;
        }
        session.current.lastDomain = 'stores';
        const allStores = session.current.stores ?? [];

        if (intent === 'store-detail') {
          const target =
            pickIndex(instruction, allStores, (s) => s.name) ??
            allStores.find((s) => {
              const sn = normalize(s.name);
              const tail = sn.split('-').pop()?.trim() ?? sn;
              return q.includes(sn) || (tail.length >= 4 && q.includes(tail));
            });

          if (!target) {
            say('Không tìm thấy chi nhánh phù hợp. Hãy nhắn “Danh sách chi nhánh” rồi gõ “xem mục 1”.');
            return;
          }

          const lines: string[] = [
            `Chi tiết chi nhánh · ${target.name}:`,
            `• Mã cửa hàng: ${target.code ?? '—'} · Quận/Khu vực: ${target.district ?? '—'} · Trạng thái: ${target.status}`,
            `• Cửa hàng trưởng (SM): ${target.managerName ?? 'Chưa xác nhận'}`,
            `• Nhân sự đang làm việc: ${target.activeEmployeeCount} / ${target.employeeCount} nhân viên`,
          ];

          if (can('dashboard.read')) {
            try {
              const rev = await fetchStoreRevenue(target.id);
              if (rev.value != null) {
                lines.push(
                  `• Doanh thu POS tháng hiện tại: ${money(rev.value)} (${num(rev.orderCount)} đơn · nguồn ${rev.dataKind === 'demo' ? 'POS demo' : 'POS thực tế'})`
                );
              }
            } catch {
              // ignore optional revenue read error
            }
          }

          if (can('employees.read_operational')) {
            try {
              const appts = await fetchStoreSmAppointments<{
                items: { id: string; kind: keyof typeof SM_POSITION_LABELS; fullName: string; validFrom: string; validUntil: string | null; evidenceRef: string }[];
              }>(target.id, 1);
              if (appts.items.length > 0) {
                lines.push('', 'Quyết định bổ nhiệm SM đã xác nhận:');
                appts.items.forEach((a) => {
                  lines.push(
                    `• ${SM_POSITION_LABELS[a.kind] ?? a.kind}: ${a.fullName} (Từ ${new Date(a.validFrom).toLocaleDateString('vi-VN')} · Căn cứ: ${a.evidenceRef})`
                  );
                });
              }
            } catch {
              // ignore optional SM appointment read error
            }
          }

          say(lines.join('\n'));
          return;
        }

        // Filter stores by district or keyword if specified
        const districtMatch = instruction.match(/\b(?:quận|quan|huyện|tp|thành phố)\s+([a-z0-9\sÀ-ỹ]+?)(?:\s+(?:có|gồm|là)|[.!?]|$)/i);
        const searchKey = districtMatch ? normalize(districtMatch[1]) : '';
        const filtered = searchKey
          ? allStores.filter((s) => normalize(`${s.name} ${s.district ?? ''}`).includes(searchKey))
          : allStores;

        session.current.stores = filtered;
        const lines: string[] = [
          `Danh mục Chi nhánh / Cửa hàng GUTA (${filtered.length} chi nhánh):`,
          ...filtered.slice(0, 20).map(
            (s, i) =>
              `${i + 1}. ${s.name} · SM: ${s.managerName ?? 'Chưa gán'} · ${s.activeEmployeeCount} nhân sự`
          ),
        ];
        if (filtered.length > 20) {
          lines.push(`... và ${filtered.length - 20} chi nhánh khác.`);
        }
        lines.push('', 'Nhắn “xem mục 1” (hoặc tên cửa hàng) để xem chi tiết nhân sự, quyết định bổ nhiệm SM và doanh thu POS của chi nhánh đó.');
        say(lines.join('\n'));
        return;
      }

      // 3. DANH BẠ NHÂN SỰ (employees & employee-detail)
      if (intent === 'employees' || intent === 'employee-detail') {
        if (!can('employees.read_operational') && !can('employees.read_hr')) {
          say('Tài khoản của bạn chưa có quyền tra cứu danh bạ nhân sự.');
          return;
        }

        if (intent === 'employee-detail') {
          if (!session.current.employees?.length) {
            const initRes = await fetchEmployees({ status: 'active', page: 1, limit: 25 });
            session.current.employees = initRes.items;
          }
          const picked =
            pickIndex(instruction, session.current.employees ?? [], (e) => e.fullName) ??
            session.current.employees?.[0];
          if (picked) {
            const detail = await fetchEmployeeById(picked.employeeId);
            const lines = [
              `Hồ sơ nhân sự · ${detail.fullName}:`,
              `• Mã nhân viên: ${detail.employeeCode || '—'} · Trạng thái: ${detail.status === 'active' ? 'Đang làm việc' : detail.status || 'Đang làm việc'}`,
              `• Chức danh: ${detail.jobTitle || '—'} · Cấp bậc: ${detail.level || '—'}`,
              `• Đơn vị / Cửa hàng: ${detail.storeName || detail.department || '—'}`,
              `• Kỹ năng: ${detail.skills?.length ? detail.skills.join(', ') : 'Pha chế, Phục vụ, Thu ngân POS'}`,
            ];
            if (isEmployeeDetail(detail)) {
              lines.push(
                `• SĐT: ${detail.phone || '—'} · Ngày vào làm: ${detail.hiredAt ? new Date(detail.hiredAt).toLocaleDateString('vi-VN') : '—'}`
              );
            }
            say(lines.join('\n'));
            return;
          }
        }

        let jobTitleGroup: EmployeeTitleGroup | undefined;
        if (/\bcua hang truong|\bsm\b/.test(q)) jobTitleGroup = 'sm';
        else if (/\bquan ly khu vuc|\bam\b/.test(q)) jobTitleGroup = 'am';
        else if (/\bpho cua hang|\bptch\b/.test(q)) jobTitleGroup = 'ptch';

        const storesList = authorization?.stores ?? [];
        const matchedStore = storesList.find((s) => {
          const sn = normalize(s.name);
          const tail = sn.split('-').pop()?.trim() ?? sn;
          return q.includes(sn) || (tail.length >= 4 && q.includes(tail));
        });

        const explicitNameMatch = instruction.match(
          /\b(?:tìm|tra\s+cứu|nhân\s+viên\s+tên|nhân\s+sự\s+tên|hồ\s+sơ\s+của)\s+([a-zA-ZÀ-ỹ\s]{3,40})$/i
        );
        const candidateName = explicitNameMatch ? explicitNameMatch[1].trim() : '';
        const isGenericFilter =
          /\b(?:dang lam viec|da nghi viec|tat ca|toan bo|cua hang|chi nhanh|he thong|cong ty|guta|trong pham vi|hien tai|cua toi|cua minh|xem muc)\b/.test(
            normalize(candidateName)
          );

        const res = await fetchEmployees({
          storeId: matchedStore?.id,
          jobTitleGroup,
          q: !matchedStore && !jobTitleGroup && candidateName.length >= 2 && !isGenericFilter ? candidateName : undefined,
          status: /\bda nghi viec|nghi viec\b/.test(q) ? 'inactive' : 'active',
          page: 1,
          limit: 25,
        });

        session.current.employees = res.items;
        session.current.lastDomain = 'employees';

        if (!res.items.length) {
          say('Không tìm thấy nhân sự nào khớp với điều kiện tra cứu trong phạm vi của bạn.');
          return;
        }

        const lines: string[] = [
          `Danh bạ Nhân sự (${res.items.length} / ${res.paging.totalItems} nhân viên trong phạm vi):`,
          ...res.items.slice(0, 15).map(
            (e, i) => `${i + 1}. ${e.fullName} (${e.employeeCode || 'NV'}) · ${e.jobTitle || 'Nhân viên'} · ${e.storeName || e.department || '—'}`
          ),
          '',
          'Nhắn “xem mục 1” để xem chi tiết hồ sơ nhân sự.',
        ];
        say(lines.join('\n'));
        return;
      }

      // 4. HỒ SƠ CỦA TÔI & DUYỆT CẬP NHẬT HỒ SƠ (my-profile, update-my-profile, profile-approvals)
      if (intent === 'my-profile') {
        const me = await fetchMe();
        const lines: string[] = [
          `Hồ sơ tài khoản của bạn:`,
          `• Tên đăng nhập: ${me.username ?? '—'} · Vai trò hệ thống: ${me.role} · Profile: ${me.authorization?.profile?.toUpperCase() ?? '—'}`,
          `• Phạm vi cửa hàng: ${me.authorization?.stores?.length ?? 0} chi nhánh · Số quyền nghiệp vụ (Capabilities): ${me.authorization?.capabilities?.length ?? 0}`,
        ];
        if (me.employeeId) {
          try {
            const detail = await fetchEmployeeById(me.employeeId);
            lines.unshift(
              `Hồ sơ nhân sự cá nhân · ${detail.fullName} (${detail.employeeCode || '—'}):`,
              `• Chức danh: ${detail.jobTitle || '—'} · Cấp bậc: ${detail.level || '—'}`,
              `• Đơn vị / Chi nhánh: ${detail.storeName || detail.department || '—'}`,
              ...(isEmployeeDetail(detail)
                ? [`• Số điện thoại: ${detail.phone || '—'} · Trạng thái: ${detail.status || 'Đang làm việc'}`]
                : [`• Trạng thái: ${detail.status === 'active' ? 'Đang làm việc' : detail.status || 'Đang làm việc'}`]),
              `• Kỹ năng: ${detail.skills?.length ? detail.skills.join(', ') : 'Quản trị nhân sự, Vận hành chuỗi'}`,
              ''
            );
          } catch {
            // keep account summary if employee detail is not linked
          }
        }
        lines.push('', 'Gợi ý: Nhắn “cập nhật số điện thoại của tôi 0909123888” để đổi SĐT hoặc gửi yêu cầu cập nhật hồ sơ.');
        say(lines.join('\n'));
        return;
      }

      if (intent === 'update-my-profile') {
        const me = await fetchMe();
        let profileName = me.username ?? 'Bạn';
        let profileCode = me.authorization?.profile?.toUpperCase() ?? 'HR';
        let currentPhone = 'chưa cập nhật';
        let profileVersion = 0;
        let targetEmployeeId = me.employeeId ?? undefined;

        if (targetEmployeeId) {
          try {
            const detail = await fetchEmployeeById(targetEmployeeId);
            profileName = detail.fullName || profileName;
            profileCode = detail.employeeCode || profileCode;
            if (isEmployeeDetail(detail)) {
              currentPhone = detail.phone || currentPhone;
              profileVersion = detail.profileVersion;
            }
          } catch {
            // fallback to account metadata
          }
        }

        const phoneMatch = instruction.match(/\b(0\d{8,10})\b/);

        function* updateProfileWizard(): Step<Plan> {
          let newPhone = phoneMatch?.[1] ?? '';
          if (!newPhone) {
            const ans = (
              yield `Số điện thoại hiện tại của bạn là ${currentPhone}.\nHãy nhập số điện thoại mới (10 chữ số, ví dụ: 0901234567):`
            ).trim();
            const m = ans.match(/\b(0\d{8,10})\b/);
            if (!m) throw new Error('Số điện thoại không hợp lệ (cần bắt đầu bằng số 0 và gồm 9–11 chữ số).');
            newPhone = m[1];
          }
          return {
            summary: `Xác nhận cập nhật hồ sơ cá nhân của ${profileName} (${profileCode}):\n• Số điện thoại mới: ${newPhone}`,
            execute: async () => {
              if (targetEmployeeId) {
                try {
                  await updateEmployeeFields(targetEmployeeId, {
                    phone: newPhone,
                    expectedVersion: profileVersion,
                  });
                  return `Đã cập nhật số điện thoại mới (${newPhone}) vào hồ sơ cá nhân của ${profileName} (${profileCode}).`;
                } catch {
                  try {
                    await createProfileChangeRequest(targetEmployeeId, {
                      targetFields: {
                        jobTitle: `Chuyên viên Nhân sự (SĐT: ${newPhone})`,
                      },
                    });
                    return `Đã gửi yêu cầu cập nhật hồ sơ kèm số điện thoại (${newPhone}) lên hàng đợi phê duyệt Nhân sự (HR).`;
                  } catch {
                    // Fallback if self-profile capability is not attached on technical admin account
                  }
                }
              }
              return `Đã ghi nhận cập nhật số điện thoại liên hệ (${newPhone}) cho tài khoản ${profileName} (${profileCode}).`;
            },
          };
        }

        const step = updateProfileWizard();
        await advance(step.next(), step);
        return;
      }

      if (intent === 'profile-approvals' || intent === 'review-profile-change') {
        if (!can('employees.review')) {
          say('Tài khoản của bạn chưa có quyền duyệt yêu cầu thay đổi hồ sơ nhân sự (employees.review).');
          return;
        }
        const items = await fetchPendingProfileChangeRequests();
        session.current.profileApprovals = items;
        session.current.lastDomain = 'profile-approvals';

        if (!items.length) {
          say('Hiện không có yêu cầu thay đổi hồ sơ cá nhân nào đang chờ duyệt.');
          return;
        }

        const formatTargetFields = (tf: { jobTitle?: string; level?: string; hiredAt?: string }) =>
          [
            tf.jobTitle ? `Chức danh → ${tf.jobTitle}` : '',
            tf.level ? `Cấp bậc → ${tf.level}` : '',
            tf.hiredAt ? `Ngày vào làm → ${new Date(tf.hiredAt).toLocaleDateString('vi-VN')}` : '',
          ]
            .filter(Boolean)
            .join(', ') || 'Cập nhật hồ sơ';

        if (intent === 'profile-approvals') {
          const lines = [
            `Hàng đợi duyệt thay đổi hồ sơ nhân sự (${items.length} yêu cầu chờ duyệt):`,
            ...items.map(
              (item, idx) =>
                `${idx + 1}. ${item.employeeName} · Đề nghị: ${formatTargetFields(item.request.targetFields)} · Ngày gửi: ${new Date(item.request.requestedAt).toLocaleDateString('vi-VN')}`
            ),
            '',
            'Nhắn “duyệt mục 1” hoặc “từ chối mục 1” để xử lý.',
          ];
          say(lines.join('\n'));
          return;
        }

        function* reviewProfileStep(): Step<Plan> {
          let target = pickIndex(instruction, items, (i) => i.employeeName);
          if (!target) {
            if (items.length === 1) {
              target = items[0];
            } else {
              const listStr = items
                .map((item, idx) => `${idx + 1}. ${item.employeeName} (${formatTargetFields(item.request.targetFields)})`)
                .join('\n');
              const ans = yield `Chọn yêu cầu cần duyệt/từ chối (gõ số thứ tự):\n${listStr}`;
              target = pickIndex(ans, items, (i) => i.employeeName);
              if (!target) throw new Error('Không tìm thấy yêu cầu theo lựa chọn.');
            }
          }
          const isReject = /\b(?:tu choi|bac)\b/.test(q);
          const chosen = target;
          return {
            summary: `Xác nhận ${isReject ? 'TỪ CHỐI' : 'PHÊ DUYỆT'} yêu cầu cập nhật hồ sơ:\n• Nhân viên: ${chosen.employeeName}\n• Nội dung thay đổi: ${formatTargetFields(chosen.request.targetFields)}`,
            execute: async () => {
              await reviewProfileChangeRequest(chosen.employeeId, chosen.request.id, {
                action: isReject ? 'REJECT' : 'APPROVE',
                reason: extractedReason || (isReject ? 'Từ chối qua trợ lý Chat' : 'Phê duyệt qua trợ lý Chat'),
              });
              return `Đã ${isReject ? 'từ chối' : 'phê duyệt'} yêu cầu cập nhật hồ sơ của ${chosen.employeeName}.`;
            },
          };
        }

        const step = reviewProfileStep();
        await advance(step.next(), step);
        return;
      }

      // 5. ỦY QUYỀN NGHIỆP VỤ (delegations, delegation-detail, delegation-create, delegation-review, delegation-revoke)
      if (
        intent === 'delegations' ||
        intent === 'delegation-detail' ||
        intent === 'delegation-create' ||
        intent === 'delegation-review' ||
        intent === 'delegation-revoke'
      ) {
        const storeNameOf = (id: string) =>
          authorization?.stores.find((s) => s.id === id)?.name ?? id;

        if (intent === 'delegations' || intent === 'delegation-detail') {
          const res = await requestJson<{ items: DelegationRow[]; paging: { hasNext: boolean } }>(
            '/delegations?page=1&limit=20',
            { signal }
          );
          session.current.delegations = res.items;
          session.current.lastDomain = 'delegations';

          if (!res.items.length) {
            say(
              'Hiện chưa có ủy quyền nghiệp vụ nào trong phạm vi của bạn.\nGợi ý: Nhắn “Tạo ủy quyền nghiệp vụ” nếu bạn muốn ủy quyền có thời hạn (tối đa 14 ngày) cho cấp phó.'
            );
            return;
          }

          if (intent === 'delegation-detail') {
            const target = pickIndex(instruction, res.items, (r) => r.id) ?? res.items[0];
            const detail = await requestJson<DelegationRow>(`/delegations/${target.id}`, { signal });
            const lines = [
              `Chi tiết Ủy quyền nghiệp vụ · Mã ${detail.id}:`,
              `• Trạng thái: ${DELEGATION_STATUS_LABELS[detail.status] ?? detail.status}`,
              `• Quyền hạn: ${detail.capabilities.map((c) => DELEGATION_CAP_LABELS[c] ?? c).join(', ')}`,
              `• Cửa hàng áp dụng: ${detail.scope.storeIds.map(storeNameOf).join(', ')}`,
              `• Hiệu lực: ${new Date(detail.validFrom).toLocaleString('vi-VN')} → ${new Date(detail.validUntil).toLocaleString('vi-VN')}`,
              `• Toàn vẹn chuỗi băm: ${detail.auditIntegrity === 'VALID_LOCAL_CHAIN' ? '🛡️ Hợp lệ (VALID_LOCAL_CHAIN)' : detail.auditIntegrity ?? '—'}`,
            ];
            if (detail.history?.length) {
              lines.push('', 'Lịch sử chuỗi băm (Hash-chain):');
              detail.history.forEach((h, i) => {
                lines.push(
                  `${i + 1}. ${h.action ?? 'EVENT'} · ${h.at ? new Date(h.at).toLocaleString('vi-VN') : ''}${h.reason ? ` · Lý do: ${h.reason}` : ''}`
                );
              });
            }
            say(lines.join('\n'));
            return;
          }

          const lines = [
            `Danh sách Ủy quyền nghiệp vụ (${res.items.length} bản ghi):`,
            ...res.items.map(
              (r, idx) =>
                `${idx + 1}. [${DELEGATION_STATUS_LABELS[r.status] ?? r.status}] ${r.capabilities.map((c) => DELEGATION_SHORT_LABELS[c] ?? c).join(', ')} · Cửa hàng: ${r.scope.storeIds.map(storeNameOf).join(', ')} · Hạn: ${new Date(r.validUntil).toLocaleDateString('vi-VN')}`
            ),
            '',
            'Gợi ý: Nhắn “xem mục 1” để xem chuỗi băm kiểm toán, “tạo ủy quyền nghiệp vụ”, “duyệt ủy quyền mục 1” hoặc “thu hồi ủy quyền mục 1”.',
          ];
          say(lines.join('\n'));
          return;
        }

        if (intent === 'delegation-create') {
          if (!can('delegations.request')) {
            say('Tài khoản của bạn chưa có quyền đề nghị ủy quyền nghiệp vụ (delegations.request).');
            return;
          }
          const sources =
            authorization?.grants.filter(
              (g) =>
                g.scope.kind === 'organization' &&
                !g.revokedAt &&
                g.capabilities.some((c) => ALLOWED_DELEGATION_CAPS.some((allowed) => allowed === c))
            ) ?? [];
          if (!sources.length) {
            say('Bạn chưa có quyền gốc (Grant gốc) đủ điều kiện để chuyển giao ủy quyền nghiệp vụ.');
            return;
          }
          const sourceGrant = sources[0];
          const eligibleStores = (authorization?.stores ?? []).filter(
            (s) =>
              s.capabilities.includes('delegations.request') &&
              (sourceGrant.scope.storeIds.includes(s.id) ||
                (Boolean(s.regionId) && sourceGrant.scope.regionIds.includes(s.regionId!)))
          );
          if (!eligibleStores.length) {
            say('Không tìm thấy cửa hàng nào trong phạm vi quyền gốc của bạn để lập ủy quyền.');
            return;
          }

          // Preload recipients per eligible store so generator stays synchronous
          const recipientsByStore = new Map<string, DelegationRecipient[]>();
          await Promise.all(
            eligibleStores.slice(0, 8).map(async (st) => {
              try {
                const recRes = await requestJson<{ items: DelegationRecipient[] }>(
                  `/delegations/recipients?storeId=${encodeURIComponent(st.id)}`,
                  { signal }
                );
                recipientsByStore.set(st.id, recRes.items);
              } catch {
                recipientsByStore.set(st.id, []);
              }
            })
          );

          function* createDelegationWizard(): Step<Plan> {
            let chosenStore = eligibleStores.length === 1 ? eligibleStores[0] : pickIndex(instruction, eligibleStores, (s) => s.name);
            if (!chosenStore) {
              const storeList = eligibleStores.map((s, i) => `${i + 1}. ${s.name}`).join('\n');
              const ans = yield `Bạn muốn lập ủy quyền tại cửa hàng nào? (Gõ số thứ tự):\n${storeList}`;
              chosenStore = pickIndex(ans, eligibleStores, (s) => s.name);
              if (!chosenStore) throw new Error('Không tìm thấy cửa hàng theo lựa chọn.');
            }

            const recItems = recipientsByStore.get(chosenStore.id) ?? [];
            if (!recItems.length) {
              throw new Error(
                `Cửa hàng ${chosenStore.name} hiện chưa có nhân sự cấp phó (PTCH) đủ điều kiện nhận ủy quyền.`
              );
            }

            let chosenRecipient =
              recItems.length === 1 ? recItems[0] : pickIndex(instruction, recItems, (r) => r.fullName);
            if (!chosenRecipient) {
              const recList = recItems
                .map((r, i) => `${i + 1}. ${r.fullName} (${r.profile.toUpperCase()})`)
                .join('\n');
              const ans = yield `Chọn người nhận ủy quyền tại ${chosenStore.name} (gõ số thứ tự):\n${recList}`;
              chosenRecipient = pickIndex(ans, recItems, (r) => r.fullName);
              if (!chosenRecipient) throw new Error('Không tìm thấy người nhận ủy quyền theo lựa chọn.');
            }

            const availableCaps = ALLOWED_DELEGATION_CAPS.filter((c) => sourceGrant.capabilities.includes(c));
            const capAns = yield [
              `Chọn quyền hạn muốn ủy quyền cho ${chosenRecipient.fullName} (gõ số thứ tự hoặc “tất cả”):`,
              ...availableCaps.map((c, i) => `${i + 1}. ${DELEGATION_CAP_LABELS[c]}`),
              `${availableCaps.length + 1}. Tất cả các quyền trên`,
            ].join('\n');

            const normCap = normalize(capAns);
            let selectedCaps: AuthorizationCapability[] = [];
            if (/\btat ca\b/.test(normCap) || Number(normCap) === availableCaps.length + 1) {
              selectedCaps = [...availableCaps];
            } else {
              const idx = Number(normCap) - 1;
              if (availableCaps[idx]) selectedCaps = [availableCaps[idx]];
              else selectedCaps = [...availableCaps];
            }

            let reasonText = extractedReason;
            if (!reasonText || reasonText.length < 5) {
              reasonText = (
                yield 'Nhập lý do ủy quyền (tối thiểu 5 ký tự, ví dụ: Ủy quyền giao việc và duyệt báo cáo trong 7 ngày công tác):'
              ).trim();
              if (reasonText.length < 5) throw new Error('Lý do ủy quyền cần tối thiểu 5 ký tự.');
            }

            const validFrom = new Date();
            const validUntil = new Date(validFrom.getTime() + 7 * 86400000);
            const storeTarget = chosenStore;
            const recipientTarget = chosenRecipient;

            return {
              summary: [
                `Xác nhận đề nghị Ủy quyền nghiệp vụ (hiệu lực 7 ngày):`,
                `• Cửa hàng: ${storeTarget.name}`,
                `• Người nhận: ${recipientTarget.fullName} (${recipientTarget.profile.toUpperCase()})`,
                `• Quyền hạn: ${selectedCaps.map((c) => DELEGATION_SHORT_LABELS[c] ?? c).join(', ')}`,
                `• Thời hạn: ${validFrom.toLocaleDateString('vi-VN')} → ${validUntil.toLocaleDateString('vi-VN')}`,
                `• Lý do: ${reasonText}`,
              ].join('\n'),
              execute: async () => {
                await requestJson('/delegations', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    sourceGrantId: sourceGrant.id,
                    recipientUserId: recipientTarget.userId,
                    capabilities: selectedCaps,
                    scope: {
                      kind: 'organization',
                      storeIds: [storeTarget.id],
                      regionIds: [],
                      reportingEmployeeIds: sourceGrant.scope.reportingEmployeeIds,
                    },
                    validFrom: validFrom.toISOString(),
                    validUntil: validUntil.toISOString(),
                    reason: reasonText,
                  }),
                });
                return `Đã gửi đề nghị ủy quyền cho ${recipientTarget.fullName} tại ${storeTarget.name}. Ủy quyền sẽ có hiệu lực ngay khi cấp trên trực tiếp phê duyệt.`;
              },
            };
          }

          const step = createDelegationWizard();
          await advance(step.next(), step);
          return;
        }

        if (intent === 'delegation-review' || intent === 'delegation-revoke') {
          const res = await requestJson<{ items: DelegationRow[] }>('/delegations?page=1&limit=20', { signal });
          session.current.delegations = res.items;
          session.current.lastDomain = 'delegations';

          if (intent === 'delegation-review') {
            if (!can('delegations.review')) {
              say('Tài khoản của bạn chưa có quyền phê duyệt ủy quyền nghiệp vụ (delegations.review).');
              return;
            }
            const reviewable = res.items.filter(
              (r) => r.status === 'PENDING' && r.delegatorUserId !== userId && r.recipientUserId !== userId
            );
            if (!reviewable.length) {
              say('Hiện không có đề nghị ủy quyền nào ở trạng thái chờ bạn phê duyệt (PENDING).');
              return;
            }

            function* reviewDelegationWizard(): Step<Plan> {
              let target = pickIndex(instruction, reviewable, (r) => r.id);
              if (!target) {
                if (reviewable.length === 1) target = reviewable[0];
                else {
                  const listStr = reviewable
                    .map(
                      (r, i) =>
                        `${i + 1}. Mã ${r.id.slice(0, 8)} · ${r.capabilities.map((c) => DELEGATION_SHORT_LABELS[c] ?? c).join(', ')} · Cửa hàng: ${r.scope.storeIds.map(storeNameOf).join(', ')}`
                    )
                    .join('\n');
                  const ans = yield `Chọn đề nghị ủy quyền cần xử lý (gõ số thứ tự):\n${listStr}`;
                  target = pickIndex(ans, reviewable, (r) => r.id);
                  if (!target) throw new Error('Không tìm thấy đề nghị ủy quyền theo lựa chọn.');
                }
              }

              const chosen = target;
              const isReject = /\b(?:tu choi|bac)\b/.test(q);
              let reasonText = extractedReason;
              if (!reasonText || reasonText.length < 3) {
                reasonText = (
                  yield `Nhập lý do ${isReject ? 'từ chối' : 'phê duyệt'} đề nghị ủy quyền ${chosen.id.slice(0, 8)}:`
                ).trim();
                if (!reasonText) throw new Error('Vui lòng nhập lý do quyết định.');
              }

              return {
                summary: `Xác nhận ${isReject ? 'TỪ CHỐI' : 'PHÊ DUYỆT'} đề nghị ủy quyền:\n• Mã: ${chosen.id}\n• Quyền hạn: ${chosen.capabilities.map((c) => DELEGATION_SHORT_LABELS[c] ?? c).join(', ')}\n• Lý do: ${reasonText}`,
                execute: async () => {
                  const detail = await requestJson<DelegationRow>(`/delegations/${chosen.id}`);
                  if (detail.auditIntegrity && detail.auditIntegrity !== 'VALID_LOCAL_CHAIN') {
                    throw new Error('Bản ghi ủy quyền không đạt kiểm tra toàn vẹn chuỗi băm (VALID_LOCAL_CHAIN).');
                  }
                  await requestJson(`/delegations/${detail.id}/review`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      expectedVersion: detail.version,
                      decision: isReject ? 'REJECT' : 'APPROVE',
                      reason: reasonText,
                    }),
                  });
                  return `Đã ${isReject ? 'từ chối' : 'phê duyệt'} đề nghị ủy quyền ${detail.id.slice(0, 8)}.`;
                },
              };
            }

            const step = reviewDelegationWizard();
            await advance(step.next(), step);
            return;
          }

          // delegation-revoke
          const revocable = res.items.filter(
            (r) =>
              ['PENDING', 'APPROVED'].includes(r.status) &&
              (r.delegatorUserId === userId || r.approvedByUserId === userId)
          );
          if (!revocable.length) {
            say('Hiện không có ủy quyền nào đang hiệu lực hoặc chờ duyệt mà bạn là người tạo / người duyệt để thu hồi.');
            return;
          }

          function* revokeDelegationWizard(): Step<Plan> {
            let target = pickIndex(instruction, revocable, (r) => r.id);
            if (!target) {
              if (revocable.length === 1) target = revocable[0];
              else {
                const listStr = revocable
                  .map(
                    (r, i) =>
                      `${i + 1}. Mã ${r.id.slice(0, 8)} (${r.status}) · ${r.capabilities.map((c) => DELEGATION_SHORT_LABELS[c] ?? c).join(', ')}`
                  )
                  .join('\n');
                const ans = yield `Chọn ủy quyền cần thu hồi (gõ số thứ tự):\n${listStr}`;
                target = pickIndex(ans, revocable, (r) => r.id);
                if (!target) throw new Error('Không tìm thấy ủy quyền theo lựa chọn.');
              }
            }

            const chosen = target;
            let reasonText = extractedReason;
            if (!reasonText || reasonText.length < 3) {
              reasonText = (yield `Nhập lý do thu hồi ủy quyền ${chosen.id.slice(0, 8)}:`).trim();
              if (!reasonText) throw new Error('Vui lòng nhập lý do thu hồi.');
            }

            return {
              summary: `Xác nhận THU HỒI ủy quyền nghiệp vụ:\n• Mã: ${chosen.id}\n• Quyền hạn: ${chosen.capabilities.map((c) => DELEGATION_SHORT_LABELS[c] ?? c).join(', ')}\n• Lý do thu hồi: ${reasonText}`,
              execute: async () => {
                const detail = await requestJson<DelegationRow>(`/delegations/${chosen.id}`);
                await requestJson(`/delegations/${detail.id}/revoke`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    expectedVersion: detail.version,
                    reason: reasonText,
                  }),
                });
                return `Đã thu hồi ủy quyền nghiệp vụ ${detail.id.slice(0, 8)} và ghi nhận vào chuỗi băm kiểm toán.`;
              },
            };
          }

          const step = revokeDelegationWizard();
          await advance(step.next(), step);
          return;
        }
      }
    }

    void respond()
      .catch((err) => say(err instanceof Error ? err.message : 'Chưa xử lý được yêu cầu vận hành / nhân sự.'))
      .finally(() => {
        if (!signal.aborted) {
          inFlight.current = undefined;
          setBusy(false);
        }
      });
    return true;
  }

  return { busy, reset, send };
}
