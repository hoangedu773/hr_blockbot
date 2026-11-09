import { RevenueKpiOpenActionSchema, RevenueKpiOpenPreviewSchema, RevenueKpiPolicySchema,
  type RevenueKpiAssignment, type RevenueKpiDashboard, type RevenueKpiResult } from '@hr-blockbot/contracts';
import { newClientMessageId, requestJson } from '../../services/api';
import * as api from '../../services/revenue-kpi-api';
import { pickRevenueChoice, revenueParts, revenueText, type RevenueIntent } from './revenue-chat-intent';

type Assignment = RevenueKpiAssignment;
type Candidate = RevenueKpiDashboard['candidates'][number];
type Step<T> = Generator<string, T, string>;
type Plan = { summary: string; readOnly?: boolean; execute: (signal: AbortSignal) => Promise<string> };
export type { Plan, Step };

const monthFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit' });
const numberFormat = new Intl.NumberFormat('vi-VN');
export const currentRevenueMonth = () => monthFormat.format(new Date()).slice(0, 7);
export const revenueMoney = (value: number | null) => value === null ? 'chưa có số liệu' : numberFormat.format(value) + ' ₫';
export const unitName = (a: Assignment) => a.unitType === 'STORE' ? a.stores[0].storeName : 'Khu vực của ' + a.assigneeName;
export const assignmentStatus: Record<Assignment['status'], string> = {
  DRAFT: 'Nháp', PENDING_ACCEPTANCE: 'Chờ nhận', ACCEPTED: 'Đã nhận', REFUSED: 'Đã từ chối',
  HR_REVIEW: 'Chờ HR xử lý', ACTIVE: 'Đang thực hiện', ADJUSTMENT_REQUESTED: 'Chờ điều chỉnh', CLOSED: 'Đã chốt', CANCELLED: 'Đã hủy',
};
export const resultStatus: Record<RevenueKpiResult['status'], string> = {
  PENDING: 'Chờ tính', PENDING_DATA: 'Thiếu dữ liệu', COMPUTED: 'Đã tính', AWAITING_REASON: 'Chờ giải trình',
  CONFIRMED: 'Đã xác nhận', CORRECTED: 'Đã điều chỉnh',
};
export const periodStatus = { DRAFT: 'Nháp', OPEN: 'Đang mở', CLOSED: 'Đã chốt', ARCHIVED: 'Đã lưu trữ' };
const command = (expectedVersion: number) => ({ expectedVersion, clientRequestId: newClientMessageId() });
const post = (body: unknown) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const resultFor = (d: RevenueKpiDashboard, a: Assignment) => d.results.find(result => result.assignmentId === a.id);

export function closeBlockers(d: RevenueKpiDashboard) {
  const blockers: string[] = [];
  if (d.period.status !== 'OPEN') blockers.push('Kỳ chưa mở hoặc đã được chốt.');
  if (d.period.period >= currentRevenueMonth()) blockers.push('Chưa hết tháng theo giờ Việt Nam.');
  const rows = d.assignments.filter(a => a.status !== 'CANCELLED');
  if (!rows.length) blockers.push('Kỳ chưa có KPI.');
  for (const a of rows) {
    const r = resultFor(d, a);
    if (!['ACTIVE', 'CLOSED'].includes(a.status)) blockers.push(`${unitName(a)} · ${assignmentStatus[a.status]}`);
    else if (!r || r.status !== 'CONFIRMED' || (a.status !== 'CLOSED' && r.assignmentVersion !== a.version))
      blockers.push(`${unitName(a)} · ${r ? resultStatus[r.status] : 'Chưa tính kết quả'}${r?.status === 'CONFIRMED' ? ', cần đối soát phiên bản mới' : ''}`);
  }
  return blockers;
}

export function eligibleResults(d: RevenueKpiDashboard) {
  if (d.period.status !== 'OPEN' || d.period.period >= currentRevenueMonth()) return [];
  return d.results.filter(r => {
    const a = d.assignments.find(row => row.id === r.assignmentId);
    return a?.status === 'ACTIVE' && a.version === r.assignmentVersion && r.actualRevenueVnd !== null
      && ['COMPUTED', 'AWAITING_REASON'].includes(r.status)
      && (r.achieved === true || r.missReason?.reviewDecision === 'ACKNOWLEDGED');
  });
}

export function* choose<T>(items: T[], label: (item: T) => string, prompt: string): Step<T> {
  if (!items.length) throw new Error('Không có mục phù hợp trong phạm vi được cấp.');
  if (items.length === 1) return items[0];
  const list = items.map((item, index) => `${index + 1}. ${label(item)}`).join('\n');
  let answer = yield `${prompt}\n\n${list}\n\nBạn có thể nhập số hoặc tên.`;
  for (;;) {
    const matches = pickRevenueChoice(answer, items, label);
    if (matches.length === 1) return matches[0];
    answer = yield `Mình chưa xác định được một mục duy nhất.\n\n${list}`;
  }
}

function* note(question: string, supplied = ''): Step<string> {
  let text = supplied.trim() || (yield question).trim();
  while (text.length < 5) text = (yield 'Bạn ghi ít nhất 5 ký tự giúp mình nhé.').trim();
  return text;
}

type Target = { targetMode: 'ABSOLUTE_VND'; targetVnd: number } | { targetMode: 'GROWTH_PERCENT'; growthPercent: number };
function parseTarget(input: string): Target | null {
  const normalized = revenueText(input);
  const percent = normalized.match(/([+-]?\d+(?:[.,]\d+)?)\s*%/);
  if (percent) {
    const growthPercent = Number(percent[1].replace(',', '.')) * (/\bgiam\b/.test(normalized) && Number(percent[1]) > 0 ? -1 : 1);
    if (growthPercent >= -50 && growthPercent <= 100) return { targetMode: 'GROWTH_PERCENT', growthPercent };
    return null;
  }
  const scale = normalized.match(/(\d+(?:[.,]\d+)?)\s*(ty|trieu|nghin|ngan|k)\b/);
  const digits = normalized.match(/(?:^|\s)(\d{1,3}(?:[., ]\d{3})+|\d+)(?=\s|₫|đ|$)/);
  const targetVnd = scale
    ? Math.round(Number(scale[1].replace(',', '.')) * (scale[2] === 'ty' ? 1e9 : scale[2] === 'trieu' ? 1e6 : 1e3))
    : digits ? Number(digits[1].replace(/[., ]/g, '')) : 0;
  return Number.isSafeInteger(targetVnd) && targetVnd > 0 ? { targetMode: 'ABSOLUTE_VND', targetVnd } : null;
}

function* target(question = 'Bạn muốn giao bao nhiêu? Ví dụ “12 triệu” hoặc “tăng 3%”.', supplied = ''): Step<Target> {
  let parsed = parseTarget(supplied);
  while (!parsed) parsed = parseTarget(yield question);
  return parsed;
}
const targetLabel = (t: Target) => t.targetMode === 'ABSOLUTE_VND' ? revenueMoney(t.targetVnd) : `${t.growthPercent}% so với tháng trước`;
const targetChange = (t: Target) => t.targetMode === 'ABSOLUTE_VND' ? { newTargetVnd: t.targetVnd } : { newGrowthPercent: t.growthPercent };
const inlineTarget = (text: string) => revenueParts(text).instruction.match(/(?:mức|muc|thành|thanh|lên|len|xuống|xuong)\s+([^;]+?)(?:\s*(?:;|$))/i)?.[1] ?? '';

function action(summary: string, run: () => Promise<unknown>, reply = 'Đã lưu thay đổi KPI doanh thu.'): Plan {
  return { summary, execute: async () => { await run(); return reply; } };
}

export async function openRevenuePlan(period: string): Promise<Plan> {
  const path = '/revenue-kpi/periods/' + encodeURIComponent(period);
  const preview = RevenueKpiOpenPreviewSchema.parse(await requestJson(path + '/open-preview'));
  const blockers = preview.items.filter(item => item.status === 'BLOCKED');
  return {
    summary: [`Kỳ ${period} · ${preview.summary.create} bản nháp dự kiến tạo · ${preview.summary.skipped} đã có · ${preview.summary.blocked} còn vướng.`,
      ...blockers.map(item => `• ${item.label} · ${item.message ?? item.fixHint ?? 'Cần kiểm tra'}`)].join('\n'),
    execute: async () => {
      const proposal = RevenueKpiOpenActionSchema.parse(await requestJson(path + '/open-proposal', post({})));
      if (proposal.preview.planDigest !== preview.planDigest || proposal.preview.version !== preview.version) throw new Error('Kế hoạch vừa thay đổi. Hãy yêu cầu xem trước lại.');
      const result = RevenueKpiOpenActionSchema.parse(await requestJson('/chat/actions/' + proposal.actionId + '/decision',
        post({ approve: true, expectedVersion: preview.version, planDigest: preview.planDigest, clientRequestId: newClientMessageId() })));
      if (!result.result) throw new Error('Chưa nhận được kết quả mở kỳ.');
      const s = result.result.summary;
      return `Đã xử lý kỳ ${period} · ${s.created} bản nháp tạo mới · ${s.skipped} bỏ qua · ${s.blocked} còn vướng · ${s.failed} lỗi lưu.`;
    },
  };
}

export function* createRevenuePlan(period: string): Step<Plan> {
  let policy;
  while (!policy) {
    const reply = revenueText(yield 'Dùng cấu hình mặc định hay tùy chỉnh? Mặc định là tăng 3%, ngưỡng cửa hàng chưa đạt 30%, hạn nhận 3 ngày làm việc, dùng POS thật. Bạn có thể nhắn “mặc định” hoặc “tăng 5%, ngưỡng 25%, hạn 4 ngày, dùng dữ liệu demo”.');
    const growth = reply.match(/tang\s*(-?\d+(?:[.,]\d+)?)\s*%/);
    const threshold = reply.match(/nguong\s*(\d+(?:[.,]\d+)?)\s*%/);
    const days = reply.match(/han\s*(\d+)\s*ngay/);
    const allowDemoData = /(?:dung|cho phep) (?:du lieu |pos )?demo/.test(reply) && !/khong (?:dung|cho phep)/.test(reply);
    if (!/mac dinh/.test(reply) && !growth && !threshold && !days && !allowDemoData) continue;
    const parsed = RevenueKpiPolicySchema.safeParse({
      defaultGrowthPercent: growth ? Number(growth[1].replace(',', '.')) : undefined,
      underperformingRateThresholdPercent: threshold ? Number(threshold[1].replace(',', '.')) : undefined,
      acceptanceWindowWorkingDays: days ? Number(days[1]) : undefined, allowDemoData,
      aiProposalEnabled: !/tat ai|khong dung ai/.test(reply),
    });
    if (parsed.success) policy = parsed.data;
  }
  const selected = policy;
  return action(`Tạo kỳ nháp ${period} · tăng ${selected.defaultGrowthPercent}% · ngưỡng ${selected.underperformingRateThresholdPercent}% · hạn nhận ${selected.acceptanceWindowWorkingDays} ngày làm việc · ${selected.allowDemoData ? 'cho phép POS demo' : 'POS thật'} · AI ${selected.aiProposalEnabled ? 'bật' : 'tắt'}.`,
    () => api.createRevenueKpiPeriod({ ...command(0), period, policy: selected }), `Đã tạo kỳ nháp ${period}. Bạn có thể nhắn “mở kỳ”.`);
}

function saveDraft(d: RevenueKpiDashboard, a: Assignment | undefined, candidate: Candidate, storeId: string | undefined, chosen: Target | undefined, reason: string) {
  return api.saveRevenueKpiAssignment({
    ...command(a?.version ?? 0), ...(a ? { id: a.id } : {}), period: d.period.period,
    unitType: candidate.role === 'SM' ? 'STORE' : 'AREA', ...(storeId ? { storeId } : {}),
    assigneeEmployeeId: candidate.employeeId, ...(chosen ?? { targetMode: 'ABSOLUTE_VND' }), reason,
  });
}

export function* draftRevenuePlan(d: RevenueKpiDashboard, prompt: string, a?: Assignment): Step<Plan> {
  const { instruction, note: supplied } = revenueParts(prompt);
  const input = revenueText(instruction);
  let area = a ? a.unitType === 'AREA' : /khu vuc|\bam\b/.test(input);
  if (!a && !area && !/cua hang|chi nhanh|\bsm\b/.test(input) && !pickRevenueChoice(input, d.stores, s => s.name).length) {
    area = (yield* choose(['Cửa hàng', 'Khu vực'], item => item, 'Bạn muốn tạo KPI cửa hàng hay khu vực?')) === 'Khu vực';
  }
  let store = d.stores.find(s => s.id === a?.storeId);
  if (!area && !store) {
    const available = d.stores.filter(s => s.smEmployeeIds.length && !d.assignments.some(row => row.storeId === s.id));
    const named = pickRevenueChoice(instruction, available, s => s.name);
    store = named.length === 1 ? named[0] : yield* choose(named.length ? named : available, s => s.name, 'Bạn muốn giao cho cửa hàng nào?');
  }
  const candidates = d.candidates.filter(c => c.role === (area ? 'AM' : 'SM') && (area || store?.smEmployeeIds.includes(c.employeeId)));
  const named = pickRevenueChoice(instruction, candidates, c => c.name);
  const candidate = named.length === 1 ? named[0] : yield* choose(named.length ? named : candidates, c => c.name, 'Ai sẽ phụ trách KPI này?');
  const chosen = area ? undefined : yield* target(undefined, inlineTarget(prompt));
  const reason = yield* note('Bạn ghi lý do giao hoặc sửa mục tiêu giúp mình nhé.', supplied);
  const summary = `${a ? 'Sửa bản nháp' : 'Tạo bản nháp'} ${d.period.period} · ${store?.name ?? 'Khu vực'} · ${candidate.name} · ${chosen ? targetLabel(chosen) : 'tổng chỉ tiêu các cửa hàng phụ trách'}.\nLý do · ${reason}`;
  return action(summary, () => saveDraft(d, a, candidate, store?.id, chosen, reason));
}

export function computeOrClose(d: RevenueKpiDashboard, close: boolean): Plan {
  const p = d.period;
  const blockers = close ? closeBlockers(d) : [];
  if (blockers.length) throw new Error(`Kỳ ${p.period} còn ${blockers.length} mục chặn chốt.\n${blockers.map(item => '• ' + item).join('\n')}`);
  const fingerprint = (data: RevenueKpiDashboard) => JSON.stringify({
    assignments: data.assignments.map(a => a.id + ':' + a.version).sort(),
    results: data.results.map(r => r.id + ':' + r.version).sort(),
  });
  return action(close ? `Chốt kỳ ${p.period} và khóa ${d.assignments.filter(a => a.status !== 'CANCELLED').length} KPI đã xác nhận.`
    : `Tính kết quả kỳ ${p.period} từ sổ POS cho ${d.assignments.filter(a => a.status === 'ACTIVE').length} KPI đang chạy.`,
  async () => {
    if (close) {
      const fresh = await api.getRevenueKpiDashboard(p.period);
      if (fresh.period.version !== p.version || fingerprint(fresh) !== fingerprint(d)) throw new Error('Kết quả vừa thay đổi. Hãy yêu cầu xem trước kỳ này lại.');
      await api.closeRevenueKpiPeriod(p.period, command(p.version));
    } else await api.computeRevenueKpiPeriod(p.period, command(p.version));
  }, close ? `Đã chốt kỳ ${p.period}.` : `Đã tính kết quả kỳ ${p.period}. Bạn có thể hỏi “kỳ này còn gì cần xử lý?”.`);
}

function applyAi(d: RevenueKpiDashboard, a: Assignment) {
  const growthPercent = a.aiProposal?.suggestedGrowthPercent;
  if (growthPercent == null) throw new Error('Bản nháp này chưa có mức tăng do AI đề xuất.');
  const candidate = d.candidates.find(c => c.employeeId === a.assigneeEmployeeId);
  if (!candidate || !a.storeId) throw new Error('Cửa hàng hoặc người phụ trách không còn hợp lệ.');
  return saveDraft(d, a, candidate, a.storeId, { targetMode: 'GROWTH_PERCENT', growthPercent }, 'HR áp dụng đề xuất tham khảo sau xem xét.');
}

export function bulkRevenuePlan(d: RevenueKpiDashboard, intent: 'ai' | 'apply-ai' | 'publish' | 'confirm', scope: Assignment[]): Plan {
  const ids = new Set(scope.map(a => a.id));
  const targets = intent === 'confirm' ? eligibleResults(d).filter(r => ids.has(r.assignmentId)).map(r => ({ id: r.id, version: r.version, name: unitName(d.assignments.find(a => a.id === r.assignmentId)!) }))
    : scope.filter(a => a.status === 'DRAFT' && (intent === 'publish' || (a.unitType === 'STORE' && (intent === 'ai' || a.aiProposal?.suggestedGrowthPercent != null))))
      .sort((a, b) => Number(a.unitType === 'AREA') - Number(b.unitType === 'AREA'))
      .map(a => ({ id: a.id, version: a.version, name: unitName(a) }));
  if (!targets.length) throw new Error('Không có mục nào đủ điều kiện để thực hiện hàng loạt.');
  const labels = { ai: 'Lấy đề xuất AI', 'apply-ai': 'Áp dụng đề xuất vào bản nháp', publish: 'Phát hành', confirm: 'Xác nhận kết quả' };
  return {
    summary: `${labels[intent]} cho ${targets.length} mục kỳ ${d.period.period}.\n${targets.map(t => '• ' + t.name).join('\n')}`,
    execute: async signal => {
      const failures: string[] = [];
      let success = 0;
      for (const t of targets) {
        if (signal.aborted) break;
        try {
          const a = d.assignments.find(row => row.id === t.id);
          if (intent === 'confirm') await api.confirmRevenueKpiResult(t.id, command(t.version));
          else if (intent === 'ai') await api.proposeRevenueKpiTarget(t.id, command(t.version));
          else if (intent === 'apply-ai') await applyAi(d, a!);
          else if (a?.unitType === 'AREA') {
            const candidate = d.candidates.find(c => c.employeeId === a.assigneeEmployeeId);
            if (!candidate) throw new Error('AM không còn trong danh mục.');
            const synced = await saveDraft(d, a, candidate, undefined, undefined, 'HR đồng bộ mục tiêu cửa hàng trước khi phát hành.');
            await api.publishRevenueKpiAssignment(synced.id, command(synced.version));
          } else await api.publishRevenueKpiAssignment(t.id, command(t.version));
          success++;
        } catch (error) {
          failures.push(`• ${t.name} · ${error instanceof Error ? error.message : 'Chưa xử lý được'}`);
        }
      }
      return [`${labels[intent]} · ${success}/${targets.length} thành công.`, ...failures].join('\n');
    },
  };
}

const labels = {
  edit: 'Sửa bản nháp', publish: 'Phát hành KPI', accept: 'Chấp nhận KPI', refuse: 'Từ chối nhận KPI',
  keep: 'Giữ nguyên mục tiêu và kích hoạt KPI', force: 'Kích hoạt KPI theo quyết định của HR',
  'cancel-target': 'Hủy KPI', 'adjust-target': 'Đổi mục tiêu và yêu cầu xác nhận lại',
  request: 'Gửi yêu cầu điều chỉnh', verify: 'AM xác minh yêu cầu điều chỉnh',
  'approve-adjustment': 'Duyệt điều chỉnh và yêu cầu xác nhận lại', 'reject-adjustment': 'Từ chối điều chỉnh',
  responsibility: 'Đổi SM phụ trách', 'miss-reason': 'Gửi giải trình chưa đạt',
  'review-reason': 'Ghi nhận giải trình', 'return-reason': 'Trả lại giải trình',
  confirm: 'Xác nhận kết quả', waive: 'Xác nhận kết quả và miễn giải trình', correct: 'Điều chỉnh kết quả sau chốt',
  ai: 'Lấy đề xuất AI', 'apply-ai': 'Áp dụng đề xuất vào bản nháp',
};
export type UnitIntent = keyof typeof labels;
export const isUnitIntent = (intent: RevenueIntent): intent is UnitIntent => Object.prototype.hasOwnProperty.call(labels, intent);

export function canUseUnit(d: RevenueKpiDashboard, a: Assignment, intent: UnitIntent, employeeId?: string) {
  const own = a.assigneeEmployeeId === employeeId;
  const r = resultFor(d, a);
  if (intent === 'correct') return d.period.status === 'CLOSED' && !!r && ['CONFIRMED', 'CORRECTED'].includes(r.status);
  if (d.period.status !== 'OPEN') return false;
  switch (intent) {
    case 'accept':
    case 'refuse': return own && a.status === 'PENDING_ACCEPTANCE';
    case 'request': return own && a.status === 'ACTIVE';
    case 'verify': return !own && a.unitType === 'STORE' && a.adjustment?.status === 'PENDING';
    case 'approve-adjustment': return a.status === 'ADJUSTMENT_REQUESTED'
      && (a.unitType === 'AREA' ? a.adjustment?.status === 'PENDING' : a.adjustment?.status === 'VERIFIED');
    case 'reject-adjustment': return a.status === 'ADJUSTMENT_REQUESTED';
    case 'publish':
    case 'edit': return a.status === 'DRAFT';
    case 'ai': return a.unitType === 'STORE' && a.status === 'DRAFT' && d.period.policy.aiProposalEnabled;
    case 'apply-ai': return a.unitType === 'STORE' && a.status === 'DRAFT' && a.aiProposal?.suggestedGrowthPercent != null;
    case 'responsibility': return a.unitType === 'STORE' && ['ACTIVE', 'PENDING_ACCEPTANCE'].includes(a.status);
    case 'keep':
    case 'force':
    case 'adjust-target': return ['HR_REVIEW', 'REFUSED', 'PENDING_ACCEPTANCE'].includes(a.status);
    case 'cancel-target': return ['DRAFT', 'PENDING_ACCEPTANCE', 'ACTIVE', 'HR_REVIEW', 'REFUSED', 'ADJUSTMENT_REQUESTED'].includes(a.status);
    case 'miss-reason': return own && r?.achieved === false && ['AWAITING_REASON', 'COMPUTED'].includes(r.status);
    case 'review-reason':
    case 'return-reason': return r?.status === 'COMPUTED' && !!r.missReason;
    case 'confirm': return !!r && eligibleResults(d).some(row => row.id === r.id);
    case 'waive': return d.period.period < currentRevenueMonth() && !!r && a.status === 'ACTIVE' && r.assignmentVersion === a.version
      && r.achieved === false && r.actualRevenueVnd !== null && ['AWAITING_REASON', 'COMPUTED'].includes(r.status);
  }
}

export function* unitRevenuePlan(d: RevenueKpiDashboard, a: Assignment, intent: UnitIntent, prompt: string): Step<Plan> {
  const title = `${labels[intent]} · ${unitName(a)} · kỳ ${a.period}`;
  const r = resultFor(d, a);
  const { instruction, note: supplied } = revenueParts(prompt);
  switch (intent) {
    case 'edit': return yield* draftRevenuePlan(d, prompt, a);
    case 'accept': return action(title, () => api.acceptRevenueKpiAssignment(a.id, command(a.version)), 'Đã chấp nhận KPI doanh thu.');
    case 'publish': return action(`${title} · ${revenueMoney(a.targetVnd)}`, () => api.publishRevenueKpiAssignment(a.id, command(a.version)), 'Đã phát hành KPI và gửi yêu cầu nhận cho người phụ trách.');
    case 'ai': return {
      summary: title,
      execute: async () => {
        const updated = await api.proposeRevenueKpiTarget(a.id, command(a.version));
        const proposal = updated.aiProposal;
        return proposal?.suggestedGrowthPercent == null
          ? 'Dữ liệu lịch sử chưa đủ để đề xuất mục tiêu.'
          : `Đề xuất tăng trưởng ${proposal.suggestedGrowthPercent}%.\n${proposal.rationale ?? ''}\nBạn có thể nhắn “áp dụng đề xuất AI” để xem trước thay đổi bản nháp.`;
      },
    };
    case 'apply-ai': return action(`${title} · tăng trưởng ${a.aiProposal!.suggestedGrowthPercent}%`, () => applyAi(d, a), 'Đã áp dụng đề xuất vào bản nháp. Bạn có thể sửa hoặc phát hành riêng.');
    case 'confirm': return action(`${title} · thực tế ${revenueMoney(r!.actualRevenueVnd)}`, () => api.confirmRevenueKpiResult(r!.id, command(r!.version)), 'Đã xác nhận kết quả KPI.');
    case 'responsibility': {
      const candidates = d.candidates.filter(c => c.role === 'SM' && c.employeeId !== a.assigneeEmployeeId && c.storeIds.includes(a.storeId!));
      const named = pickRevenueChoice(instruction, candidates, c => c.name);
      const candidate = named.length === 1 ? named[0] : yield* choose(named.length ? named : candidates, c => c.name, 'Bạn chọn SM tiếp nhận KPI này.');
      let effectiveAt: string | undefined;
      while (!effectiveAt) {
        const reply = revenueText(yield 'Thời điểm bàn giao là lúc nào? Nhập “bây giờ”, hoặc ngày và giờ theo dạng 09/11/2026 15:00.');
        if (/^(?:bay gio|hien tai|ngay bay gio)$/.test(reply)) effectiveAt = new Date().toISOString();
        const date = reply.match(/^(\d{1,2})\/(\d{1,2})\/(20\d{2})\s+(\d{1,2}):(\d{2})$/);
        if (date) {
          const iso = `${date[3]}-${date[2].padStart(2, '0')}-${date[1].padStart(2, '0')}T${date[4].padStart(2, '0')}:${date[5]}:00+07:00`;
          const time = Date.parse(iso);
          if (Number.isFinite(time) && time <= Date.now() && new Date(time + 7 * 3600000).toISOString().slice(0, 16) === iso.slice(0, 16)) effectiveAt = new Date(time).toISOString();
        }
      }
      const reason = yield* note('Bạn ghi lý do đổi SM phụ trách.', supplied);
      const from = effectiveAt;
      return action(`${title} · người nhận ${candidate.name} · ${new Date(from).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}\nLý do · ${reason}`,
        () => api.changeRevenueKpiResponsibility(a.id, { ...command(a.version), assigneeEmployeeId: candidate.employeeId, from, reason }));
    }
  }
  const reason = yield* note(intent === 'miss-reason' ? 'Bạn mô tả vì sao KPI chưa đạt.' : 'Bạn ghi lý do hoặc ghi chú cho thao tác này.', supplied);
  const summary = `${title}\n${intent === 'miss-reason' ? 'Giải trình' : 'Lý do'} · ${reason}`;
  switch (intent) {
    case 'refuse': return action(summary, () => api.refuseRevenueKpiAssignment(a.id, { ...command(a.version), reason }));
    case 'request': {
      const evidenceRef = yield* note('Bạn nhập link, mã biên bản hoặc mô tả bằng chứng kèm theo.');
      return action(`${summary}\nBằng chứng · ${evidenceRef}`, () => api.requestRevenueKpiAdjustment(a.id, { ...command(a.version), reason, evidenceRef }));
    }
    case 'verify': return action(summary, () => api.verifyRevenueKpiAdjustment(a.id, { ...command(a.version), reason }));
    case 'reject-adjustment': return action(summary, () => api.decideRevenueKpiAdjustment(a.id, { ...command(a.version), action: 'REJECT', reason }));
    case 'approve-adjustment':
    case 'adjust-target': {
      const chosen = a.unitType === 'AREA' ? undefined : yield* target('Bạn muốn đổi mục tiêu thành bao nhiêu?', inlineTarget(prompt));
      const next = { ...command(a.version), reason, ...(chosen ? targetChange(chosen) : { newTargetVnd: a.targetVnd }) };
      return action(`${summary}\nMục tiêu mới · ${chosen ? targetLabel(chosen) : 'tổng mục tiêu cửa hàng'}`, () =>
        intent === 'approve-adjustment'
          ? api.decideRevenueKpiAdjustment(a.id, { ...next, action: 'APPROVE' })
          : api.decideRevenueKpiAssignment(a.id, { ...next, action: 'ADJUST' }));
    }
    case 'keep':
    case 'force':
    case 'cancel-target': return action(summary, () => api.decideRevenueKpiAssignment(a.id, {
      ...command(a.version), action: intent === 'cancel-target' ? 'CANCEL' : 'KEEP', reason, force: intent === 'force',
    }));
    case 'miss-reason': return action(summary, () => api.submitRevenueKpiMissReason(r!.id, { ...command(r!.version), text: reason }), 'Đã gửi giải trình cho HR xem xét.');
    case 'review-reason':
    case 'return-reason': return action(summary, () => api.reviewRevenueKpiReason(r!.id, { ...command(r!.version), decision: intent === 'review-reason' ? 'ACKNOWLEDGED' : 'REJECTED', note: reason }));
    case 'waive': return action(summary, () => api.confirmRevenueKpiResult(r!.id, { ...command(r!.version), waiveReason: reason }));
    case 'correct': return action(summary, () => api.correctRevenueKpiResult(r!.id, { ...command(r!.version), reason }));
  }
}
