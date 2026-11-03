import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { EmployeeSummary, EmployeeManagement, PaginationMeta } from '@hr-blockbot/contracts';
import { ApiError, fetchDepartments, fetchEmployees, fetchEmployeeById, fetchPersonnelManagement, type CrmDepartment } from '../services/api';
import { Select } from './ui/Select';
import { CrmDialog } from './ui/CrmDialog';
import '../styles/crm-work.css';
import { ProfileApprovalQueue } from './ProfileApprovalQueue';
import { PersonnelAdmin } from './PersonnelAdmin';
import { useAuthorization } from '../context/useAuthorization';
import { EmployeeHrHistory } from './EmployeeHrHistory';

export const EmployeeListView: React.FC = () => {
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
        q: query, jobTitle: titleQuery || undefined, storeId: storeId || undefined, status: (status || undefined) as 'active' | 'inactive' | 'UNKNOWN' | undefined,
        departmentId: department || undefined, page, limit: 20,
      });
      if (sequence === latest.current) { setEmployees(result.items); setPaging(result.paging); }
    } catch (failure) {
      if (sequence === latest.current) setError(failure instanceof ApiError && failure.status === 403
        ? 'Danh mục nhân sự chỉ dành cho quản lý trong phạm vi được cấp. Nhân viên vui lòng mở Hồ sơ của tôi.'
        : failure instanceof Error ? failure.message : 'Không tải được nhân sự.');
    } finally { if (sequence === latest.current) setLoading(false); }
  }, [query, titleQuery, status, department, storeId, page]);
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
  const clear = () => { setSearch(''); setQuery(''); setJobTitle(''); setTitleQuery(''); setStatus(''); setDepartment(''); setStoreId(''); setPage(1); };
  return <section className="crm-workspace" aria-label="Danh mục nhân sự">
    <header className="crm-work-heading"><div><p className="crm-work-eyebrow">DỮ LIỆU NHÂN SỰ</p><h2>Danh Sách Nhân Sự Điểm Bán</h2><p>Tra cứu trong phạm vi được cấp. Không hiển thị ngân hàng, CCCD hoặc tiền lương.</p></div><button type="button" className="btn" onClick={() => void load()} disabled={loading}>Làm Mới</button></header>
    <PersonnelAdmin departments={departments} editingEmployeeId={editingEmployee} onDismissEdit={() => setEditingEmployee(null)} onChanged={() => { void load(); if (canMetadata) void fetchDepartments().then(setDepartments).catch(() => {}); }} />
    <div className="crm-work-toolbar">
      <label className="field"><span className="field__label">Tìm nhân sự</span><input className="input" type="search" maxLength={50} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm theo tên, mã NV..." /></label>
      <label className="field"><span className="field__label">Chức danh</span><input className="input" type="search" maxLength={100} value={jobTitle} onChange={(event) => setJobTitle(event.target.value)} placeholder="Lọc theo chức danh..." /></label>
      <div className="field"><span id="employee-status-filter" className="field__label">Trạng thái</span><Select aria-labelledby="employee-status-filter" value={status} onChange={(value) => { setStatus(value); setPage(1); }} options={[{ value: '', label: 'Tất cả trạng thái' }, { value: 'active', label: 'Hoạt động' }, { value: 'inactive', label: 'Tạm dừng' }, { value: 'UNKNOWN', label: 'Chưa xác minh' }]} /></div>
      <label className="field">Cửa hàng nhân sự<select aria-label="Cửa hàng nhân sự" className="input" value={storeId} onChange={(event) => { setStoreId(event.target.value); setPage(1); }}><option value="">Tất cả cửa hàng được cấp</option>{stores.filter((store) => store.capabilities.includes('employees.read_operational')).map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}</select></label>
      {!!departments.length && <div className="field"><span id="employee-department-filter" className="field__label">Phòng ban</span><Select aria-labelledby="employee-department-filter" value={department} onChange={(value) => { setDepartment(value); setPage(1); }} options={[{ value: '', label: 'Tất cả phạm vi được cấp' }, ...departments.map((item) => ({ value: item.id, label: item.name }))]} /></div>}
    </div>
    {loading && <p role="status">Đang tải danh sách nhân sự từ API...</p>}
    {error && <div role="alert" className="banner banner--error">{error}<button type="button" className="btn" onClick={() => void load()}>Thử lại</button></div>}
    {!loading && !error && !employees.length && <div className="empty"><h3>Không tìm thấy nhân sự phù hợp</h3><p>Kiểm tra từ khóa hoặc thay đổi bộ lọc.</p><button type="button" className="btn" onClick={clear}>Xóa bộ lọc</button></div>}
    {!loading && !error && !!employees.length && <>
      <p className="crm-work-count">{paging?.totalItems ?? employees.length} nhân sự phù hợp</p>
      <div className="crm-work-table-wrap"><table className="table crm-work-table"><caption className="sr-only">Nhân sự trong phạm vi được cấp</caption><thead><tr><th>Họ tên</th><th>Chức danh</th><th>Điểm bán / phòng ban</th><th>Kỹ năng</th><th>Trạng thái</th></tr></thead>
        <tbody>{employees.map((employee) => <tr key={employee.employeeId}><td><button type="button" className="crm-work-title" onClick={() => void details(employee)}>{employee.fullName}</button><p>{employee.employeeCode}</p></td><td>{employee.jobTitle || 'Chưa cập nhật'}</td><td>{employee.storeName || employee.department}</td><td>{employee.skills.join(', ') || 'Chưa cập nhật'}</td><td>{employee.status === 'active' ? 'Hoạt động' : employee.status === 'inactive' ? 'Tạm dừng' : 'Chưa xác minh'}</td></tr>)}</tbody></table></div>
      <nav aria-label="Phân trang nhân sự" className="crm-work-pagination"><button type="button" className="btn" disabled={!paging?.hasPrev} onClick={() => setPage((old) => old - 1)}>Trang trước</button><span>Trang {paging?.page ?? page} / {paging?.totalPages ?? 1}</span><button type="button" className="btn" disabled={!paging?.hasNext} onClick={() => setPage((old) => old + 1)}>Trang sau</button></nav>
    </>}
    {!loading && !error && can('employees.review') && <ProfileApprovalQueue />}
    {selected && <CrmDialog title="Chi tiết nhân sự" onClose={() => { detailRequest.current++; setSelected(null); }}>
      {!detailLoading && !detailError && can('employees.update_other') && <button type="button" className="btn" onClick={() => { setEditingEmployee(selected.employeeId); setSelected(null); }}>Chỉnh sửa thông tin thường</button>}
      {detailLoading ? <p role="status">Đang tải hồ sơ…</p> : detailError ? <div role="alert" className="banner banner--error">{detailError}<button className="btn" type="button" onClick={() => void details(selected)}>Thử lại</button></div> : <dl className="crm-work-detail"><dt>Họ tên</dt><dd>{selected.fullName}</dd><dt>Chức danh</dt><dd>{selected.jobTitle || 'Chưa cập nhật'}</dd><dt>Phòng ban / điểm bán</dt><dd>{selected.department}</dd><dt>Kỹ năng</dt><dd>{selected.skills.join(', ') || 'Chưa cập nhật'}</dd><dt>Trạng thái</dt><dd>{selected.status === 'active' ? 'Hoạt động' : selected.status === 'inactive' ? 'Tạm dừng' : 'Chưa xác minh'}</dd></dl>}
      {!detailLoading && !detailError && can('employees.read_hr') && 'profileVersion' in selected && <><dl><dt>Mã nhân viên</dt><dd>{selected.employeeCode}</dd><dt>Điện thoại</dt><dd>{selected.phone || 'Chưa có'}</dd><dt>Ngày vào làm</dt><dd>{selected.hiredAt ? new Date(selected.hiredAt).toLocaleDateString('vi-VN') : 'Chưa có'}</dd></dl><EmployeeHrHistory employeeId={selected.employeeId} /></>}
    </CrmDialog>}
  </section>;
};
