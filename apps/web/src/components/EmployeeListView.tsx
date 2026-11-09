import React, { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { EmployeeSummary, EmployeeManagement, PaginationMeta } from '@hr-blockbot/contracts';
import { ApiError, fetchDepartments, fetchEmployees, fetchEmployeeById, fetchPersonnelManagement, requestJson, type CrmDepartment, type EmployeeTitleGroup } from '../services/api';
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
    {!loading && !error && !employees.length && <div className="empty"><h3>Không tìm thấy nhân sự phù hợp</h3><p>Kiểm tra từ khóa hoặc thay đổi bộ lọc.</p><button type="button" className="btn" onClick={clear}>Xóa bộ lọc</button></div>}
    {!loading && !error && !!employees.length && <>
      <p className="crm-work-count">{paging?.totalItems ?? employees.length} nhân sự phù hợp</p>
      <div className="crm-work-table-wrap"><table className="table crm-work-table"><caption className="sr-only">Nhân sự trong phạm vi được cấp</caption><thead><tr><th>Họ tên</th><th>Chức danh</th><th>Điểm bán / phòng ban</th><th>Kỹ năng</th><th>Trạng thái</th></tr></thead>
        <tbody>{employees.map((employee) => <tr key={employee.employeeId}><td><button type="button" className="crm-work-title" onClick={() => void details(employee)}>{employee.fullName}</button><p>{employee.employeeCode}</p></td><td>{employee.jobTitle || 'Chưa cập nhật'}</td><td>{employeeLocationLabel(employee)}</td><td>{employee.skills.join(', ') || 'Chưa cập nhật'}</td><td>{employee.status === 'active' ? 'Hoạt động' : employee.status === 'inactive' ? 'Tạm dừng' : 'Chưa xác minh'}</td></tr>)}</tbody></table></div>
      <nav aria-label="Phân trang nhân sự" className="crm-work-pagination"><button type="button" className="btn" disabled={!paging?.hasPrev} onClick={() => setPage((old) => old - 1)}>Trang trước</button><span>Trang {paging?.page ?? page} / {paging?.totalPages ?? 1}</span><button type="button" className="btn" disabled={!paging?.hasNext} onClick={() => setPage((old) => old + 1)}>Trang sau</button></nav>
    </>}
    {!loading && !error && can('employees.review') && <ProfileApprovalQueue />}
    {selected && <CrmDialog title="Chi tiết nhân sự" onClose={() => { detailRequest.current++; setSelected(null); }}>
      {!detailLoading && !detailError && can('employees.update_other') && <button type="button" className="btn" onClick={() => { setEditingEmployee(selected.employeeId); setSelected(null); }}>Chỉnh sửa thông tin thường</button>}
      {detailLoading ? <p role="status">Đang tải hồ sơ…</p> : detailError ? <div role="alert" className="banner banner--error">{detailError}<button className="btn" type="button" onClick={() => void details(selected)}>Thử lại</button></div> : <dl className="crm-work-detail"><dt>Họ tên</dt><dd>{selected.fullName}</dd><dt>Chức danh</dt><dd>{selected.jobTitle || 'Chưa cập nhật'}</dd><dt>Phòng ban / điểm bán</dt><dd>{employeeLocationLabel(selected)}</dd><dt>Kỹ năng</dt><dd>{selected.skills.join(', ') || 'Chưa cập nhật'}</dd><dt>Trạng thái</dt><dd>{selected.status === 'active' ? 'Hoạt động' : selected.status === 'inactive' ? 'Tạm dừng' : 'Chưa xác minh'}</dd></dl>}
      {!detailLoading && !detailError && can('employees.read_hr') && 'profileVersion' in selected && <><dl><dt>Mã nhân viên</dt><dd>{selected.employeeCode}</dd><dt>Điện thoại</dt><dd>{selected.phone || 'Chưa có'}</dd><dt>Ngày vào làm</dt><dd>{selected.hiredAt ? new Date(selected.hiredAt).toLocaleDateString('vi-VN') : 'Chưa có'}</dd></dl><EmployeeHrHistory employeeId={selected.employeeId} /></>}
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
