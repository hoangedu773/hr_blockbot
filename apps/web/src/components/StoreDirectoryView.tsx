import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DashboardOverview, StoreKind, StoreStatus, StoreSummary } from '@hr-blockbot/contracts';
import { StoreCreateSchema } from '@hr-blockbot/contracts';
import type { PaginationMeta } from '@hr-blockbot/contracts';
import {
  ApiError,
  createStore,
  deleteStore,
  fetchDashboardOverview,
  fetchStores,
  updateStore,
} from '../services/api';
import type { NotifyFn } from './Toast';

export interface StoreDirectoryViewProps {
  userRole: string;
  onNotify?: NotifyFn;
  onSelectStore?: (store: StoreSummary) => void;
  onOverviewLoaded?: (overview: DashboardOverview) => void;
  onOverviewError?: (message: string) => void;
  /** Emits the visible page so the parent can resolve drawer clicks by id. */
  onStoresLoaded?: (stores: StoreSummary[]) => void;
  /**
   * District filter is lifted to the parent: the chrome header owns the
   * "Bộ lọc Quận" control, so the value must live above this component.
   */
  district: string;
  onDistrictChange: (district: string) => void;
  onDistrictOptions?: (options: string[]) => void;
}

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 250;

const KIND_LABEL: Record<StoreKind, string> = {
  outlet: 'Cửa hàng',
  group: 'Nhóm',
  support: 'Hỗ trợ',
};

type FormMode = 'create' | 'edit';

interface StoreFormState {
  name: string;
  code: string;
  kind: StoreKind;
  district: string;
  status: StoreStatus;
}

const EMPTY_FORM: StoreFormState = {
  name: '',
  code: '',
  kind: 'outlet',
  district: '',
  status: 'ACTIVE',
};

type FieldErrors = Partial<Record<keyof StoreFormState, string>>;

function validateForm(form: StoreFormState): FieldErrors {
  const parsed = StoreCreateSchema.safeParse({
    name: form.name,
    code: form.code.trim() === '' ? null : form.code,
    kind: form.kind,
    district: form.district.trim() === '' ? null : form.district,
    status: form.status,
  });
  if (parsed.success) return {};
  const errors: FieldErrors = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0];
    if (field === 'name' || field === 'code' || field === 'kind' || field === 'district' || field === 'status') {
      if (!errors[field]) errors[field] = issue.message;
    }
  }
  return errors;
}

function formatMoney(value: number): string {
  return `${new Intl.NumberFormat('vi-VN').format(value)} ₫`;
}

function formatMetric(
  metric: DashboardOverview['revenue'] | null,
  format: (value: number) => string
): { text: string; title?: string } {
  if (!metric) return { text: '…' };
  if (metric.value === null) {
    return { text: '—', title: metric.reason ?? 'Chưa có nguồn dữ liệu' };
  }
  return { text: format(metric.value), title: metric.asOf ? `Số liệu tại ${metric.asOf}` : undefined };
}

export const StoreDirectoryView: React.FC<StoreDirectoryViewProps> = ({
  userRole,
  onNotify,
  onSelectStore,
  onOverviewLoaded,
  onOverviewError,
  onStoresLoaded,
  district,
  onDistrictChange,
  onDistrictOptions,
}) => {
  const isAdmin = userRole === 'Admin';

  const [stores, setStores] = useState<StoreSummary[]>([]);
  const [paging, setPaging] = useState<PaginationMeta | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [overviewError, setOverviewError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState<string>('');
  // Only the debounced term triggers a fetch; only the latest request may write
  // state. Same guard as EmployeeListView (P2-11): a slow older response must
  // never overwrite the result of a newer keystroke.
  const [debouncedTerm, setDebouncedTerm] = useState<string>('');
  const latestRequestRef = useRef<number>(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [kind, setKind] = useState<StoreKind | ''>('');
  const [status, setStatus] = useState<StoreStatus | ''>('');
  const [page, setPage] = useState<number>(1);
  // District options accumulate from every response so the cycle control does
  // not lose entries once a district filter narrows the result set.
  const [districtOptions, setDistrictOptions] = useState<string[]>([]);

  const [formMode, setFormMode] = useState<FormMode | null>(null);
  const [editingStore, setEditingStore] = useState<StoreSummary | null>(null);
  const [form, setForm] = useState<StoreFormState>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const notify: NotifyFn = onNotify ?? ((type, message) => {
    console.log(`[Toast ${type}] ${message}`);
  });

  const onStoresLoadedRef = useRef(onStoresLoaded);
  onStoresLoadedRef.current = onStoresLoaded;

  useEffect(() => {
    onDistrictOptions?.(districtOptions);
  }, [districtOptions, onDistrictOptions]);

  useEffect(() => {
    if (searchTerm === '') {
      setDebouncedTerm('');
      return;
    }
    const timer = setTimeout(() => setDebouncedTerm(searchTerm), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    setPage(1);
  }, [debouncedTerm, kind, district, status]);

  const loadStores = useCallback(async () => {
    const requestId = ++latestRequestRef.current;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetchStores({
        q: debouncedTerm || undefined,
        kind: kind || undefined,
        district: district || undefined,
        status: status || undefined,
        page,
        limit: PAGE_SIZE,
      });
      if (requestId !== latestRequestRef.current) return;
      setStores(res.items);
      setPaging(res.paging);
      onStoresLoadedRef.current?.(res.items);
      setDistrictOptions((previous) => {
        const merged = new Set(previous);
        for (const item of res.items) {
          const value = item.district?.trim();
          if (value) merged.add(value);
        }
        // Insertion order mirrors the server's sort; sorting here would make the
        // district cycle jump around as filters change.
        return [...merged];
      });
    } catch (err: unknown) {
      if (requestId !== latestRequestRef.current) return;
      const message = err instanceof Error ? err.message : 'Không tải được danh sách cửa hàng';
      setError(message);
    } finally {
      if (requestId === latestRequestRef.current) {
        setIsLoading(false);
      }
    }
  }, [debouncedTerm, kind, district, status, page]);

  useEffect(() => {
    void loadStores();
  }, [loadStores]);

  useEffect(() => {
    let cancelled = false;
    setOverviewError(null);
    fetchDashboardOverview()
      .then((data) => {
        if (cancelled) return;
        setOverview(data);
        onOverviewLoaded?.(data);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Không tải được số liệu tổng quan';
        setOverviewError(message);
        onOverviewError?.(message);
      });
    return () => {
      cancelled = true;
    };
  }, [onOverviewLoaded]);

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && (event.key === 'k' || event.key === 'K')) {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, []);

  const resetFilters = () => {
    setSearchTerm('');
    setDebouncedTerm('');
    setKind('');
    onDistrictChange('');
    setStatus('');
    setPage(1);
  };

  const hasActiveFilter = searchTerm !== '' || kind !== '' || district !== '' || status !== '';

  const openCreateForm = () => {
    setFormMode('create');
    setEditingStore(null);
    setForm(EMPTY_FORM);
    setFieldErrors({});
    setFormError(null);
  };

  const openEditForm = (store: StoreSummary) => {
    setFormMode('edit');
    setEditingStore(store);
    setForm({
      name: store.name,
      code: store.code ?? '',
      kind: store.kind,
      district: store.district ?? '',
      status: store.status,
    });
    setFieldErrors({});
    setFormError(null);
  };

  const closeForm = () => {
    if (isSaving) return;
    setFormMode(null);
    setEditingStore(null);
    setFormError(null);
  };

  const submitForm = async (event: React.FormEvent) => {
    event.preventDefault();
    const errors = validateForm(form);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const payload = {
      name: form.name.trim(),
      code: form.code.trim() === '' ? null : form.code.trim(),
      kind: form.kind,
      district: form.district.trim() === '' ? null : form.district.trim(),
      status: form.status,
    };

    setIsSaving(true);
    setFormError(null);
    try {
      if (formMode === 'edit' && editingStore) {
        await updateStore(editingStore.id, payload);
        notify('Đã cập nhật cửa hàng.', 'success', 'Cập nhật thành công');
      } else {
        await createStore(payload);
        notify('Đã thêm cửa hàng mới.', 'success', 'Tạo thành công');
      }
      setFormMode(null);
      setEditingStore(null);
      await loadStores();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Không lưu được cửa hàng');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (store: StoreSummary) => {
    const label = store.code ? `${store.code} — ${store.name}` : store.name;
    if (!window.confirm(`Xoá cửa hàng "${label}"? Thao tác này không thể hoàn tác.`)) return;

    setDeletingId(store.id);
    try {
      await deleteStore(store.id);
      notify('Đã xoá cửa hàng.', 'success', 'Xoá thành công');
      await loadStores();
    } catch (err: unknown) {
      // 409 STORE_HAS_EMPLOYEES is a business rule, not a transport failure:
      // surface the headcount the user must reassign, never the raw error code.
      const hasEmployees =
        err instanceof ApiError && (err.code === 'STORE_HAS_EMPLOYEES' || err.status === 409);
      if (hasEmployees) {
        const count = store.employeeCount;
        notify(
          `Cửa hàng còn ${count} nhân sự, không thể xoá. Vui lòng điều chuyển nhân sự trước.`,
          'error',
          'Không thể xoá cửa hàng'
        );
      } else {
        notify(err instanceof Error ? err.message : 'Không xoá được cửa hàng', 'error', 'Xoá thất bại');
      }
    } finally {
      setDeletingId(null);
    }
  };

  const outletMetric = overview
    ? { text: new Intl.NumberFormat('vi-VN').format(overview.stores.outlets) }
    : { text: overviewError ? '—' : '…', title: overviewError ?? undefined };
  const staffMetric = overview
    ? { text: new Intl.NumberFormat('vi-VN').format(overview.employees.active) }
    : { text: overviewError ? '—' : '…', title: overviewError ?? undefined };
  const revenueMetric = formatMetric(overview?.revenue ?? null, formatMoney);
  const onTimeMetric = formatMetric(
    overview?.onTimeRate ?? null,
    (value) => `${value.toFixed(1)}%`
  );

  const pagingLabel = useMemo(() => {
    if (!paging) return 'Đang tải danh sách cửa hàng…';
    return `Hiển thị ${stores.length} / ${paging.totalItems} Cửa hàng`;
  }, [paging, stores.length]);

  return (
    <div>
      {/* KPI strip: one container divided by hairlines. No icon, no gradient,
          no blur — the 1px gap between cells is the only rule (phase 01). */}
      <div className="crm-kpi-grid">
        <div className="crm-kpi-card">
          <div className="crm-kpi-header">
            <span className="crm-kpi-title">Tổng cửa hàng</span>
          </div>
          <div className="crm-kpi-value" title={outletMetric.title}>
            {outletMetric.text}<span className="crm-kpi-unit">chi nhánh</span>
          </div>
          <div className="crm-kpi-meta">
            {overview
              ? `${overview.stores.groups} nhóm · ${overview.stores.support} hỗ trợ`
              : overviewError ? 'Không tải được số liệu tổng quan' : 'Đang tải số liệu…'}
          </div>
        </div>

        <div className="crm-kpi-card">
          <div className="crm-kpi-header">
            <span className="crm-kpi-title">Nhân sự đang hoạt động</span>
          </div>
          <div className="crm-kpi-value" title={staffMetric.title}>
            {staffMetric.text}<span className="crm-kpi-unit">nhân sự</span>
          </div>
          <div className="crm-kpi-meta">
            {overview
              ? `${overview.employees.total} tổng · ${overview.employees.inactive} tạm dừng`
              : overviewError ? 'Không tải được số liệu tổng quan' : 'Đang tải số liệu…'}
          </div>
        </div>

        <div className="crm-kpi-card">
          <div className="crm-kpi-header">
            <span className="crm-kpi-title">Doanh thu két sáng</span>
          </div>
          <div className="crm-kpi-value crm-kpi-value--lead" title={revenueMetric.title}>
            {revenueMetric.text}
          </div>
          <div className="crm-kpi-meta">
            {overview
              ? (overview.revenue.value === null
                  ? (overview.revenue.reason ?? 'Chưa có nguồn dữ liệu')
                  : `Nguồn: ${overview.revenue.source}`)
              : overviewError ? 'Không tải được số liệu' : 'Đang tải số liệu…'}
          </div>
        </div>

        <div className="crm-kpi-card">
          <div className="crm-kpi-header">
            <span className="crm-kpi-title">Tỷ lệ đúng giờ</span>
          </div>
          <div className="crm-kpi-value" title={onTimeMetric.title}>
            {onTimeMetric.text}
          </div>
          <div className="crm-kpi-meta">
            {overview
              ? (overview.onTimeRate.value === null
                  ? (overview.onTimeRate.reason ?? 'Chưa có nguồn dữ liệu')
                  : `Nguồn: ${overview.onTimeRate.source}`)
              : overviewError ? 'Không tải được số liệu' : 'Đang tải số liệu…'}
          </div>
        </div>
      </div>

      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">Guta Workspace — Quản lý nhân sự &amp; chi nhánh</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Dữ liệu cửa hàng và nhân sự lấy trực tiếp từ hệ thống. Bấm vào từng hàng để mở Slide-Over Drawer.
          </p>
        </div>
        <div className="text-xs font-medium text-muted-foreground whitespace-nowrap">{pagingLabel}</div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          ref={searchInputRef}
          type="text"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="Lọc theo tên, quận, mã..."
          aria-label="Lọc theo tên, quận, mã"
          className="flex-1 bg-transparent border border-border/70 rounded-xl px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground outline-none"
          style={{ minWidth: 220 }}
        />

        <select
          value={kind}
          onChange={(event) => setKind(event.target.value as StoreKind | '')}
          aria-label="Lọc theo loại cửa hàng"
          className="bg-transparent border border-border/70 rounded-xl px-3 py-2 text-xs text-foreground outline-none"
        >
          <option value="">Tất cả loại</option>
          <option value="outlet">Cửa hàng</option>
          <option value="group">Nhóm</option>
          <option value="support">Hỗ trợ</option>
        </select>

        <select
          value={status}
          onChange={(event) => setStatus(event.target.value as StoreStatus | '')}
          aria-label="Lọc theo trạng thái"
          className="bg-transparent border border-border/70 rounded-xl px-3 py-2 text-xs text-foreground outline-none"
        >
          <option value="">Tất cả trạng thái</option>
          <option value="ACTIVE">Đang hoạt động</option>
          <option value="INACTIVE">Tạm dừng</option>
        </select>

        {/* The chrome header owns the "Bộ lọc Quận" cycle button; this select
            mirrors the same lifted value for keyboard/direct selection. */}
        <select
          value={district}
          onChange={(event) => onDistrictChange(event.target.value)}
          aria-label="Lọc theo quận"
          className="bg-transparent border border-border/70 rounded-xl px-3 py-2 text-xs text-foreground outline-none"
        >
          <option value="">Tất cả quận</option>
          {districtOptions.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>

        {isAdmin && (
          <button
            type="button"
            onClick={openCreateForm}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-zinc-700 to-zinc-800 hover:from-zinc-400 hover:to-zinc-700 text-white text-xs font-bold transition-colors shadow-sm cursor-pointer active:scale-95 transition-transform"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="M12 5v14" /></svg>
            <span>Thêm cửa hàng</span>
          </button>
        )}
      </div>

      <div className="crm-table-shell overflow-x-auto">
      <table className="crm-table">
        <thead className="crm-table-head">
          <tr>
            <th scope="col">Cửa hàng</th>
            <th scope="col">Quản lý</th>
            <th scope="col" className="crm-num-head">Khu vực</th>
            <th scope="col" className="crm-num-head">Nhân sự</th>
            <th scope="col">Trạng thái</th>
            {isAdmin && <th scope="col" className="crm-num-head">Thao tác</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60 font-medium">
          {isLoading && (
            <>
              {[0, 1, 2].map((index) => (
                <tr key={`skeleton-${index}`}>
                  <td className="p-3"><div className="skeleton h-4 w-16" /></td>
                  <td className="p-3"><div className="skeleton h-4 w-44" /></td>
                  <td className="p-3"><div className="skeleton h-4 w-20" /></td>
                  <td className="p-3"><div className="skeleton h-4 w-28" /></td>
                  <td className="p-3"><div className="skeleton h-4 w-12" /></td>
                  <td className="p-3"><div className="skeleton h-4 w-16" /></td>
                  {isAdmin && <td className="p-3"><div className="skeleton h-4 w-14" /></td>}
                </tr>
              ))}
              <tr>
                <td colSpan={isAdmin ? 7 : 6} className="text-center py-3 px-4 text-xs text-muted-foreground">
                  Đang tải danh sách cửa hàng…
                </td>
              </tr>
            </>
          )}

          {!isLoading && error && (
            <tr>
              <td colSpan={isAdmin ? 7 : 6} className="text-center py-10 px-4">
                <div className="flex flex-col items-center justify-center max-w-sm mx-auto space-y-3">
                  <p className="text-sm font-semibold" style={{ color: 'var(--status-late)' }}>Không tải được danh sách cửa hàng.</p>
                  <p className="text-xs text-muted-foreground">{error}</p>
                  <button
                    type="button"
                    onClick={() => void loadStores()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-background hover:bg-muted text-xs font-medium text-foreground transition-colors active:scale-95 cursor-pointer"
                  >
                    Thử lại
                  </button>
                </div>
              </td>
            </tr>
          )}

          {!isLoading && !error && stores.length === 0 && (
            <tr>
              <td colSpan={isAdmin ? 7 : 6} className="text-center py-10 px-4">
                <div className="flex flex-col items-center justify-center max-w-sm mx-auto space-y-3">
                  <div className="size-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground shadow-2xs">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="opacity-70"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /><path d="M8 11h6" /></svg>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">
                      {hasActiveFilter
                        ? 'Không tìm thấy chi nhánh nào phù hợp với từ khóa tìm kiếm.'
                        : 'Chưa có cửa hàng nào'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {hasActiveFilter
                        ? 'Vui lòng kiểm tra lại tên đường, mã chi nhánh hoặc xóa bộ lọc.'
                        : 'Thêm cửa hàng đầu tiên để bắt đầu quản lý danh mục.'}
                    </p>
                  </div>
                  {hasActiveFilter && (
                    <button
                      type="button"
                      onClick={resetFilters}
                      className="reset-filter-btn inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-background hover:bg-muted text-xs font-medium text-foreground transition-colors active:scale-95 cursor-pointer"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></svg>
                      <span>Đặt lại bộ lọc</span>
                    </button>
                  )}
                </div>
              </td>
            </tr>
          )}

          {!isLoading && !error && stores.map((store) => (
            <tr
              key={store.id}
              className="table-row-hover cursor-pointer"
              data-id={store.id}
              data-name={store.name}
              data-district={store.district ?? ''}
              data-staff={store.activeEmployeeCount}
              data-staff-total={store.employeeCount}
              data-kind={store.kind}
              data-status={store.status}
              onClick={() => onSelectStore?.(store)}
            >
              <td data-col="store" className="crm-cell-identity">
                <span className="crm-cell-primary">{store.name}</span>
                <span className="crm-cell-sub">
                  <span className="crm-col-code">{store.code ?? '—'}</span> · {store.district ?? '—'}
                </span>
              </td>
              <td data-col="sm">
                <span className="crm-cell-primary">{store.managerName ?? '—'}</span>
              </td>
              <td data-col="district" className="crm-num">
                <span className="crm-cell-primary">{store.district ?? '—'}</span>
                <span className="crm-cell-sub">{KIND_LABEL[store.kind]}</span>
              </td>
              <td data-col="staff" className="crm-num">
                <span className="crm-cell-primary">{store.activeEmployeeCount}</span>
                <span className="crm-cell-sub">/ {store.employeeCount} định biên</span>
              </td>
              <td data-col="status">
                <span className={store.status === 'ACTIVE' ? 'crm-status crm-status--positive' : 'crm-status crm-status--negative'}>
                  {store.status === 'ACTIVE' ? 'Đang hoạt động' : 'Tạm dừng'}
                </span>
              </td>
              {isAdmin && (
                <td data-col="actions" className="crm-num">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      openEditForm(store);
                    }}
                    className="crm-icon-btn"
                  >
                    Sửa
                  </button>
                  <button
                    type="button"
                    disabled={deletingId === store.id}
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleDelete(store);
                    }}
                    className="crm-icon-btn crm-icon-btn--danger"
                  >
                    {deletingId === store.id ? 'Đang xoá…' : 'Xoá'}
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      {paging && paging.totalPages > 1 && (
        <div className="mt-3 flex items-center justify-end gap-2 text-xs text-muted-foreground">
          <button
            type="button"
            disabled={!paging.hasPrev}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            className="px-3 py-1.5 rounded-lg border border-border bg-background hover:bg-muted disabled:opacity-50 cursor-pointer"
          >
            Trước
          </button>
          <span>
            Trang {paging.page} / {paging.totalPages}
          </span>
          <button
            type="button"
            disabled={!paging.hasNext}
            onClick={() => setPage((current) => current + 1)}
            className="px-3 py-1.5 rounded-lg border border-border bg-background hover:bg-muted disabled:opacity-50 cursor-pointer"
          >
            Sau
          </button>
        </div>
      )}

      {formMode && (
        <div
          className="fixed inset-0 flex items-center justify-center p-4"
          style={{ zIndex: 300, background: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(4px)' }}
          role="dialog"
          aria-modal="true"
          aria-label={formMode === 'create' ? 'Thêm cửa hàng' : 'Sửa cửa hàng'}
        >
          <form
            onSubmit={(event) => void submitForm(event)}
            className="w-full max-w-md rounded-2xl border border-border space-y-3"
            style={{ background: 'var(--surface)', padding: 20 }}
          >
            <h2 className="text-sm font-bold text-foreground">
              {formMode === 'create' ? 'Thêm cửa hàng' : 'Sửa cửa hàng'}
            </h2>

            <label className="block text-xs text-muted-foreground">
              Tên cửa hàng
              <input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                aria-label="Tên cửa hàng"
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground outline-none"
              />
              {fieldErrors.name && <span className="mt-1 block text-[11px]" style={{ color: 'var(--status-late)' }}>{fieldErrors.name}</span>}
            </label>

            <label className="block text-xs text-muted-foreground">
              Mã cửa hàng
              <input
                value={form.code}
                onChange={(event) => setForm({ ...form, code: event.target.value })}
                aria-label="Mã cửa hàng"
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground outline-none"
              />
              {fieldErrors.code && <span className="mt-1 block text-[11px]" style={{ color: 'var(--status-late)' }}>{fieldErrors.code}</span>}
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs text-muted-foreground">
                Loại
                <select
                  value={form.kind}
                  onChange={(event) => setForm({ ...form, kind: event.target.value as StoreKind })}
                  aria-label="Loại cửa hàng"
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground outline-none"
                >
                  <option value="outlet">Cửa hàng</option>
                  <option value="group">Nhóm</option>
                  <option value="support">Hỗ trợ</option>
                </select>
                {fieldErrors.kind && <span className="mt-1 block text-[11px]" style={{ color: 'var(--status-late)' }}>{fieldErrors.kind}</span>}
              </label>

              <label className="block text-xs text-muted-foreground">
                Trạng thái
                <select
                  value={form.status}
                  onChange={(event) => setForm({ ...form, status: event.target.value as StoreStatus })}
                  aria-label="Trạng thái cửa hàng"
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground outline-none"
                >
                  <option value="ACTIVE">Đang hoạt động</option>
                  <option value="INACTIVE">Tạm dừng</option>
                </select>
                {fieldErrors.status && <span className="mt-1 block text-[11px]" style={{ color: 'var(--status-late)' }}>{fieldErrors.status}</span>}
              </label>
            </div>

            <label className="block text-xs text-muted-foreground">
              Quận / Khu vực
              <input
                value={form.district}
                onChange={(event) => setForm({ ...form, district: event.target.value })}
                aria-label="Quận khu vực"
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground outline-none"
              />
              {fieldErrors.district && <span className="mt-1 block text-[11px]" style={{ color: 'var(--status-late)' }}>{fieldErrors.district}</span>}
            </label>

            {formError && (
              <p className="rounded-lg px-3 py-2 text-[11px]" style={{ border: '1px solid rgba(244, 63, 94, 0.3)', background: 'rgba(244, 63, 94, 0.1)', color: '#fca5a5' }}>
                {formError}
              </p>
            )}

            <div className="flex items-center justify-end gap-2" style={{ paddingTop: 4 }}>
              <button
                type="button"
                onClick={closeForm}
                disabled={isSaving}
                className="px-3 py-2 rounded-lg border border-border bg-background hover:bg-muted text-xs font-medium text-foreground transition-colors cursor-pointer disabled:opacity-50"
              >
                Huỷ
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="px-4 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                style={{ background: '#ffffff', color: '#000000' }}
              >
                {isSaving ? 'Đang lưu…' : 'Lưu'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
