import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { EmployeeSummary, MeResponse, Project, ProjectStatus, Report } from '@hr-blockbot/contracts';
import {
  ApiError, assignProject, createProject, editProject, fetchDepartments, fetchMe, requestJson,
  fetchProjectById, fetchProjectReports, fetchWorkList, newClientMessageId, reviewReport, submitReport, transitionProject, updateProjectProgress,
  type CrmDepartment, type WorkListResponse, type WorkType,
  fetchAssignmentSummary, fetchAssignmentNotices, readAssignmentNotice, type AssignmentSummary,
} from '../services/api';
import type { NotifyFn } from './Toast';
import { Select } from './ui/Select';
import { CrmDialog } from './ui/CrmDialog';
import { AssignmentPanel, assignmentLabel } from './AssignmentPanel';
import { CandidateSuggestions } from './CandidateSuggestions';
import '../styles/crm-work.css';
import { WorkOverview } from './WorkOverview';
import { WorkRubricFields } from './WorkRubricFields';
import { PerformanceKpiView } from './PerformanceKpiView';
import { performanceLabels } from './TaskDetailView';
import { performancePost } from '../services/performance-kpi-api';

const LABEL: Record<ProjectStatus, string> = {
  DRAFT: 'Khởi tạo', ASSIGNED: 'Đã giao', IN_PROGRESS: 'Đang thực hiện', PENDING_REVIEW: 'Chờ nghiệm thu', COMPLETED: 'Hoàn thành',
};
const REPORT_LABEL = { PENDING: 'Chờ duyệt', APPROVED: 'Đã duyệt', REJECTED: 'Yêu cầu làm lại' };
type WorkTarget = { id: string; period: string };
type WorkModal = { kind: 'create' } | { kind: 'scored'; task: WorkTarget; review?: boolean } | { kind: 'edit' | 'assign' | 'progress' | 'submit' | 'details' | 'review' | 'assignment'; project: Project };
const dateText = (value?: string | null) => value ? new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : 'Chưa đặt hạn';
const dateInput = (value?: string | null) => value ? new Date(value).toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }) : '';
const deadline = (value: string) => value ? new Date(value + 'T23:59:59+07:00').toISOString() : undefined;
const safeLink = (value: string) => { try { return ['http:', 'https:'].includes(new URL(value).protocol); } catch { return false; } };
const overdue = (project: Project) => !!project.dueDate && project.status !== 'COMPLETED' && new Date(project.dueDate).getTime() < Date.now();

export const ProjectListView: React.FC<{
  onNotify: NotifyFn; canReadProjects: boolean; canReadScored: boolean; workTarget: WorkTarget | null; onTargetApplied: () => void;
}> = ({ onNotify, canReadProjects, canReadScored, workTarget, onTargetApplied }) => {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [departments, setDepartments] = useState<CrmDepartment[]>([]);
  const [identityError, setIdentityError] = useState('');
  const can = (capability: string) => !!me?.authorization?.capabilities.some((value) => value === capability);
  const canCreateRegular = can('projects.create');
  const canCreateScored = canReadScored && can('task.manage');
  const [scored, setScored] = useState(false);
  const [templateId, setTemplateId] = useState('');
  const [weight, setWeight] = useState('30');
  const createRequest = useRef<{ key: string; id: string }>();
  const creationStores = me?.authorization?.stores.filter(store =>
    scored ? store.capabilities.includes('task.manage') : store.capabilities.includes('projects.create') && !!store.departmentId
  ) ?? [];
  const [filters, setFilters] = useState(() => {
    const url = new URL(window.location.href);
    const status = url.searchParams.get('workStatus') || '';
    return {
      q: url.searchParams.get('workQ') || '',
      departmentId: url.searchParams.get('workDepartment') || '',
      storeId: url.searchParams.get('workStore') || '', assigneeId: url.searchParams.get('workAssignee') || '',
      dueFrom: url.searchParams.get('workDueFrom') || '', dueTo: url.searchParams.get('workDueTo') || '',
      assignmentView: ['AWAITING_ACCEPTANCE', 'PENDING_REQUESTS', 'HANDOVER'].includes(url.searchParams.get('workAssignment') || '') ? url.searchParams.get('workAssignment')! : '',
      status: status in LABEL ? status : '',
      overdue: url.searchParams.get('workOverdue') === 'true',
      mine: url.searchParams.get('workMine') === 'true',
      page: Math.max(1, Number.parseInt(url.searchParams.get('workPage') || '1', 10) || 1),
    };
  });
  const [workType, setWorkType] = useState<WorkType>('all');
  const [workPeriod, setWorkPeriod] = useState('');
  const [search, setSearch] = useState(filters.q);
  const [data, setData] = useState<WorkListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState<AssignmentSummary | null>(null);
  const [notices, setNotices] = useState<Awaited<ReturnType<typeof fetchAssignmentNotices>> | null>(null);
  const [noticePage, setNoticePage] = useState(1), [overviewRevision, setOverviewRevision] = useState(0);
  const [noticesLoading, setNoticesLoading] = useState(false);
  const [knownAssignees, setKnownAssignees] = useState<Record<string, string>>({});
  const [summaryError, setSummaryError] = useState('');
  const request = useRef(0);
  const notify = useRef(onNotify);
  notify.current = onNotify;
  const [modal, setModal] = useState<WorkModal | null>(null);
  const [busy, setBusy] = useState(false);
  const writing = useRef(false);
  const assignmentBusy = useCallback((value: boolean) => { writing.current = value; setBusy(value); }, []);
  const [formError, setFormError] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [requiredSkills, setRequiredSkills] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [department, setDepartment] = useState('');
  const [storeId, setStoreId] = useState('');
  const [progress, setProgress] = useState('0');
  const [content, setContent] = useState('');
  const [attachments, setAttachments] = useState('');
  const [reason, setReason] = useState('');
  const [assignee, setAssignee] = useState('');
  const [assigneeSearch, setAssigneeSearch] = useState('');
  const [assignees, setAssignees] = useState<EmployeeSummary[]>([]);
  const [assigneePage, setAssigneePage] = useState(1);
  const [moreAssignees, setMoreAssignees] = useState(false);
  const [assigneeLoading, setAssigneeLoading] = useState(false);
  const [assigneeError, setAssigneeError] = useState('');
  const [reports, setReports] = useState<Report[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const detailRequest = useRef(0);
  const assigneeRequest = useRef(0);

  const load = useCallback(async () => {
    const sequence = ++request.current;
    setLoading(true); setNoticesLoading(true); setError('');
    try {
      const result = await fetchWorkList({
        ...filters, workType: canReadScored ? workType : 'regular', period: workPeriod,
        status: (filters.status || undefined) as ProjectStatus | undefined, limit: 20,
      });
      if (sequence === request.current) {
        setData(result);
        const people = result.items.flatMap(item => {
          const [id, name] = item.type === 'regular' ? [item.project.assigneeId, item.project.assigneeName] : [item.task.assigneeEmployeeId, item.task.assigneeName];
          return id ? [[id, name || id]] : [];
        });
        setKnownAssignees(old => ({ ...old, ...Object.fromEntries(people) }));
      }
    } catch (failure) {
      if (sequence === request.current) setError(failure instanceof Error ? failure.message : 'Không tải được công việc.');
    } finally { if (sequence === request.current) setLoading(false); }
    try {
      if (!canReadProjects) return;
      const [counts, inbox] = await Promise.all([fetchAssignmentSummary(), fetchAssignmentNotices(noticePage)]);
      if (sequence === request.current) { setSummary(counts); setNotices(inbox); setSummaryError(''); }
    } catch (failure) { if (sequence === request.current) setSummaryError(failure instanceof Error ? failure.message : 'Không tải được tổng quan tiếp nhận.'); }
    finally { if (sequence === request.current) setNoticesLoading(false); }
  }, [filters, noticePage, workType, workPeriod, canReadProjects, canReadScored]);

  useEffect(() => { void load(); return () => { request.current++; }; }, [load]);
  useEffect(() => {
    const timer = setTimeout(() => setFilters((old) => old.q === search ? old : { ...old, q: search, page: 1 }), 250);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    const url = new URL(window.location.href);
    for (const [key, value] of Object.entries({ workQ: filters.q, workStore: filters.storeId, workAssignee: filters.assigneeId, workDueFrom: filters.dueFrom, workDueTo: filters.dueTo, workAssignment: filters.assignmentView, workDepartment: filters.departmentId, workStatus: filters.status, workMine: filters.mine ? 'true' : '', workOverdue: filters.overdue ? 'true' : '', workPage: String(filters.page) })) {
      if (value && !(key === 'workPage' && value === '1')) url.searchParams.set(key, value); else url.searchParams.delete(key);
    }
    window.history.replaceState(window.history.state, '', url);
  }, [filters]);
  useEffect(() => {
    let active = true;
    void fetchMe().then(async (identity) => {
      const directory = identity.authorization?.capabilities.includes('projects.create') ? await fetchDepartments() : [];
      const store = identity.authorization?.stores.find((value) => value.capabilities.includes('projects.create') && value.departmentId);
      if (active) { setMe(identity); setDepartments(directory); setDepartment(store?.departmentId || ''); setStoreId(store?.id || ''); }
    }).catch((failure) => { if (active) setIdentityError(failure instanceof Error ? failure.message : 'Không xác định được quyền truy cập.'); });
    return () => { active = false; };
  }, []);

  const refreshDetails = useCallback(async (project: Project) => {
    const sequence = ++detailRequest.current;
    setDetailLoading(true); setDetailError('');
    try {
      const [latest, entries] = await Promise.all([fetchProjectById(project.id), fetchProjectReports(project.id)]);
      if (sequence !== detailRequest.current) return;
      setModal((current) => current && 'project' in current && current.project.id === latest.id ? { ...current, project: latest } : current);
      setReports(entries);
    } catch (failure) {
      if (sequence === detailRequest.current) setDetailError(failure instanceof Error ? failure.message : 'Không tải được báo cáo.');
    } finally { if (sequence === detailRequest.current) setDetailLoading(false); }
  }, []);

  const assignmentProject = modal?.kind === 'assign' ? modal.project : null;
  useEffect(() => {
    if (!assignmentProject) return;
    const sequence = ++assigneeRequest.current;
    setAssigneeLoading(true); setAssigneeError('');
    const timer = setTimeout(() => {
      void requestJson<{ items: EmployeeSummary[]; paging: { hasNext: boolean } }>(`/projects/${assignmentProject.id}/eligible-assignees?q=${encodeURIComponent(assigneeSearch)}&page=${assigneePage}&limit=30`)
        .then((result) => {
          if (sequence !== assigneeRequest.current) return;
          setAssignees((old) => assigneePage === 1 ? result.items : [...old, ...result.items.filter((item) => !old.some((previous) => previous.employeeId === item.employeeId))]);
          setMoreAssignees(result.paging.hasNext);
        })
        .catch((failure) => { if (sequence === assigneeRequest.current) setAssigneeError(failure instanceof Error ? failure.message : 'Không tải được người nhận việc.'); })
        .finally(() => { if (sequence === assigneeRequest.current) setAssigneeLoading(false); });
    }, 200);
    return () => { clearTimeout(timer); assigneeRequest.current++; };
  }, [assignmentProject?.id, assigneeSearch, assigneePage]);

  const close = () => {
    if (writing.current) return;
    detailRequest.current++; assigneeRequest.current++; setModal(null); setFormError('');
  };
  const open = (kind: Exclude<WorkModal['kind'], 'create' | 'scored'>, project: Project) => {
    setFormError(''); setReports([]); setDetailError(''); setReason('');
    setModal({ kind, project });
    if (kind === 'edit') { setTitle(project.title); setDescription(project.description || ''); setRequiredSkills(project.requiredSkills.join(', ')); setDueDate(dateInput(project.dueDate)); }
    if (kind === 'progress') setProgress(String(project.progress));
    if (kind === 'submit') { setContent(''); setAttachments(''); }
    if (kind === 'assign') { setAssignee(''); setAssigneeSearch(''); setAssigneePage(1); setAssignees([]); }
    if (kind === 'details' || kind === 'review' || kind === 'assignment') void refreshDetails(project);
  };
  useEffect(() => {
    if (!workTarget || !canReadScored) return;
    setModal({ kind: 'scored', task: workTarget });
    onTargetApplied();
  }, [workTarget, canReadScored, onTargetApplied]);

  function selectCreationType(next: boolean) {
    setScored(next); setTemplateId(''); setFormError('');
    const stores = me?.authorization?.stores.filter(store =>
      next ? store.capabilities.includes('task.manage') : store.capabilities.includes('projects.create') && !!store.departmentId
    ) ?? [];
    const store = stores.find(store => store.id === storeId) ?? stores[0];
    setStoreId(store?.id ?? '');
    setDepartment(store?.departmentId ?? '');
  }

  function openCreate() {
    setTitle(''); setDescription(''); setRequiredSkills(''); setDueDate(''); setWeight('30');
    createRequest.current = undefined;
    selectCreationType(!canCreateRegular);
    setModal({ kind: 'create' });
  }

  const run = async (action: () => Promise<unknown>, message: string) => {
    if (writing.current) return;
    writing.current = true; setBusy(true); setFormError('');
    try {
      await action(); setOverviewRevision((old) => old + 1);
      detailRequest.current++; setModal(null); notify.current(message, 'success'); await load();
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : 'Không thể lưu thay đổi.';
      setFormError(message); notify.current(message, 'error');
      if (failure instanceof ApiError && failure.status === 409) {
        void load();
        // Keep typed report/reason. Do not silently retry or discard the draft.
        if (modal && 'project' in modal) void refreshDetails(modal.project);
      }
    } finally { writing.current = false; setBusy(false); }
  };
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!modal || busy) return;
    if (modal.kind === 'create' && scored) {
      const importance = Number(weight);
      if (!canCreateScored || title.trim().length < 3 || !storeId || !dueDate || !templateId || importance < 5 || importance > 50) {
        setFormError('Chọn cửa hàng, hạn hoàn thành, mẫu đã công bố và mức quan trọng hợp lệ.');
        return;
      }
      const fields = { title: title.trim(), description: description.trim(), storeId, templateId, dueAt: deadline(dueDate), taskWeightPercent: importance };
      const key = JSON.stringify(fields);
      if (createRequest.current?.key !== key) createRequest.current = { key, id: newClientMessageId() };
      const clientRequestId = createRequest.current.id;
      void run(async () => {
        await performancePost('/tasks', { ...fields, expectedVersion: 0, clientRequestId });
        setWorkType('all'); setWorkPeriod(''); setFilters(old => ({ ...old, page: 1 }));
      }, 'Đã tạo công việc có thang điểm.');
    } else if (modal.kind === 'create' || modal.kind === 'edit') {
      if (!title.trim() || (modal.kind === 'create' && !department)) { setFormError('Nhập tiêu đề và chọn phòng ban.'); return; }
      const skills = [...new Set(requiredSkills.split(',').map((skill) => skill.trim()).filter(Boolean))];
      if (skills.length > 30 || skills.some((skill) => skill.length > 100)) { setFormError('Tối đa 30 kỹ năng, mỗi kỹ năng không quá 100 ký tự.'); return; }
      if (modal.kind === 'create' && !dueDate) { setFormError('Chọn hạn hoàn thành cho nhiệm vụ mới.'); return; }
      const fields = { title: title.trim(), description: description.trim(), requiredSkills: skills, dueDate: deadline(dueDate)! };
      if (modal.kind === 'create') void run(() => createProject({ ...fields, departmentId: department, storeId }), 'Đã tạo công việc.');
      else { if (modal.project.dueDate && !dueDate) { setFormError('Nhiệm vụ có hạn phải giữ deadline khác rỗng.'); return; } void run(() => editProject(modal.project.id, { ...fields, dueDate: fields.dueDate, expectedVersion: modal.project.version }), 'Đã cập nhật công việc.'); }
    } else if (modal.kind === 'assign') {
      if (!assignee) { setFormError('Chọn nhân sự nhận việc.'); return; }
      void run(() => assignProject(modal.project.id, { assigneeId: assignee, expectedVersion: modal.project.version }), 'Đã giao việc.');
    } else if (modal.kind === 'progress') {
      const value = Number(progress);
      if (!progress.trim() || !Number.isInteger(value) || value < 0 || value > 100) { setFormError('Tiến độ phải là số nguyên từ 0 đến 100.'); return; }
      void run(() => updateProjectProgress(modal.project.id, { progress: value, expectedVersion: modal.project.version }), 'Đã lưu tiến độ.');
    } else if (modal.kind === 'submit') {
      const links = attachments.split('\n').map((item) => item.trim()).filter(Boolean);
      if (!content.trim() || links.length > 10 || links.some((item) => !safeLink(item))) { setFormError('Nhập nội dung và tối đa 10 liên kết HTTP/HTTPS hợp lệ.'); return; }
      void run(() => submitReport(modal.project.id, { content: content.trim(), attachments: links, expectedVersion: modal.project.version }), 'Đã nộp báo cáo, đang chờ quản lý nghiệm thu.');
    }
  };

  const current = modal && 'project' in modal ? modal.project : null;
  const pending = reports.find((report) => report.status === 'PENDING');
  const canReview = can('reports.review') && current?.status === 'PENDING_REVIEW' && pending && current.assigneeId !== me?.employeeId && ![me?.userId, me?.employeeId].includes(pending.submittedBy);
  const modalTitle = modal?.kind === 'create' ? 'Tạo công việc' : modal?.kind === 'edit' ? 'Sửa công việc' : modal?.kind === 'assign' ? 'Giao việc' : modal?.kind === 'progress' ? 'Cập nhật tiến độ' : modal?.kind === 'submit' ? 'Nộp báo cáo' : modal?.kind === 'review' ? 'Nghiệm thu báo cáo' : modal?.kind === 'assignment' ? 'Tiếp nhận & bàn giao nhiệm vụ' : 'Chi tiết công việc';
  const reset = () => { setWorkType('all'); setWorkPeriod(''); setSearch(''); setFilters({ q: '', departmentId: '', storeId: '', assigneeId: '', dueFrom: '', dueTo: '', assignmentView: '', status: '', mine: false, overdue: false, page: 1 }); };

  return <section className="crm-workspace" aria-label="Công việc và nghiệm thu" aria-busy={!me && !identityError}>
    <header className="crm-work-heading"><div><p className="crm-work-eyebrow">QUẢN TRỊ CÔNG VIỆC</p><h2>Công việc & nghiệm thu</h2><p>Giao đúng người. Theo dõi tiến độ. Nghiệm thu bằng báo cáo và lịch sử thực tế.</p></div>
      {(canCreateRegular || canCreateScored) && <button type="button" className="btn btn--primary" onClick={openCreate}>Tạo công việc</button>}
    </header>
    {identityError && <div role="alert" className="banner banner--error">{identityError}</div>}
    {summaryError && <p role="alert">{summaryError}</p>}
    {canReadProjects && <><WorkOverview revision={overviewRevision} />
    <nav className="crm-assignment-summary" aria-label="Tổng quan tiếp nhận việc thường">
      {([
        ['Chờ tiếp nhận', 'awaitingAcceptance', 'AWAITING_ACCEPTANCE'], ['Đang thực hiện', 'inProgress', 'IN_PROGRESS'],
        ['Yêu cầu chờ quản lý', 'pendingRequests', 'PENDING_REQUESTS'], ['Chờ bàn giao', 'pendingHandover', 'HANDOVER'], ['Nhiệm vụ quá hạn', 'overdue', 'OVERDUE'],
      ] as const).map(([label, key, view]) => <button type="button" className="btn" key={key} onClick={() => { setWorkType('regular'); setFilters((old) => ({ ...old, page: 1,
        assignmentView: ['AWAITING_ACCEPTANCE', 'PENDING_REQUESTS', 'HANDOVER'].includes(view) ? view : '', status: view === 'IN_PROGRESS' ? 'IN_PROGRESS' : '', overdue: view === 'OVERDUE' })); }}><span>{label}</span><strong>{summary?.[key] ?? '—'}</strong></button>)}
    </nav>
    {!!notices?.items.length && <details className="crm-assignment-inbox" aria-busy={noticesLoading}><summary>Thông báo phân công ({notices.unreadCount} chưa đọc)</summary>
      {notices.items.map((item) => <article className="crm-report-card" key={item.id}><strong>{item.projectTitle}{!item.read ? ' · Chưa đọc' : ''}</strong><p>{item.message}</p><time>{dateText(item.at)}</time>{!item.read && <button type="button" className="btn" onClick={() => void readAssignmentNotice(item.projectId, item.id).then(() => load()).catch((failure) => notify.current(failure instanceof Error ? failure.message : 'Không đánh dấu đọc được.', 'error'))}>Đánh dấu đã đọc</button>}</article>)}
      <nav aria-label="Phân trang thông báo phân công"><button className="btn" disabled={noticesLoading || !notices.paging.hasPrev} onClick={() => setNoticePage(noticePage - 1)}>Trang trước</button><span>Trang {notices.paging.page} · {notices.totalItems} thông báo</span><button className="btn" disabled={noticesLoading || !notices.paging.hasNext} onClick={() => setNoticePage(noticePage + 1)}>Trang sau</button></nav>
    </details>}</>}
    <div className="crm-work-toolbar">
      {canReadScored && canReadProjects && <label className="field">Loại công việc
        <select aria-label="Loại công việc" className="input" value={workType} onChange={event => { setWorkType(event.target.value as WorkType); setFilters(old => ({ ...old, page: 1 })); }}>
          <option value="all">Tất cả công việc</option><option value="regular">Việc thường</option><option value="scored">Việc có thang điểm</option>
        </select>
      </label>}
      {canReadScored && workType !== 'regular' && <label className="field">Tháng việc có thang điểm
        <input className="input" type="month" value={workPeriod} onChange={event => { setWorkPeriod(event.target.value); setFilters(old => ({ ...old, page: 1 })); }} />
      </label>}
      <label className="field">Cửa hàng công việc<select aria-label="Cửa hàng công việc" className="input" value={filters.storeId} onChange={(event) => setFilters((old) => ({ ...old, storeId: event.target.value, page: 1 }))}><option value="">Tất cả phạm vi công việc</option>{me?.authorization?.stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}</select></label>
      <label className="field">Người nhận trong các trang đã xem<select aria-label="Người nhận trong các trang đã xem" className="input" value={filters.assigneeId} onChange={(event) => setFilters((old) => ({ ...old, assigneeId: event.target.value, page: 1 }))}><option value="">Tất cả người nhận được phép</option>{Object.entries(knownAssignees).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <label className="field">Hạn từ ngày<input className="input" type="date" value={filters.dueFrom ? dateInput(filters.dueFrom) : ''} onChange={(event) => setFilters((old) => ({ ...old, dueFrom: event.target.value ? new Date(event.target.value + 'T00:00:00+07:00').toISOString() : '', page: 1 }))} /></label><label className="field">Hạn đến ngày<input className="input" type="date" value={filters.dueTo ? dateInput(filters.dueTo) : ''} onChange={(event) => setFilters((old) => ({ ...old, dueTo: deadline(event.target.value) || '', page: 1 }))} /></label>
      <label className="field"><span className="field__label">Tìm công việc</span><input className="input" type="search" value={search} maxLength={200} onChange={(event) => setSearch(event.target.value)} placeholder="Tên hoặc nội dung công việc..." /></label>
      <label className="field"><span className="field__label" id="work-status-label">Trạng thái</span><Select aria-labelledby="work-status-label" value={filters.status} onChange={(status) => setFilters((old) => ({ ...old, status, page: 1 }))} options={[{ value: '', label: 'Tất cả trạng thái' }, ...Object.entries(LABEL).map(([value, label]) => ({ value, label }))]} /></label>
      {departments.length > 1 && <div className="field"><span className="field__label" id="work-filter-department-label">Phòng ban</span><Select aria-labelledby="work-filter-department-label" value={filters.departmentId} onChange={(departmentId) => setFilters((old) => ({ ...old, departmentId, page: 1 }))} options={[{ value: '', label: 'Tất cả trong phạm vi' }, ...departments.map((item) => ({ value: item.id, label: item.name }))]} /></div>}
      <label className="crm-work-check"><input type="checkbox" checked={filters.overdue} onChange={(event) => setFilters((old) => ({ ...old, overdue: event.target.checked, page: 1 }))} />Quá hạn</label>
      <label className="crm-work-check"><input type="checkbox" checked={filters.mine} onChange={(event) => setFilters((old) => ({ ...old, mine: event.target.checked, page: 1 }))} />Việc của tôi</label>
      <button type="button" className="btn" disabled={loading} onClick={() => { setOverviewRevision((value) => value + 1); void load(); }}>Làm mới</button>
      {(filters.assignmentView || filters.status || filters.overdue || filters.mine || filters.q || filters.departmentId || filters.storeId || filters.assigneeId || filters.dueFrom || filters.dueTo || workType !== 'all' || workPeriod) && <button type="button" className="btn" onClick={reset}>Xóa bộ lọc</button>}
    </div>
    <p className="crm-work-count" role="status">{loading ? 'Đang tải công việc…' : error ? 'Chưa tải được dữ liệu' : (data?.paging.totalItems ?? 0) + ' công việc phù hợp'}</p>
    {error && <div role="alert" className="banner banner--error">{error}<button type="button" className="btn" onClick={() => void load()}>Thử lại</button></div>}
    {loading ? <div aria-hidden="true">{[1, 2, 3].map((row) => <div className="skeleton crm-work-skeleton" key={row} />)}</div> : !error && !data?.items.length ? <div className="empty"><h3>Chưa có công việc phù hợp</h3><p>Thử đổi bộ lọc hoặc tạo công việc mới nếu bạn có quyền quản lý.</p><button type="button" className="btn" onClick={reset}>Xóa bộ lọc</button></div> : !error && <>
      <div className="crm-work-table-wrap"><table className="table crm-work-table"><caption className="sr-only">Danh sách công việc trong phạm vi được cấp</caption>
        <thead><tr><th>Công việc</th><th>Trạng thái</th><th>Tiến độ</th><th>Hạn hoàn thành</th><th>Thao tác</th></tr></thead>
        <tbody>{data?.items.map(item => {
          if (item.type === 'scored') {
            const { task } = item;
            const due = task.extendedDueAt ?? task.dueAt;
            const mayReview = can('task.evaluate') && task.status === 'PENDING_REVIEW' && task.assigneeEmployeeId !== me?.employeeId;
            const taskStatus = task.assignmentStatus === 'REFUSED' ? 'REFUSED' : task.status;
            const openScored = (review = false) => setModal({ kind: 'scored', task: { id: task.id, period: task.kpiPeriod }, review });
            return <tr key={'scored:'+task.id}>
              <td><button type="button" className="crm-work-title" onClick={() => openScored()}>{task.title}</button>
                <span className="crm-work-kpi-badge">KPI</span>
                <p className="crm-work-secondary">{me?.authorization?.stores.find(store => store.id === task.storeId)?.name}</p>
                <p className="crm-work-secondary">Người nhận: {task.assigneeName || (task.assigneeEmployeeId ? 'Nhân viên được giao' : 'Chưa giao')}</p></td>
              <td><span className={'crm-work-status crm-work-status--'+task.status}>{performanceLabels[taskStatus] ?? taskStatus}</span>
                {!['COMPLETED', 'CANCELLED'].includes(task.status) && Date.parse(due) < Date.now() && <span className="crm-work-late">Quá hạn</span>}</td>
              <td><progress value={task.progressPercent} max={100} aria-label={'Tiến độ '+task.title}/><span className="crm-work-secondary">{task.progressPercent}%</span></td>
              <td><time dateTime={due}>{dateText(due)}</time></td>
              <td><div className="crm-work-actions">
                <button type="button" className="btn btn--sm" onClick={() => openScored()}>Chi tiết</button>
                {mayReview && <button type="button" className="btn btn--sm btn--primary" onClick={() => openScored(true)}>Nghiệm thu</button>}
              </div></td>
            </tr>;
          }
          const { project } = item;
          const own = !!me?.employeeId && project.assigneeId === me.employeeId;
          return <tr key={'regular:'+project.id}>
            <td><button type="button" className="crm-work-title" onClick={() => open('details', project)}>{project.title}</button><p className="crm-work-secondary">{me?.authorization?.stores.find((store) => store.id === project.storeId)?.name || departments.find((item) => item.id === project.departmentId)?.name || project.departmentId}</p><p className="crm-work-secondary">Người nhận: {project.assigneeName || project.assigneeId || 'Chưa giao'}</p></td>
            <td><span className={'crm-work-status crm-work-status--' + project.status}>{assignmentLabel(project)}</span>{overdue(project) && <span className="crm-work-late">Quá hạn</span>}</td>
            <td><progress value={project.progress} max={100} aria-label={'Tiến độ ' + project.title} /><span className="crm-work-secondary">{project.progress}%</span></td>
            <td><time dateTime={project.dueDate || undefined}>{dateText(project.dueDate)}</time></td>
            <td><div className="crm-work-actions">
              <button type="button" className="btn btn--sm" onClick={() => open('details', project)}>Chi tiết</button>
              {me && project.status !== 'DRAFT' && <button type="button" className="btn btn--sm" onClick={() => open('assignment', project)}>Tiếp nhận / Bàn giao</button>}
              {can('projects.create') && ['DRAFT', 'ASSIGNED', 'IN_PROGRESS'].includes(project.status) && <button type="button" className="btn btn--sm" onClick={() => open('edit', project)}>Sửa</button>}
              {can('projects.assign') && project.status === 'DRAFT' && <button type="button" className="btn btn--sm" onClick={() => open('assign', project)}>Giao việc</button>}
              {own && project.status === 'ASSIGNED' && project.assignmentStatus === 'ACCEPTED' && !project.assignmentRequests.some((item) => item.status === 'PENDING') && <button type="button" className="btn btn--sm btn--primary" disabled={busy} onClick={() => void run(() => transitionProject(project.id, { targetStatus: 'IN_PROGRESS', expectedVersion: project.version }), 'Đã bắt đầu công việc.')}>Bắt đầu</button>}
              {own && project.status === 'IN_PROGRESS' && project.assignmentStatus !== 'HANDOVER_PENDING' && <><button type="button" className="btn btn--sm" onClick={() => open('progress', project)}>Tiến độ</button><button type="button" className="btn btn--sm btn--primary" disabled={project.assignmentRequests.some((item) => item.status === 'PENDING')} onClick={() => open('submit', project)}>Nộp báo cáo</button></>}
              {can('reports.review') && project.assigneeId !== me?.employeeId && project.status === 'PENDING_REVIEW' && <button type="button" className="btn btn--sm btn--primary" onClick={() => open('review', project)}>Nghiệm thu</button>}
            </div></td>
          </tr>;
        })}</tbody>
      </table></div>
      <nav className="crm-work-pagination" aria-label="Phân trang công việc"><button type="button" className="btn" disabled={!data?.paging.hasPrev} onClick={() => setFilters((old) => ({ ...old, page: old.page - 1 }))}>Trang trước</button><span>Trang {data?.paging.page} / {data?.paging.totalPages}</span><button type="button" className="btn" disabled={!data?.paging.hasNext} onClick={() => setFilters((old) => ({ ...old, page: old.page + 1 }))}>Trang sau</button></nav>
    </>}

    {modal?.kind === 'scored' && <CrmDialog title="Chi tiết công việc có thang điểm" busy={busy} onClose={close}>
      <PerformanceKpiView work target={modal.task} openReview={modal.review} onWorkChanged={() => void load()} />
    </CrmDialog>}
    {modal && modal.kind !== 'scored' && <CrmDialog title={modalTitle} busy={busy} onClose={close}>
      {current && <div className="crm-work-detail"><h4>{current.title}</h4><p>{current.description || 'Chưa có mô tả.'}</p><p>Kỹ năng yêu cầu: {current.requiredSkills.join(', ') || 'Chưa cập nhật'}</p><p>Người nhận: {current.assigneeName || current.assigneeId || 'Chưa giao'}</p><p>{LABEL[current.status]} · phiên bản {current.version} · {dateText(current.dueDate)}</p></div>}
      {modal.kind === 'assignment' && current && me && <>
        {detailLoading && <p role="status">Đang tải thông tin tiếp nhận mới nhất…</p>}
        {detailError && <p role="alert">{detailError}</p>}
        <AssignmentPanel key={current.id} project={current} me={me} onBusyChange={assignmentBusy} onUpdated={(latest) => { setModal((old) => old && 'project' in old ? { ...old, project: latest } : old); void load(); }} />
      </>}
      {['create', 'edit', 'assign', 'progress', 'submit'].includes(modal.kind) && <form onSubmit={submit} className="crm-work-form">
        {(modal.kind === 'create' || modal.kind === 'edit') && <>
          {modal.kind === 'create' && canCreateScored && <label className="crm-work-check">
            <input type="checkbox" checked={scored} disabled={busy || !canCreateRegular} onChange={event => selectCreationType(event.target.checked)} />Tính vào KPI
          </label>}
          <label className="field"><span className="field__label">Tiêu đề công việc</span><input className="input" required maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} disabled={busy} /></label>
          <label className="field"><span className="field__label" id="work-description-label">Mô tả</span><textarea aria-labelledby="work-description-label" className="textarea" maxLength={10000} value={description} onChange={(event) => setDescription(event.target.value)} disabled={busy} /></label>
          {(modal.kind === 'edit' || !scored) && <label className="field"><span className="field__label">Kỹ năng yêu cầu (cách nhau bằng dấu phẩy)</span><input className="input" maxLength={3030} value={requiredSkills} onChange={(event) => setRequiredSkills(event.target.value)} disabled={busy} placeholder="Bàn giao, Kiểm kê tài sản" /></label>}
          {modal.kind === 'create' && <div className="field"><span className="field__label" id="work-store-label">Cửa hàng phụ trách</span><Select aria-labelledby="work-store-label" value={storeId} onChange={(value) => { setStoreId(value); setTemplateId(''); setDepartment(creationStores.find((store) => store.id === value)?.departmentId || ''); }} disabled={busy || !creationStores.length} options={creationStores.map((item) => ({ value: item.id, label: item.name }))} placeholder="Chọn cửa hàng được cấp" /></div>}
          <label className="field"><span className="field__label">Hạn hoàn thành (giờ Việt Nam, cuối ngày)</span><input className="input" type="date" required={modal.kind === 'create' || !!current?.dueDate} value={dueDate} onChange={(event) => { setDueDate(event.target.value); if (scored) setTemplateId(''); }} disabled={busy} /></label>
          {modal.kind === 'create' && scored && <WorkRubricFields
            storeId={storeId} title={title} description={description} dueDate={dueDate} templateId={templateId} weight={weight}
            onTemplate={setTemplateId} onWeight={setWeight} disabled={busy} onBusy={assignmentBusy}
          />}
        </>}
        {modal.kind === 'assign' && <>
          <CandidateSuggestions projectId={modal.project.id} projectVersion={modal.project.version} disabled={busy} />
          <label className="field"><span className="field__label">Tìm người nhận việc trong phòng ban</span><input className="input" value={assigneeSearch} onChange={(event) => { setAssigneeSearch(event.target.value); setAssigneePage(1); setAssignee(''); }} disabled={busy} /></label>
          <div className="field"><span id="work-assignee-label" className="field__label">Nhân sự đang hoạt động</span><Select aria-labelledby="work-assignee-label" value={assignee} onChange={setAssignee} disabled={busy || assigneeLoading} options={assignees.map((item) => ({ value: item.employeeId, label: item.fullName + ' · ' + item.level }))} placeholder={assigneeLoading ? 'Đang tải nhân sự…' : 'Chọn người nhận việc'} /></div>
          {assigneeError && <p role="alert">{assigneeError}</p>}
          {!assigneeLoading && !assignees.length && <p>Không có nhân sự đang hoạt động phù hợp.</p>}
          {moreAssignees && <button type="button" className="btn" disabled={assigneeLoading || busy} onClick={() => setAssigneePage((old) => old + 1)}>Tải thêm nhân sự</button>}
        </>}
        {modal.kind === 'progress' && <label className="field"><span className="field__label">Tiến độ (%)</span><input className="input" type="number" min={0} max={100} step={1} required value={progress} onChange={(event) => setProgress(event.target.value)} disabled={busy} /></label>}
        {modal.kind === 'submit' && <>
          <label className="field"><span className="field__label" id="work-report-content-label">Nội dung báo cáo</span><textarea aria-labelledby="work-report-content-label" className="textarea" required maxLength={20000} value={content} onChange={(event) => setContent(event.target.value)} disabled={busy} /></label>
          <label className="field"><span className="field__label" id="work-evidence-label">Liên kết minh chứng (mỗi dòng một URL, tối đa 10)</span><textarea aria-labelledby="work-evidence-label" className="textarea" value={attachments} onChange={(event) => setAttachments(event.target.value)} disabled={busy} placeholder="https://..." /></label><p>Chỉ lưu liên kết bạn cung cấp; không tải tệp lên máy chủ trong thao tác này.</p>
        </>}
        {formError && <p role="alert" className="banner banner--error">{formError}</p>}
        <footer className="crm-work-actions"><button type="button" className="btn" disabled={busy} onClick={close}>Hủy</button><button type="submit" className="btn btn--primary" disabled={busy || (modal.kind === 'assign' && !assignee)}>{busy ? 'Đang lưu…' : modal.kind === 'assign' ? 'Xác nhận giao việc' : modal.kind === 'submit' ? 'Xác nhận nộp báo cáo' : 'Lưu công việc'}</button></footer>
      </form>}
      {(modal.kind === 'details' || modal.kind === 'review') && current && <div className="crm-work-detail">
        {detailLoading && <p role="status">Đang tải báo cáo và lịch sử…</p>}
        {detailError && <div role="alert" className="banner banner--error">{detailError}<button type="button" className="btn" onClick={() => void refreshDetails(current)}>Thử lại</button></div>}
        {!detailLoading && !detailError && <>
          <h4>Báo cáo nghiệm thu</h4>
          {!reports.length && <p>Chưa có báo cáo được nộp.</p>}
          {reports.map((report) => <article key={report.id} className="crm-report-card"><header><strong>{REPORT_LABEL[report.status]}</strong><time>{dateText(report.submittedAt)}</time></header><p>Người nộp: {report.submittedBy === current.assigneeId ? current.assigneeName || report.submittedBy : report.submittedBy}</p><p className="crm-work-pre">{report.content}</p>
            {report.attachments.map((link, index) => safeLink(link) ? <a key={index} href={link} target="_blank" rel="noopener noreferrer">Minh chứng {index + 1}</a> : <span key={index}>Liên kết cũ không an toàn — không mở tự động.</span>)}
            {report.reviewedAt && <p>Người duyệt: {report.reviewedBy} · {dateText(report.reviewedAt)} · {report.reason || 'Không có ghi chú.'}</p>}
          </article>)}
          {modal.kind === 'review' && <>
            {!canReview && <p className="banner">Không thể duyệt: không có báo cáo chờ duyệt hoặc bạn là người nộp. Cần quản lý khác thực hiện.</p>}
            <label className="field"><span className="field__label" id="work-review-reason-label">Nhận xét nghiệm thu (bắt buộc khi yêu cầu làm lại)</span><textarea aria-labelledby="work-review-reason-label" className="textarea" maxLength={2000} value={reason} onChange={(event) => setReason(event.target.value)} disabled={busy || !canReview} /></label>
            {formError && <p role="alert" className="banner banner--error">{formError}</p>}
            <div className="crm-work-actions"><button type="button" className="btn btn--danger" disabled={busy || !canReview || !reason.trim()} onClick={() => pending && void run(() => reviewReport(pending.id, { action: 'REJECT', reason: reason.trim(), expectedVersion: current.version }), 'Đã trả báo cáo để bổ sung.')}>Yêu cầu làm lại</button><button type="button" className="btn btn--primary" disabled={busy || !canReview} onClick={() => pending && void run(() => reviewReport(pending.id, { action: 'APPROVE', reason: reason.trim() || undefined, expectedVersion: current.version }), 'Đã nghiệm thu và hoàn thành công việc.')}>Xác nhận nghiệm thu</button></div>
          </>}
          <h4>Lịch sử xử lý</h4><ol className="crm-work-history">{[...current.statusHistory].reverse().map((entry, index) => <li key={index}><strong>{entry.from ? LABEL[entry.from] + ' → ' : ''}{LABEL[entry.to]}</strong><p>{entry.reason || 'Cập nhật trạng thái'}</p><p>Người thực hiện: {entry.changedBy === current.assigneeId ? current.assigneeName || entry.changedBy : entry.changedBy}</p><time>{dateText(entry.changedAt)}</time></li>)}</ol>
        </>}
      </div>}
    </CrmDialog>}
  </section>;
};
