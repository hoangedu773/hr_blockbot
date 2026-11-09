import { useEffect, useRef, useState } from 'react';
import type { AuthorizationCapability, PerformanceEvaluation, TaskInstance } from '@hr-blockbot/contracts';
import * as api from '../../services/performance-kpi-api';
import { fetchMe, newClientMessageId } from '../../services/api';
import { performanceDate, performanceLabels, performanceNumber } from '../TaskDetailView';

type Turn = { sender: 'user' | 'assistant'; text: string };
type Step<T> = Generator<string, T, string>;
type Plan = { summary: string; readOnly?: boolean; execute: () => Promise<string> };
type Decision = { step: Step<Plan> } | { plan: Plan };
type Session = {
  domain: 'task' | 'evaluation';
  period: string;
  taskIds: string[];
  evaluationIds: string[];
  selectedId?: string;
};

type WorkPerfIntent =
  | 'task-list'
  | 'task-pending'
  | 'task-detail'
  | 'task-assign'
  | 'task-accept'
  | 'task-refuse'
  | 'task-progress'
  | 'task-submit'
  | 'task-evaluate'
  | 'task-refusal-decision'
  | 'eval-list'
  | 'eval-pending'
  | 'eval-detail'
  | 'eval-self-review'
  | 'eval-score'
  | 'eval-finalize'
  | 'eval-reconsider'
  | 'eval-reconsider-response'
  | 'eval-appeal'
  | 'eval-appeal-decision'
  | 'help';

function normalizeText(text: string) {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/đ/g, 'd').trim().replace(/\s+/g, ' ');
}

function splitReason(text: string) {
  const parts = /^(.+?)(?:[\s,;]+(?:lý do|ly do|ghi chú|ghi chu|nội dung|noi dung|nhận xét|nhan xet)\s*[:=]\s*|\s+(?:bởi vì|vì|vi)\s+(?!sao\b))(.+)$/is.exec(text);
  return { instruction: (parts?.[1] ?? text).trim(), note: parts?.[2]?.trim() ?? '' };
}

function currentMonthVN() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7);
}

function resolvePeriod(text: string, fallback: string) {
  const q = normalizeText(text);
  const iso = q.match(/\b(20\d{2})-(0[1-9]|1[0-2])\b/);
  if (iso) return iso[0];
  const slash = q.match(/\b(0?[1-9]|1[0-2])\s*[/.-]\s*(20\d{2})\b/);
  if (slash) return `${slash[2]}-${slash[1].padStart(2, '0')}`;
  const named = q.match(/\b(?:thang|ky)\s*(0?[1-9]|1[0-2])(?:\s+nam\s+(20\d{2}))?\b/);
  if (named) return `${named[2] || fallback.slice(0, 4)}-${named[1].padStart(2, '0')}`;
  if (/\b(?:thang|ky) (?:nay|hien tai)\b/.test(q)) return currentMonthVN();
  if (/\bthang (?:truoc|roi)\b/.test(q)) {
    return new Date(Date.UTC(Number(fallback.slice(0, 4)), Number(fallback.slice(5)) - 2, 1)).toISOString().slice(0, 7);
  }
  return fallback;
}

function pickChoice<T>(text: string, items: T[], label: (item: T) => string): T[] {
  const q = normalizeText(text).replace(/[.?!]+$/, '').trim();
  const numMatch = q.match(/^(?:(?:chon|xem|doc|mo|nhan|nop|giao|cham|nghiem thu|tu choi|xu ly|phan hoi|cong bo|chot) )?(?:(?:muc|so|cai|nhiem vu|cong viec|ho so) )?(\d+)$/)
    ?? q.match(/\b(?:muc|so|nhiem vu|cong viec|ho so) (\d+)\b/);
  if (numMatch) {
    const picked = items[Number(numMatch[1]) - 1];
    return picked ? [picked] : [];
  }
  if (/\b(?:muc|so|cai|ho so|nhiem vu) dau tien\b/.test(q)) return items.slice(0, 1);
  return items.filter(item => {
    const l = normalizeText(label(item));
    return l.length > 2 && (q.includes(l) || (q.length > 3 && l.includes(q)));
  });
}

export function detectWorkPerfIntent(text: string, session?: Session): WorkPerfIntent | null {
  const { instruction } = splitReason(text);
  const q = normalizeText(instruction);

  // Never intercept policy/regulation questions, schedule, onboarding, or revenue KPI
  if (/\b(?:quy dinh|quy che|huong dan|cach tinh|cong thuc|di tre|nghi le|cham cong|lich lam|ca truc|doi ca|tiep nhan nhan vien|ho so tiep nhan|kpi doanh thu|chi tieu doanh thu|doanh thu|tien ket)\b/.test(q)) {
    return null;
  }

  const hasTaskScope = /\b(?:cong viec co thang diem|viec co thang diem|cong viec can nghiem thu|viec can nghiem thu|nghiem thu cong viec|nhiem vu kpi|nhiem vu co thang diem|nhiem vu duoc giao|nhiem vu cua toi|nhiem vu thang|giao nhiem vu|nhan nhiem vu|nop nhiem vu|nghiem thu nhiem vu)\b/.test(q);
  const hasEvalScope = /\b(?:kpi hieu suat|danh gia hieu suat|diem hieu suat)\b/.test(q);

  // Let single personal KPI summary ("KPI hiệu suất của tôi") go to backend `/api/chat/stream` so it renders the native performanceKpi card,
  // unless the user asks for an action (tự nhận xét, kiến nghị, khiếu nại, phản hồi) or list/store/team view.
  const isSimpleOwnEvalRead = hasEvalScope
    && /\b(?:cua toi|cua minh|cua em|ca nhan)\b/.test(q)
    && !/\b(?:tu nhan xet|kien nghi|khieu nai|phan hoi|cham diem|cong bo|chot|danh sach|cua hang|doi ngu|can xu ly|cho chấm)\b/.test(q);
  if (isSimpleOwnEvalRead && !session) return null;

  if (!hasTaskScope && !hasEvalScope && !session) return null;

  if (/\b(?:tro giup|huong dan thao tac|lam duoc gi)\b/.test(q)) return 'help';

  const activeDomain = hasTaskScope ? 'task' : hasEvalScope ? 'evaluation' : session?.domain;

  if (activeDomain === 'task') {
    if (/\b(?:xu ly tu choi|duyet tu choi|bac tu choi)\b/.test(q)) return 'task-refusal-decision';
    if (/\b(?:nghiem thu|cham diem|cham nhiem vu|danh gia nhiem vu)\b/.test(q) && !/\bcan nghiem thu\b/.test(q)) return 'task-evaluate';
    if (/\b(?:nop|gui ket qua|bao cao hoan thanh)\b/.test(q)) return 'task-submit';
    if (/\b(?:tien do|hoan thanh cac buoc|cap nhat buoc)\b/.test(q)) return 'task-progress';
    if (/\b(?:tu choi|khong nhan)\b/.test(q)) return 'task-refuse';
    if (/\b(?:chap nhan|dong y nhan|nhan nhiem vu|nhan viec|nhan muc)\b/.test(q)) return 'task-accept';
    if (/\b(?:giao viec|giao nhiem vu|phan cong|giao muc)\b/.test(q) && !/\bduoc giao\b/.test(q)) return 'task-assign';
    if (/\b(?:chi tiet|xem muc|doc muc|mo muc|muc \d|so \d)\b/.test(q) || /^(?:xem|mo|chon)?\s*\d+$/.test(q)) return 'task-detail';
    if (/\b(?:can xu ly|cho xu ly|cho nhan|cho nghiem thu|cho cham|bi tu choi)\b/.test(q)) return 'task-pending';
    return 'task-list';
  }

  if (activeDomain === 'evaluation') {
    if (/\b(?:xu ly khieu nai|quyet dinh khieu nai|duyet khieu nai)\b/.test(q)) return 'eval-appeal-decision';
    if (/\b(?:khieu nai|gui khieu nai)\b/.test(q)) return 'eval-appeal';
    if (/\b(?:phan hoi kien nghi|tra loi kien nghi|dong y phan hoi|rut kien nghi)\b/.test(q)) return 'eval-reconsider-response';
    if (/\b(?:kien nghi|xem xet lai)\b/.test(q)) return 'eval-reconsider';
    if (/\b(?:cong bo|chot diem|chot kpi)\b/.test(q)) return 'eval-finalize';
    if (/\b(?:cham diem|cham kpi|danh gia tieu chi)\b/.test(q) && !/\bcho cham\b/.test(q)) return 'eval-score';
    if (/\b(?:tu nhan xet|tu danh gia)\b/.test(q)) return 'eval-self-review';
    if (/\b(?:chi tiet|giai thich|xem muc|doc muc|mo muc|muc \d|so \d)\b/.test(q) || /^(?:xem|mo|chon)?\s*\d+$/.test(q)) return 'eval-detail';
    if (/\b(?:can xu ly|cho xu ly|cho cham|dang tranh chap|kien nghi nao|khieu nai nao)\b/.test(q)) return 'eval-pending';
    return 'eval-list';
  }

  return null;
}

function describeTask(t: TaskInstance, names: Record<string, string>) {
  const assignee = t.assigneeEmployeeId ? (names[t.assigneeEmployeeId] ?? 'Nhân viên được giao') : 'Chưa giao';
  const assignmentLabel = t.assignmentStatus ? (performanceLabels[t.assignmentStatus] ?? t.assignmentStatus) : 'Chưa giao';
  const lines = [
    `${t.title} · Kỳ ${t.kpiPeriod}`,
    `Trạng thái · ${performanceLabels[t.status] ?? t.status} (${assignmentLabel})`,
    `Người nhận · ${assignee} · Trọng số ${performanceNumber(t.taskWeightPercent)}% · Tiến độ ${performanceNumber(t.progressPercent)}%`,
    `Hạn hoàn thành · ${performanceDate(t.extendedDueAt ?? t.dueAt)}`,
    `Mô tả · ${t.description}`,
    `Các bước thực hiện · ${t.stepProgress.map(s => {
      const stepName = t.templateSnapshot.steps.find(step => step.code === s.code)?.name ?? s.code;
      return `${stepName} (${s.done ? 'Đã xong' : 'Chưa xong'})`;
    }).join(' → ')}`,
  ];
  if (t.refusalReason) {
    lines.push(`Lý do từ chối · ${t.refusalReason}`);
  }
  if (t.evaluations.length) {
    const lastEval = t.evaluations[t.evaluations.length - 1];
    lines.push(`Kết quả nghiệm thu · ${performanceNumber(lastEval.totalScore)}/100 điểm (${performanceLabels[lastEval.status] ?? lastEval.status}) · ${lastEval.evaluatorComment}`);
  }
  const latestBlock = t.history[t.history.length - 1];
  if (latestBlock) {
    lines.push(`Chuỗi băm kiểm toán · Block #${t.history.length} · SHA-256 ${latestBlock.hash.slice(0, 12)}...`);
  }
  return lines.join('\n');
}

export function useWorkAndPerformanceChat({
  grants,
  onChanged,
  onOpenKpiAction,
}: {
  grants: readonly AuthorizationCapability[];
  onChanged: () => void;
  onOpenKpiAction?: (target: { id: string; period: string; kind: string }) => void;
}) {
  const [busy, setBusy] = useState(false);
  const session = useRef<Session>();
  const decision = useRef<Decision>();
  const inFlight = useRef<AbortController>();
  const can = (cap: AuthorizationCapability) => grants.includes(cap);

  const reset = () => {
    inFlight.current?.abort();
    inFlight.current = undefined;
    session.current = undefined;
    decision.current = undefined;
    setBusy(false);
  };

  useEffect(() => () => inFlight.current?.abort(), []);

  function send(text: string, append: (turn: Turn) => void, allowContext = true) {
    const activeSession = allowContext ? session.current : undefined;
    const intent = detectWorkPerfIntent(text, activeSession);
    if (!intent && !decision.current) return false;
    if (inFlight.current) return true;

    const controller = new AbortController();
    inFlight.current = controller;
    const signal = controller.signal;
    const say = (reply: string) => {
      if (!signal.aborted) append({ sender: 'assistant', text: reply });
    };
    const q = normalizeText(text).replace(/[.!?]+$/, '');
    const { instruction, note } = splitReason(text);
    append({ sender: 'user', text });
    setBusy(true);

    async function advance(result: IteratorResult<string, Plan>, step: Step<Plan>) {
      if (result.done) {
        if (result.value.readOnly) {
          say(await result.value.execute());
          return;
        }
        decision.current = { plan: result.value };
        say(`${result.value.summary}\n\nNhắn “xác nhận” để thực hiện hoặc “hủy” để dừng.`);
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
        if (!/^(?:toi )?(?:xac nhan(?: thuc hien)?|dong y|tien hanh|thuc hien)$/.test(q)) {
          say('Nhắn “xác nhận” để thực hiện nội dung vừa xem hoặc “hủy” để dừng.');
          return;
        }
        decision.current = undefined;
        say(await pending.plan.execute());
        if (!signal.aborted) onChanged();
        return;
      }

      if (!intent) return;
      if (intent === 'help') {
        say([
          'Bạn có thể thao tác tự nhiên với Công việc & nghiệm thu và KPI hiệu suất:',
          '• Công việc: “Danh sách công việc có thang điểm”, “Việc nào chờ nhận?”, “Nhận mục 1”, “Từ chối mục 1 lý do: ...”, “Tiến độ mục 1”, “Nộp mục 1 lý do: ...”, “Giao mục 1”, “Nghiệm thu mục 1”.',
          '• KPI hiệu suất: “Danh sách KPI hiệu suất tháng này”, “KPI hiệu suất cần xử lý”, “Tự nhận xét KPI hiệu suất”, “Kiến nghị KPI hiệu suất”, “Phản hồi kiến nghị mục 1”, “Khiếu nại KPI hiệu suất”, “Chấm điểm KPI hiệu suất mục 1”.',
        ].join('\n'));
        return;
      }

      const period = resolvePeriod(instruction, session.current?.period ?? currentMonthVN());

      // ---- TASK DOMAIN ----
      if (intent.startsWith('task-')) {
        const [{ items: tasks }, me, catalog] = await Promise.all([
          api.performanceTasks(period),
          fetchMe(),
          can('task.manage') || can('performance_kpi.read_scope') ? api.performanceCatalog().catch(() => ({ employees: [], stores: [] })) : Promise.resolve({ employees: [], stores: [] }),
        ]);
        if (signal.aborted) return;
        const employeeId = me.employeeId ?? undefined;
        const names: Record<string, string> = Object.fromEntries(catalog.employees.map(e => [e.id, e.name]));

        const current: Session = session.current?.domain === 'task' && session.current.period === period
          ? session.current
          : { domain: 'task', period, taskIds: [], evaluationIds: [] };
        session.current = current;

        if (intent === 'task-list' || intent === 'task-pending') {
          const filtered = tasks.filter(t => {
            if (/\b(?:cua toi|cua minh|cua em)\b/.test(q) && t.assigneeEmployeeId !== employeeId) return false;
            if (/\bcho nhan\b/.test(q) && t.status !== 'ASSIGNED') return false;
            if (/\b(?:cho nghiem thu|cho cham)\b/.test(q) && t.status !== 'PENDING_REVIEW') return false;
            if (/\bbi tu choi\b/.test(q) && t.assignmentStatus !== 'REFUSED') return false;
            if (/\bban nhap\b/.test(q) && t.status !== 'DRAFT') return false;
            if (intent === 'task-pending') {
              if (t.assigneeEmployeeId === employeeId && ['ASSIGNED', 'ACCEPTED', 'IN_PROGRESS'].includes(t.status)) return true;
              if (can('task.evaluate') && t.status === 'PENDING_REVIEW') return true;
              if (can('task.manage') && (t.status === 'DRAFT' || t.assignmentStatus === 'REFUSED')) return true;
              return false;
            }
            return true;
          });
          current.taskIds = filtered.map(t => t.id);
          current.selectedId = filtered.length === 1 ? filtered[0].id : undefined;
          if (!filtered.length) {
            say(`Kỳ ${period} hiện không có nhiệm vụ có thang điểm nào phù hợp bộ lọc.`);
            return;
          }
          say([
            `Công việc có thang điểm · Kỳ ${period} (${filtered.length} nhiệm vụ):`,
            ...filtered.map((t, i) => {
              const who = t.assigneeEmployeeId ? (names[t.assigneeEmployeeId] ?? (t.assigneeEmployeeId === employeeId ? 'Bạn' : 'Đã giao')) : 'Chưa giao';
              return `${i + 1}. ${t.title} · ${performanceLabels[t.status] ?? t.status} · ${who} · Trọng số ${performanceNumber(t.taskWeightPercent)}% · Tiến độ ${performanceNumber(t.progressPercent)}%`;
            }),
            '\nNhắn “xem mục 1”, “nhận mục 1”, “tiến độ mục 1”, “nộp mục 1”, “giao mục 1” hoặc “nghiệm thu mục 1”.',
          ].join('\n'));
          return;
        }

        const ordered = current.taskIds.map(id => tasks.find(t => t.id === id)).filter((t): t is TaskInstance => !!t);
        const candidates = ordered.length ? ordered : tasks;
        const picked = pickChoice(instruction, candidates, t => t.title);
        const selected = picked[0] ?? (current.selectedId ? tasks.find(t => t.id === current.selectedId) : undefined) ?? (candidates.length === 1 ? candidates[0] : undefined);

        if (!selected) {
          current.taskIds = candidates.map(t => t.id);
          say([
            `Bạn muốn thao tác trên nhiệm vụ nào trong kỳ ${period}?`,
            ...candidates.slice(0, 10).map((t, i) => `${i + 1}. ${t.title} · ${performanceLabels[t.status] ?? t.status}`),
            'Hãy nhắn kèm số thứ tự, ví dụ “xem mục 1” hoặc “nhận mục 1”.',
          ].join('\n'));
          return;
        }
        current.selectedId = selected.id;

        if (intent === 'task-detail') {
          say(describeTask(selected, names));
          return;
        }

        if (intent === 'task-accept') {
          if (selected.status !== 'ASSIGNED') {
            say(`Nhiệm vụ “${selected.title}” đang ở trạng thái ${performanceLabels[selected.status] ?? selected.status}, không ở trạng thái chờ nhận.`);
            return;
          }
          const plan: Plan = {
            summary: `Xác nhận nhận nhiệm vụ “${selected.title}” (Kỳ ${selected.kpiPeriod} · Trọng số ${performanceNumber(selected.taskWeightPercent)}% · Hạn ${performanceDate(selected.dueAt)}).`,
            execute: async () => {
              const updated = await api.performanceTaskAction(selected.id, 'accept', {
                expectedVersion: selected.version,
                clientRequestId: newClientMessageId(),
              });
              return `Đã nhận nhiệm vụ “${updated.title}”. Trạng thái hiện tại: ${performanceLabels[updated.status] ?? updated.status}. Bạn có thể nhắn “tiến độ mục 1” hoặc “nộp mục 1” khi hoàn thành.`;
            },
          };
          decision.current = { plan };
          say(`${plan.summary}\n\nNhắn “xác nhận” để thực hiện hoặc “hủy” để dừng.`);
          return;
        }

        if (intent === 'task-refuse') {
          function* refuseFlow(): Step<Plan> {
            let reason = note;
            while (reason.trim().length < 5) {
              reason = (yield `Bạn hãy nhập lý do từ chối nhiệm vụ “${selected.title}” (tối thiểu 5 ký tự):`).trim();
            }
            return {
              summary: `Từ chối nhiệm vụ “${selected.title}” với lý do: “${reason}”.`,
              execute: async () => {
                const updated = await api.performanceTaskAction(selected.id, 'refuse', {
                  expectedVersion: selected.version,
                  clientRequestId: newClientMessageId(),
                  reason,
                  evidenceRefs: [`Báo cáo từ chối qua trợ lý Chat: ${reason}`],
                });
                return `Đã gửi yêu cầu từ chối nhiệm vụ “${updated.title}”. Chờ quản lý trực tiếp xem xét.`;
              },
            };
          }
          const step = refuseFlow();
          await advance(step.next(), step);
          return;
        }

        if (intent === 'task-progress') {
          const allCodes = selected.templateSnapshot.steps.map(s => s.code);
          const plan: Plan = {
            summary: `Cập nhật hoàn thành 100% các bước của nhiệm vụ “${selected.title}” (${selected.templateSnapshot.steps.map(s => s.name).join(', ')}).`,
            execute: async () => {
              const updated = await api.performanceTaskAction(selected.id, 'progress', {
                expectedVersion: selected.version,
                clientRequestId: newClientMessageId(),
                completedStepCodes: allCodes,
                evidenceRefs: [note || 'Đã hoàn thành đầy đủ các bước theo quy trình vận hành cửa hàng.'],
              });
              return `Đã cập nhật tiến độ nhiệm vụ “${updated.title}” lên ${performanceNumber(updated.progressPercent)}%. Nhắn “nộp mục 1” để gửi nghiệm thu.`;
            },
          };
          decision.current = { plan };
          say(`${plan.summary}\n\nNhắn “xác nhận” để thực hiện hoặc “hủy” để dừng.`);
          return;
        }

        if (intent === 'task-submit') {
          function* submitFlow(): Step<Plan> {
            let reason = note;
            while (reason.trim().length < 5) {
              reason = (yield `Bạn hãy nhập tóm tắt kết quả và bằng chứng nộp nhiệm vụ “${selected.title}” (tối thiểu 5 ký tự):`).trim();
            }
            return {
              summary: `Nộp kết quả nhiệm vụ “${selected.title}” để chờ nghiệm thu · Nội dung: “${reason}”.`,
              execute: async () => {
                let currentTask = selected;
                const requiredCodes = currentTask.templateSnapshot.steps.filter(s => s.required).map(s => s.code);
                const doneCodes = currentTask.stepProgress.filter(s => s.done).map(s => s.code);
                if (requiredCodes.some(c => !doneCodes.includes(c))) {
                  currentTask = await api.performanceTaskAction(currentTask.id, 'progress', {
                    expectedVersion: currentTask.version,
                    clientRequestId: newClientMessageId(),
                    completedStepCodes: currentTask.templateSnapshot.steps.map(s => s.code),
                    evidenceRefs: [reason],
                  });
                }
                const updated = await api.performanceTaskAction(currentTask.id, 'submit', {
                  expectedVersion: currentTask.version,
                  clientRequestId: newClientMessageId(),
                  reason,
                  evidenceRefs: [reason],
                });
                return `Đã nộp nhiệm vụ “${updated.title}”. Trạng thái: ${performanceLabels[updated.status] ?? updated.status}.`;
              },
            };
          }
          const step = submitFlow();
          await advance(step.next(), step);
          return;
        }

        if (intent === 'task-assign') {
          const storeEmployees = catalog.employees.filter(e => e.storeId === selected.storeId && e.role !== 'SM');
          function* assignFlow(): Step<Plan> {
            let pickedEmp = pickChoice(instruction, storeEmployees, e => e.name)[0];
            while (!pickedEmp) {
              const reply = yield [
                `Chọn nhân sự tại cửa hàng để giao nhiệm vụ “${selected.title}”:`,
                ...storeEmployees.map((e, i) => `${i + 1}. ${e.name} (${e.role})`),
                'Nhắn số thứ tự hoặc tên nhân viên:',
              ].join('\n');
              pickedEmp = pickChoice(reply, storeEmployees, e => e.name)[0];
            }
            const reason = note.trim().length >= 5 ? note.trim() : `Phân công nhiệm vụ ${selected.title} theo kế hoạch vận hành cửa hàng.`;
            return {
              summary: `Giao nhiệm vụ “${selected.title}” cho ${pickedEmp.name} · Lý do: “${reason}”.`,
              execute: async () => {
                const updated = await api.performanceTaskAction(selected.id, 'assign', {
                  expectedVersion: selected.version,
                  clientRequestId: newClientMessageId(),
                  assigneeEmployeeId: pickedEmp.id,
                  reason,
                });
                return `Đã giao nhiệm vụ “${updated.title}” cho ${pickedEmp.name}. Trạng thái: ${performanceLabels[updated.status] ?? updated.status}.`;
              },
            };
          }
          const step = assignFlow();
          await advance(step.next(), step);
          return;
        }

        if (intent === 'task-refusal-decision') {
          function* refusalDecisionFlow(): Step<Plan> {
            let decisionKind: 'VALID' | 'INVALID' = /\b(?:khong hop le|bac|giu)\b/.test(q) ? 'INVALID' : 'VALID';
            let reason = note;
            while (reason.trim().length < 5) {
              const reply = yield `Nhập lý do xử lý từ chối nhiệm vụ “${selected.title}” (gõ kèm “hợp lệ” để hủy việc hoặc “không hợp lệ” để yêu cầu tiếp tục nhận):`;
              if (/\bkhong hop le|bac\b/.test(normalizeText(reply))) decisionKind = 'INVALID';
              else if (/\bhop le\b/.test(normalizeText(reply))) decisionKind = 'VALID';
              reason = reply.trim();
            }
            return {
              summary: `Xử lý từ chối nhiệm vụ “${selected.title}” · Quyết định: ${decisionKind === 'VALID' ? 'Chấp nhận từ chối (Hủy phần việc)' : 'Bác từ chối (Yêu cầu nhận lại)'} · Lý do: “${reason}”.`,
              execute: async () => {
                const updated = await api.performanceTaskAction(selected.id, 'refusal-decision', {
                  expectedVersion: selected.version,
                  clientRequestId: newClientMessageId(),
                  decision: decisionKind,
                  reason,
                  policyRef: decisionKind === 'INVALID' ? 'Quy chế phân công nhiệm vụ vận hành cửa hàng GUTA' : null,
                  evidenceRefs: [reason],
                });
                return `Đã xử lý từ chối nhiệm vụ “${updated.title}”. Trạng thái hiện tại: ${performanceLabels[updated.status] ?? updated.status}.`;
              },
            };
          }
          const step = refusalDecisionFlow();
          await advance(step.next(), step);
          return;
        }

        if (intent === 'task-evaluate') {
          const activeSeg = selected.responsibilitySegments.find(s => s.status !== 'RELEASED') ?? selected.responsibilitySegments[0];
          if (!activeSeg) {
            say('Nhiệm vụ chưa có đoạn trách nhiệm hợp lệ để nghiệm thu.');
            return;
          }
          function* evaluateTaskFlow(): Step<Plan> {
            let reason = note;
            while (reason.trim().length < 5) {
              reason = (yield `Nhập nhận xét nghiệm thu và căn cứ bằng chứng cho nhiệm vụ “${selected.title}” (tối thiểu 5 ký tự):`).trim();
            }
            const criteriaScores = selected.templateSnapshot.qualityCriteria.map(c => ({
              code: c.code,
              score: c.maxScore,
              comment: reason,
              evidenceRefs: [reason],
            }));
            return {
              summary: `Nghiệm thu xác nhận hoàn thành nhiệm vụ “${selected.title}” (100/100 điểm rubric) · Nhận xét: “${reason}”.`,
              execute: async () => {
                const updated = await api.performanceTaskAction(selected.id, 'evaluate', {
                  expectedVersion: selected.version,
                  clientRequestId: newClientMessageId(),
                  segmentId: activeSeg.segmentId,
                  criteriaScores,
                  workCompletedPercent: 100,
                  outcome: 'CONFIRM',
                  employeeFault: false,
                  lateReason: null,
                  reason,
                  evidenceRefs: [reason],
                });
                return `Đã nghiệm thu nhiệm vụ “${updated.title}” · Trạng thái: ${performanceLabels[updated.status] ?? updated.status}.`;
              },
            };
          }
          const step = evaluateTaskFlow();
          await advance(step.next(), step);
          return;
        }
      }

      // ---- EVALUATION DOMAIN ----
      const [dashboard, me] = await Promise.all([api.performanceDashboard(period), fetchMe()]);
      if (signal.aborted) return;
      const employeeId = me.employeeId ?? undefined;
      const evaluations = dashboard.evaluations;

      const current: Session = session.current?.domain === 'evaluation' && session.current.period === period
        ? session.current
        : { domain: 'evaluation', period, taskIds: [], evaluationIds: [] };
      session.current = current;

      if (intent === 'eval-list' || intent === 'eval-pending') {
        const filtered = evaluations.filter(e => {
          if (/\b(?:cua toi|cua minh|cua em)\b/.test(q) && e.employeeId !== employeeId) return false;
          if (intent === 'eval-pending') {
            if (e.employeeId === employeeId && (['OPEN', 'SELF_REVIEW'].includes(e.evaluationStatus) || (e.evaluationStatus === 'PROVISIONAL' && !e.reconsideration))) return true;
            if (e.evaluatorEmployeeId === employeeId && (['OPEN', 'SELF_REVIEW', 'MANAGER_REVIEW'].includes(e.evaluationStatus) || e.reconsideration?.status === 'REQUESTED')) return true;
            if (can('performance_kpi.appeal_review') && e.appeal && ['REQUESTED', 'IN_REVIEW', 'RETURNED'].includes(e.appeal.status)) return true;
            return false;
          }
          return true;
        });
        current.evaluationIds = filtered.map(e => e.id);
        current.selectedId = filtered.length === 1 ? filtered[0].id : undefined;
        if (!filtered.length) {
          say(`Kỳ ${period} hiện không có phiếu đánh giá KPI hiệu suất nào trong danh sách này.`);
          return;
        }
        say([
          `KPI hiệu suất · Kỳ ${period} (${filtered.length} hồ sơ):`,
          ...filtered.map((e, i) => {
            const disputeTag = e.appeal ? ` · Khiếu nại: ${e.appeal.status}` : e.reconsideration ? ` · Kiến nghị: ${e.reconsideration.status}` : '';
            return `${i + 1}. ${e.employeeName} (${e.role} · ${e.storeName}) · ${performanceLabels[e.evaluationStatus] ?? e.evaluationStatus} · Điểm: ${performanceNumber(e.finalScore)}/100${disputeTag}`;
          }),
          '\nNhắn “xem mục 1”, “tự nhận xét mục 1”, “chấm điểm mục 1”, “công bố mục 1”, “kiến nghị mục 1”, “phản hồi kiến nghị mục 1” hoặc “khiếu nại mục 1”.',
        ].join('\n'));
        return;
      }

      const ordered = current.evaluationIds.map(id => evaluations.find(e => e.id === id)).filter((e): e is PerformanceEvaluation => !!e);
      const candidates = ordered.length ? ordered : evaluations;
      const picked = pickChoice(instruction, candidates, e => `${e.employeeName} ${e.storeName}`);
      const ownEval = evaluations.find(e => e.employeeId === employeeId);
      const selected = picked[0]
        ?? (current.selectedId ? evaluations.find(e => e.id === current.selectedId) : undefined)
        ?? (['eval-self-review', 'eval-reconsider', 'eval-appeal'].includes(intent) && ownEval ? ownEval : undefined)
        ?? (candidates.length === 1 ? candidates[0] : undefined);

      if (!selected) {
        current.evaluationIds = candidates.map(e => e.id);
        say([
          `Bạn muốn chọn hồ sơ KPI hiệu suất nào trong kỳ ${period}?`,
          ...candidates.slice(0, 10).map((e, i) => `${i + 1}. ${e.employeeName} (${e.storeName}) · ${performanceLabels[e.evaluationStatus] ?? e.evaluationStatus} · ${performanceNumber(e.finalScore)}/100`),
          'Hãy nhắn kèm số thứ tự, ví dụ “xem mục 1”.',
        ].join('\n'));
        return;
      }
      current.selectedId = selected.id;

      if (intent === 'eval-detail') {
        const explained = await api.performanceExplain(selected.id);
        say([
          explained.summary,
          ...(explained.advice ?? []),
          selected.history.length ? `Chuỗi băm kiểm toán · Block #${selected.history.length} · SHA-256 ${selected.history[selected.history.length - 1].hash.slice(0, 12)}...` : '',
        ].filter(Boolean).join('\n'));
        return;
      }

      if (intent === 'eval-score') {
        if (onOpenKpiAction) {
          onOpenKpiAction({ id: selected.id, period: selected.period, kind: 'detail' });
          say(`Đã mở bảng chấm điểm theo tiêu chí cho ${selected.employeeName} (Kỳ ${selected.period}).`);
          return;
        }
      }

      if (intent === 'eval-self-review') {
        function* selfReviewFlow(): Step<Plan> {
          let reviewText = note;
          while (reviewText.trim().length < 5) {
            reviewText = (yield `Bạn hãy nhập nội dung tự nhận xét kết quả công việc kỳ ${selected.period} (tối thiểu 5 ký tự):`).trim();
          }
          return {
            summary: `Gửi tự nhận xét KPI hiệu suất kỳ ${selected.period} của ${selected.employeeName}: “${reviewText}”.`,
            execute: async () => {
              const updated = await api.performanceEvaluationAction(selected.id, 'self-review', {
                expectedVersion: selected.version,
                clientRequestId: newClientMessageId(),
                text: reviewText,
                evidenceRefs: [`Tự nhận xét qua Chat: ${reviewText}`],
              });
              return `Đã lưu tự nhận xét cho kỳ ${updated.period}. Trạng thái hiện tại: ${performanceLabels[updated.evaluationStatus] ?? updated.evaluationStatus}.`;
            },
          };
        }
        const step = selfReviewFlow();
        await advance(step.next(), step);
        return;
      }

      if (intent === 'eval-finalize') {
        const nextLabel = selected.evaluationStatus === 'MANAGER_REVIEW' ? 'Công bố điểm tạm tính (PROVISIONAL)' : 'Chốt điểm chính thức (FINAL)';
        const reason = note.trim().length >= 5 ? note.trim() : `Xác nhận ${nextLabel.toLowerCase()} sau khi đối chiếu đầy đủ bằng chứng.`;
        const plan: Plan = {
          summary: `${nextLabel} cho hồ sơ ${selected.employeeName} (Kỳ ${selected.period} · Điểm hiện tại ${performanceNumber(selected.finalScore)}/100) · Lý do: “${reason}”.`,
          execute: async () => {
            const updated = await api.performanceEvaluationAction(selected.id, 'finalize', {
              expectedVersion: selected.version,
              clientRequestId: newClientMessageId(),
              reason,
              evidenceRefs: [reason],
            });
            return `Đã cập nhật hồ sơ ${updated.employeeName} sang trạng thái: ${performanceLabels[updated.evaluationStatus] ?? updated.evaluationStatus} (${performanceNumber(updated.finalScore)}/100).`;
          },
        };
        decision.current = { plan };
        say(`${plan.summary}\n\nNhắn “xác nhận” để thực hiện hoặc “hủy” để dừng.`);
        return;
      }

      if (intent === 'eval-reconsider') {
        function* reconsiderFlow(): Step<Plan> {
          let reason = note;
          while (reason.trim().length < 5) {
            reason = (yield `Nhập lý do và căn cứ kiến nghị xem xét lại điểm KPI hiệu suất kỳ ${selected.period} của ${selected.employeeName}:`).trim();
          }
          const criterionCodes = selected.criteriaScores.map(c => c.code);
          return {
            summary: `Gửi kiến nghị xem xét lại điểm KPI hiệu suất kỳ ${selected.period} (${selected.employeeName}) · Lý do: “${reason}”.`,
            execute: async () => {
              const updated = await api.performanceEvaluationAction(selected.id, 'reconsideration', {
                expectedVersion: selected.version,
                clientRequestId: newClientMessageId(),
                reason,
                evidenceRefs: [reason],
                criterionCodes: criterionCodes.length ? criterionCodes : ['service'],
                taskIds: selected.taskBreakdown.map(t => t.taskId),
              });
              return `Đã gửi kiến nghị cho kỳ ${updated.period}. Trạng thái: ${performanceLabels[updated.evaluationStatus] ?? updated.evaluationStatus}.`;
            },
          };
        }
        const step = reconsiderFlow();
        await advance(step.next(), step);
        return;
      }

      if (intent === 'eval-reconsider-response') {
        const isSelf = selected.employeeId === employeeId;
        const decisionKind = isSelf
          ? (/\brut\b/.test(q) ? 'WITHDRAWN' : 'ACCEPTED')
          : 'UPHELD';
        function* reconsiderResponseFlow(): Step<Plan> {
          let reason = note;
          while (reason.trim().length < 5) {
            reason = (yield `Nhập nội dung phản hồi kiến nghị cho hồ sơ ${selected.employeeName} (tối thiểu 5 ký tự):`).trim();
          }
          return {
            summary: `Phản hồi kiến nghị hồ sơ ${selected.employeeName} · Quyết định: ${decisionKind} · Nội dung: “${reason}”.`,
            execute: async () => {
              const updated = await api.performanceEvaluationAction(selected.id, 'reconsideration-response', {
                expectedVersion: selected.version,
                clientRequestId: newClientMessageId(),
                decision: decisionKind,
                reason,
                evidenceRefs: [reason],
              });
              return `Đã ghi nhận phản hồi kiến nghị cho ${updated.employeeName}. Trạng thái: ${performanceLabels[updated.evaluationStatus] ?? updated.evaluationStatus}.`;
            },
          };
        }
        const step = reconsiderResponseFlow();
        await advance(step.next(), step);
        return;
      }

      if (intent === 'eval-appeal') {
        function* appealFlow(): Step<Plan> {
          let reason = note;
          while (reason.trim().length < 5) {
            reason = (yield `Nhập lý do và bằng chứng gửi khiếu nại độc lập lên cấp trên (AM/HR) cho kỳ ${selected.period}:`).trim();
          }
          const criterionCodes = selected.criteriaScores.map(c => c.code);
          return {
            summary: `Gửi khiếu nại độc lập KPI hiệu suất kỳ ${selected.period} (${selected.employeeName}) · Lý do: “${reason}”.`,
            execute: async () => {
              const updated = await api.performanceEvaluationAction(selected.id, 'appeal', {
                expectedVersion: selected.version,
                clientRequestId: newClientMessageId(),
                reason,
                evidenceRefs: [reason],
                criterionCodes: criterionCodes.length ? criterionCodes : ['service'],
                taskIds: selected.taskBreakdown.map(t => t.taskId),
              });
              return `Đã gửi khiếu nại độc lập cho kỳ ${updated.period}. Trạng thái: ${performanceLabels[updated.evaluationStatus] ?? updated.evaluationStatus}.`;
            },
          };
        }
        const step = appealFlow();
        await advance(step.next(), step);
        return;
      }

      if (intent === 'eval-appeal-decision') {
        const decisionKind = /\btra ve|cham lai\b/.test(q) ? 'RETURNED' : 'UPHELD';
        function* appealDecisionFlow(): Step<Plan> {
          let reason = note;
          while (reason.trim().length < 5) {
            reason = (yield `Nhập kết luận giải quyết khiếu nại cho hồ sơ ${selected.employeeName} (tối thiểu 5 ký tự):`).trim();
          }
          return {
            summary: `Giải quyết khiếu nại KPI hiệu suất của ${selected.employeeName} · Quyết định: ${decisionKind === 'RETURNED' ? 'Trả về người chấm đánh giá lại' : 'Giữ nguyên kết quả'} · Kết luận: “${reason}”.`,
            execute: async () => {
              const updated = await api.performanceEvaluationAction(selected.id, 'appeal-decision', {
                expectedVersion: selected.version,
                clientRequestId: newClientMessageId(),
                decision: decisionKind,
                reason,
                evidenceRefs: [reason],
              });
              return `Đã ban hành quyết định giải quyết khiếu nại cho ${updated.employeeName}. Trạng thái: ${performanceLabels[updated.evaluationStatus] ?? updated.evaluationStatus}.`;
            },
          };
        }
        const step = appealDecisionFlow();
        await advance(step.next(), step);
        return;
      }
    }

    void respond()
      .catch(error => say(error instanceof Error ? error.message : 'Chưa xử lý được yêu cầu công việc / KPI hiệu suất.'))
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
