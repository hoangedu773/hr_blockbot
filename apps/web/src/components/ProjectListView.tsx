import React, { useCallback, useEffect, useRef, useState } from 'react';
import type {
  EmployeeSummary,
  MeResponse,
  PaginatedProjectsResponse,
  Project,
  ProjectStatus,
} from '@hr-blockbot/contracts';
import { useAuth } from '../context/AuthContext';
import {
  ApiError,
  assignProject,
  createProject,
  fetchEmployees,
  fetchMe,
  fetchProjects,
  submitReport as submitReportApi,
  transitionProject,
  updateProjectProgress,
} from '../services/api';
import type { NotifyFn } from './Toast';

interface ProjectListViewProps {
  onNotify: NotifyFn;
}

type ModalState =
  | { kind: 'create' }
  | { kind: 'assign'; project: Project }
  | { kind: 'report'; project: Project }
  | { kind: 'progress'; project: Project }
  | { kind: 'review'; project: Project; action: 'APPROVE' | 'REJECT' }
  | null;

const STATUS_ORDER: ProjectStatus[] = ['DRAFT', 'ASSIGNED', 'IN_PROGRESS', 'PENDING_REVIEW', 'COMPLETED'];

const STATUS_CHIP: Record<ProjectStatus, string> = {
  DRAFT: '',
  ASSIGNED: 'chip--info',
  IN_PROGRESS: 'chip--warn',
  PENDING_REVIEW: 'chip--warn',
  COMPLETED: 'chip--ok',
};

const STATUS_LABEL: Record<ProjectStatus, string> = {
  DRAFT: 'DRAFT',
  ASSIGNED: 'ASSIGNED',
  IN_PROGRESS: 'IN_PROGRESS',
  PENDING_REVIEW: 'PENDING_REVIEW',
  COMPLETED: 'COMPLETED',
};

function isOverdue(project: Project): boolean {
  if (!project.dueDate || project.status === 'COMPLETED') return false;
  return new Date(project.dueDate).getTime() < Date.now();
}

export const ProjectListView: React.FC<ProjectListViewProps> = ({ onNotify }) => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'Admin';

  // P1-16: `onNotify` is usually passed as an inline arrow, so its identity changes
  // on every render. Using it directly in `load`'s dependency list made the effect
  // re-run forever. Keep the latest callback in a ref and leave deps to real inputs.
  const onNotifyRef = useRef(onNotify);
  useEffect(() => {
    onNotifyRef.current = onNotify;
  }, [onNotify]);

  const [data, setData] = useState<PaginatedProjectsResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [overdueOnly, setOverdueOnly] = useState<boolean>(false);
  const [page, setPage] = useState<number>(1);

  const [me, setMe] = useState<MeResponse | null>(null);
  const [assignees, setAssignees] = useState<EmployeeSummary[]>([]);
  const [assigneesError, setAssigneesError] = useState<string>('');

  const [modal, setModal] = useState<ModalState>(null);
  const [busy, setBusy] = useState<boolean>(false);
  const [formError, setFormError] = useState<string>('');

  // Create form
  const [title, setTitle] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [dueDate, setDueDate] = useState<string>('');
  // Assign form
  const [assigneeId, setAssigneeId] = useState<string>('');
  // Progress form
  const [progress, setProgress] = useState<string>('50');
  // Report form
  const [reportContent, setReportContent] = useState<string>('');
  // Review form
  const [reviewReason, setReviewReason] = useState<string>('');

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const result = await fetchProjects({
        status: (statusFilter as ProjectStatus) || undefined,
        overdue: overdueOnly || undefined,
        page,
        limit: 20,
      });
      setData(result);
    } catch (err: unknown) {
      const message = err instanceof ApiError ? `${err.code}: ${err.message}` : err instanceof Error ? err.message : 'Lỗi tải danh sách đề tài';
      setLoadError(message);
      onNotifyRef.current(message, 'error', 'Không tải được đề tài');
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, overdueOnly, page]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const meResult = await fetchMe();
        if (!cancelled) setMe(meResult);
      } catch {
        if (!cancelled) setMe(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadAssignees = async () => {
    if (assignees.length > 0) return;
    try {
      const result = await fetchEmployees({ limit: 100 });
      setAssignees(result.items);
      setAssigneesError('');
    } catch (err: unknown) {
      setAssigneesError(err instanceof Error ? err.message : 'Không tải được danh sách nhân sự để giao việc');
    }
  };

  const closeModal = () => {
    setModal(null);
    setFormError('');
  };

  const handleError = (err: unknown, fallback: string) => {
    const message =
      err instanceof ApiError
        ? `${err.code}: ${err.message}${err.status === 409 ? ' — dữ liệu đã đổi, đang tải lại danh sách.' : ''}`
        : err instanceof Error
        ? err.message
        : fallback;
    setFormError(message);
    onNotify(message, 'error', fallback);
    if (err instanceof ApiError && err.status === 409) {
      void load();
    }
  };

  const submitCreate = async () => {
    if (!me?.departmentId) {
      setFormError('Tài khoản Admin chưa được gán departmentId nên không thể tạo đề tài (server cần phạm vi phòng ban).');
      return;
    }
    if (title.trim().length === 0) {
      setFormError('Tiêu đề đề tài là bắt buộc.');
      return;
    }
    setBusy(true);
    setFormError('');
    try {
      await createProject({
        title: title.trim(),
        description: description.trim() || undefined,
        departmentId: me.departmentId,
        dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
      });
      onNotify('Đã tạo đề tài ở trạng thái DRAFT.', 'success', 'Tạo đề tài');
      closeModal();
      setTitle('');
      setDescription('');
      setDueDate('');
      await load();
    } catch (err: unknown) {
      handleError(err, 'Lỗi tạo đề tài');
    } finally {
      setBusy(false);
    }
  };

  const submitAssign = async (project: Project) => {
    if (!assigneeId) {
      setFormError('Chọn một nhân sự để giao việc.');
      return;
    }
    setBusy(true);
    setFormError('');
    try {
      await assignProject(project.id, { assigneeId, expectedVersion: project.version });
      onNotify('Đã giao việc cho nhân sự.', 'success', 'Giao việc');
      closeModal();
      setAssigneeId('');
      await load();
    } catch (err: unknown) {
      handleError(err, 'Lỗi giao việc');
    } finally {
      setBusy(false);
    }
  };

  const submitStart = async (project: Project) => {
    setBusy(true);
    try {
      await transitionProject(project.id, { targetStatus: 'IN_PROGRESS', expectedVersion: project.version });
      onNotify('Đề tài chuyển sang IN_PROGRESS.', 'success', 'Cập nhật trạng thái');
      await load();
    } catch (err: unknown) {
      handleError(err, 'Lỗi chuyển trạng thái');
    } finally {
      setBusy(false);
    }
  };

  const submitProgress = async (project: Project) => {
    const value = Number.parseInt(progress, 10);
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      setFormError('Tiến độ phải là số nguyên 0..100.');
      return;
    }
    setBusy(true);
    setFormError('');
    try {
      await updateProjectProgress(project.id, { progress: value });
      onNotify(`Đã cập nhật tiến độ ${value}%.`, 'success', 'Cập nhật tiến độ');
      closeModal();
      await load();
    } catch (err: unknown) {
      handleError(err, 'Lỗi cập nhật tiến độ');
    } finally {
      setBusy(false);
    }
  };

  const submitReport = async (project: Project) => {
    if (reportContent.trim().length === 0) {
      setFormError('Nội dung báo cáo là bắt buộc.');
      return;
    }
    setBusy(true);
    setFormError('');
    try {
      await submitReportApi(project.id, {
        content: reportContent.trim(),
        attachments: [],
        expectedVersion: project.version,
      });
      onNotify('Đã nộp báo cáo — đề tài chuyển PENDING_REVIEW.', 'success', 'Nộp báo cáo');
      closeModal();
      setReportContent('');
      await load();
    } catch (err: unknown) {
      handleError(err, 'Lỗi nộp báo cáo');
    } finally {
      setBusy(false);
    }
  };

  const submitReview = async (project: Project, action: 'APPROVE' | 'REJECT') => {
    if (action === 'REJECT' && reviewReason.trim().length === 0) {
      setFormError('Bắt buộc nhập lý do khi từ chối.');
      return;
    }
    setBusy(true);
    setFormError('');
    try {
      await transitionProject(project.id, {
        targetStatus: action === 'APPROVE' ? 'COMPLETED' : 'IN_PROGRESS',
        expectedVersion: project.version,
        ...(reviewReason.trim() ? { reason: reviewReason.trim() } : {}),
      });
      onNotify(
        action === 'APPROVE' ? 'Đề tài đã COMPLETED.' : 'Đề tài trả về IN_PROGRESS kèm lý do.',
        'success',
        action === 'APPROVE' ? 'Duyệt báo cáo' : 'Từ chối báo cáo'
      );
      closeModal();
      setReviewReason('');
      await load();
    } catch (err: unknown) {
      handleError(err, 'Lỗi duyệt báo cáo');
    } finally {
      setBusy(false);
    }
  };

  const items = data?.items ?? [];
  const paging = data?.paging;

  const renderActions = (project: Project) => {
    const actions: React.ReactNode[] = [];

    if (isAdmin && project.status === 'DRAFT') {
      actions.push(
        <button
          key="assign"
          type="button"
          className="btn btn--sm btn--primary"
          onClick={() => {
            setModal({ kind: 'assign', project });
            setFormError('');
            void loadAssignees();
          }}
        >
          Giao việc
        </button>
      );
    }

    if (!isAdmin && project.status === 'ASSIGNED') {
      actions.push(
        <button key="start" type="button" className="btn btn--sm btn--primary" disabled={busy} onClick={() => void submitStart(project)}>
          Bắt đầu
        </button>
      );
    }

    if (!isAdmin && project.status === 'IN_PROGRESS') {
      actions.push(
        <button
          key="progress"
          type="button"
          className="btn btn--sm"
          onClick={() => {
            setModal({ kind: 'progress', project });
            setProgress(String(project.progress));
            setFormError('');
          }}
        >
          Tiến độ
        </button>,
        <button
          key="report"
          type="button"
          className="btn btn--sm btn--primary"
          onClick={() => {
            setModal({ kind: 'report', project });
            setReportContent('');
            setFormError('');
          }}
        >
          Nộp báo cáo
        </button>
      );
    }

    if (isAdmin && project.status === 'PENDING_REVIEW') {
      actions.push(
        <button
          key="approve"
          type="button"
          className="btn btn--sm btn--primary"
          onClick={() => {
            setModal({ kind: 'review', project, action: 'APPROVE' });
            setReviewReason('');
            setFormError('');
          }}
        >
          Duyệt
        </button>,
        <button
          key="reject"
          type="button"
          className="btn btn--sm btn--danger"
          onClick={() => {
            setModal({ kind: 'review', project, action: 'REJECT' });
            setReviewReason('');
            setFormError('');
          }}
        >
          Từ chối
        </button>
      );
    }

    if (actions.length === 0) {
      return <span style={{ fontSize: '11px', color: 'var(--text-faint)' }}>—</span>;
    }
    return <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>{actions}</div>;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#f8fafc' }}>Vòng Đời Đề Tài (F2)</h2>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
            DRAFT → ASSIGNED → IN_PROGRESS → PENDING_REVIEW → COMPLETED · optimistic lock theo version
          </p>
        </div>
        {isAdmin && (
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => {
              setModal({ kind: 'create' });
              setFormError('');
              setTitle('');
              setDescription('');
              setDueDate('');
            }}
          >
            + Tạo đề tài
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="field" style={{ minWidth: '170px' }}>
          <label className="field__label" htmlFor="project-status">
            Trạng thái
          </label>
          <select
            id="project-status"
            className="select"
            value={statusFilter}
            onChange={(event) => {
              setPage(1);
              setStatusFilter(event.target.value);
            }}
          >
            <option value="">Tất cả</option>
            {STATUS_ORDER.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABEL[status]}
              </option>
            ))}
          </select>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', paddingBottom: '8px' }}>
          <input
            type="checkbox"
            checked={overdueOnly}
            onChange={(event) => {
              setPage(1);
              setOverdueOnly(event.target.checked);
            }}
          />
          Chỉ đề tài quá hạn (dueDate &lt; now, chưa COMPLETED)
        </label>
        <button type="button" className="btn" onClick={() => void load()} disabled={isLoading}>
          Làm mới
        </button>
      </div>

      {isLoading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {[0, 1, 2, 3].map((row) => (
            <div key={row} className="skeleton" style={{ height: '52px' }} />
          ))}
        </div>
      )}

      {!isLoading && loadError && (
        <div className="banner banner--error" role="alert">
          <span>Không tải được danh sách đề tài: {loadError}</span>
          <button type="button" className="btn btn--sm" onClick={() => void load()}>
            Thử lại
          </button>
        </div>
      )}

      {!isLoading && !loadError && items.length === 0 && (
        <div className="empty">
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
            {statusFilter || overdueOnly ? 'Không có đề tài khớp bộ lọc' : 'Chưa có đề tài nào'}
          </div>
          <p>
            {statusFilter || overdueOnly
              ? 'Thử xoá bộ lọc trạng thái / quá hạn.'
              : 'Tạo đề tài DRAFT để bắt đầu vòng đời, hoặc chờ Admin giao việc.'}
          </p>
          {(statusFilter || overdueOnly) && (
            <button
              type="button"
              className="btn btn--sm"
              onClick={() => {
                setStatusFilter('');
                setOverdueOnly(false);
                setPage(1);
              }}
            >
              Xoá bộ lọc
            </button>
          )}
        </div>
      )}

      {!isLoading && !loadError && items.length > 0 && (
        <>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
            {paging?.totalItems ?? items.length} đề tài · trang {paging?.page ?? 1}/{paging?.totalPages ?? 1}
          </div>
          <div className="card table-wrap" style={{ overflow: 'hidden' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Đề tài</th>
                  <th>Trạng thái</th>
                  <th>Tiến độ</th>
                  <th>Hạn</th>
                  <th>Version</th>
                  <th style={{ textAlign: 'right' }}>Hành động</th>
                </tr>
              </thead>
              <tbody>
                {items.map((project) => (
                  <tr key={project.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: '#f8fafc' }}>{project.title}</div>
                      {project.description && (
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', maxWidth: '360px' }}>{project.description}</div>
                      )}
                    </td>
                    <td>
                      <span className={`chip ${STATUS_CHIP[project.status]}`}>{STATUS_LABEL[project.status]}</span>
                    </td>
                    <td style={{ minWidth: '120px' }}>
                      <div className="progress" aria-hidden="true">
                        <div className="progress__bar" style={{ width: `${project.progress}%` }} />
                      </div>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>{project.progress}%</span>
                    </td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: '11px' }}>
                      {project.dueDate ? new Date(project.dueDate).toLocaleDateString('vi-VN') : '—'}
                      {isOverdue(project) && (
                        <div>
                          <span className="chip chip--err">quá hạn</span>
                        </div>
                      )}
                    </td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: '11px' }}>v{project.version}</td>
                    <td>{renderActions(project)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn--sm" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
              Trang trước
            </button>
            <button
              type="button"
              className="btn btn--sm"
              disabled={!paging || page >= paging.totalPages}
              onClick={() => setPage((value) => value + 1)}
            >
              Trang sau
            </button>
          </div>
        </>
      )}

      {modal?.kind === 'create' && (
        <div className="overlay" role="dialog" aria-modal="true" aria-label="Tạo đề tài" onClick={closeModal}>
          <div className="sheet" onClick={(event) => event.stopPropagation()}>
            <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#f8fafc' }}>Tạo đề tài (DRAFT)</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '14px' }}>
              <div className="field">
                <label className="field__label" htmlFor="project-title">
                  Tiêu đề (bắt buộc)
                </label>
                <input id="project-title" className="input" value={title} onChange={(event) => setTitle(event.target.value)} />
              </div>
              <div className="field">
                <label className="field__label" htmlFor="project-description">
                  Mô tả
                </label>
                <textarea
                  id="project-description"
                  className="textarea"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </div>
              <div className="field">
                <label className="field__label" htmlFor="project-due">
                  Hạn hoàn thành
                </label>
                <input id="project-due" className="input" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
              </div>
              <div className="field__hint">
                departmentId lấy từ phiên đăng nhập: {me?.departmentId ?? 'chưa có (server sẽ từ chối)'}
              </div>
              {formError && <div className="banner banner--error" role="alert">{formError}</div>}
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn--ghost" onClick={closeModal} disabled={busy}>
                  Huỷ
                </button>
                <button type="button" className="btn btn--primary" onClick={() => void submitCreate()} disabled={busy} aria-busy={busy}>
                  {busy ? <span className="spinner" /> : null}
                  Tạo đề tài
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {modal?.kind === 'assign' && (
        <div className="overlay" role="dialog" aria-modal="true" aria-label="Giao việc" onClick={closeModal}>
          <div className="sheet" onClick={(event) => event.stopPropagation()}>
            <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#f8fafc' }}>Giao việc · {modal.project.title}</h3>
            <div className="field" style={{ marginTop: '12px' }}>
              <label className="field__label" htmlFor="assign-assignee">
                Nhân sự nhận việc
              </label>
              <select id="assign-assignee" className="select" value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}>
                <option value="">Chọn nhân sự…</option>
                {assignees.map((employee) => (
                  <option key={employee.employeeId} value={employee.employeeId}>
                    {employee.fullName} — {employee.level}
                  </option>
                ))}
              </select>
              {assigneesError && <span className="field__error">{assigneesError}</span>}
            </div>
            {formError && <div className="banner banner--error" role="alert" style={{ marginTop: '12px' }}>{formError}</div>}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button type="button" className="btn btn--ghost" onClick={closeModal} disabled={busy}>
                Huỷ
              </button>
              <button type="button" className="btn btn--primary" onClick={() => void submitAssign(modal.project)} disabled={busy} aria-busy={busy}>
                {busy ? <span className="spinner" /> : null}
                Xác nhận giao việc
              </button>
            </div>
          </div>
        </div>
      )}

      {modal?.kind === 'progress' && (
        <div className="overlay" role="dialog" aria-modal="true" aria-label="Cập nhật tiến độ" onClick={closeModal}>
          <div className="sheet" onClick={(event) => event.stopPropagation()}>
            <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#f8fafc' }}>Cập nhật tiến độ · {modal.project.title}</h3>
            <div className="field" style={{ marginTop: '12px' }}>
              <label className="field__label" htmlFor="progress-value">
                Tiến độ (%)
              </label>
              <input
                id="progress-value"
                className="input"
                inputMode="numeric"
                value={progress}
                aria-invalid={!(Number(progress) >= 0 && Number(progress) <= 100)}
                onChange={(event) => setProgress(event.target.value)}
              />
            </div>
            {formError && <div className="banner banner--error" role="alert" style={{ marginTop: '12px' }}>{formError}</div>}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button type="button" className="btn btn--ghost" onClick={closeModal} disabled={busy}>
                Huỷ
              </button>
              <button type="button" className="btn btn--primary" onClick={() => void submitProgress(modal.project)} disabled={busy} aria-busy={busy}>
                {busy ? <span className="spinner" /> : null}
                Lưu tiến độ
              </button>
            </div>
          </div>
        </div>
      )}

      {modal?.kind === 'report' && (
        <div className="overlay" role="dialog" aria-modal="true" aria-label="Nộp báo cáo" onClick={closeModal}>
          <div className="sheet" onClick={(event) => event.stopPropagation()}>
            <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#f8fafc' }}>Nộp báo cáo · {modal.project.title}</h3>
            <div className="field" style={{ marginTop: '12px' }}>
              <label className="field__label" htmlFor="report-content">
                Nội dung báo cáo (bắt buộc)
              </label>
              <textarea
                id="report-content"
                className="textarea"
                value={reportContent}
                onChange={(event) => setReportContent(event.target.value)}
              />
            </div>
            <p style={{ fontSize: '11px', color: 'var(--text-faint)', marginTop: '8px' }}>
              Nộp báo cáo sẽ chuyển đề tài sang PENDING_REVIEW (expectedVersion v{modal.project.version}).
            </p>
            {formError && <div className="banner banner--error" role="alert" style={{ marginTop: '12px' }}>{formError}</div>}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button type="button" className="btn btn--ghost" onClick={closeModal} disabled={busy}>
                Huỷ
              </button>
              <button type="button" className="btn btn--primary" onClick={() => void submitReport(modal.project)} disabled={busy} aria-busy={busy}>
                {busy ? <span className="spinner" /> : null}
                Nộp báo cáo
              </button>
            </div>
          </div>
        </div>
      )}

      {modal?.kind === 'review' && (
        <div className="overlay" role="dialog" aria-modal="true" aria-label="Duyệt báo cáo" onClick={closeModal}>
          <div className="sheet" onClick={(event) => event.stopPropagation()}>
            <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#f8fafc' }}>
              {modal.action === 'APPROVE' ? 'Duyệt báo cáo' : 'Từ chối báo cáo'} · {modal.project.title}
            </h3>
            <div className="field" style={{ marginTop: '12px' }}>
              <label className="field__label" htmlFor="review-reason">
                {modal.action === 'REJECT' ? 'Lý do từ chối (bắt buộc)' : 'Ghi chú (tuỳ chọn)'}
              </label>
              <textarea
                id="review-reason"
                className="textarea"
                value={reviewReason}
                aria-invalid={modal.action === 'REJECT' && reviewReason.trim().length === 0}
                onChange={(event) => setReviewReason(event.target.value)}
              />
            </div>
            <p style={{ fontSize: '11px', color: 'var(--text-faint)', marginTop: '8px' }}>
              Duyệt qua transition đề tài (PENDING_REVIEW → {modal.action === 'APPROVE' ? 'COMPLETED' : 'IN_PROGRESS'}).
              Endpoint review báo cáo theo reportId tồn tại nhưng API chưa có endpoint danh sách báo cáo để lấy reportId.
            </p>
            {formError && <div className="banner banner--error" role="alert" style={{ marginTop: '12px' }}>{formError}</div>}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button type="button" className="btn btn--ghost" onClick={closeModal} disabled={busy}>
                Huỷ
              </button>
              <button
                type="button"
                className={`btn ${modal.action === 'REJECT' ? 'btn--danger' : 'btn--primary'}`}
                onClick={() => void submitReview(modal.project, modal.action)}
                disabled={busy || (modal.action === 'REJECT' && reviewReason.trim().length === 0)}
                aria-busy={busy}
              >
                {busy ? <span className="spinner" /> : null}
                {modal.action === 'REJECT' ? 'Xác nhận từ chối' : 'Xác nhận duyệt'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
