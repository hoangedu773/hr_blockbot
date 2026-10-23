import React, { useCallback, useEffect, useState } from 'react';
import type {
  EmployeeDetail,
  EmployeeLevel,
  EmployeeSummary,
  ReviewProfileChangeRequest,
} from '@hr-blockbot/contracts';
import {
  ApiError,
  fetchEmployeeById,
  fetchEmployees,
  fetchPendingProfileChangeRequests,
  isEmployeeDetail,
  reviewProfileChangeRequest,
  type PendingChangeRequestItem,
} from '../services/api';
import type { NotifyFn } from './Toast';

interface RosterViewProps {
  onNotify: NotifyFn;
}

type Tab = 'roster' | 'queue';

const LEVELS: EmployeeLevel[] = ['Intern', 'Junior', 'Middle', 'Senior', 'Lead'];

interface ReviewDraft {
  employeeId: string;
  requestId: string;
  action: 'APPROVE' | 'REJECT';
  reason: string;
}

export const RosterView: React.FC<RosterViewProps> = ({ onNotify }) => {
  const [tab, setTab] = useState<Tab>('roster');

  const [query, setQuery] = useState<string>('');
  const [appliedQuery, setAppliedQuery] = useState<string>('');
  const [level, setLevel] = useState<string>('');
  const [status, setStatus] = useState<string>('');
  const [page, setPage] = useState<number>(1);

  const [employees, setEmployees] = useState<EmployeeSummary[]>([]);
  const [totalItems, setTotalItems] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string>('');

  const [detail, setDetail] = useState<EmployeeDetail | EmployeeSummary | null>(null);
  const [detailLoading, setDetailLoading] = useState<boolean>(false);
  const [detailError, setDetailError] = useState<string>('');

  const [requests, setRequests] = useState<PendingChangeRequestItem[]>([]);
  const [queueLoading, setQueueLoading] = useState<boolean>(false);
  const [queueError, setQueueError] = useState<string>('');
  const [reviewDraft, setReviewDraft] = useState<ReviewDraft | null>(null);
  const [reviewBusy, setReviewBusy] = useState<boolean>(false);

  const loadEmployees = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const result = await fetchEmployees({
        q: appliedQuery || undefined,
        level: (level as EmployeeLevel) || undefined,
        status: status === 'active' || status === 'inactive' ? status : undefined,
        page,
        limit: 20,
      });
      setEmployees(result.items);
      setTotalItems(result.paging.totalItems);
      setTotalPages(result.paging.totalPages || 1);
    } catch (err: unknown) {
      const message = err instanceof ApiError ? `${err.code}: ${err.message}` : err instanceof Error ? err.message : 'Lỗi tải danh sách nhân sự';
      setLoadError(message);
      onNotify(message, 'error', 'Không tải được danh sách nhân sự');
    } finally {
      setIsLoading(false);
    }
  }, [appliedQuery, level, page, status, onNotify]);

  useEffect(() => {
    void loadEmployees();
  }, [loadEmployees]);

  const loadQueue = useCallback(async () => {
    setQueueLoading(true);
    setQueueError('');
    try {
      const result = await fetchPendingProfileChangeRequests();
      setRequests(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Lỗi tải hàng đợi duyệt';
      setQueueError(message);
    } finally {
      setQueueLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'queue') void loadQueue();
  }, [tab, loadQueue]);

  const openDetail = async (employeeId: string) => {
    setDetailLoading(true);
    setDetailError('');
    setDetail(null);
    try {
      const result = await fetchEmployeeById(employeeId);
      setDetail(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Lỗi tải hồ sơ nhân sự';
      setDetailError(message);
    } finally {
      setDetailLoading(false);
    }
  };

  const submitReview = async () => {
    if (!reviewDraft) return;
    if (reviewDraft.action === 'REJECT' && reviewDraft.reason.trim().length === 0) {
      onNotify('Bắt buộc nhập lý do khi từ chối yêu cầu.', 'warning', 'Thiếu lý do');
      return;
    }
    setReviewBusy(true);
    try {
      const payload: ReviewProfileChangeRequest = {
        action: reviewDraft.action,
        ...(reviewDraft.reason.trim() ? { reason: reviewDraft.reason.trim() } : {}),
      };
      await reviewProfileChangeRequest(reviewDraft.employeeId, reviewDraft.requestId, payload);
      onNotify(
        reviewDraft.action === 'APPROVE' ? 'Đã duyệt yêu cầu thay đổi.' : 'Đã từ chối yêu cầu thay đổi.',
        'success',
        'Duyệt hồ sơ'
      );
      setReviewDraft(null);
      await loadQueue();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Không duyệt được yêu cầu';
      onNotify(message, 'error', 'Lỗi duyệt yêu cầu');
    } finally {
      setReviewBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#f8fafc' }}>Hồ Sơ Nhân Sự (F1)</h2>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
            Allowlist DTO · phạm vi phòng ban do máy chủ quyết định theo JWT · không thấy CCCD/bank/lương
          </p>
        </div>
        <div className="tabs" role="tablist" aria-label="Chế độ xem F1">
          <button type="button" role="tab" className="tab" aria-selected={tab === 'roster'} onClick={() => setTab('roster')}>
            Danh sách
          </button>
          <button type="button" role="tab" className="tab" aria-selected={tab === 'queue'} onClick={() => setTab('queue')}>
            Hàng đợi duyệt
          </button>
        </div>
      </div>

      {tab === 'roster' && (
        <>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="field" style={{ minWidth: '220px', flex: '1 1 220px' }}>
              <label className="field__label" htmlFor="roster-query">
                Tìm theo tên / mã NV
              </label>
              <input
                id="roster-query"
                className="input"
                value={query}
                placeholder="Tên hoặc mã nhân viên…"
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    setPage(1);
                    setAppliedQuery(query.trim());
                  }
                }}
              />
            </div>
            <div className="field" style={{ minWidth: '150px' }}>
              <label className="field__label" htmlFor="roster-level">
                Cấp bậc
              </label>
              <select
                id="roster-level"
                className="select"
                value={level}
                onChange={(event) => {
                  setPage(1);
                  setLevel(event.target.value);
                }}
              >
                <option value="">Tất cả</option>
                {LEVELS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ minWidth: '150px' }}>
              <label className="field__label" htmlFor="roster-status">
                Trạng thái
              </label>
              <select
                id="roster-status"
                className="select"
                value={status}
                onChange={(event) => {
                  setPage(1);
                  setStatus(event.target.value);
                }}
              >
                <option value="">Tất cả</option>
                <option value="active">Đang hoạt động</option>
                <option value="inactive">Tạm dừng</option>
              </select>
            </div>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => {
                setPage(1);
                setAppliedQuery(query.trim());
              }}
            >
              Lọc
            </button>
            <button type="button" className="btn" onClick={() => void loadEmployees()} disabled={isLoading}>
              Làm mới
            </button>
          </div>

          {isLoading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[0, 1, 2, 3].map((row) => (
                <div key={row} className="skeleton" style={{ height: '48px' }} />
              ))}
            </div>
          )}

          {!isLoading && loadError && (
            <div className="banner banner--error" role="alert">
              <span>Không tải được danh sách nhân sự: {loadError}</span>
              <button type="button" className="btn btn--sm" onClick={() => void loadEmployees()}>
                Thử lại
              </button>
            </div>
          )}

          {!isLoading && !loadError && employees.length === 0 && (
            <div className="empty">
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
                {appliedQuery || level || status ? 'Không có nhân sự khớp bộ lọc' : 'Chưa có nhân sự trong phạm vi'}
              </div>
              <p>
                {appliedQuery || level || status
                  ? 'Thử xoá bộ lọc để xem toàn bộ phạm vi được giao.'
                  : 'Máy chủ trả về danh sách rỗng cho phạm vi phòng ban của tài khoản này.'}
              </p>
              {(appliedQuery || level || status) && (
                <button
                  type="button"
                  className="btn btn--sm"
                  onClick={() => {
                    setQuery('');
                    setAppliedQuery('');
                    setLevel('');
                    setStatus('');
                    setPage(1);
                  }}
                >
                  Xoá bộ lọc
                </button>
              )}
            </div>
          )}

          {!isLoading && !loadError && employees.length > 0 && (
            <>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
                {totalItems} nhân sự · trang {page}/{totalPages}
              </div>
              <div className="card table-wrap" style={{ overflow: 'hidden' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Mã NV / Họ tên</th>
                      <th>Cấp bậc</th>
                      <th>Phòng ban / Điểm bán</th>
                      <th>Kỹ năng</th>
                      <th>Trạng thái</th>
                      <th style={{ textAlign: 'right' }}>Hồ sơ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employees.map((employee) => (
                      <tr key={employee.employeeId}>
                        <td>
                          <div style={{ fontWeight: 600, color: '#f8fafc' }}>{employee.fullName}</div>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>{employee.employeeId}</div>
                        </td>
                        <td style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>{employee.level}</td>
                        <td style={{ color: 'var(--text-muted)' }}>{employee.department}</td>
                        <td>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                            {employee.skills.slice(0, 3).map((skill) => (
                              <span key={skill} className="chip">
                                {skill}
                              </span>
                            ))}
                            {employee.skills.length === 0 && <span style={{ color: 'var(--text-faint)' }}>—</span>}
                          </div>
                        </td>
                        <td>
                          <span className={`chip ${employee.status === 'active' ? 'chip--ok' : 'chip--err'}`}>
                            {employee.status === 'active' ? 'hoạt động' : 'tạm dừng'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button type="button" className="btn btn--sm" onClick={() => void openDetail(employee.employeeId)}>
                            Xem
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn--sm" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
                  Trang trước
                </button>
                <button type="button" className="btn btn--sm" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>
                  Trang sau
                </button>
              </div>
            </>
          )}
        </>
      )}

      {tab === 'queue' && (
        <>
          {queueLoading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[0, 1, 2].map((row) => (
                <div key={row} className="skeleton" style={{ height: '56px' }} />
              ))}
            </div>
          )}

          {!queueLoading && queueError && (
            <div className="banner banner--error" role="alert">
              <span>
                Không tải được hàng đợi duyệt: {queueError}
                <br />
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Endpoint danh sách yêu cầu PENDING chưa được chốt trong phase-02 — lỗi này là lỗi thật của API, không phải
                  dữ liệu giả.
                </span>
              </span>
              <button type="button" className="btn btn--sm" onClick={() => void loadQueue()}>
                Thử lại
              </button>
            </div>
          )}

          {!queueLoading && !queueError && requests.length === 0 && (
            <div className="empty">
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>Không có yêu cầu chờ duyệt</div>
              <p>Hàng đợi PENDING rỗng tại thời điểm tải.</p>
            </div>
          )}

          {!queueLoading && !queueError && requests.length > 0 && (
            <div className="card table-wrap" style={{ overflow: 'hidden' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Yêu cầu</th>
                    <th>Người tạo (employeeId)</th>
                    <th>Trường cần đổi</th>
                    <th>Thời điểm</th>
                    <th style={{ textAlign: 'right' }}>Duyệt</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((item) => (
                    <tr key={item.request.id}>
                      <td>
                        <div style={{ fontWeight: 600, color: '#f8fafc' }}>{item.employeeName}</div>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
                          {item.employeeId} · request {item.request.id}
                        </div>
                      </td>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: '11px' }}>{item.request.requestedBy}</td>
                      <td>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                          {Object.entries(item.request.targetFields).map(([field, value]) => (
                            <span key={field} className="chip chip--warn">
                              {field}: {String(value)}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
                        {new Date(item.request.requestedAt).toLocaleString('vi-VN')}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            className="btn btn--sm btn--primary"
                            onClick={() =>
                              setReviewDraft({ employeeId: item.employeeId, requestId: item.request.id, action: 'APPROVE', reason: '' })
                            }
                          >
                            Duyệt
                          </button>
                          <button
                            type="button"
                            className="btn btn--sm btn--danger"
                            onClick={() =>
                              setReviewDraft({ employeeId: item.employeeId, requestId: item.request.id, action: 'REJECT', reason: '' })
                            }
                          >
                            Từ chối
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {detailLoading && (
        <div className="overlay">
          <div className="sheet">
            <div className="skeleton" style={{ height: '24px', width: '60%' }} />
            <div className="skeleton" style={{ height: '16px', marginTop: '12px' }} />
            <div className="skeleton" style={{ height: '16px', marginTop: '8px' }} />
          </div>
        </div>
      )}

      {(detailError || detail) && !detailLoading && (
        <div className="overlay" role="dialog" aria-modal="true" aria-label="Chi tiết hồ sơ" onClick={() => setDetail(null)}>
          <div className="sheet" onClick={(event) => event.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#f8fafc' }}>Chi tiết hồ sơ</h3>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setDetail(null)}>
                Đóng
              </button>
            </div>

            {detailError && (
              <div className="banner banner--error" role="alert" style={{ marginTop: '12px' }}>
                <span>{detailError}</span>
              </div>
            )}

            {detail && (
              <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 14px', marginTop: '14px', fontSize: '12px' }}>
                <dt style={{ color: 'var(--text-faint)', fontFamily: 'var(--mono)' }}>Họ tên</dt>
                <dd>{detail.fullName}</dd>
                <dt style={{ color: 'var(--text-faint)', fontFamily: 'var(--mono)' }}>employeeId</dt>
                <dd style={{ fontFamily: 'var(--mono)' }}>{detail.employeeId}</dd>
                {isEmployeeDetail(detail) && (
                  <>
                    <dt style={{ color: 'var(--text-faint)', fontFamily: 'var(--mono)' }}>Mã NV</dt>
                    <dd style={{ fontFamily: 'var(--mono)' }}>{detail.employeeCode}</dd>
                    <dt style={{ color: 'var(--text-faint)', fontFamily: 'var(--mono)' }}>Điện thoại</dt>
                    <dd>{detail.phone ?? '—'}</dd>
                    <dt style={{ color: 'var(--text-faint)', fontFamily: 'var(--mono)' }}>Ngày vào làm</dt>
                    <dd>{detail.hiredAt ?? '—'}</dd>
                  </>
                )}
                <dt style={{ color: 'var(--text-faint)', fontFamily: 'var(--mono)' }}>Cấp bậc</dt>
                <dd>{detail.level}</dd>
                <dt style={{ color: 'var(--text-faint)', fontFamily: 'var(--mono)' }}>Phòng ban</dt>
                <dd>{detail.department}</dd>
                <dt style={{ color: 'var(--text-faint)', fontFamily: 'var(--mono)' }}>Trạng thái</dt>
                <dd>{detail.status}</dd>
              </dl>
            )}

            <p style={{ fontSize: '11px', color: 'var(--text-faint)', marginTop: '14px' }}>
              Admin chỉ nhận allowlist EmployeeSummary. Trường nhạy cảm (CCCD, tài khoản ngân hàng, lương, lý do nghỉ) không
              nằm trong DTO nên không thể hiển thị.
            </p>
          </div>
        </div>
      )}

      {reviewDraft && (
        <div className="overlay" role="dialog" aria-modal="true" aria-label="Duyệt yêu cầu thay đổi" onClick={() => setReviewDraft(null)}>
          <div className="sheet" onClick={(event) => event.stopPropagation()}>
            <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#f8fafc' }}>
              {reviewDraft.action === 'APPROVE' ? 'Duyệt yêu cầu thay đổi' : 'Từ chối yêu cầu thay đổi'}
            </h3>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--mono)', marginTop: '4px' }}>
              employeeId {reviewDraft.employeeId} · request {reviewDraft.requestId}
            </p>
            <div className="field" style={{ marginTop: '12px' }}>
              <label className="field__label" htmlFor="review-reason">
                {reviewDraft.action === 'REJECT' ? 'Lý do từ chối (bắt buộc)' : 'Ghi chú (tuỳ chọn)'}
              </label>
              <textarea
                id="review-reason"
                className="textarea"
                value={reviewDraft.reason}
                aria-invalid={reviewDraft.action === 'REJECT' && reviewDraft.reason.trim().length === 0}
                onChange={(event) => setReviewDraft({ ...reviewDraft, reason: event.target.value })}
              />
              {reviewDraft.action === 'REJECT' && reviewDraft.reason.trim().length === 0 && (
                <span className="field__error">Bắt buộc nhập lý do khi từ chối.</span>
              )}
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button type="button" className="btn btn--ghost" onClick={() => setReviewDraft(null)} disabled={reviewBusy}>
                Huỷ
              </button>
              <button
                type="button"
                className={`btn ${reviewDraft.action === 'REJECT' ? 'btn--danger' : 'btn--primary'}`}
                onClick={() => void submitReview()}
                disabled={reviewBusy || (reviewDraft.action === 'REJECT' && reviewDraft.reason.trim().length === 0)}
                aria-busy={reviewBusy}
              >
                {reviewBusy ? <span className="spinner" /> : null}
                {reviewDraft.action === 'REJECT' ? 'Xác nhận từ chối' : 'Xác nhận duyệt'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
