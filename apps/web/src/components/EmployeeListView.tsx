import React, { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { EmployeeSummary, EmployeeManagement, PaginationMeta, StoreSummary } from '@hr-blockbot/contracts';
import { ApiError, fetchDepartments, fetchEmployees, fetchEmployeeById, fetchPersonnelManagement, fetchStoreById, requestJson, type CrmDepartment, type EmployeeTitleGroup } from '../services/api';
import { Select } from './ui/Select';
import { CrmDialog } from './ui/CrmDialog';
import '../styles/crm-work.css';
import { ProfileApprovalQueue } from './ProfileApprovalQueue';
import { PersonnelAdmin } from './PersonnelAdmin';
import { useAuthorization } from '../context/useAuthorization';
import { EmployeeHrHistory } from './EmployeeHrHistory';
import { SmAppointments, isSmPositionCandidate } from './SmAppointments';
import { ScopedManagerList } from './ScopedManagerList';
import { employeeLocationLabel } from '../services/employee-display';
import { InitialManagerPicker } from './InitialManagerPicker';

const titles: { value: EmployeeTitleGroup; label: string }[] = [
  { value: 'am', label: 'AM — Quản lý khu vực' },
  { value: 'sam', label: 'SAM — Quản lý khu vực cấp cao' },
  { value: 'aom', label: 'AOM — Trợ lý OM' },
  { value: 'om', label: 'OM — Quản lý vùng' },
  { value: 'sm', label: 'SM — Cửa hàng trưởng' },
  { value: 'ptch', label: 'PTCH — Phụ trách cửa hàng' },
  { value: 'staff', label: 'Nhân viên cửa hàng (Cafe)' },
  { value: 'kitchen', label: 'Khối Bếp (Bếp chính / Bếp nấu / Phụ bếp)' },
  { value: 'bakery', label: 'Khối Bánh mì' },
  { value: 'ops_support', label: 'Giao hàng / Bảo vệ / Hỗ trợ vận hành' },
];

export interface EmployeeListViewProps {
  onNavigateOnboarding?: () => void;
}

export const EmployeeListView: React.FC<EmployeeListViewProps> = ({ onNavigateOnboarding }) => {
  const { can } = useAuthorization();
  const canReadManagers = can('stores.read');
  const [view, setView] = useState<'employees' | 'managers'>('employees');
  const [managerRole, setManagerRole] = useState('');
  const openManagers = (role = '') => { setManagerRole(role); setView('managers'); };
  return <>
    {canReadManagers && <nav className="pf-tabs" aria-label="Phạm vi danh sách nhân sự">
      <button type="button" aria-pressed={view==='employees'} onClick={() => setView('employees')}>Nhân sự điểm bán</button>
      <button type="button" aria-pressed={view==='managers'} onClick={() => openManagers()}>Quản lý theo phạm vi</button>
    </nav>}
    {canReadManagers && view==='managers' ? <ScopedManagerList key={managerRole} initialRole={managerRole} />
      : <OutletEmployees onOpenManagers={canReadManagers ? openManagers : undefined} onNavigateOnboarding={onNavigateOnboarding} />}
  </>;
};

function OutletEmployees({ onOpenManagers, onNavigateOnboarding }: { onOpenManagers?: (role?: string) => void; onNavigateOnboarding?: () => void }) {
  const { can, stores } = useAuthorization();
  const canMetadata = can('projects.create');
  const [storeId, setStoreId] = useState('');
  const [employees, setEmployees] = useState<EmployeeSummary[]>([]);
  const [paging, setPaging] = useState<PaginationMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [titleQuery, setTitleQuery] = useState('');
  const [titleGroup, setTitleGroup] = useState<EmployeeTitleGroup | '' | 'custom'>('');
  const [status, setStatus] = useState('');
  const [department, setDepartment] = useState('');
  const [departments, setDepartments] = useState<CrmDepartment[]>([]);
  const [page, setPage] = useState(1);
  const latest = useRef(0);
  const [selected, setSelected] = useState<EmployeeSummary | EmployeeManagement | null>(null);
  const [editingEmployee, setEditingEmployee] = useState<string | null>(null);
  const [detailError, setDetailError] = useState('');
  const [detailLoading, setDetailLoading] = useState(false);
  const detailRequest = useRef(0);

  // Thêm nhân sự mới (Onboarding intake)
  const [showAdd, setShowAdd] = useState(false);
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState('');
  const [addMessage, setAddMessage] = useState('');
  const [addStoreId, setAddStoreId] = useState('');
  const [addFullName, setAddFullName] = useState('');
  const [addPhone, setAddPhone] = useState('');
  const [addEmail, setAddEmail] = useState('');
  const [addHiredAt, setAddHiredAt] = useState(() => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }));
  const [addReason, setAddReason] = useState('Tiếp nhận nhân sự mới điểm bán');
  const [addManagerId, setAddManagerId] = useState('');
  const [addManagerReadyStore, setAddManagerReadyStore] = useState('');

  const availableStores = stores.filter((store) =>
    store.capabilities.includes('onboarding.propose') ||
    store.capabilities.includes('onboarding.draft') ||
    store.capabilities.includes('employees.read_operational') ||
    store.capabilities.includes('stores.read')
  );

  const effectiveStoreId = storeId || (availableStores.length > 0 ? availableStores[0]?.id : '');
  const [currentStore, setCurrentStore] = useState<StoreSummary | null>(null);

  useEffect(() => {
    if (!effectiveStoreId) {
      setCurrentStore(null);
      return;
    }
    let active = true;
    fetchStoreById(effectiveStoreId)
      .then((data) => {
        if (active) setCurrentStore(data);
      })
      .catch(() => {
        if (active) setCurrentStore(null);
      });
    return () => { active = false; };
  }, [effectiveStoreId]);

  const aomManager = currentStore?.managers?.find((m) => m.role === 'aom' || m.role === 'om');
  const amManager = currentStore?.managers?.find((m) => m.role === 'am' || m.role === 'sam');
  const smManager = currentStore?.managers?.find((m) => m.role === 'sm' && m.assignmentKind === 'home') || currentStore?.managers?.find((m) => m.role === 'sm');
  const ptchEmployee = employees.find((e) => e.jobTitle && /PTCH|Phụ trách cửa hàng/i.test(e.jobTitle));

  const isRegionalManager = (title?: string | null) => {
    if (!title) return false;
    return /^(?:AOM|AM|SAM|OM|QUẢN LÝ KHU VỰC|TRỢ LÝ OM|QUẢN LÝ VÙNG)/i.test(title.trim());
  };
  const floorEmployees = employees.filter((e) => !isRegionalManager(e.jobTitle));

  const submitAddEmployee = async (event: FormEvent) => {
    event.preventDefault();
    if (addBusy || !addStoreId || !addFullName.trim() || !addPhone.trim()) return;
    setAddBusy(true); setAddError('');
    try {
      const clientRequestId = crypto.randomUUID();
      const hiredAt = new Date(addHiredAt + 'T00:00:00+07:00').toISOString();
      const payload = {
        clientRequestId,
        fullName: addFullName.trim(),
        phone: addPhone.trim(),
        email: addEmail.trim() || undefined,
        hiredAt,
        storeId: addStoreId,
        reason: addReason.trim() || 'Tiếp nhận nhân sự mới điểm bán',
        ...(addManagerId ? { initialManagerEmployeeId: addManagerId } : {})
      };
      const saved = await requestJson<{ id: string; payload?: { employeeCode?: string } }>('/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const code = saved.payload?.employeeCode ? ` (Mã NV: ${saved.payload.employeeCode})` : '';
      setAddMessage(`Đã gửi đề nghị tiếp nhận nhân viên mới${code} thành công! Hồ sơ đã được chuyển tiếp đến bộ phận HR.`);
      setShowAdd(false);
      setAddFullName(''); setAddPhone(''); setAddEmail('');
      await load();
    } catch (failure) {
      setAddError(failure instanceof Error ? failure.message : 'Không gửi được đề nghị tiếp nhận nhân viên.');
    } finally {
      setAddBusy(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => { setQuery(search); setTitleQuery(jobTitle); setPage(1); }, search || jobTitle ? 250 : 0);
    return () => clearTimeout(timer);
  }, [search, jobTitle]);
  useEffect(() => {
    let mounted = true;
    if (canMetadata) void fetchDepartments().then((items) => { if (mounted) setDepartments(items); }).catch(() => {});
    return () => { mounted = false; };
  }, [canMetadata]);
  const load = useCallback(async () => {
    const sequence = ++latest.current;
    setLoading(true); setError('');
    try {
      const result = await fetchEmployees({
        q: query, jobTitle: titleGroup==='custom' ? titleQuery || undefined : undefined,
        jobTitleGroup: titleGroup && titleGroup!=='custom' ? titleGroup : undefined, storeId: storeId || undefined, status: (status || undefined) as 'active' | 'inactive' | 'UNKNOWN' | undefined,
        departmentId: department || undefined, page, limit: 20,
      });
      if (sequence === latest.current) { setEmployees(result.items); setPaging(result.paging); }
    } catch (failure) {
      if (sequence === latest.current) setError(failure instanceof ApiError && failure.status === 403
        ? 'Danh mục nhân sự chỉ dành cho quản lý trong phạm vi được cấp. Nhân viên vui lòng mở Hồ sơ của tôi.'
        : failure instanceof Error ? failure.message : 'Không tải được nhân sự.');
    } finally { if (sequence === latest.current) setLoading(false); }
  }, [query, titleQuery, titleGroup, status, department, storeId, page]);
  useEffect(() => { void load(); return () => { latest.current++; }; }, [load]);
  const details = async (employee: EmployeeSummary) => {
    const sequence = ++detailRequest.current;
    setSelected(employee); setDetailLoading(true); setDetailError('');
    try {
      const result = can('employees.read_hr') ? await fetchPersonnelManagement(employee.employeeId) : await fetchEmployeeById(employee.employeeId);
      if (sequence === detailRequest.current) setSelected(result);
    } catch (failure) {
      if (sequence === detailRequest.current) setDetailError(failure instanceof Error ? failure.message : 'Không tải được hồ sơ.');
    } finally { if (sequence === detailRequest.current) setDetailLoading(false); }
  };
  const clear = () => { setSearch(''); setQuery(''); setJobTitle(''); setTitleQuery(''); setTitleGroup(''); setStatus(''); setDepartment(''); setStoreId(''); setPage(1); };
  return <section className="crm-workspace" aria-label="Danh mục nhân sự">
    <header className="crm-work-heading">
      <div>
        <p className="crm-work-eyebrow">DỮ LIỆU NHÂN SỰ</p>
        <h2>Danh Sách Nhân Sự Điểm Bán</h2>
        <p>Tra cứu theo cửa hàng công tác đã xác minh trong phạm vi được cấp.</p>
      </div>
      <div className="crm-work-actions">
        <button type="button" className="btn" onClick={() => void load()} disabled={loading}>Làm Mới</button>
        <button type="button" className="btn btn--primary" onClick={() => {
          setShowAdd(true);
          setAddStoreId(storeId || availableStores[0]?.id || '');
          setAddError('');
          setAddManagerId('');
          setAddManagerReadyStore('');
        }}>+ Thêm Nhân Viên</button>
      </div>
    </header>
    {addMessage && (
      <div role="status" className="banner banner--success" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>{addMessage}</span>
        <button type="button" className="btn" onClick={() => setAddMessage('')}>Đóng</button>
      </div>
    )}
    <PersonnelAdmin departments={departments} editingEmployeeId={editingEmployee} onDismissEdit={() => setEditingEmployee(null)} onChanged={() => { void load(); if (canMetadata) void fetchDepartments().then(setDepartments).catch(() => {}); }} />

    {currentStore && (
      <div className="store-hierarchy-card" style={{
        background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.75) 0%, rgba(15, 23, 42, 0.95) 100%)',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        borderRadius: '12px',
        padding: '16px 20px',
        marginBottom: '20px',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '8px',
              background: 'rgba(59, 130, 246, 0.15)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '18px'
            }}>
              🏪
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#f8fafc', letterSpacing: '-0.2px' }}>
                {currentStore.name}
              </h3>
              <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#94a3b8' }}>
                Tuyến phân cấp vận hành chuẩn GUTA · 1 Cửa hàng trưởng duy nhất · Phụ trách bởi AM &amp; AOM
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{
              fontSize: '11px',
              fontWeight: 600,
              padding: '4px 10px',
              borderRadius: '9999px',
              background: 'rgba(16, 185, 129, 0.15)',
              color: '#34d399',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }}></span>
              Tuyến quản lý phân cấp chuẩn
            </span>
          </div>
        </div>

        {/* 3 hoặc 4 Thẻ Quản Lý Nổi Bật */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: '12px'
        }}>
          {/* AOM */}
          <div style={{
            background: 'rgba(168, 85, 247, 0.05)',
            border: '1px solid rgba(168, 85, 247, 0.25)',
            borderRadius: '10px',
            padding: '12px 14px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#c084fc', letterSpacing: '0.5px' }}>
                👑 Quản Lý Vận Hành (AOM)
              </span>
              <span style={{ fontSize: '10px', background: 'rgba(168, 85, 247, 0.2)', color: '#e9d5ff', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>
                Cấp Vùng
              </span>
            </div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: '#f1f5f9' }}>
              {aomManager?.fullName || 'Chưa phân công'}
            </div>
            <div style={{ fontSize: '11px', color: '#a855f7', marginTop: '3px' }}>
              Trợ lý OM · Điều hành &amp; giám sát cụm khu vực
            </div>
          </div>

          {/* AM */}
          <div style={{
            background: 'rgba(59, 130, 246, 0.05)',
            border: '1px solid rgba(59, 130, 246, 0.25)',
            borderRadius: '10px',
            padding: '12px 14px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#60a5fa', letterSpacing: '0.5px' }}>
                👔 Quản Lý Khu Vực (AM)
              </span>
              <span style={{ fontSize: '10px', background: 'rgba(59, 130, 246, 0.2)', color: '#bfdbfe', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>
                Khu vực
              </span>
            </div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: '#f1f5f9' }}>
              {amManager?.fullName || 'Chưa phân công'}
            </div>
            <div style={{ fontSize: '11px', color: '#3b82f6', marginTop: '3px' }}>
              Quản lý khu vực · Phụ trách cụm cửa hàng
            </div>
          </div>

          {/* SM */}
          <div style={{
            background: 'rgba(16, 185, 129, 0.05)',
            border: '1px solid rgba(16, 185, 129, 0.25)',
            borderRadius: '10px',
            padding: '12px 14px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#34d399', letterSpacing: '0.5px' }}>
                🏬 Cửa Hàng Trưởng (SM)
              </span>
              <span style={{ fontSize: '10px', background: 'rgba(16, 185, 129, 0.2)', color: '#a7f3d0', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>
                1 SM / Điểm bán
              </span>
            </div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: '#f1f5f9' }}>
              {smManager?.fullName || currentStore.managerName || 'Chưa xác định'}
            </div>
            <div style={{ fontSize: '11px', color: '#10b981', marginTop: '3px' }}>
              Cửa hàng trưởng chính thức · Điều hành trực tiếp
            </div>
          </div>

          {/* PTCH nếu có */}
          {ptchEmployee && (
            <div style={{
              background: 'rgba(245, 158, 11, 0.05)',
              border: '1px solid rgba(245, 158, 11, 0.25)',
              borderRadius: '10px',
              padding: '12px 14px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#fbbf24', letterSpacing: '0.5px' }}>
                  📋 Phụ Trách Cửa Hàng (PTCH)
                </span>
                <span style={{ fontSize: '10px', background: 'rgba(245, 158, 11, 0.2)', color: '#fde68a', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>
                  Phó CH
                </span>
              </div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#f1f5f9' }}>
                {ptchEmployee.fullName}
              </div>
              <div style={{ fontSize: '11px', color: '#f59e0b', marginTop: '3px' }}>
                {ptchEmployee.employeeCode} · Giám sát ca &amp; nhận ủy quyền
              </div>
            </div>
          )}
        </div>
      </div>
    )}

    <div className="crm-work-toolbar">
      <label className="field"><span className="field__label">Tìm nhân sự</span><input className="input" type="search" maxLength={50} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm theo tên, mã NV..." /></label>
      <div className="field"><span id="employee-title-filter" className="field__label">Chức danh</span>
        <Select aria-labelledby="employee-title-filter" value={titleGroup} onChange={(value) => { setTitleGroup(value as typeof titleGroup); setPage(1); }}
          options={[{ value: '', label: 'Tất cả chức danh' }, ...titles, { value: 'custom', label: 'Tìm chức danh khác…' }]} />
      </div>
      {titleGroup==='custom' && <label className="field"><span className="field__label">Tên chức danh</span><input className="input" type="search" maxLength={100} value={jobTitle} onChange={(event) => setJobTitle(event.target.value)} placeholder="Nhập chức danh…" /></label>}
      <div className="field"><span id="employee-status-filter" className="field__label">Trạng thái</span><Select aria-labelledby="employee-status-filter" value={status} onChange={(value) => { setStatus(value); setPage(1); }} options={[{ value: '', label: 'Tất cả trạng thái' }, { value: 'active', label: 'Hoạt động' }, { value: 'inactive', label: 'Tạm dừng' }, { value: 'UNKNOWN', label: 'Chưa xác minh' }]} /></div>
      <label className="field">Cửa hàng nhân sự<select aria-label="Cửa hàng nhân sự" className="input" value={storeId} onChange={(event) => { setStoreId(event.target.value); setPage(1); }}><option value="">Tất cả cửa hàng được cấp</option>{stores.filter((store) => store.capabilities.includes('employees.read_operational')).map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}</select></label>
      {!!departments.length && <div className="field"><span id="employee-department-filter" className="field__label">Phòng ban</span><Select aria-labelledby="employee-department-filter" value={department} onChange={(value) => { setDepartment(value); setPage(1); }} options={[{ value: '', label: 'Tất cả phạm vi được cấp' }, ...departments.map((item) => ({ value: item.id, label: item.name }))]} /></div>}
    </div>
    {onOpenManagers && ['am','aom','sam','om'].includes(titleGroup) && <p>
      Mục này lọc theo cửa hàng công tác. Để xem người quản lý theo cửa hàng phụ trách, <button type="button" className="btn" onClick={() => onOpenManagers(titleGroup)}>Xem quản lý theo phạm vi</button>.
    </p>}
    {loading && <p role="status">Đang tải danh sách nhân sự từ API...</p>}
    {error && <div role="alert" className="banner banner--error">{error}<button type="button" className="btn" onClick={() => void load()}>Thử lại</button></div>}
    {!loading && !error && !floorEmployees.length && <div className="empty"><h3>Không tìm thấy nhân sự phù hợp</h3><p>Kiểm tra từ khóa hoặc thay đổi bộ lọc.</p><button type="button" className="btn" onClick={clear}>Xóa bộ lọc</button></div>}
    {!loading && !error && !!floorEmployees.length && <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <p className="crm-work-count" style={{ margin: 0, fontSize: '13px', color: '#94a3b8' }}>
          <strong style={{ color: '#f8fafc' }}>{floorEmployees.length} nhân sự điểm bán</strong>
          {currentStore ? ` thuộc ${currentStore.name}` : ''}
        </p>
      </div>
      <div className="crm-work-table-wrap">
        <table className="table crm-work-table">
          <caption className="sr-only">Nhân sự trong phạm vi được cấp</caption>
          <thead>
            <tr>
              <th>Họ tên &amp; Mã NV</th>
              <th>Chức danh</th>
              <th>Điểm bán / phòng ban</th>
              <th>Kỹ năng</th>
              <th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {floorEmployees.map((employee) => {
              const isSm = employee.jobTitle && /SM|Cửa hàng trưởng/i.test(employee.jobTitle);
              const isPtch = employee.jobTitle && /PTCH|Phụ trách cửa hàng/i.test(employee.jobTitle);
              const initials = employee.fullName
                .split(' ')
                .filter(Boolean)
                .slice(-2)
                .map((w) => w[0])
                .join('')
                .toUpperCase() || 'NV';

              return (
                <tr key={employee.employeeId} style={isSm ? { background: 'rgba(16, 185, 129, 0.05)' } : isPtch ? { background: 'rgba(245, 158, 11, 0.05)' } : undefined}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        background: isSm ? 'linear-gradient(135deg, #059669, #10b981)' : isPtch ? 'linear-gradient(135deg, #d97706, #f59e0b)' : 'linear-gradient(135deg, #334155, #475569)',
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '11px',
                        fontWeight: 700,
                        flexShrink: 0
                      }}>
                        {initials}
                      </div>
                      <div>
                        <button type="button" className="crm-work-title" onClick={() => void details(employee)} style={{ fontWeight: 600 }}>
                          {employee.fullName}
                        </button>
                        <p style={{ margin: '1px 0 0 0', fontSize: '11px', color: '#94a3b8', fontFamily: 'monospace' }}>
                          {employee.employeeCode}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td>
                    {isSm ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 8px', borderRadius: '6px', background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', fontSize: '12px', fontWeight: 600, border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                        🏬 SM · Cửa hàng trưởng
                      </span>
                    ) : isPtch ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 8px', borderRadius: '6px', background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', fontSize: '12px', fontWeight: 600, border: '1px solid rgba(245, 158, 11, 0.3)' }}>
                        📋 Phụ trách cửa hàng
                      </span>
                    ) : (
                      <span style={{ color: '#cbd5e1', fontSize: '13px' }}>
                        {employee.jobTitle || 'Chưa cập nhật'}
                      </span>
                    )}
                  </td>
                  <td>{employeeLocationLabel(employee)}</td>
                  <td>{employee.skills.join(', ') || 'Chưa cập nhật'}</td>
                  <td>
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      fontSize: '12px',
                      color: employee.status === 'active' ? '#34d399' : '#94a3b8'
                    }}>
                      <span style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        background: employee.status === 'active' ? '#10b981' : '#64748b'
                      }}></span>
                      {employee.status === 'active' ? 'Hoạt động' : employee.status === 'inactive' ? 'Tạm dừng' : 'Chưa xác minh'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <nav aria-label="Phân trang nhân sự" className="crm-work-pagination">
        <button type="button" className="btn" disabled={!paging?.hasPrev} onClick={() => setPage((old) => old - 1)}>Trang trước</button>
        <span>Trang {paging?.page ?? page} / {paging?.totalPages ?? 1}</span>
        <button type="button" className="btn" disabled={!paging?.hasNext} onClick={() => setPage((old) => old + 1)}>Trang sau</button>
      </nav>
    </>}
    {!loading && !error && can('employees.review') && <ProfileApprovalQueue />}
    {selected && <CrmDialog title="Chi tiết nhân sự" onClose={() => { detailRequest.current++; setSelected(null); }}>
      {detailLoading ? (
        <p role="status">Đang tải hồ sơ…</p>
      ) : detailError ? (
        <div role="alert" className="banner banner--error">
          {detailError}
          <button className="btn" type="button" onClick={() => void details(selected)}>Thử lại</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px',
              padding: '14px 16px',
              borderRadius: '12px',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '50%',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '15px',
                  fontWeight: 700,
                  background: 'rgba(59, 130, 246, 0.18)',
                  color: '#60a5fa',
                  border: '1px solid rgba(59, 130, 246, 0.35)',
                }}
              >
                {selected.fullName.trim().split(/\s+/).slice(-2).map((w) => w[0]).join('').toUpperCase()}
              </span>
              <div>
                <div style={{ fontSize: '16px', fontWeight: 700, color: '#f8fafc' }}>{selected.fullName}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '3px', flexWrap: 'wrap' }}>
                  <code style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '6px', background: 'rgba(255,255,255,0.06)', color: '#93c5fd' }}>
                    {'employeeCode' in selected && selected.employeeCode ? selected.employeeCode : selected.employeeId}
                  </code>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: '#cbd5e1' }}>
                    {selected.jobTitle || 'Chưa cập nhật'}
                  </span>
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: '999px',
                      background: selected.status === 'active' ? 'rgba(16, 185, 129, 0.14)' : 'rgba(148, 163, 184, 0.14)',
                      color: selected.status === 'active' ? '#34d399' : '#94a3b8',
                    }}
                  >
                    {selected.status === 'active' ? 'Hoạt động' : selected.status === 'inactive' ? 'Tạm dừng' : 'Chưa xác minh'}
                  </span>
                </div>
              </div>
            </div>
            {can('employees.update_other') && (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setEditingEmployee(selected.employeeId);
                  setSelected(null);
                }}
              >
                ✎ Chỉnh sửa hồ sơ
              </button>
            )}
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
              gap: '10px',
              padding: '14px',
              borderRadius: '10px',
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <div>
              <div style={{ fontSize: '11px', color: '#94a3b8' }}>Phòng ban / Điểm bán</div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#e2e8f0', marginTop: '2px' }}>
                {employeeLocationLabel(selected)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '11px', color: '#94a3b8' }}>Kỹ năng nghiệp vụ</div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#e2e8f0', marginTop: '2px' }}>
                {selected.skills.join(', ') || 'Chưa cập nhật'}
              </div>
            </div>
            {can('employees.read_hr') && 'profileVersion' in selected && (
              <>
                <div>
                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>Điện thoại liên hệ</div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#e2e8f0', marginTop: '2px' }}>
                    {selected.phone || 'Chưa có'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>Ngày vào làm</div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#e2e8f0', marginTop: '2px' }}>
                    {selected.hiredAt ? new Date(selected.hiredAt).toLocaleDateString('vi-VN') : 'Chưa có'}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {!detailLoading && !detailError && can('employees.read_hr') && 'profileVersion' in selected && <EmployeeHrHistory employeeId={selected.employeeId} />}
      {!detailLoading && !detailError && isSmPositionCandidate(selected.jobTitle) && <SmAppointments key={selected.employeeId} employeeId={selected.employeeId} />}
    </CrmDialog>}
    {showAdd && <CrmDialog title="Tiếp nhận & Thêm nhân viên mới" busy={addBusy} onClose={() => { if (!addBusy) setShowAdd(false); }}>
      <form className="crm-work-form" onSubmit={submitAddEmployee}>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary, #aaa)', marginBottom: '8px' }}>
          Nhân viên mới sẽ được cấp mã định danh <code>GT-CH...</code> và khởi tạo hồ sơ tiếp nhận vào hệ thống Guta.
        </p>
        <label className="field">
          <span>Cửa hàng tiếp nhận</span>
          <select className="input" required value={addStoreId} disabled={addBusy} onChange={(event) => {
            setAddStoreId(event.target.value);
            setAddManagerId('');
            setAddManagerReadyStore('');
          }}>
            <option value="">Chọn cửa hàng tiếp nhận</option>
            {availableStores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        {addStoreId && (
          <InitialManagerPicker
            key={addStoreId}
            storeId={addStoreId}
            value={addManagerId}
            onChange={setAddManagerId}
            onReady={setAddManagerReadyStore}
            busy={addBusy}
          />
        )}
        <label className="field">
          <span>Họ và tên nhân viên</span>
          <input className="input" required maxLength={200} disabled={addBusy} placeholder="Ví dụ: Nguyễn Văn An" value={addFullName} onChange={(e) => setAddFullName(e.target.value)} />
        </label>
        <label className="field">
          <span>Số điện thoại liên hệ</span>
          <input className="input" required type="tel" maxLength={30} disabled={addBusy} placeholder="Ví dụ: 0901234567" value={addPhone} onChange={(e) => setAddPhone(e.target.value)} />
        </label>
        <label className="field">
          <span>Email nhận link kích hoạt tài khoản</span>
          <input className="input" type="email" maxLength={254} disabled={addBusy} placeholder="Ví dụ: nvan@guta.vn" value={addEmail} onChange={(e) => setAddEmail(e.target.value)} />
        </label>
        <label className="field">
          <span>Ngày vào làm</span>
          <input className="input" required type="date" disabled={addBusy} value={addHiredAt} onChange={(e) => setAddHiredAt(e.target.value)} />
        </label>
        <label className="field">
          <span>Lý do tiếp nhận / Ghi chú</span>
          <textarea className="input" maxLength={2000} disabled={addBusy} placeholder="Nhập lý do tiếp nhận nhân viên mới..." value={addReason} onChange={(e) => setAddReason(e.target.value)} />
        </label>
        {addError && <p role="alert" style={{ color: 'var(--destructive, #ef4444)', fontSize: '13px' }}>{addError}</p>}
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '12px' }}>
          {onNavigateOnboarding && (
            <button type="button" className="btn" disabled={addBusy} onClick={() => { setShowAdd(false); onNavigateOnboarding(); }}>
              Đi đến mục Tiếp nhận (HR)
            </button>
          )}
          <button type="button" className="btn" disabled={addBusy} onClick={() => setShowAdd(false)}>Hủy</button>
          <button type="submit" className="btn btn--primary" disabled={addBusy || !addStoreId || !addFullName.trim() || !addPhone.trim() || (addManagerReadyStore !== '' && addManagerReadyStore !== addStoreId)}>
            {addBusy ? 'Đang lưu…' : 'Xác nhận thêm nhân viên'}
          </button>
        </div>
      </form>
    </CrmDialog>}
  </section>;
}
