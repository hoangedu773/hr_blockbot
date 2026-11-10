import { useEffect, useRef, useState } from 'react';
import type {
  AuthorizationCapability,
  OperationalScheduleWeek,
  PersonalSchedule,
  ScheduleAssignment,
  ScheduleChange,
  ScheduleRegistration,
  ScheduleRegistrations,
  SchedulingAccess,
  ShiftDefinition,
} from '@hr-blockbot/contracts';
import { requestJson } from '../../services/api';
import {
  addDays,
  detectScheduleIntent,
  formatShiftIntervals,
  formatVietnameseDate,
  matchShiftFromText,
  mentionsShiftCode,
  mondayOf,
  parseScheduleDate,
  scheduleParts,
  scheduleText,
  todayLocal,
} from './schedule-chat-intent';

type Turn = { sender: 'user' | 'assistant'; text: string };
type Plan = { summary: string; readOnly?: boolean; execute: () => Promise<string> };
type Step = Generator<string, Plan, string> | AsyncGenerator<string, Plan, string>;
type Decision = { step: Step } | { plan: Plan };

type SessionState = {
  weekStart: string;
  storeId?: string;
  myAssignments?: PersonalSchedule['assignments'];
  myRequests?: PersonalSchedule['requests'];
  storeRequests?: { weekId: string; weekVersion: number; storeName: string; request: ScheduleChange }[];
  registrations?: ScheduleRegistration[];
};

const CHANGE_STATUS_LABELS: Record<string, string> = {
  PENDING_RECEIVER: 'Chờ người nhận xác nhận',
  PENDING_REQUESTER: 'Chờ người đề nghị xác nhận ca đổi',
  PENDING_MANAGER: 'Chờ quản lý điều phối / duyệt',
  READY_FOR_REVIEW: 'Chờ quản lý duyệt',
  APPROVED: 'Đã áp dụng vào lịch công bố',
  REJECTED: 'Đã từ chối',
  CANCELLED: 'Đã hủy',
};

const REG_STATUS_LABELS: Record<string, string> = {
  PENDING_MANAGER: '⏳ Chờ quản lý duyệt',
  PENDING_EMPLOYEE: '⏳ Chờ nhân viên xác nhận',
  APPROVED: '✓ Đã duyệt',
  CANCELLED: 'Đã hủy',
};

const planned = (plan: Plan) => `${plan.summary}\n\nNhắn “xác nhận” để thực hiện hoặc “hủy” để dừng.`;

function futureAssignment(a: Pick<ScheduleAssignment, 'date' | 'intervals'>) {
  const start = Date.parse(a.date + 'T00:00:00+07:00');
  return a.intervals.every((p) => start + p.startMinute * 60000 > Date.now());
}

function pickStore(text: string, stores: SchedulingAccess['stores'], fallbackId?: string) {
  if (!stores.length) return null;
  const q = scheduleText(text);
  for (const s of stores) {
    const norm = scheduleText(s.name);
    const shortParts = norm.split('-').map((p) => p.trim()).filter((p) => p.length > 3);
    if (q.includes(norm) || shortParts.some((part) => q.includes(part))) {
      return s;
    }
  }
  return stores.find((s) => s.id === fallbackId) ?? stores[0];
}

function pickIndex<T>(text: string, items: T[]): T | null {
  const q = scheduleText(text);
  const m = q.match(/\b(?:muc|so|ca|yeu cau|dong)\s*(\d+)\b/) ?? q.match(/^(\d+)$/);
  if (m) {
    const idx = Number(m[1]) - 1;
    return items[idx] ?? null;
  }
  if (/\bdau tien\b/.test(q)) return items[0] ?? null;
  return null;
}

type ShiftOption = Pick<ScheduleAssignment, 'id' | 'date' | 'shiftCode' | 'intervals'>;
type ChangePartner = { employeeId: string; fullName: string; employeeCode: string; canCover: boolean; assignments: ShiftOption[] };

function shiftLabel(a: ShiftOption) {
  return `${formatVietnameseDate(a.date)} · Ca ${a.shiftCode} (${formatShiftIntervals(a.intervals)})`;
}

function pickShift<T extends ShiftOption>(text: string, items: T[], weekStart: string) {
  const indexed = pickIndex(text, items);
  if (indexed) return indexed;
  const date = parseScheduleDate(text, weekStart).date;
  const q = scheduleText(text).replace(/\bnhan ca thay\s+/g, 'nhan ca ');
  const byCode = items.filter(a => mentionsShiftCode(q, a.shiftCode));
  const explicitCode = q.match(/\bca\s+([a-z0-9_-]{1,20})\s+(?:ngay|thu|tuan|20\d{2}-)/)?.[1];
  if (!byCode.length && explicitCode && !/^(?:sang|chieu|toi|dem|lam|truc|gay|thay)$/.test(explicitCode)) return null;
  const candidates = (byCode.length ? byCode : items).filter(a => !date || date === a.date);
  return (date || byCode.length) && candidates.length === 1 ? candidates[0] : null;
}

function pickColleague<T extends { fullName: string; employeeCode: string }>(text: string, items: T[]) {
  const indexed = pickIndex(text, items);
  if (indexed) return indexed;
  const q = scheduleText(text).replace(/[.!?]+$/, '');
  if (!q) return null;
  const matches = items.filter(p => {
    const full = scheduleText(p.fullName), code = scheduleText(p.employeeCode);
    return q === code || q === full || (` ${q} `).includes(` ${full} `) ||
      (q.length >= 3 && (` ${full} `).includes(` ${q} `));
  });
  return matches.length === 1 ? matches[0] : null;
}

export function useScheduleChat({
  grants,
  onChanged,
}: {
  grants: readonly AuthorizationCapability[];
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const session = useRef<SessionState>({ weekStart: mondayOf(todayLocal()) });
  const decision = useRef<Decision>();
  const inFlight = useRef<AbortController>();
  const accessCache = useRef<SchedulingAccess | null>(null);

  const hasScheduleGrants = grants.some(
    (cap) => cap.startsWith('schedules.') || cap.startsWith('schedule_changes.') || cap.startsWith('shifts.')
  );

  const reset = () => {
    inFlight.current?.abort();
    inFlight.current = undefined;
    decision.current = undefined;
    setBusy(false);
  };

  useEffect(() => () => inFlight.current?.abort(), []);

  async function getAccess(): Promise<SchedulingAccess> {
    if (accessCache.current) return accessCache.current;
    const acc = await requestJson<SchedulingAccess>('/scheduling/access');
    accessCache.current = acc;
    return acc;
  }

  function send(text: string, append: (turn: Turn) => void, allowContext = true): boolean {
    if (!hasScheduleGrants) return false;
    const intent = detectScheduleIntent(text, allowContext && !!decision.current);
    if (!intent && !decision.current) return false;
    if (inFlight.current) return true;

    const controller = new AbortController();
    inFlight.current = controller;
    const signal = controller.signal;
    const say = (reply: string) => {
      if (!signal.aborted) append({ sender: 'assistant', text: reply });
    };
    const q = scheduleText(text).replace(/[.!?]+$/, '');
    const { instruction, reason: extractedReason } = scheduleParts(text);

    append({ sender: 'user', text });
    setBusy(true);

    async function advance(result: IteratorResult<string, Plan>, step: Step) {
      if (signal.aborted) return;
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
        say('Đã hủy thao tác lịch làm đang chuẩn bị.');
        return;
      }
      if (pending && 'step' in pending) {
        decision.current = undefined;
        await advance(await pending.step.next(text), pending.step);
        return;
      }
      if (pending && 'plan' in pending) {
        if (/^(?:toi\s+)?(?:xac nhan(?:\s+(?:thuc hien|gui))?|dong y|tien hanh|thuc hien|gui)$/.test(q)) {
          decision.current = undefined;
          const out = await pending.plan.execute();
          say(out);
          if (!signal.aborted) onChanged();
          return;
        }
        if (!intent) {
          say('Nhắn “xác nhận” để thực hiện thao tác lịch làm vừa xem hoặc “hủy” để dừng.');
          return;
        }
        decision.current = undefined;
      }

      if (!intent) return;
      const access = await getAccess();
      if (signal.aborted) return;

      const parsedDate = parseScheduleDate(instruction, session.current.weekStart);
      let weekStart = parsedDate.weekStart;
      const store = pickStore(instruction, access.stores, session.current.storeId);
      if (store) session.current.storeId = store.id;
      session.current.weekStart = weekStart;

      if (intent === 'help') {
        const lines = [
          'Hướng dẫn trợ lý Lịch làm & Phân ca bằng ngôn ngữ tự nhiên:',
          '• Tra cứu lịch cá nhân: “Lịch làm của tôi tuần này”, “Lịch của tôi tuần sau”',
          '• Xem bảng đăng ký ca: “Bảng đăng ký ca tuần sau”, “Ai đã đăng ký ca tuần 16/11”',
          '• Đăng ký ca làm: “Đăng ký ca A1 thứ Ba tuần sau”, “Đăng ký ca sáng ngày 17/11”',
          '• Đổi ca / Nhận ca thay: “Yêu cầu đổi ca”, “Xin đổi ca mục 1 lý do: bận việc gia đình”, “Đồng ý nhận ca”, “Từ chối nhận ca”',
        ];
        if (access.stores.length > 0) {
          lines.push(
            '• Xem lịch cửa hàng & mã ca: “Lịch tuần cửa hàng”, “Lịch cửa hàng Quận 10 tuần này”, “Danh mục ca”'
          );
        }
        if (access.stores.some((s) => s.canManage)) {
          lines.push(
            '• Quản lý duyệt & công bố lịch (SM/AM): “Duyệt đăng ký ca tuần sau”, “Thêm ca cho nhân viên”, “Duyệt yêu cầu đổi ca”, “Công bố lịch tuần sau”'
          );
        }
        say(lines.join('\n'));
        return;
      }

      // 1. LỊCH CỦA TÔI (mine)
      if (intent === 'mine') {
        if (!access.canReadSelf) {
          say('Tài khoản của bạn chưa có quyền xem lịch cá nhân.');
          return;
        }
        const to = addDays(weekStart, 6);
        const mine = await requestJson<PersonalSchedule>(`/scheduling/me?from=${weekStart}&to=${to}`);
        session.current.myAssignments = mine.assignments;
        session.current.myRequests = mine.requests;

        const lines: string[] = [
          `Lịch làm của bạn · Tuần ${weekStart} đến ${to}:`,
        ];
        if (!mine.assignments.length) {
          lines.push('• Chưa có ca đã công bố trong tuần này.');
        } else {
          mine.assignments.forEach((a, idx) => {
            const canSwap = futureAssignment(a) ? ' (có thể đổi ca)' : '';
            lines.push(
              `${idx + 1}. ${formatVietnameseDate(a.date)} · ${a.shiftCode} (${a.shiftName}) · ${formatShiftIntervals(a.intervals)} · ${a.storeName}${canSwap}`
            );
          });
        }
        if (mine.requests.length > 0) {
          lines.push('', `Yêu cầu đổi / nhận ca thay bạn tham gia (${mine.requests.length}):`);
          mine.requests.forEach((r, idx) => {
            lines.push(
              `• [Yêu cầu ${idx + 1}] ${r.kind === 'SWAP' ? 'Đổi ca 2 chiều' : 'Nhận ca thay'} · Ca ${r.source.date} (${r.source.shiftCode}) của ${r.source.employeeName}${r.receiverName ? ' → ' + r.receiverName : ''} · ${CHANGE_STATUS_LABELS[r.status] ?? r.status}`
            );
          });
        }
        lines.push(
          '',
          'Gợi ý: Nhắn “bảng đăng ký ca tuần sau”, “đăng ký ca A1 ngày 17/11”, “xin đổi ca mục 1 lý do: ...” hoặc “đồng ý nhận ca”.'
        );
        say(lines.join('\n'));
        return;
      }

      // 2. DANH MỤC CA (shifts)
      if (intent === 'shifts') {
        if (store) {
          const res = await requestJson<{ items: ShiftDefinition[] }>(`/scheduling/stores/${store.id}/shifts`);
          const active = res.items.filter((s) => s.active);
          const lines = [
            `Danh mục mã ca · ${store.name} (${active.length} ca đang dùng):`,
            ...active.map((s, i) => `${i + 1}. Mã ca ${s.code} · ${s.name} · Giờ: ${formatShiftIntervals(s.intervals)}`),
          ];
          say(lines.join('\n'));
          return;
        }
        if (access.canReadSelf) {
          const nextMon = addDays(mondayOf(todayLocal()), 7);
          const reg = await requestJson<ScheduleRegistrations>(`/scheduling/registrations/me?weekStart=${nextMon}`);
          const lines = [
            `Danh mục mã ca · ${reg.storeName}:`,
            ...(reg.shifts.length
              ? reg.shifts.map((s, i) => `${i + 1}. Mã ca ${s.code} · ${s.name} · Giờ: ${formatShiftIntervals(s.intervals)}`)
              : ['Tuần này đã khóa hoặc chưa có danh mục ca mở đăng ký.']),
          ];
          say(lines.join('\n'));
          return;
        }
        say('Bạn chưa có quyền xem danh mục ca.');
        return;
      }

      // 3. LỊCH TUẦN CỬA HÀNG (store-week)
      if (intent === 'store-week') {
        if (!store || !store.canRead) {
          say('Tài khoản của bạn chỉ xem được lịch cá nhân. Hãy nhắn “Lịch làm của tôi tuần này”.');
          return;
        }
        const [{ week }, regBoard] = await Promise.all([
          requestJson<{ week: OperationalScheduleWeek | null }>(`/scheduling/stores/${store.id}/week?weekStart=${weekStart}`),
          requestJson<ScheduleRegistrations>(`/scheduling/stores/${store.id}/registrations?weekStart=${weekStart}`).catch(() => null),
        ]);
        const to = addDays(weekStart, 6);
        if (!week) {
          say(
            `Lịch tuần cửa hàng · ${store.name} (${weekStart} – ${to}):\n• Chưa tạo lịch tuần cho tuần này.${store.canManage ? '\n• Nhắn “tạo lịch tuần” để khởi tạo bản nháp.' : ''}`
          );
          return;
        }
        const assignments = week.publishedAt ? week.published : week.draft;
        const statusText = week.publishedAt
          ? `Đã công bố (${new Date(week.publishedAt).toLocaleDateString('vi-VN')})`
          : 'Bản nháp chờ công bố (Đang mở đăng ký ca)';
        const lines: string[] = [
          `Lịch tuần cửa hàng · ${store.name}`,
          `Tuần: ${weekStart} – ${to} · Trạng thái: ${statusText}`,
          `Tổng số phân công: ${assignments.length} ca · Đăng ký ca: ${regBoard?.items.length ?? 0} · Yêu cầu đổi ca: ${week.requests.length}`,
          '',
          'Phân bổ theo ngày:',
        ];
        for (let i = 0; i < 7; i++) {
          const d = addDays(weekStart, i);
          const dayItems = assignments.filter((a) => a.date === d);
          const summary = dayItems.length
            ? dayItems.slice(0, 6).map((a) => `${a.employeeName} (${a.shiftCode})`).join(', ') +
              (dayItems.length > 6 ? ` và ${dayItems.length - 6} ca khác` : '')
            : 'Chưa xếp ca';
          lines.push(`• ${formatVietnameseDate(d)}: ${dayItems.length} ca — ${summary}`);
        }
        if (week.requests.length > 0) {
          session.current.storeRequests = week.requests.map((r) => ({
            weekId: week.id,
            weekVersion: week.version,
            storeName: store.name,
            request: r,
          }));
          lines.push('', `Yêu cầu đổi ca trong tuần (${week.requests.length}):`);
          week.requests.forEach((r, idx) => {
            lines.push(
              `• [Yêu cầu ${idx + 1}] ${r.source.employeeName} (${r.source.date} · ${r.source.shiftCode}) → ${r.receiverName ?? 'Chờ quản lý chọn người'} · ${CHANGE_STATUS_LABELS[r.status] ?? r.status}`
            );
          });
        }
        say(lines.join('\n'));
        return;
      }

      // 4. BẢNG ĐĂNG KÝ CA (registrations)
      if (intent === 'registrations') {
        const explicitWeek = /\btuan\s+(?:nay|sau|toi|truoc)\b|\b20\d{2}-|\b\d{1,2}[/-]\d{1,2}\b/.test(scheduleText(instruction));
        let targetWeek = weekStart;
        const loadBoard = async (wk: string) => {
          if (store && store.canRead) {
            return requestJson<ScheduleRegistrations>(`/scheduling/stores/${store.id}/registrations?weekStart=${wk}`);
          }
          return requestJson<ScheduleRegistrations>(`/scheduling/registrations/me?weekStart=${wk}`);
        };
        let board = await loadBoard(targetWeek);
        // If user didn't specify a week and current week is already published with 0 pending, check if they want to know about next week too
        const nextWeek = addDays(mondayOf(todayLocal()), 7);
        session.current.registrations = board.items;
        session.current.weekStart = targetWeek;

        const lines: string[] = [
          `Bảng đăng ký ca · ${board.storeName} · Tuần ${targetWeek} – ${addDays(targetWeek, 6)}`,
          `Trạng thái tuần: ${board.published ? '🔒 Đã công bố (Chỉ xem — muốn đăng ký mới hãy chọn tuần ' + nextWeek + ')' : '🟢 Đang mở đăng ký & xếp nháp'}`,
        ];
        if (!board.items.length) {
          lines.push('• Chưa có đăng ký ca nào trong tuần này.');
        } else {
          board.items.slice(0, 20).forEach((item, idx) => {
            const ownTag = item.isOwn ? ' [Bạn]' : '';
            lines.push(
              `${idx + 1}. ${item.employeeName}${ownTag} · ${formatVietnameseDate(item.slot.date)} · Ca ${item.slot.shiftCode} (${formatShiftIntervals(item.slot.intervals)}) · ${REG_STATUS_LABELS[item.status] ?? item.status}`
            );
          });
          if (board.items.length > 20) {
            lines.push(`... và ${board.items.length - 20} đăng ký khác.`);
          }
        }
        if (!board.published && board.shifts.length > 0) {
          lines.push(
            '',
            `Các mã ca đang mở đăng ký: ${board.shifts.map((s) => `${s.code} (${formatShiftIntervals(s.intervals)})`).join(', ')}`,
            'Gợi ý: Nhắn “đăng ký ca A1 ngày 17/11”' + (store?.canManage ? ', “duyệt đăng ký ca” hoặc “công bố lịch tuần”.' : ' để gửi đăng ký.')
          );
        } else if (board.published && !explicitWeek) {
          lines.push('', `💡 Tuần ${targetWeek} đã công bố. Nhắn “bảng đăng ký ca tuần sau” (${nextWeek}) để xem và đăng ký ca tuần tới.`);
        }
        say(lines.join('\n'));
        return;
      }

      // 5. ĐĂNG KÝ CA LÀM (register)
      if (intent === 'register') {
        if (!access.canRequest) {
          say('Tài khoản của bạn chưa có quyền gửi đăng ký ca cá nhân.');
          return;
        }
        const currentMon = mondayOf(todayLocal());
        const nextMon = addDays(currentMon, 7);
        let targetWeek = weekStart;
        let board = await requestJson<ScheduleRegistrations>(`/scheduling/registrations/me?weekStart=${targetWeek}`).catch(() => null);
        if (board?.published && targetWeek === currentMon && !parsedDate.date) {
          targetWeek = nextMon;
          board = await requestJson<ScheduleRegistrations>(`/scheduling/registrations/me?weekStart=${targetWeek}`).catch(() => null);
        }
        if (!board) {
          say('Tài khoản của bạn chưa gắn cửa hàng công tác cố định để tự đăng ký ca. Nếu bạn là quản lý, hãy nhắn “thêm ca cho nhân viên”.');
          return;
        }
        if (board.published) {
          say(`Tuần ${targetWeek} tại ${board.storeName} đã công bố lịch nên không thể đăng ký thêm. Hãy nhắn “đăng ký ca tuần sau” (tuần ${nextMon}) hoặc dùng “xin đổi ca”.`);
          return;
        }
        if (!board.shifts.length) {
          say(`Cửa hàng ${board.storeName} chưa có mã ca đang hoạt động để đăng ký.`);
          return;
        }
        const activeBoard = board;
        const initialDate = parsedDate.date && parsedDate.date >= targetWeek && parsedDate.date <= addDays(targetWeek, 6)
          ? parsedDate.date
          : null;
        const initialShift = matchShiftFromText(instruction, activeBoard.shifts);

        function* registerStep(): Step {
          let chosenDate = initialDate;
          while (!chosenDate) {
            const dayOptions = Array.from({ length: 7 }, (_, i) => addDays(targetWeek, i)).filter((d) => d >= todayLocal());
            const reply = yield [
              `Đăng ký ca làm tại ${activeBoard.storeName} (Tuần ${targetWeek} – ${addDays(targetWeek, 6)}).`,
              'Bạn muốn đăng ký vào ngày nào? Chọn số thứ tự hoặc nhắn thứ/ngày:',
              ...dayOptions.map((d, i) => `${i + 1}. ${formatVietnameseDate(d)}`),
            ].join('\n');
            const byIndex = pickIndex(reply, dayOptions);
            const byParsed = parseScheduleDate(reply, targetWeek).date;
            chosenDate = byIndex ?? (byParsed && dayOptions.includes(byParsed) ? byParsed : null);
          }
          let chosenShift = initialShift;
          while (!chosenShift) {
            const reply = yield [
              `Đã chọn ngày ${formatVietnameseDate(chosenDate)}.`,
              'Bạn muốn đăng ký mã ca nào? Chọn số thứ tự hoặc nhắn mã ca:',
              ...activeBoard.shifts.map((s, i) => `${i + 1}. Ca ${s.code} · ${s.name} (${formatShiftIntervals(s.intervals)})`),
            ].join('\n');
            chosenShift = pickIndex(reply, activeBoard.shifts) ?? matchShiftFromText(reply, activeBoard.shifts);
          }
          const finalDate = chosenDate!;
          const finalShift = chosenShift!;
          return {
            summary: [
              'Bản xem trước đăng ký ca làm việc:',
              `• Cửa hàng: ${activeBoard.storeName}`,
              `• Ngày làm: ${formatVietnameseDate(finalDate)} (Tuần ${targetWeek})`,
              `• Ca đăng ký: ${finalShift.code} · ${finalShift.name} (${formatShiftIntervals(finalShift.intervals)})`,
              '• Trạng thái sau khi gửi: Chờ quản lý duyệt',
            ].join('\n'),
            execute: async () => {
              await requestJson('/scheduling/registrations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  weekStart: targetWeek,
                  clientRequestId: crypto.randomUUID(),
                  slot: { date: finalDate, shiftId: finalShift.id, shiftVersion: finalShift.version },
                }),
              });
              return `Đã gửi đăng ký ca ${finalShift.code} (${finalShift.name}) ngày ${formatVietnameseDate(finalDate)} tại ${activeBoard.storeName}. Trạng thái: Chờ quản lý duyệt.`;
            },
          };
        }

        const step = registerStep();
        await advance(await step.next(), step);
        return;
      }

      // 6. QUẢN LÝ DUYỆT ĐĂNG KÝ CA (approve-registration)
      if (intent === 'approve-registration') {
        if (!store || !store.canManage) {
          say('Chỉ Quản lý cửa hàng (SM) hoặc Quản lý khu vực (AM) có quyền duyệt bảng đăng ký ca.');
          return;
        }
        const currentMon = mondayOf(todayLocal());
        const nextMon = addDays(currentMon, 7);
        let targetWeek = weekStart;
        let board = await requestJson<ScheduleRegistrations>(`/scheduling/stores/${store.id}/registrations?weekStart=${targetWeek}`);
        if (board.published && targetWeek === currentMon) {
          targetWeek = nextMon;
          board = await requestJson<ScheduleRegistrations>(`/scheduling/stores/${store.id}/registrations?weekStart=${targetWeek}`);
        }
        const pendingItems = board.items.filter((i) => i.canManage && (i.status === 'PENDING_MANAGER' || i.status === 'PENDING_EMPLOYEE') && !i.expired);
        if (!pendingItems.length) {
          say(`Tại ${store.name} (tuần ${targetWeek}), hiện không có đăng ký ca nào đang chờ bạn duyệt.`);
          return;
        }
        const bulk = /\b(?:tat ca|hang loat|toan bo)\b/.test(scheduleText(instruction));
        const single = pickIndex(instruction, board.items);
        const toApprove = bulk ? pendingItems : single ? pendingItems.filter(p => p.id === single.id) : pendingItems.length === 1 ? pendingItems : [];
        if (!toApprove.length) {
          say('Hãy chọn một đăng ký theo số trong bảng (“duyệt đăng ký ca mục 2”) hoặc nhắn “duyệt tất cả đăng ký ca” để xem trước cả danh sách.');
          return;
        }
        const plan: Plan = {
          summary: [
            `Bản xem trước duyệt đăng ký ca · ${store.name} (Tuần ${targetWeek}):`,
            `Số lượng duyệt: ${toApprove.length} ca đăng ký`,
            ...toApprove.map((item, idx) => `${idx + 1}. ${item.employeeName} · ${formatVietnameseDate(item.slot.date)} · Ca ${item.slot.shiftCode} (${formatShiftIntervals(item.slot.intervals)})`),
          ].join('\n'),
          execute: async () => {
            let count = 0;
            for (const item of toApprove) {
              try { await requestJson(`/scheduling/stores/${store.id}/registrations/${item.id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  weekStart: targetWeek,
                  expectedVersion: item.version,
                  action: 'APPROVE',
                }),
              }); } catch (error) {
                if (count === 0) throw error;
                return `Đã duyệt ${count}/${toApprove.length} đăng ký rồi dừng ở mục ${count + 1}: ${error instanceof Error ? error.message : 'Chưa duyệt được'}. Hãy xem lại bảng trước khi tiếp tục.`;
              }
              count++;
            }
            return `Đã duyệt thành công ${count} đăng ký ca và đưa vào bản nháp lịch tuần ${targetWeek} tại ${store.name}.`;
          },
        };
        decision.current = { plan };
        say(planned(plan));
        return;
      }

      // 7. QUẢN LÝ THÊM CA CHO NHÂN VIÊN (add-registration)
      if (intent === 'add-registration') {
        if (!store || !store.canManage) {
          say('Chỉ Quản lý cửa hàng (SM) hoặc Quản lý khu vực (AM) có quyền thêm ca cho nhân viên.');
          return;
        }
        const currentMon = mondayOf(todayLocal());
        const nextMon = addDays(currentMon, 7);
        let targetWeek = weekStart === currentMon ? nextMon : weekStart;
        const board = await requestJson<ScheduleRegistrations>(`/scheduling/stores/${store.id}/registrations?weekStart=${targetWeek}`);
        if (board.published) {
          say(`Tuần ${targetWeek} tại ${store.name} đã công bố. Hãy chọn tuần chưa công bố để thêm ca.`);
          return;
        }
        if (!board.roster.length || !board.shifts.length) {
          say(`Cửa hàng ${store.name} chưa có danh sách nhân viên thuộc quyền quản lý hoặc chưa có mã ca hoạt động.`);
          return;
        }
        function* addStep(): Step {
          const empReply = yield [
            `Thêm ca cho nhân viên tại ${store!.name} (Tuần ${targetWeek}):`,
            'Chọn số thứ tự hoặc tên nhân viên:',
            ...board.roster.slice(0, 15).map((p, i) => `${i + 1}. ${p.fullName} (${p.employeeCode})`),
          ].join('\n');
          const emp = pickIndex(empReply, board.roster)
            ?? board.roster.find((p) => scheduleText(p.fullName).includes(scheduleText(empReply)) || scheduleText(p.employeeCode) === scheduleText(empReply))
            ?? board.roster[0];

          const dayOptions = Array.from({ length: 7 }, (_, i) => addDays(targetWeek, i)).filter((d) => d >= todayLocal());
          const dayReply = yield [
            `Nhân viên: ${emp.fullName}. Chọn ngày làm việc trong tuần ${targetWeek}:`,
            ...dayOptions.map((d, i) => `${i + 1}. ${formatVietnameseDate(d)}`),
          ].join('\n');
          const chosenDate = pickIndex(dayReply, dayOptions) ?? parseScheduleDate(dayReply, targetWeek).date ?? dayOptions[0];

          const shiftReply = yield [
            `Ngày: ${formatVietnameseDate(chosenDate)}. Chọn mã ca:`,
            ...board.shifts.map((s, i) => `${i + 1}. Ca ${s.code} · ${s.name} (${formatShiftIntervals(s.intervals)})`),
          ].join('\n');
          const chosenShift = pickIndex(shiftReply, board.shifts) ?? matchShiftFromText(shiftReply, board.shifts) ?? board.shifts[0];

          return {
            summary: [
              'Bản xem trước thêm ca cho nhân viên:',
              `• Cửa hàng: ${store!.name}`,
              `• Nhân viên: ${emp.fullName} (${emp.employeeCode})`,
              `• Ngày làm: ${formatVietnameseDate(chosenDate)}`,
              `• Ca làm: ${chosenShift.code} · ${chosenShift.name} (${formatShiftIntervals(chosenShift.intervals)})`,
            ].join('\n'),
            execute: async () => {
              await requestJson(`/scheduling/stores/${store!.id}/registrations`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  weekStart: targetWeek,
                  clientRequestId: crypto.randomUUID(),
                  employeeId: emp.employeeId,
                  slot: { date: chosenDate, shiftId: chosenShift.id, shiftVersion: chosenShift.version },
                }),
              });
              return `Đã thêm ca ${chosenShift.code} ngày ${formatVietnameseDate(chosenDate)} cho ${emp.fullName} vào bản nháp lịch tuần ${targetWeek}.`;
            },
          };
        }
        const step = addStep();
        await advance(await step.next(), step);
        return;
      }

      // 8. QUẢN LÝ XÓA ĐĂNG KÝ CA (remove-registration)
      if (intent === 'remove-registration') {
        if (!store || !store.canManage) {
          say('Chỉ Quản lý cửa hàng (SM) hoặc Quản lý khu vực (AM) có quyền xóa ca trong bảng đăng ký.');
          return;
        }
        const currentMon = mondayOf(todayLocal());
        const nextMon = addDays(currentMon, 7);
        const targetWeek = weekStart === currentMon ? nextMon : weekStart;
        const board = await requestJson<ScheduleRegistrations>(`/scheduling/stores/${store.id}/registrations?weekStart=${targetWeek}`);
        const manageable = board.items.filter((i) => i.canManage);
        if (!manageable.length) {
          say(`Không có đăng ký ca nào thuộc phạm vi quản lý của bạn trong tuần ${targetWeek}.`);
          return;
        }
        const picked = pickIndex(instruction, board.items) ?? manageable[0];
        const reason = extractedReason.length >= 5 ? extractedReason : 'Điều chỉnh định biên nhân sự trong ca';
        const plan: Plan = {
          summary: [
            `Bản xem trước xóa đăng ký ca · ${store.name}:`,
            `• Nhân viên: ${picked.employeeName}`,
            `• Ca: ${picked.slot.shiftCode} ngày ${formatVietnameseDate(picked.slot.date)}`,
            `• Lý do: ${reason}`,
          ].join('\n'),
          execute: async () => {
            await requestJson(`/scheduling/stores/${store.id}/registrations/${picked.id}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                weekStart: targetWeek,
                expectedVersion: picked.version,
                action: 'REMOVE',
                reason,
              }),
            });
            return `Đã xóa đăng ký ca ${picked.slot.shiftCode} ngày ${formatVietnameseDate(picked.slot.date)} của ${picked.employeeName}.`;
          },
        };
        decision.current = { plan };
        say(planned(plan));
        return;
      }

      // 9. XEM DANH SÁCH YÊU CẦU ĐỔI CA (requests)
      if (intent === 'requests') {
        const to = addDays(weekStart, 6);
        const lines: string[] = [];
        if (access.canReadSelf) {
          const mine = await requestJson<PersonalSchedule>(`/scheduling/me?from=${weekStart}&to=${to}`);
          session.current.myRequests = mine.requests;
          session.current.myAssignments = mine.assignments;
          lines.push(`Yêu cầu đổi / nhận ca thay của bạn (${weekStart} – ${to}):`);
          if (!mine.requests.length) {
            lines.push('• Bạn chưa có yêu cầu đổi ca nào trong tuần này.');
          } else {
            mine.requests.forEach((r, i) => {
              lines.push(
                `${i + 1}. [${r.kind === 'SWAP' ? 'Đổi ca 2 chiều' : 'Nhận ca thay'}] Ca ${r.source.date} · ${r.source.shiftCode} (${r.source.employeeName}) → ${r.receiverName ?? 'Chờ quản lý điều phối'} · Trạng thái: ${CHANGE_STATUS_LABELS[r.status] ?? r.status} · Lý do: ${r.reason}`
              );
            });
          }
        }
        if (store && store.canRead) {
          const { week } = await requestJson<{ week: OperationalScheduleWeek | null }>(`/scheduling/stores/${store.id}/week?weekStart=${weekStart}`);
          if (week && week.requests.length > 0) {
            session.current.storeRequests = week.requests.map((r) => ({
              weekId: week.id,
              weekVersion: week.version,
              storeName: store.name,
              request: r,
            }));
            lines.push('', `Yêu cầu đổi ca tại ${store.name} (${week.requests.length}):`);
            week.requests.forEach((r, i) => {
              lines.push(
                `${i + 1}. [${r.kind === 'SWAP' ? 'Đổi ca' : 'Nhận thay'}] ${r.source.employeeName} (${r.source.date} · ${r.source.shiftCode}) → ${r.receiverName ?? 'Chờ quản lý chọn người'} · ${CHANGE_STATUS_LABELS[r.status] ?? r.status} · Lý do: ${r.reason}`
              );
            });
          }
        }
        lines.push('', 'Gợi ý: Nhắn “đồng ý nhận ca”, “từ chối nhận ca lý do: ...”, “hủy yêu cầu đổi ca” hoặc “xin đổi ca”.');
        say(lines.join('\n'));
        return;
      }

      // 10. XIN ĐỔI CA / NHỜ NHẬN CA THAY (request-change)
      if (intent === 'request-change') {
        if (!access.canRequest) {
          say('Tài khoản của bạn chưa có quyền gửi yêu cầu đổi ca.');
          return;
        }
        const to = addDays(weekStart, 13);
        const mine = await requestJson<PersonalSchedule>(`/scheduling/me?from=${weekStart}&to=${to}`);
        const upcoming = mine.assignments.filter((a) => futureAssignment(a));
        if (!upcoming.length) {
          say(`Bạn chưa có ca đã công bố nào sắp tới trong khoảng ${weekStart} – ${to} để xin đổi ca.`);
          return;
        }
        const priorOptions = (session.current.myAssignments ?? upcoming).filter(futureAssignment);
        const pickedFromList = pickIndex(instruction, priorOptions);
        const initialAssignment = pickedFromList && upcoming.some(a => a.id === pickedFromList.id && a.weekId === pickedFromList.weekId)
          ? pickedFromList : pickShift(instruction.split(/\s+(?:với|voi)\s+/i)[0], upcoming, weekStart);
        const command = scheduleText(instruction);
        const partnerHint = instruction.match(/\s+(?:với|voi|cho)\s+(.+)$/i)?.[1]?.trim();
        const inferredMode = /\b(?:nho quan ly|nho sm|chua co nguoi|tim nguoi|bo tri nguoi)\b/.test(command) ? 'MANAGER'
          : /\bdoi ca\b.*\bvoi\b|\bdoi ca hai chieu\b/.test(command) ? 'SWAP'
          : partnerHint && /\b(?:nhan ca thay|thay ca)\b/.test(command) ? 'COVER' : null;
        function modeFrom(text: string) {
          const q = scheduleText(text);
          if (/^(?:1|doi(?: ca)?(?: hai chieu)?|hoan doi)$/.test(q)) return 'SWAP';
          if (/^(?:2|nhan(?: ca)? thay|da co nguoi)$/.test(q)) return 'COVER';
          if (/^(?:3|nho (?:sm|quan ly)(?: tim nguoi)?|chua co nguoi)$/.test(q)) return 'MANAGER';
          return null;
        }
        async function* requestChangeStep(): AsyncGenerator<string, Plan, string> {
          let chosen = initialAssignment;
          while (!chosen) {
            const reply = yield ['Bạn muốn xin đổi hoặc nhờ nhận thay cho ca nào? Chọn số thứ tự hoặc ngày và mã ca:',
              ...upcoming.map((a, i) => `${i + 1}. ${shiftLabel(a)} · ${a.storeName}`)].join('\n');
            chosen = pickShift(reply, upcoming, weekStart);
          }
          let mode = inferredMode;
          const modeQuestion = 'Anh/chị muốn xử lý thế nào?\n1. Đổi ca hai chiều với đồng nghiệp\n2. Nhờ đồng nghiệp đã chọn nhận thay\n3. Nhờ SM tìm người nhận thay';
          while (!mode) mode = modeFrom(yield modeQuestion);
          let partner: ChangePartner | null = null;
          let target: ShiftOption | null = null;
          let expectedVersion = chosen.weekVersion;
          if (mode !== 'MANAGER') {
            const choices = await requestJson<{ weekVersion: number; items: ChangePartner[] }>(
              `/scheduling/weeks/${chosen.weekId}/partners?assignmentId=${encodeURIComponent(chosen.id)}`, { signal });
            expectedVersion = choices.weekVersion;
            const eligible = choices.items.filter(p => mode === 'SWAP' ? p.assignments.length > 0 : p.canCover);
            if (!eligible.length) {
              const reply = yield 'Không tìm thấy đồng nghiệp và ca phù hợp, không chồng giờ. Gõ “nhờ SM” để tìm người nhận thay hoặc “hủy” để dừng.';
              if (modeFrom(reply) !== 'MANAGER') throw new Error('Chưa gửi đề nghị. Bạn có thể bắt đầu lại và chọn nhờ SM.');
              mode = 'MANAGER';
            } else {
              partner = partnerHint ? pickColleague(partnerHint, eligible) : null;
              while (!partner) {
                const reply = yield ['Chọn đồng nghiệp theo tên, mã nhân viên hoặc số thứ tự. Danh sách đã lọc ca chồng giờ:',
                  ...eligible.map((p, i) => `${i + 1}. ${p.fullName} · ${p.employeeCode}`)].join('\n');
                if (/^(?:nho (?:sm|quan ly)(?: tim nguoi)?|chua co nguoi)$/.test(scheduleText(reply))) { mode = 'MANAGER'; partner = null; break; }
                partner = pickColleague(reply, eligible);
              }
              if (mode === 'SWAP' && partner) {
                while (!target) {
                  const reply = yield [`Bạn muốn nhận lại ca nào của ${partner.fullName}? Chỉ hiện ca không làm chồng giờ lịch của hai người:`,
                    ...partner.assignments.map((a, i) => `${i + 1}. ${shiftLabel(a)}`)].join('\n');
                  target = pickShift(reply, partner.assignments, mondayOf(chosen.date));
                }
              }
            }
          }
          let reason = extractedReason;
          while (reason.length < 5 || reason.length > 500) reason = (yield 'Nhập lý do đổi hoặc nhờ nhận ca thay (5–500 ký tự):').trim();
          const finalAssignment = chosen;
          const finalTarget = target;
          const finalPartner = partner;
          const manager = mode === 'MANAGER';
          const label = mode === 'SWAP' ? 'Đổi ca hai chiều' : manager ? 'Nhờ quản lý tìm người nhận thay' : 'Nhờ đồng nghiệp nhận ca thay';
          const urgent = [finalAssignment, ...(finalTarget ? [finalTarget] : [])].some(a =>
            a.intervals.some(p => Date.parse(a.date + 'T00:00:00+07:00') + p.startMinute * 60000 - Date.now() < 86400000));
          const clientRequestId = crypto.randomUUID();
          return {
            summary: [
              'Bản xem trước yêu cầu đổi / nhận ca thay:',
              `• Cửa hàng: ${finalAssignment.storeName}`,
              `• Ca của bạn: ${shiftLabel(finalAssignment)}`,
              `• Hình thức: ${label}`,
              ...(finalPartner ? [`• Đồng nghiệp: ${finalPartner.fullName}`] : []),
              ...(finalTarget ? [`• Ca bạn nhận lại: ${shiftLabel(finalTarget)}`] : []),
              ...(urgent ? ['• Còn dưới 24 giờ: quản lý phải xử lý trước.'] : []),
              `• Lý do: ${reason}`,
            ].join('\n'),
            execute: async () => {
              const result = await requestJson<{ request: ScheduleChange }>(`/scheduling/weeks/${finalAssignment.weekId}/changes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  expectedVersion, clientRequestId, assignmentId: finalAssignment.id,
                  arrangement: manager ? 'MANAGER' : 'DIRECT',
                  kind: finalTarget ? 'SWAP' : 'COVER',
                  receiverEmployeeId: finalPartner?.employeeId ?? null,
                  ...(finalTarget ? { targetAssignmentId: finalTarget.id } : {}), reason,
                }),
              });
              return `Đã gửi yêu cầu: ${label}. ${CHANGE_STATUS_LABELS[result.request.status] ?? result.request.status}.`;
            },
          };
        }

        const step = requestChangeStep();
        await advance(await step.next(), step);
        return;
      }

      // 11. ĐỒNG Ý / TỪ CHỐI / HỦY YÊU CẦU ĐỔI CA (accept-change, decline-change, cancel-change)
      if (intent === 'accept-change' || intent === 'decline-change' || intent === 'cancel-change') {
        const specified = parsedDate.date || /\btuan\s+(?:nay|sau|toi|ke|truoc|qua|roi|hien tai)\b/.test(scheduleText(instruction));
        const from = specified ? weekStart : mondayOf(todayLocal());
        const to = addDays(from, specified ? 6 : 41);
        const mine = await requestJson<PersonalSchedule>(`/scheduling/me?from=${from}&to=${to}`);
        const targetAction = intent === 'accept-change' ? 'ACCEPT' : intent === 'decline-change' ? 'DECLINE' : 'CANCEL';
        const candidates = mine.requests.filter((r) =>
          (!parsedDate.date || r.source.date === parsedDate.date || r.target?.date === parsedDate.date) &&
          (
          targetAction === 'CANCEL'
            ? r.requesterEmployeeId === access.employeeId && ['PENDING_MANAGER', 'PENDING_RECEIVER', 'PENDING_REQUESTER', 'READY_FOR_REVIEW'].includes(r.status)
            : r.receiverEmployeeId === access.employeeId && r.status === 'PENDING_RECEIVER')
        );
        if (!candidates.length) {
          say(
            targetAction === 'CANCEL'
              ? `Không thấy yêu cầu đổi ca đang chờ hủy trong khoảng ${from} – ${to}.`
              : `Không thấy lời mời nhận / đổi ca đang chờ bạn xác nhận trong khoảng ${from} – ${to}. Nếu ca nằm ngoài khoảng này, hãy nhắn kèm ngày của ca.`
          );
          return;
        }
        let picked = pickIndex(instruction, candidates);
        if (!picked && candidates.length > 1) {
          function* chooseRequest(): Generator<string, Plan, string> {
            let choice: typeof candidates[number] | null = null;
            while (!choice) choice = pickIndex(yield ['Bạn muốn xử lý yêu cầu nào? Chọn số thứ tự:',
              ...candidates.map((r, i) => `${i + 1}. ${r.source.employeeName} · ${shiftLabel(r.source)}`)].join('\n'), candidates);
            return responsePlan(choice);
          }
          const step = chooseRequest();
          await advance(step.next(), step);
          return;
        }
        picked ??= candidates[0];
        const plan = responsePlan(picked);
        decision.current = { plan };
        say(planned(plan));
        return;

        function responsePlan(picked: typeof candidates[number]): Plan {
          const reason = extractedReason.length >= 5
          ? extractedReason
          : targetAction === 'ACCEPT'
            ? 'Đồng ý nhận ca hỗ trợ đồng nghiệp qua trợ lý chat'
            : targetAction === 'DECLINE'
              ? 'Bận lịch cá nhân, không thể nhận ca này'
              : 'Hủy yêu cầu đổi ca theo kế hoạch cá nhân';
        const label = targetAction === 'ACCEPT' ? 'Đồng ý nhận / đổi ca' : targetAction === 'DECLINE' ? 'Từ chối nhận ca' : 'Hủy yêu cầu đổi ca';

        return {
          summary: [
            `Bản xem trước: ${label}`,
            `• Ca làm: ${formatVietnameseDate(picked.source.date)} · Ca ${picked.source.shiftCode} (${formatShiftIntervals(picked.source.intervals)})`,
            `• Người đề nghị: ${picked.source.employeeName}`,
            ...(picked.target ? [`• Ca đổi lại: ${shiftLabel(picked.target)}`] : []),
            `• Ghi chú xử lý: ${reason}`,
          ].join('\n  '),
          execute: async () => {
            const result = await requestJson<{ request: ScheduleChange }>(`/scheduling/weeks/${picked.weekId}/changes/${picked.id}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                expectedVersion: picked.weekVersion,
                action: targetAction,
                reason,
              }),
            });
            return `Đã thực hiện: ${label}. ${CHANGE_STATUS_LABELS[result.request.status] ?? result.request.status}.`;
          },
        };
        }
      }

      // 12. QUẢN LÝ DUYỆT / ĐIỀU PHỐI YÊU CẦU ĐỔI CA (review-change)
      if (intent === 'review-change') {
        if (!store || !store.canReview) {
          say('Chỉ Quản lý cửa hàng (SM) hoặc Quản lý khu vực (AM) có quyền điều phối / duyệt yêu cầu đổi ca.');
          return;
        }
        const { week } = await requestJson<{ week: OperationalScheduleWeek | null }>(
          `/scheduling/stores/${store.id}/week?weekStart=${weekStart}`, { signal });
        const pendingReqs = (week?.requests ?? []).filter(r =>
          (r.status === 'PENDING_MANAGER' || r.status === 'READY_FOR_REVIEW') &&
          r.requesterEmployeeId !== access.employeeId && r.receiverEmployeeId !== access.employeeId);
        if (!week || !pendingReqs.length) {
          say(`Tại ${store.name} (tuần ${weekStart}), hiện không có yêu cầu đổi ca nào đang chờ bạn xử lý.`);
          return;
        }
        const storeName = store.name;
        const selectedWeek = week;
        const isReject = /\btu choi\b/.test(scheduleText(instruction));
        const reason = extractedReason.length >= 5 ? extractedReason
          : isReject ? 'Không đủ nhân sự thay thế trong khung giờ này' : 'Quản lý điều phối nhân sự nhận ca thay';
        async function* reviewChangeStep(): AsyncGenerator<string, Plan, string> {
          let picked = pickIndex(instruction, pendingReqs) ?? (pendingReqs.length === 1 ? pendingReqs[0] : null);
          while (!picked) picked = pickIndex(yield ['Chọn yêu cầu đổi ca cần xử lý:',
            ...pendingReqs.map((r, i) => `${i + 1}. ${r.source.employeeName} · ${shiftLabel(r.source)}`)].join('\n'), pendingReqs);
          const finalRequest = picked;
          const action = isReject ? 'REJECT' : picked.kind === 'COVER' && picked.arrangement === 'MANAGER' ? 'SELECT' : 'APPROVE';
          let receiverId = picked.receiverEmployeeId;
          let receiverName = picked.receiverName;
          let expectedVersion = selectedWeek.version;
          if (action === 'SELECT') {
            const replacements = await requestJson<{ weekVersion: number; items: ChangePartner[] }>(
              `/scheduling/weeks/${selectedWeek.id}/changes/${picked.id}/replacements`);
            expectedVersion = replacements.weekVersion;
            if (!replacements.items.length) throw new Error('Không có nhân viên phù hợp để nhận thay ca này.');
            let receiver: ChangePartner | null = null;
            while (!receiver) receiver = pickColleague(yield ['Chọn người nhận ca thay theo tên, mã nhân viên hoặc số thứ tự:',
              ...replacements.items.map((p, i) => `${i + 1}. ${p.fullName} · ${p.employeeCode}`)].join('\n'), replacements.items);
            receiverId = receiver.employeeId;
            receiverName = receiver.fullName;
          }
          return {
            summary: [
              `Bản xem trước ${isReject ? 'từ chối' : 'điều phối'} yêu cầu đổi ca · ${storeName}:`,
              `• Ca gốc: ${finalRequest.source.employeeName} · ${shiftLabel(finalRequest.source)}`,
              ...(finalRequest.target ? [`• Ca đổi lại: ${shiftLabel(finalRequest.target)}`] : []),
              ...(!isReject && receiverName ? [`• Người nhận: ${receiverName}`] : []),
              `• Ghi chú: ${reason}`,
            ].join('\n'),
            execute: async () => {
              const result = await requestJson<{ request: ScheduleChange }>(`/scheduling/weeks/${selectedWeek.id}/changes/${finalRequest.id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ expectedVersion, action, ...(action === 'SELECT' ? { receiverEmployeeId: receiverId } : {}), reason }),
              });
              return `Đã xử lý yêu cầu đổi ca. ${CHANGE_STATUS_LABELS[result.request.status] ?? result.request.status}.`;
            },
          };
        }
        const step = reviewChangeStep();
        await advance(await step.next(), step);
        return;
      }

      // 13. TẠO LỊCH TUẦN & CÔNG BỐ LỊCH TUẦN (create-week, publish-week)
      if (intent === 'create-week') {
        if (!store || !store.canManage) {
          say('Chỉ Quản lý cửa hàng (SM) hoặc Quản lý khu vực (AM) có quyền tạo lịch tuần.');
          return;
        }
        const plan: Plan = {
          summary: `Khởi tạo bản nháp lịch tuần ${weekStart} – ${addDays(weekStart, 6)} cho ${store.name}.`,
          execute: async () => {
            await requestJson(`/scheduling/stores/${store.id}/weeks`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ weekStart }),
            });
            return `Đã khởi tạo bản nháp lịch tuần ${weekStart} cho ${store.name}.`;
          },
        };
        decision.current = { plan };
        say(planned(plan));
        return;
      }

      if (intent === 'publish-week') {
        if (!store || !store.canPublish) {
          say('Chỉ Quản lý cửa hàng (SM) hoặc Quản lý khu vực (AM) có quyền công bố lịch tuần.');
          return;
        }
        const currentMon = mondayOf(todayLocal());
        const nextMon = addDays(currentMon, 7);
        let targetWeek = weekStart;
        let { week } = await requestJson<{ week: OperationalScheduleWeek | null }>(`/scheduling/stores/${store.id}/week?weekStart=${targetWeek}`);
        if (week?.publishedAt && targetWeek === currentMon) {
          targetWeek = nextMon;
          ({ week } = await requestJson<{ week: OperationalScheduleWeek | null }>(`/scheduling/stores/${store.id}/week?weekStart=${targetWeek}`));
        }
        if (!week) {
          say(`Tuần ${targetWeek} tại ${store.name} chưa có bản nháp lịch để công bố.`);
          return;
        }
        if (week.publishedAt && !week.hasUnpublishedChanges) {
          say(`Lịch tuần ${targetWeek} tại ${store.name} đã được công bố trước đó và không có thay đổi mới.`);
          return;
        }
        const reason = extractedReason.length >= 5 ? extractedReason : `Công bố lịch làm việc tuần ${targetWeek}`;
        const targetWeekRow = week;
        const plan: Plan = {
          summary: [
            `Bản xem trước công bố lịch tuần · ${store.name}:`,
            `• Tuần bắt đầu: ${targetWeek} – ${addDays(targetWeek, 6)}`,
            `• Số ca trong bản nháp sẽ công bố: ${targetWeekRow.draft.length} ca`,
            `• Ghi chú công bố: ${reason}`,
          ].join('\n'),
          execute: async () => {
            await requestJson(`/scheduling/weeks/${targetWeekRow.id}/publish`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ expectedVersion: targetWeekRow.version, reason }),
            });
            window.dispatchEvent(new Event('schedule:published'));
            return `Đã công bố chính thức lịch tuần ${targetWeek} (${targetWeekRow.draft.length} ca) tại ${store.name} và gửi thông báo cho nhân viên.`;
          },
        };
        decision.current = { plan };
        say(planned(plan));
        return;
      }
    }

    respond()
      .catch((error: unknown) => {
        decision.current = undefined;
        say(error instanceof Error ? error.message : 'Chưa xử lý được yêu cầu lịch làm.');
      })
      .finally(() => {
        if (inFlight.current === controller) {
          inFlight.current = undefined;
          setBusy(false);
        }
      });

    return true;
  }

  return { busy, reset, send };
}
