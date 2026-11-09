import { RevenueKpiOpenCard, requestRevenueOpenProposal } from './RevenueKpiOpenCard';
import type { RevenueKpiOpenAction } from '@hr-blockbot/contracts';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  RevenueKpiDashboardSchema,
  RevenueKpiPolicySchema,
  type NotificationItem,
  type RevenueKpiAssignment as Assignment,
  type RevenueKpiResult as Result,
  type RevenueKpiDashboard as Dashboard,
} from '@hr-blockbot/contracts';
import { useAuthorization } from '../context/useAuthorization';
import * as api from '../services/revenue-kpi-api';
import { ApiError, fetchMe, fetchNotifications, markNotificationRead, newClientMessageId } from '../services/api';
import './revenue-kpi.css';

const money = (n: number | null | undefined) =>
  n == null ? '—' : new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(n);
const percentage = (n: number | null | undefined) =>
  n == null ? '—' : new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(n) + '%';
const date = (s: string | null) =>
  s ? new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' }).format(new Date(s)) : '—';

const labels: Record<string, string> = {
  DRAFT: 'Nháp',
  OPEN: 'Đang mở',
  PENDING_ACCEPTANCE: 'Chờ xác nhận',
  ACCEPTED: 'Đã xác nhận',
  ACTIVE: 'Đang thực hiện',
  REFUSED: 'Đã từ chối',
  HR_REVIEW: 'HR đang xem xét',
  ADJUSTMENT_REQUESTED: 'Yêu cầu điều chỉnh',
  CLOSED: 'Đã chốt',
  CANCELLED: 'Đã hủy',
  PENDING: 'Chờ tính',
  PENDING_DATA: 'Thiếu dữ liệu',
  COMPUTED: 'Đã tính',
  AWAITING_REASON: 'Chờ giải trình',
  CONFIRMED: 'Đã xác nhận kết quả',
  CORRECTED: 'Đã điều chỉnh',
  ARCHIVED: 'Đã lưu trữ',
};

const pendingLabels: Record<string, string> = {
  STORE_WITHOUT_DATA: 'Cửa hàng chưa đủ doanh thu',
  INVALID_ORDERS: 'Số liệu đơn hàng cần đối chiếu',
  MIXED_DATA_SOURCES: 'Các cửa hàng đang dùng nguồn doanh thu khác nhau',
  INVALID_TARGET: 'Mục tiêu chưa hợp lệ',
  NO_VALID_STORES: 'Chưa có cửa hàng đủ điều kiện',
};

type Modal = { kind: string; a?: Assignment; r?: Result };
type Values = {
  reason: string;
  evidenceRef: string;
  amount: string;
  growth: string;
  mode: string;
  action: string;
  storeId: string;
  employeeId: string;
  unitType: string;
  force: boolean;
  allowDemo: boolean;
  threshold: string;
  days: string;
  waive: boolean;
  from: string;
};

const defaults = (): Values => ({
  reason: '',
  evidenceRef: '',
  amount: '',
  growth: '3',
  mode: 'GROWTH_PERCENT',
  action: 'ADJUST',
  storeId: '',
  employeeId: '',
  unitType: 'STORE',
  force: false,
  allowDemo: false,
  threshold: '30',
  days: '3',
  waive: false,
  from: '',
});

const initialMonth = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7);

const saveAiTarget = (a: Assignment, growthPercent: number, clientRequestId: string) =>
  api.saveRevenueKpiAssignment({
    id: a.id,
    expectedVersion: a.version,
    clientRequestId,
    period: a.period,
    unitType: 'STORE',
    storeId: a.storeId,
    assigneeEmployeeId: a.assigneeEmployeeId,
    targetMode: 'GROWTH_PERCENT',
    growthPercent,
    reason: 'HR áp dụng đề xuất tham khảo sau xem xét.',
  });

export function RevenueKpiView() {
  const { can, summary } = useAuthorization();
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [identityError, setIdentityError] = useState('');
  const [period, setPeriod] = useState(initialMonth);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [periods, setPeriods] = useState<string[]>([]);
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reload, setReload] = useState(0);
  const [openProposal, setOpenProposal] = useState<RevenueKpiOpenAction | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [modal, setModal] = useState<Modal | null>(null);
  const [values, setValues] = useState<Values>(defaults);
  const [notices, setNotices] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);

  // Filters for Store vs Area view
  const [unitFilter, setUnitFilter] = useState<'ALL' | 'STORE' | 'AREA'>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [flagsExpanded, setFlagsExpanded] = useState(false);
  const [flagsSearch, setFlagsSearch] = useState('');

  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const commandCache = useRef<{ key: string; id: string } | null>(null);
  const loadedPeriodRef = useRef<string | null>(null);

  const hr = can('revenue_kpi.assign');
  const am = can('revenue_kpi.verify_adjustment');
  const authority = JSON.stringify(summary);

  useEffect(() => {
    let alive = true;
    setNotices([]);
    const load = () => {
      void fetchNotifications(30, 'revenue_kpi')
        .then(r => {
          if (alive) {
            setNotices(r.items);
            setUnread(r.unread);
          }
        })
        .catch(() => {});
    };
    load();
    const timer = setInterval(load, 30000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [authority, reload]);

  useEffect(() => {
    let live = true;
    setEmployeeId(null);
    setIdentityError('');
    void fetchMe()
      .then(me => {
        if (live) setEmployeeId(me.employeeId ?? null);
      })
      .catch(() => {
        if (live) {
          setIdentityError('Không xác định được tài khoản của bạn; các thao tác của người phụ trách tạm ẩn. Tải lại trang để thử lại.');
        }
      });
    return () => {
      live = false;
    };
  }, [authority]);

  useEffect(() => {
    let live = true;
    const isPeriodSwitch = loadedPeriodRef.current !== period;
    if (isPeriodSwitch) {
      setLoading(true);
      setDashboard(null);
      setMissing(false);
      setModal(null);
      setUnitFilter('ALL');
      setStatusFilter('ALL');
      setSearchQuery('');
    } else {
      setBusy(true);
    }
    setError('');
    if (!['hr', 'am', 'sm'].includes(summary?.profile ?? '')) {
      setLoading(false);
      setBusy(false);
      setError('Bạn chưa có quyền KPI doanh thu.');
      return;
    }
    Promise.all([api.listRevenueKpiPeriods(), api.getRevenueKpiDashboard(period)])
      .then(([p, d]) => {
        if (live) {
          loadedPeriodRef.current = period;
          setPeriods(p.items.map(item => item.period));
          setDashboard(RevenueKpiDashboardSchema.parse(d));
          setMissing(false);
        }
      })
      .catch(e => {
        if (!live) return;
        if (e instanceof ApiError && e.status === 404) {
          loadedPeriodRef.current = null;
          setDashboard(null);
          setMissing(true);
          void api.listRevenueKpiPeriods().then(p => {
            if (live) setPeriods(p.items.map(item => item.period));
          });
        } else {
          setError(e instanceof Error ? e.message : 'Không tải được KPI doanh thu.');
        }
      })
      .finally(() => {
        if (live) {
          setLoading(false);
          setBusy(false);
        }
      });
    return () => {
      live = false;
    };
  }, [period, reload, authority]);

  useEffect(() => {
    if (modal && !dialog.current?.open) dialog.current?.showModal();
    if (!modal && dialog.current?.open) dialog.current.close();
  }, [modal]);

  const cmd = (version: number, extras: Record<string, unknown> = {}) => {
    const key = JSON.stringify({ period, modal: modal?.kind, a: modal?.a?.id, version, extras });
    if (commandCache.current?.key !== key) commandCache.current = { key, id: newClientMessageId() };
    return { expectedVersion: version, clientRequestId: commandCache.current.id, ...extras };
  };

  const open = (kind: string, a?: Assignment, r?: Result, preset?: Partial<Values>) => {
    trigger.current = document.activeElement as HTMLElement;
    commandCache.current = null;
    setValues({
      ...defaults(),
      growth: String(a?.growthPercent ?? dashboard?.period.policy.defaultGrowthPercent ?? 3),
      amount: a ? String(a.targetVnd) : '',
      storeId: preset?.storeId ?? a?.storeId ?? '',
      employeeId: preset?.employeeId ?? a?.assigneeEmployeeId ?? '',
      unitType: preset?.unitType ?? a?.unitType ?? 'STORE',
      mode: a?.targetMode ?? 'GROWTH_PERCENT',
      ...preset,
    });
    setError('');
    setModal({ kind, a, r });
  };

  const openDraftForStore = (storeId: string, employeeId?: string) => {
    open('draft', undefined, undefined, {
      storeId,
      employeeId: employeeId ?? '',
      unitType: 'STORE',
    });
  };

  const close = () => {
    if (busy) return;
    setModal(null);
    trigger.current?.focus();
  };

  const mergeAssignmentInPlace = (updated: Assignment) => {
    setDashboard(prev =>
      prev
        ? {
            ...prev,
            assignments: prev.assignments.some(x => x.id === updated.id)
              ? prev.assignments.map(x => (x.id === updated.id ? updated : x))
              : [updated, ...prev.assignments],
          }
        : prev
    );
  };

  const mergeResultInPlace = (updated: Result) => {
    setDashboard(prev =>
      prev
        ? {
            ...prev,
            results: prev.results.some(x => x.id === updated.id)
              ? prev.results.map(x => (x.id === updated.id ? updated : x))
              : [updated, ...prev.results],
          }
        : prev
    );
  };

  const run = async (operation: () => Promise<unknown>, message: string, targetCardId?: string) => {
    setBusy(true);
    if (targetCardId) setActiveCardId(targetCardId);
    setError('');
    try {
      const res = await operation();
      if (res && typeof res === 'object' && 'id' in res) {
        if ('unitType' in res && 'stores' in res && 'responsibility' in res) {
          mergeAssignmentInPlace(res as Assignment);
        } else if ('assignmentId' in res && 'pendingReasons' in res) {
          mergeResultInPlace(res as Result);
        }
      }
      // Refresh dashboard in-place without clearing existing dashboard state or resetting scroll
      const [p, d] = await Promise.all([api.listRevenueKpiPeriods(), api.getRevenueKpiDashboard(period)]);
      loadedPeriodRef.current = period;
      setPeriods(p.items.map(item => item.period));
      setDashboard(RevenueKpiDashboardSchema.parse(d));
      setMissing(false);
      commandCache.current = null;
      setModal(null);
      setNotice(message);
      trigger.current?.focus();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Thao tác chưa hoàn tất.');
    } finally {
      setActiveCardId(null);
      setBusy(false);
    }
  };

  const ask = (kind: string, a?: Assignment, r?: Result) => (
    <button
      type="button"
      className={`rk-action-btn rk-action-${kind}`}
      disabled={busy}
      onClick={() => open(kind, a, r)}
    >
      {
        ({
          publish: 'Phát hành',
          accept: 'Chấp nhận',
          refuse: 'Từ chối',
          decision: 'HR xử lý',
          request: 'Xin điều chỉnh',
          verify: 'AM xác minh',
          adjustment: 'HR quyết định',
          reason: 'Gửi giải trình',
          review: 'Xem xét giải trình',
          confirm: 'Xác nhận kết quả',
          correct: 'Điều chỉnh sau chốt',
          edit: 'Sửa mục tiêu',
          responsibility: 'Đổi SM phụ trách',
          ai: 'Đề xuất AI',
        } as Record<string, string>)[kind]
      }
    </button>
  );

  const submit = async () => {
    if (!modal) return;
    const { kind, a, r } = modal;
    const p = dashboard?.period;
    const reason = values.reason.trim();
    const targetChange = () =>
      values.mode === 'ABSOLUTE_VND' || a?.unitType === 'AREA'
        ? { newTargetVnd: Number(values.amount) }
        : { newGrowthPercent: Number(values.growth) };
    await run(
      async () => {
        if (kind === 'create') {
          return api.createRevenueKpiPeriod(
            cmd(0, {
              period,
              policy: RevenueKpiPolicySchema.parse({
                defaultGrowthPercent: Number(values.growth),
                underperformingRateThresholdPercent: Number(values.threshold),
                acceptanceWindowWorkingDays: Number(values.days),
                allowDemoData: values.allowDemo,
              }),
            })
          );
        }
        if (kind === 'compute') return api.computeRevenueKpiPeriod(period, cmd(p!.version));
        if (kind === 'close') return api.closeRevenueKpiPeriod(period, cmd(p!.version));
        if (kind === 'draft' || kind === 'edit') {
          return api.saveRevenueKpiAssignment(
            cmd(a?.version ?? 0, {
              ...(a ? { id: a.id } : {}),
              period,
              unitType: values.unitType,
              ...(values.unitType === 'STORE' ? { storeId: values.storeId } : {}),
              assigneeEmployeeId: values.employeeId,
              targetMode: values.mode,
              ...(values.unitType === 'STORE'
                ? values.mode === 'ABSOLUTE_VND'
                  ? { targetVnd: Number(values.amount) }
                  : { growthPercent: Number(values.growth) }
                : {}),
              reason,
            })
          );
        }
        if (kind === 'publish') return api.publishRevenueKpiAssignment(a!.id, cmd(a!.version));
        if (kind === 'accept') return api.acceptRevenueKpiAssignment(a!.id, cmd(a!.version));
        if (kind === 'refuse') return api.refuseRevenueKpiAssignment(a!.id, cmd(a!.version, { reason }));
        if (kind === 'decision') {
          return api.decideRevenueKpiAssignment(
            a!.id,
            cmd(a!.version, { action: values.action, reason, force: values.force, ...(values.action === 'ADJUST' ? targetChange() : {}) })
          );
        }
        if (kind === 'request') return api.requestRevenueKpiAdjustment(a!.id, cmd(a!.version, { reason, evidenceRef: values.evidenceRef }));
        if (kind === 'verify') return api.verifyRevenueKpiAdjustment(a!.id, cmd(a!.version, { reason }));
        if (kind === 'adjustment') {
          return api.decideRevenueKpiAdjustment(
            a!.id,
            cmd(a!.version, {
              action: values.action === 'REJECT' ? 'REJECT' : 'APPROVE',
              reason,
              ...(values.action === 'REJECT' ? {} : targetChange()),
            })
          );
        }
        if (kind === 'reason') return api.submitRevenueKpiMissReason(r!.id, cmd(r!.version, { text: reason }));
        if (kind === 'review') {
          return api.reviewRevenueKpiReason(
            r!.id,
            cmd(r!.version, { decision: values.action === 'REJECT' ? 'REJECTED' : 'ACKNOWLEDGED', note: reason })
          );
        }
        if (kind === 'confirm') return api.confirmRevenueKpiResult(r!.id, cmd(r!.version, values.waive ? { waiveReason: reason } : {}));
        if (kind === 'correct') return api.correctRevenueKpiResult(r!.id, cmd(r!.version, { reason }));
        if (kind === 'ai') return api.proposeRevenueKpiTarget(a!.id, cmd(a!.version));
        if (kind === 'apply-ai' && a?.aiProposal?.suggestedGrowthPercent != null) {
          return saveAiTarget(a, a.aiProposal.suggestedGrowthPercent, cmd(a.version).clientRequestId);
        }
        if (kind === 'responsibility') {
          return api.changeRevenueKpiResponsibility(
            a!.id,
            cmd(a!.version, { assigneeEmployeeId: values.employeeId, from: new Date(values.from + '+07:00').toISOString(), reason })
          );
        }
      },
      kind === 'apply-ai'
        ? 'Đã áp dụng đề xuất cho bản nháp cửa hàng. Bạn có thể chỉnh sửa trước khi phát hành.'
        : 'Đã lưu thay đổi KPI doanh thu.',
      a?.id
    );
  };

  const bulk = (kind: 'ai' | 'apply' | 'publish') =>
    run(
      async () => {
        const drafts = dashboard!.assignments.filter(
          a => a.status === 'DRAFT' && (kind !== 'ai' && kind !== 'apply' || a.unitType === 'STORE')
        );
        for (const a of drafts) {
          setActiveCardId(a.id);
          if (kind === 'ai') {
            const updated = await api.proposeRevenueKpiTarget(a.id, {
              expectedVersion: a.version,
              clientRequestId: newClientMessageId(),
            });
            mergeAssignmentInPlace(updated);
          } else if (kind === 'publish') {
            const prepared =
              a.unitType === 'AREA'
                ? await api.saveRevenueKpiAssignment({
                    id: a.id,
                    period,
                    unitType: 'AREA',
                    assigneeEmployeeId: a.assigneeEmployeeId,
                    targetMode: 'ABSOLUTE_VND',
                    reason: 'HR đồng bộ tổng mục tiêu các cửa hàng trước phát hành.',
                    expectedVersion: a.version,
                    clientRequestId: newClientMessageId(),
                  })
                : a;
            const published = await api.publishRevenueKpiAssignment(prepared.id, {
              expectedVersion: prepared.version,
              clientRequestId: newClientMessageId(),
            });
            mergeAssignmentInPlace(published);
          } else if (a.aiProposal?.suggestedGrowthPercent != null) {
            const applied = await saveAiTarget(a, a.aiProposal.suggestedGrowthPercent, newClientMessageId());
            mergeAssignmentInPlace(applied);
          }
        }
      },
      kind === 'apply'
        ? 'Đã áp dụng đề xuất vào bản nháp. Cần kiểm tra và phát hành riêng.'
        : kind === 'ai'
        ? 'Đã lấy đề xuất cho các cửa hàng đủ dữ liệu.'
        : 'Đã phát hành các bản nháp đủ điều kiện.'
    );

  const v = (key: keyof Values, value: string | boolean) => setValues(x => ({ ...x, [key]: value }));

  const previewOpen = async () => {
    setError('');
    setPreviewBusy(true);
    try {
      setOpenProposal(await requestRevenueOpenProposal(period));
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Chưa lập được bản xem trước.');
    } finally {
      setPreviewBusy(false);
    }
  };

  // Summary metrics & filtered assignments for Store vs Area view
  const stats = useMemo(() => {
    if (!dashboard) return null;
    const storeItems = dashboard.assignments.filter(a => a.unitType === 'STORE');
    const areaItems = dashboard.assignments.filter(a => a.unitType === 'AREA');
    const storeTargetTotal = storeItems.reduce((sum, a) => sum + (a.targetVnd || 0), 0);
    const storeActualTotal = storeItems.reduce((sum, a) => {
      const r = dashboard.results.find(res => res.assignmentId === a.id);
      return sum + (r?.actualRevenueVnd ?? 0);
    }, 0);
    const areaTargetTotal = areaItems.reduce((sum, a) => sum + (a.targetVnd || 0), 0);
    const areaActualTotal = areaItems.reduce((sum, a) => {
      const r = dashboard.results.find(res => res.assignmentId === a.id);
      return sum + (r?.actualRevenueVnd ?? 0);
    }, 0);

    const draftCount = dashboard.assignments.filter(a => a.status === 'DRAFT').length;
    const pendingCount = dashboard.assignments.filter(a => a.status === 'PENDING_ACCEPTANCE').length;
    const activeCount = dashboard.assignments.filter(a => ['ACTIVE', 'ACCEPTED', 'CLOSED'].includes(a.status)).length;
    const attentionCount = dashboard.assignments.filter(a =>
      ['REFUSED', 'HR_REVIEW', 'ADJUSTMENT_REQUESTED'].includes(a.status)
    ).length;
    const aiReadyCount = storeItems.filter(a => a.aiProposal != null).length;

    return {
      storeCount: storeItems.length,
      areaCount: areaItems.length,
      storeTargetTotal,
      storeActualTotal,
      areaTargetTotal,
      areaActualTotal,
      draftCount,
      pendingCount,
      activeCount,
      attentionCount,
      aiReadyCount,
    };
  }, [dashboard]);

  const filteredAssignments = useMemo(() => {
    if (!dashboard) return [];
    return dashboard.assignments.filter(a => {
      if (unitFilter === 'STORE' && a.unitType !== 'STORE') return false;
      if (unitFilter === 'AREA' && a.unitType !== 'AREA') return false;
      if (statusFilter === 'DRAFT' && a.status !== 'DRAFT') return false;
      if (statusFilter === 'PENDING_ACCEPTANCE' && a.status !== 'PENDING_ACCEPTANCE') return false;
      if (statusFilter === 'ACTIVE' && !['ACTIVE', 'ACCEPTED', 'CLOSED'].includes(a.status)) return false;
      if (statusFilter === 'ATTENTION' && !['REFUSED', 'HR_REVIEW', 'ADJUSTMENT_REQUESTED'].includes(a.status)) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const storeMatch = a.stores.some(s => s.storeName.toLowerCase().includes(q));
        const assigneeMatch = a.assigneeName.toLowerCase().includes(q);
        return storeMatch || assigneeMatch;
      }
      return true;
    });
  }, [dashboard, unitFilter, statusFilter, searchQuery]);

  const parsedFlags = useMemo(() => {
    if (!dashboard) return [];
    return dashboard.flags.map((flag, idx) => {
      const colonIdx = flag.indexOf(':');
      const storeName = colonIdx > -1 ? flag.slice(0, colonIdx).trim() : flag;
      const message = colonIdx > -1 ? flag.slice(colonIdx + 1).trim() : '';
      const storeObj = dashboard.stores.find(s => s.name === storeName);
      const candidateSMs = storeObj
        ? dashboard.candidates.filter(c => c.role === 'SM' && c.storeIds.includes(storeObj.id))
        : [];
      return {
        id: storeObj?.id ?? `flag-${idx}`,
        raw: flag,
        storeName,
        message,
        storeId: storeObj?.id,
        smStatus: storeObj?.smStatus,
        candidateSMs,
      };
    });
  }, [dashboard]);

  const filteredFlags = useMemo(() => {
    if (!flagsSearch.trim()) return parsedFlags;
    const q = flagsSearch.toLowerCase();
    return parsedFlags.filter(
      f => f.storeName.toLowerCase().includes(q) || f.message.toLowerCase().includes(q)
    );
  }, [parsedFlags, flagsSearch]);

  const isOpen = dashboard?.period.status === 'OPEN';
  const selected = modal?.a;

  const renderAssignmentCard = (a: Assignment) => {
    const result = dashboard!.results.find(r => r.assignmentId === a.id);
    const own = a.assigneeEmployeeId === employeeId;
    const needsReason = result?.achieved === false;
    const isCardBusy = activeCardId === a.id;
    const pct = result?.achievementPercent ?? null;
    const progressWidth = pct != null ? Math.min(100, Math.max(0, pct)) : 0;

    return (
      <article
        key={a.id}
        className={`rk-assignment rk-assignment-${a.unitType.toLowerCase()} ${isCardBusy ? 'rk-assignment-busy' : ''}`}
        aria-label={`KPI ${a.unitType === 'AREA' ? 'khu vực' : 'cửa hàng'} ${a.assigneeName}`}
      >
        <div className="rk-assignment-head">
          <div className="rk-assignment-title-block">
            <div className="rk-unit-badge-row">
              <p className={`rk-unit-pill rk-unit-pill-${a.unitType.toLowerCase()}`}>
                {a.unitType === 'AREA' ? 'KHU VỰC · AM' : 'CỬA HÀNG · SM'}
              </p>
              {a.unitType === 'AREA' && (
                <span className="rk-store-count-tag">{a.stores.length} cửa hàng trực thuộc</span>
              )}
              {isCardBusy && <span className="rk-inline-spinner">⏳ Đang cập nhật…</span>}
            </div>
            <h2>{a.unitType === 'AREA' ? `Khu vực ${a.assigneeName}` : a.stores[0].storeName}</h2>
            <span className="rk-assignee-line">👤 Phụ trách: <strong>{a.assigneeName}</strong> ({a.assigneeRole})</span>
          </div>
          <strong className={'rk-state rk-state-' + a.status.toLowerCase()}>{labels[a.status]}</strong>
        </div>

        <div className="rk-metrics">
          <div className="rk-metric-cell">
            <span>Tháng gốc {a.basePeriod ? `${a.basePeriod.slice(5)}/${a.basePeriod.slice(0, 4)}` : '—'}</span>
            <strong>{money(a.baseRevenueVnd)}</strong>
            <small>Doanh thu kỳ gốc</small>
          </div>
          <div className="rk-metric-cell rk-metric-target">
            <span>Mục tiêu {a.growthPercent == null ? 'VND' : `(${percentage(a.growthPercent)})`}</span>
            <strong>{money(a.targetVnd)}</strong>
            <small>{a.targetMode === 'ABSOLUTE_VND' ? 'Mục tiêu cố định' : 'Theo mức tăng trưởng'}</small>
          </div>
          <div className="rk-metric-cell rk-metric-actual">
            <span>Doanh thu kỳ này</span>
            <strong>{money(result?.actualRevenueVnd)}</strong>
            <small>{result ? `${result.orderCount} đơn hợp lệ` : 'Chưa tính kết quả'}</small>
          </div>
          <div className="rk-metric-cell rk-metric-achievement">
            <span>Hoàn thành</span>
            <strong>{percentage(result?.achievementPercent)}</strong>
            <small className={result?.achieved === true ? 'rk-text-pass' : result?.achieved === false ? 'rk-text-fail' : ''}>
              {result?.achieved === true ? '✓ Đạt' : result?.achieved === false ? '⚠️ Chưa đạt' : 'Chưa kết luận'}
            </small>
          </div>
        </div>

        {pct != null && (
          <div className="rk-progress-bar-wrap" aria-hidden="true">
            <div
              className={`rk-progress-bar-fill ${result?.achieved === true ? 'pass' : result?.achieved === false ? 'fail' : ''}`}
              style={{ width: `${progressWidth}%` }}
            />
          </div>
        )}

        {a.deadlineAt && a.status === 'PENDING_ACCEPTANCE' && (
          <p className="rk-sub">
            ⏱️ Hạn xác nhận: {date(a.deadlineAt)}
            {a.overdue || Date.parse(a.deadlineAt) < Date.now()
              ? ' · Quá hạn — chờ HR xem xét, chưa tự chấp nhận'
              : ''}
          </p>
        )}

        {result && (
          <p className="rk-result-status">
            {labels[result.status]}
            {a.unitType === 'AREA' && result.underperformingStoreCount !== null
              ? ` · ${result.underperformingStoreCount}/${result.stores.length} cửa hàng chưa đạt (${percentage(
                  result.underperformingStoreRatePercent
                )})`
              : ''}
            {result.assignmentVersion !== a.version && a.status !== 'CLOSED' ? ' · Mục tiêu đã cập nhật, cần tính lại' : ''}
          </p>
        )}

        {result?.pendingReasons.length ? (
          <ul className="rk-pending">
            {result.pendingReasons.map(r => (
              <li key={r}>{pendingLabels[r] ?? 'Dữ liệu cần đối chiếu'}</li>
            ))}
          </ul>
        ) : null}

        {a.refusal && (
          <p className="rk-note rk-note-warn">
            <strong>Lý do từ chối:</strong> {a.refusal.reason}
          </p>
        )}

        {a.adjustment && (
          <div className="rk-note">
            <p>
              <strong>Điều chỉnh:</strong> {a.adjustment.reason}
            </p>
            <p>Bằng chứng/tham chiếu: {a.adjustment.evidenceRef}</p>
            {a.adjustment.amNote && <p>AM xác minh: {a.adjustment.amNote}</p>}
            {a.adjustment.hrDecision && <p>HR: {a.adjustment.hrDecision.reason}</p>}
          </div>
        )}

        {result?.missReason && (
          <p className="rk-note">
            <strong>Giải trình:</strong> {result.missReason.text}
            {result.missReason.reviewNote ? ` · HR xem xét: ${result.missReason.reviewNote}` : ''}
          </p>
        )}

        {a.aiProposal && (
          <div className="rk-ai">
            <div className="rk-ai-header">
              <strong>✨ Đề xuất tham khảo; HR quyết định</strong>
              <small>
                {a.aiProposal.degraded ? 'Đang dùng phân tích dự phòng' : 'Đề xuất AI'} · {a.aiProposal.dataMonths}/3 tháng dữ liệu
              </small>
            </div>
            <p className="rk-ai-highlight">
              {a.aiProposal.suggestedGrowthPercent == null
                ? 'Chưa đủ dữ liệu để đề xuất.'
                : `Tăng ${percentage(a.aiProposal.suggestedGrowthPercent)} · Khoảng ${percentage(
                    a.aiProposal.rangeMinPercent
                  )} – ${percentage(a.aiProposal.rangeMaxPercent)}`}
            </p>
            {a.aiProposal.rationale && <p className="rk-ai-rationale">{a.aiProposal.rationale}</p>}
            {hr && isOpen && a.unitType === 'STORE' && a.status === 'DRAFT' && a.aiProposal.suggestedGrowthPercent != null && (
              a.growthPercent === a.aiProposal.suggestedGrowthPercent ? (
                <small className="rk-ai-matched">Mục tiêu nháp đã khớp mức đề xuất.</small>
              ) : (
                <button type="button" className="rk-btn rk-btn-ai rk-btn-sm" disabled={busy} onClick={() => open('apply-ai', a)}>
                  Áp dụng đề xuất
                </button>
              )
            )}
          </div>
        )}

        {a.unitType === 'AREA' && (
          <div className="rk-table">
            <table>
              <thead>
                <tr>
                  <th>Cửa hàng đã giao</th>
                  <th>Mục tiêu</th>
                  <th>Doanh thu</th>
                  <th>Hoàn thành</th>
                </tr>
              </thead>
              <tbody>
                {a.stores.map(s => {
                  const r = result?.stores.find(x => x.storeId === s.storeId);
                  return (
                    <tr key={s.storeId}>
                      <td><strong>{s.storeName}</strong></td>
                      <td className="rk-tabular">{money(s.targetVnd)}</td>
                      <td className="rk-tabular">{money(r?.actualRevenueVnd)}</td>
                      <td className="rk-tabular">
                        {percentage(r?.achievementPercent)}{' '}
                        {r?.achieved === true ? '· Đạt' : r?.achieved === false ? '· Chưa đạt' : ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="rk-actions">
          {hr && isOpen && a.status === 'DRAFT' && (
            <>
              {ask('edit', a)}
              {a.unitType === 'STORE' && ask('ai', a)}
              {ask('publish', a)}
            </>
          )}
          {own && can('revenue_kpi.respond') && a.status === 'PENDING_ACCEPTANCE' && isOpen && (
            <>
              {ask('accept', a)}
              {ask('refuse', a)}
            </>
          )}
          {hr && isOpen && !['CANCELLED', 'CLOSED'].includes(a.status) && ask('decision', a)}
          {own && can('revenue_kpi.request_adjustment') && a.status === 'ACTIVE' && isOpen && ask('request', a)}
          {am && !own && a.unitType === 'STORE' && a.status === 'ADJUSTMENT_REQUESTED' && a.adjustment?.status === 'PENDING' && ask('verify', a)}
          {hr && isOpen && a.status === 'ADJUSTMENT_REQUESTED' && ask('adjustment', a)}
          {own && result && needsReason && ['AWAITING_REASON', 'COMPUTED'].includes(result.status) && isOpen && ask('reason', a, result)}
          {hr && result && isOpen && result.status === 'COMPUTED' && result.missReason && ask('review', a, result)}
          {hr && result && isOpen && ['COMPUTED', 'AWAITING_REASON'].includes(result.status) && ask('confirm', a, result)}
          {hr && result && dashboard!.period.status === 'CLOSED' && ask('correct', a, result)}
          {hr && isOpen && a.unitType === 'STORE' && ['ACTIVE', 'PENDING_ACCEPTANCE'].includes(a.status) && ask('responsibility', a)}
        </div>

        <details className="rk-history">
          <summary>Lịch sử và thời gian phụ trách ({a.history.length + (result?.history.length ?? 0)})</summary>
          <div className="rk-history-body">
            {a.responsibility.map((r, i) => (
              <p key={i}>
                <strong>{r.employeeName}</strong>: {date(r.from)} → {r.to ? date(r.to) : 'hiện tại'}
              </p>
            ))}
            <ol>
              {[...a.history, ...(result?.history ?? [])].map((h, i) => (
                <li key={i}>
                  {date(h.at)} · {h.actorKind === 'SYSTEM' ? 'Hệ thống nhắc hạn' : labels[h.toStatus ?? ''] ?? 'Cập nhật KPI'}
                  {h.reason ? ` · ${h.reason}` : ''}
                </li>
              ))}
            </ol>
          </div>
        </details>
      </article>
    );
  };

  return (
    <section className="revenue-kpi" aria-labelledby="rk-title" aria-busy={loading || busy}>
      <header>
        <div>
          <p className="rk-eyebrow">MỤC TIÊU VẬN HÀNH</p>
          <h1 id="rk-title">KPI doanh thu</h1>
          <p>Mục tiêu theo cửa hàng và khu vực · HR xem xét, người nhận xác nhận.</p>
        </div>
        <label>
          Kỳ tháng
          <input aria-label="Kỳ KPI doanh thu" type="month" value={period} onChange={e => setPeriod(e.target.value)} />
        </label>
      </header>

      {periods.length > 0 && (
        <nav aria-label="Các kỳ KPI">
          {periods.map(p => (
            <button key={p} type="button" aria-pressed={p === period} onClick={() => setPeriod(p)}>
              {p.slice(5)}/{p.slice(0, 4)}
            </button>
          ))}
        </nav>
      )}

      {notice && (
        <p role="status" className="rk-notice">
          {notice}
        </p>
      )}
      {error && !modal && (
        <p role="alert" className="rk-error">
          {error}
        </p>
      )}
      {identityError && (
        <p role="alert" className="rk-error">
          {identityError}
        </p>
      )}

      <details className="rk-flags">
        <summary>Thông báo KPI doanh thu · {unread} chưa đọc</summary>
        {!notices.length && <p>Chưa có thông báo gần đây.</p>}
        {notices.map(n => (
          <article key={n.id}>
            <p>
              <strong>{n.title}</strong> · {date(n.createdAt)}
            </p>
            <p>{n.body}</p>
            {!n.readAt && (
              <button
                type="button"
                onClick={() =>
                  void markNotificationRead(n.id)
                    .then(() => {
                      setNotices(old => old.map(item => (item.id === n.id ? { ...item, readAt: new Date().toISOString() } : item)));
                      setUnread(n => Math.max(0, n - 1));
                    })
                    .catch(() => setError('Chưa đánh dấu được thông báo.'))
                }
              >
                Đánh dấu đã đọc
              </button>
            )}
          </article>
        ))}
        {notices.length >= 30 && (
          <button
            type="button"
            onClick={() =>
              void fetchNotifications(30, 'revenue_kpi', notices[notices.length - 1].createdAt).then(r =>
                setNotices(old => [...old, ...r.items.filter(n => !old.some(item => item.id === n.id))])
              )
            }
          >
            Xem thông báo cũ
          </button>
        )}
      </details>

      {hr && openProposal?.preview.period === period && (
        <RevenueKpiOpenCard key={openProposal.actionId} initial={openProposal} onExecuted={() => setReload(n => n + 1)} />
      )}

      {loading ? (
        <p role="status" className="rk-loading-banner">
          ⏳ Đang tải KPI doanh thu…
        </p>
      ) : missing ? (
        <div className="rk-empty">
          <h2>Chưa có kỳ KPI này</h2>
          <p>{hr ? 'Tạo kỳ, đặt mức tăng và ngưỡng đánh giá trước khi giao mục tiêu.' : 'HR chưa giao mục tiêu cho bạn trong kỳ này.'}</p>
          {hr && (
            <button type="button" onClick={() => open('create')}>
              Tạo kỳ KPI
            </button>
          )}
        </div>
      ) : (
        dashboard && (
          <>
            <div className="rk-policy-bar">
              <div className="rk-policy-status">
                <span className={`rk-status-indicator rk-status-indicator-${dashboard.period.status.toLowerCase()}`}>
                  <span className="rk-status-dot" />
                  {labels[dashboard.period.status]}
                </span>
                <span className="rk-policy-period-tag">Kỳ {period.slice(5)}/{period.slice(0, 4)}</span>
              </div>
              <div className="rk-policy-chips">
                <div className="rk-policy-chip" title="Mức tăng trưởng KPI mặc định">
                  <span className="rk-chip-icon">📈</span>
                  <span className="rk-chip-label">Tăng mặc định:</span>
                  <strong>{percentage(dashboard.period.policy.defaultGrowthPercent)}</strong>
                </div>
                <div className="rk-policy-chip" title="Tỷ lệ cửa hàng chưa đạt tối đa cho phép">
                  <span className="rk-chip-icon">🎯</span>
                  <span className="rk-chip-label">Ngưỡng chưa đạt:</span>
                  <strong>≤ {percentage(dashboard.period.policy.underperformingRateThresholdPercent)}</strong>
                </div>
                <div className="rk-policy-chip" title="Thời hạn để quản lý xác nhận nhận KPI">
                  <span className="rk-chip-icon">⏱️</span>
                  <span className="rk-chip-label">Hạn xác nhận:</span>
                  <strong>{dashboard.period.policy.acceptanceWindowWorkingDays} ngày làm việc</strong>
                </div>
              </div>
              {busy && <span className="rk-sync-indicator">⏳ Đang đồng bộ dữ liệu…</span>}
            </div>

            {stats && dashboard.assignments.length > 0 && (
              <div className="rk-overview-grid">
                <div
                  className={`rk-overview-card rk-overview-store ${unitFilter === 'STORE' ? 'active' : ''}`}
                  onClick={() => setUnitFilter(u => (u === 'STORE' ? 'ALL' : 'STORE'))}
                  role="button"
                  tabIndex={0}
                >
                  <div className="rk-overview-top">
                    <span className="rk-overview-label">🏪 Doanh thu theo Cửa hàng (SM)</span>
                    <span className="rk-overview-count">{stats.storeCount} cửa hàng</span>
                  </div>
                  <strong className="rk-overview-amount">{money(stats.storeTargetTotal)}</strong>
                  <div className="rk-overview-sub">
                    <span>Thực tế: <strong>{money(stats.storeActualTotal)}</strong></span>
                    <span>· AI đề xuất: {stats.aiReadyCount}/{stats.storeCount}</span>
                  </div>
                </div>

                <div
                  className={`rk-overview-card rk-overview-area ${unitFilter === 'AREA' ? 'active' : ''}`}
                  onClick={() => setUnitFilter(u => (u === 'AREA' ? 'ALL' : 'AREA'))}
                  role="button"
                  tabIndex={0}
                >
                  <div className="rk-overview-top">
                    <span className="rk-overview-label">🗺️ Doanh thu theo Khu vực (AM)</span>
                    <span className="rk-overview-count">{stats.areaCount} khu vực</span>
                  </div>
                  <strong className="rk-overview-amount">{money(stats.areaTargetTotal)}</strong>
                  <div className="rk-overview-sub">
                    <span>Thực tế: <strong>{money(stats.areaActualTotal)}</strong></span>
                    <span>· Tổng hợp từ chi nhánh AM</span>
                  </div>
                </div>

                <div
                  className={`rk-overview-card rk-overview-status ${statusFilter === 'DRAFT' ? 'active' : ''}`}
                  onClick={() => setStatusFilter(s => (s === 'DRAFT' ? 'ALL' : 'DRAFT'))}
                  role="button"
                  tabIndex={0}
                >
                  <div className="rk-overview-top">
                    <span className="rk-overview-label">📝 Tiến độ phân công</span>
                    <span className="rk-overview-count">{dashboard.assignments.length} mục tiêu</span>
                  </div>
                  <strong className="rk-overview-amount">{stats.activeCount} đang chạy</strong>
                  <div className="rk-overview-sub">
                    <span>Nháp: {stats.draftCount}</span>
                    <span>· Chờ nhận: {stats.pendingCount}</span>
                    {stats.attentionCount > 0 && <span className="rk-text-warn">· Cần xử lý: {stats.attentionCount}</span>}
                  </div>
                </div>
              </div>
            )}

            {hr && (
              <div className="rk-action-hub">
                <div className="rk-action-group">
                  <span className="rk-action-group-label">1. Lập kế hoạch & AI</span>
                  <div className="rk-action-buttons">
                    {(dashboard.period.status === 'DRAFT' || isOpen) && (
                      <button
                        type="button"
                        className="rk-btn rk-btn-primary"
                        disabled={busy || previewBusy}
                        onClick={() => void previewOpen()}
                      >
                        {previewBusy ? 'Đang lập bản xem trước…' : isOpen ? 'Xem trước bản nháp còn thiếu' : 'Xem trước mở kỳ'}
                      </button>
                    )}
                    {isOpen && (
                      <>
                        <button type="button" className="rk-btn rk-btn-secondary" disabled={busy} onClick={() => open('draft')}>
                          Thêm mục tiêu
                        </button>
                        <button
                          type="button"
                          className="rk-btn rk-btn-ai"
                          disabled={busy || !dashboard.assignments.some(a => a.status === 'DRAFT' && a.unitType === 'STORE')}
                          onClick={() => void bulk('ai')}
                          title="Lấy đề xuất tăng trưởng từ mô hình AI cho các bản nháp"
                        >
                          Đề xuất AI hàng loạt
                        </button>
                        <button
                          type="button"
                          className="rk-btn rk-btn-subtle"
                          disabled={busy || !dashboard.assignments.some(a => a.status === 'DRAFT' && a.aiProposal?.suggestedGrowthPercent != null)}
                          onClick={() => open('bulk-apply')}
                          title="Áp dụng mức tăng đề xuất của AI vào tất cả bản nháp"
                        >
                          Áp dụng đề xuất đã xem
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {isOpen && (
                  <>
                    <div className="rk-action-group-divider" aria-hidden="true" />

                    <div className="rk-action-group">
                      <span className="rk-action-group-label">2. Phát hành</span>
                      <div className="rk-action-buttons">
                        <button
                          type="button"
                          className="rk-btn rk-btn-publish"
                          disabled={busy || !dashboard.assignments.some(a => a.status === 'DRAFT')}
                          onClick={() => open('bulk-publish')}
                        >
                          Phát hành bản nháp
                        </button>
                      </div>
                    </div>

                    <div className="rk-action-group-divider" aria-hidden="true" />

                    <div className="rk-action-group">
                      <span className="rk-action-group-label">3. Nghiệm thu & Chốt</span>
                      <div className="rk-action-buttons">
                        <button type="button" className="rk-btn rk-btn-secondary" disabled={busy} onClick={() => open('compute')}>
                          Tính kết quả
                        </button>
                        <button type="button" className="rk-btn rk-btn-danger-outline" disabled={busy} onClick={() => open('close')}>
                          Chốt kỳ
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {hr && dashboard.flags.length > 0 && (
              <div className="rk-flags-card">
                <div
                  className="rk-flags-summary"
                  role="button"
                  tabIndex={0}
                  onClick={() => setFlagsExpanded(x => !x)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setFlagsExpanded(x => !x);
                    }
                  }}
                >
                  <div className="rk-flags-summary-left">
                    <span className="rk-flags-icon">⚠️</span>
                    <div>
                      <div className="rk-flags-title-row">
                        <strong>Cần kiểm tra người phụ trách</strong>
                        <span className="rk-flags-count-badge">{dashboard.flags.length} chi nhánh</span>
                      </div>
                      <p className="rk-flags-subtitle">
                        Các cửa hàng chưa có SM chính thức hoặc có nhiều SM cần HR xác nhận đại diện nhận KPI.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="rk-flags-toggle-btn"
                    onClick={e => {
                      e.stopPropagation();
                      setFlagsExpanded(x => !x);
                    }}
                  >
                    {flagsExpanded ? 'Thu gọn ▲' : `Xem chi tiết (${dashboard.flags.length}) ▼`}
                  </button>
                </div>

                {flagsExpanded && (
                  <div className="rk-flags-content">
                    <div className="rk-flags-toolbar">
                      <div className="rk-flags-search-wrap">
                        <input
                          type="search"
                          placeholder="🔍 Lọc nhanh chi nhánh (VD: Quận 3, Điện Biên Phủ...)"
                          aria-label="Lọc nhanh chi nhánh cần kiểm tra"
                          value={flagsSearch}
                          onChange={e => setFlagsSearch(e.target.value)}
                        />
                      </div>
                      <span className="rk-flags-filtered-count">
                        Hiển thị {filteredFlags.length} / {dashboard.flags.length} chi nhánh
                      </span>
                    </div>

                    <div className="rk-flags-grid">
                      {filteredFlags.map(item => (
                        <div key={item.id} className="rk-flag-item">
                          <div className="rk-flag-info">
                            <strong className="rk-flag-store-name">{item.storeName}</strong>
                            <span
                              className={`rk-flag-status-chip ${
                                item.message.includes('Chưa có') || item.smStatus === 'MISSING'
                                  ? 'missing'
                                  : 'need-select'
                              }`}
                            >
                              {item.message || (item.smStatus === 'MISSING' ? 'Chưa có SM hợp lệ' : 'HR cần chọn SM')}
                            </span>
                          </div>
                          {item.storeId && (
                            <button
                              type="button"
                              className="rk-flag-action-btn"
                              onClick={() => openDraftForStore(item.storeId!, item.candidateSMs[0]?.employeeId)}
                            >
                              ➕ Gán SM & mục tiêu
                            </button>
                          )}
                        </div>
                      ))}
                    </div>

                    <div className="rk-flags-footer-tip">
                      💡 <strong>Hướng dẫn:</strong> Với các cửa hàng có nhiều SM phụ trách, bấm "Gán SM & mục tiêu" để chọn người đại diện phụ trách KPI tháng này.
                    </div>
                  </div>
                )}
              </div>
            )}

            {dashboard.assignments.length > 0 && (
              <div className="rk-view-controls">
                <div className="rk-unit-tabs" role="tablist" aria-label="Phân loại theo cửa hàng và khu vực">
                  <button
                    type="button"
                    className={`rk-unit-tab ${unitFilter === 'ALL' ? 'active' : ''}`}
                    onClick={() => setUnitFilter('ALL')}
                  >
                    Tất cả ({dashboard.assignments.length})
                  </button>
                  <button
                    type="button"
                    className={`rk-unit-tab ${unitFilter === 'STORE' ? 'active' : ''}`}
                    onClick={() => setUnitFilter('STORE')}
                  >
                    🏪 Theo cửa hàng · SM ({stats?.storeCount ?? 0})
                  </button>
                  <button
                    type="button"
                    className={`rk-unit-tab ${unitFilter === 'AREA' ? 'active' : ''}`}
                    onClick={() => setUnitFilter('AREA')}
                  >
                    🗺️ Theo khu vực · AM ({stats?.areaCount ?? 0})
                  </button>
                </div>

                <div className="rk-filter-right">
                  <div className="rk-status-pills">
                    {[
                      ['ALL', 'Tất cả trạng thái'],
                      ['DRAFT', `Nháp (${stats?.draftCount ?? 0})`],
                      ['PENDING_ACCEPTANCE', `Chờ xác nhận (${stats?.pendingCount ?? 0})`],
                      ['ACTIVE', `Đang thực hiện (${stats?.activeCount ?? 0})`],
                      ...(stats?.attentionCount ? [['ATTENTION', `Cần xử lý (${stats.attentionCount})`]] : []),
                    ].map(([code, label]) => (
                      <button
                        key={code}
                        type="button"
                        className={`rk-status-pill ${statusFilter === code ? 'active' : ''}`}
                        onClick={() => setStatusFilter(code)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <div className="rk-inline-search">
                    <input
                      type="search"
                      placeholder="Tìm cửa hàng, khu vực, SM/AM..."
                      aria-label="Tìm kiếm mục tiêu KPI"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}

            {!dashboard.assignments.length && <p className="rk-empty">Chưa có mục tiêu trong phạm vi của bạn.</p>}

            {dashboard.assignments.length > 0 && filteredAssignments.length === 0 && (
              <div className="rk-empty">
                <p>Không có mục tiêu nào khớp với bộ lọc hiện tại.</p>
                <button
                  type="button"
                  onClick={() => {
                    setUnitFilter('ALL');
                    setStatusFilter('ALL');
                    setSearchQuery('');
                  }}
                >
                  Xóa bộ lọc
                </button>
              </div>
            )}

            <div className="rk-assignment-list">
              {unitFilter === 'ALL' &&
              filteredAssignments.some(a => a.unitType === 'AREA') &&
              filteredAssignments.some(a => a.unitType === 'STORE') ? (
                <>
                  <section className="rk-group-section" aria-label="Nhóm KPI theo khu vực AM">
                    <div className="rk-group-header">
                      <h3>🗺️ Doanh thu theo Khu vực (AM)</h3>
                      <span>{filteredAssignments.filter(a => a.unitType === 'AREA').length} khu vực</span>
                    </div>
                    <div className="rk-group-cards">
                      {filteredAssignments.filter(a => a.unitType === 'AREA').map(renderAssignmentCard)}
                    </div>
                  </section>

                  <section className="rk-group-section" aria-label="Nhóm KPI theo cửa hàng SM">
                    <div className="rk-group-header">
                      <h3>🏪 Doanh thu theo Cửa hàng (SM)</h3>
                      <span>{filteredAssignments.filter(a => a.unitType === 'STORE').length} cửa hàng</span>
                    </div>
                    <div className="rk-group-cards rk-store-cards-grid">
                      {filteredAssignments.filter(a => a.unitType === 'STORE').map(renderAssignmentCard)}
                    </div>
                  </section>
                </>
              ) : (
                <div className={unitFilter === 'STORE' ? 'rk-group-cards rk-store-cards-grid' : 'rk-group-cards'}>
                  {filteredAssignments.map(renderAssignmentCard)}
                </div>
              )}
            </div>
          </>
        )
      )}

      <dialog ref={dialog} className="rk-dialog" aria-labelledby="rk-dialog-title" onCancel={e => { e.preventDefault(); close(); }}>
        {modal && (
          <form
            onSubmit={e => {
              e.preventDefault();
              if (modal.kind === 'bulk-apply' || modal.kind === 'bulk-publish') {
                void bulk(modal.kind === 'bulk-apply' ? 'apply' : 'publish');
              } else {
                void submit();
              }
            }}
          >
            <div className="rk-dialog-head">
              <h2 id="rk-dialog-title">
                {
                  ({
                    create: 'Tạo kỳ KPI doanh thu',
                    compute: 'Tính kết quả doanh thu',
                    close: 'Chốt kỳ KPI',
                    draft: 'Thêm mục tiêu',
                    edit: 'Sửa mục tiêu nháp',
                    publish: 'Phát hành mục tiêu',
                    accept: 'Chấp nhận KPI',
                    refuse: 'Từ chối KPI',
                    decision: 'HR xử lý mục tiêu',
                    request: 'Yêu cầu điều chỉnh',
                    verify: 'AM xác minh',
                    adjustment: 'HR quyết định điều chỉnh',
                    reason: 'Giải trình kết quả',
                    review: 'Xem xét giải trình',
                    confirm: 'Xác nhận kết quả',
                    correct: 'Điều chỉnh sau chốt',
                    responsibility: 'Cập nhật SM phụ trách',
                    ai: 'Lấy đề xuất AI',
                    'apply-ai': 'Áp dụng đề xuất cho cửa hàng',
                    'bulk-apply': 'Áp dụng đề xuất vào bản nháp',
                    'bulk-publish': 'Phát hành các bản nháp',
                  } as Record<string, string>)[modal.kind]
                }
              </h2>
              <button type="button" disabled={busy} onClick={close} aria-label="Đóng hộp thoại KPI">
                ×
              </button>
            </div>
            {selected && (
              <p className="rk-dialog-target-summary">
                <strong>{selected.unitType === 'STORE' ? selected.stores[0].storeName : `Khu vực ${selected.assigneeName}`}</strong> · Mục tiêu hiện tại: {money(selected.targetVnd)}
              </p>
            )}
            {['draft', 'edit'].includes(modal.kind) && (
              <>
                <label>
                  Loại mục tiêu
                  <select
                    aria-label="Loại mục tiêu"
                    value={values.unitType}
                    disabled={modal.kind === 'edit'}
                    onChange={e => {
                      v('unitType', e.target.value);
                      v('employeeId', '');
                    }}
                  >
                    <option value="STORE">Cửa hàng · SM</option>
                    <option value="AREA">Khu vực · AM</option>
                  </select>
                </label>
                {values.unitType === 'STORE' && (
                  <label>
                    Cửa hàng
                    <select
                      aria-label="Cửa hàng KPI"
                      required
                      value={values.storeId}
                      disabled={modal.kind === 'edit'}
                      onChange={e => {
                        v('storeId', e.target.value);
                        v('employeeId', '');
                      }}
                    >
                      <option value="">Chọn cửa hàng</option>
                      {dashboard?.stores.map(s => (
                        <option key={s.id} value={s.id} disabled={s.smStatus === 'MISSING'}>
                          {s.name}
                          {s.smStatus === 'MISSING' ? ' · chưa có SM' : s.smStatus === 'AMBIGUOUS' ? ' · HR chọn SM' : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label>
                  Người phụ trách
                  <select aria-label="Người phụ trách KPI" required value={values.employeeId} onChange={e => v('employeeId', e.target.value)}>
                    <option value="">Chọn người phụ trách</option>
                    {dashboard?.candidates
                      .filter(
                        c =>
                          c.role === (values.unitType === 'STORE' ? 'SM' : 'AM') &&
                          (values.unitType !== 'STORE' || c.storeIds.includes(values.storeId))
                      )
                      .map(c => (
                        <option key={c.employeeId} value={c.employeeId}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </label>
                {values.unitType === 'AREA' && (
                  <p>Khu vực lấy toàn bộ cửa hàng của AM đã xác minh, cộng mục tiêu từng cửa hàng. Cần tạo mục tiêu cửa hàng trước.</p>
                )}
              </>
            )}
            {modal.kind === 'create' && (
              <>
                <label>
                  Ngưỡng cửa hàng không đạt (%)
                  <input
                    aria-label="Ngưỡng cửa hàng không đạt"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    required
                    value={values.threshold}
                    onChange={e => v('threshold', e.target.value)}
                  />
                </label>
                <label>
                  Thời hạn xác nhận (ngày làm việc)
                  <input type="number" min="1" max="30" required value={values.days} onChange={e => v('days', e.target.value)} />
                </label>
                <label className="rk-check">
                  <input
                    type="checkbox"
                    aria-label="Cho phép dữ liệu POS demo trong kỳ này"
                    checked={values.allowDemo}
                    onChange={e => v('allowDemo', e.target.checked)}
                  />
                  Cho phép dữ liệu POS mô phỏng trong kỳ này
                </label>
              </>
            )}
            {modal.kind === 'decision' && (
              <label>
                Quyết định HR
                <select aria-label="Quyết định HR" value={values.action} onChange={e => v('action', e.target.value)}>
                  <option value="ADJUST">Điều chỉnh và yêu cầu xác nhận lại</option>
                  <option value="KEEP">Giữ nguyên mục tiêu</option>
                  <option value="CANCEL">Hủy KPI</option>
                </select>
              </label>
            )}
            {modal.kind === 'adjustment' && (
              <label>
                Quyết định điều chỉnh
                <select value={values.action} onChange={e => v('action', e.target.value)}>
                  <option value="ADJUST">Phê duyệt mục tiêu mới</option>
                  <option value="REJECT">Từ chối điều chỉnh</option>
                </select>
              </label>
            )}
            {modal.kind === 'review' && (
              <label>
                Xem xét giải trình
                <select value={values.action} onChange={e => v('action', e.target.value)}>
                  <option value="ADJUST">Đã xem xét, ghi nhận</option>
                  <option value="REJECT">Yêu cầu giải trình lại</option>
                </select>
              </label>
            )}
            {modal.kind === 'create' ||
            (['draft', 'edit'].includes(modal.kind) && values.unitType === 'STORE') ||
            (modal.kind === 'decision' && values.action === 'ADJUST') ||
            (modal.kind === 'adjustment' && values.action !== 'REJECT') ? (
              <>
                {modal.kind !== 'create' && selected?.unitType !== 'AREA' && (
                  <label>
                    Cách giao mục tiêu
                    <select aria-label="Cách giao mục tiêu" value={values.mode} onChange={e => v('mode', e.target.value)}>
                      <option value="GROWTH_PERCENT">Tăng trưởng so tháng trước (%)</option>
                      <option value="ABSOLUTE_VND">Mục tiêu VND tuyệt đối</option>
                    </select>
                  </label>
                )}
                {modal.kind !== 'create' && (values.mode === 'ABSOLUTE_VND' || selected?.unitType === 'AREA') ? (
                  <label>
                    Mục tiêu VND
                    <input
                      aria-label="Mục tiêu VND"
                      type="number"
                      min="1"
                      step="1"
                      max={Number.MAX_SAFE_INTEGER}
                      required
                      value={values.amount}
                      onChange={e => v('amount', e.target.value)}
                    />
                  </label>
                ) : (
                  <label>
                    Mức tăng (%)
                    <input
                      aria-label="Mức tăng KPI"
                      type="number"
                      min="-50"
                      max="100"
                      step="0.01"
                      required
                      value={values.growth}
                      onChange={e => v('growth', e.target.value)}
                    />
                  </label>
                )}
              </>
            ) : null}
            {modal.kind === 'decision' && values.action === 'KEEP' && (
              <label className="rk-check">
                <input type="checkbox" checked={values.force} onChange={e => v('force', e.target.checked)} />
                HR chủ động giữ nguyên trước hạn, lưu lý do
              </label>
            )}
            {modal.kind === 'request' && (
              <label>
                Bằng chứng / tài liệu tham chiếu
                <textarea
                  aria-label="Bằng chứng điều chỉnh"
                  minLength={5}
                  maxLength={2000}
                  required
                  value={values.evidenceRef}
                  onChange={e => v('evidenceRef', e.target.value)}
                />
              </label>
            )}
            {modal.kind === 'confirm' && modal.r?.achieved === false && (
              <label className="rk-check">
                <input type="checkbox" checked={values.waive} onChange={e => v('waive', e.target.checked)} />
                HR miễn yêu cầu giải trình hoặc xác nhận ngoại lệ, có lý do
              </label>
            )}
            {modal.kind === 'responsibility' && (
              <>
                <label>
                  SM phụ trách mới
                  <select required value={values.employeeId} onChange={e => v('employeeId', e.target.value)}>
                    {dashboard?.candidates
                      .filter(c => c.role === 'SM' && c.storeIds.includes(selected!.storeId!))
                      .map(c => (
                        <option key={c.employeeId} value={c.employeeId}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Thời điểm bắt đầu (giờ Việt Nam)
                  <input type="datetime-local" required value={values.from} onChange={e => v('from', e.target.value)} />
                </label>
                <p>Mục tiêu cửa hàng giữ nguyên; người mới cần xác nhận lại. Lịch sử người phụ trách cũ được lưu.</p>
              </>
            )}
            {['draft', 'edit', 'refuse', 'decision', 'request', 'verify', 'adjustment', 'reason', 'review', 'correct', 'responsibility'].includes(
              modal.kind
            ) ||
            (modal.kind === 'confirm' && values.waive) ? (
              <label>
                {modal.kind === 'reason' ? 'Lý do chưa đạt' : 'Lý do / ghi chú'}
                <textarea
                  aria-label="Lý do KPI doanh thu"
                  minLength={5}
                  maxLength={2000}
                  required
                  value={values.reason}
                  onChange={e => v('reason', e.target.value)}
                />
              </label>
            ) : null}
            {['ai', 'bulk-apply'].includes(modal.kind) && (
              <p>Đề xuất tham khảo; HR quyết định. Lấy đề xuất không tự thay mục tiêu. Áp dụng chỉ sửa bản nháp, phát hành là bước riêng.</p>
            )}
            {modal.kind === 'apply-ai' && (
              <p>Áp dụng mức {percentage(selected?.aiProposal?.suggestedGrowthPercent)} so với tháng gốc cho bản nháp của cửa hàng này. Bạn có thể chỉnh sửa trước khi phát hành.</p>
            )}
            {modal.kind === 'bulk-publish' && <p>Phát hành tất cả bản nháp đủ điều kiện. Mỗi SM/AM sẽ nhận yêu cầu xác nhận KPI của mình.</p>}
            {modal.kind === 'compute' && <p>Tính từ doanh thu POS của kỳ. Thiếu dữ liệu sẽ chưa kết luận; không tự xác nhận hoặc chốt kết quả.</p>}
            {modal.kind === 'close' && (
              <p>Chỉ chốt khi đã hết tháng, mọi KPI không hủy đã xác nhận đầy đủ. Sau chốt, thay đổi cần tạo bản điều chỉnh có lý do.</p>
            )}
            {error && (
              <p role="alert" className="rk-error">
                {error}
              </p>
            )}
            <footer>
              <button type="button" disabled={busy} onClick={close}>
                Hủy
              </button>
              <button type="submit" disabled={busy}>
                {busy ? 'Đang xử lý…' : 'Xác nhận'}
              </button>
            </footer>
          </form>
        )}
      </dialog>
    </section>
  );
}
