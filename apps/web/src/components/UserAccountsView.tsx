import React, { useCallback, useEffect, useState } from 'react';
import type { AdminUser, BusinessRoleName } from '@hr-blockbot/contracts';
import { useAuth } from '../context/AuthContext';
import type { EmployeeSummary } from '@hr-blockbot/contracts';
import {
  ApiError,
  createAdminUser,
  deleteAdminUser,
  fetchAdminUsers,
  fetchEmployees,
  resetAdminUserPassword,
  updateAdminUser,
} from '../services/api';
import type { NotifyFn } from './Toast';

interface UserAccountsViewProps {
  onNotify: NotifyFn;
}

const BUSINESS_ROLE_LABEL: Record<BusinessRoleName, string> = {
  admin: 'Ban điều hành',
  aom: 'AOM',
  sm: 'SM',
  am: 'AM',
  ptch: 'PTCH',
  staff: 'Nhân viên',
};

const EMPLOYEE_ROLE_OPTIONS: BusinessRoleName[] = ['staff', 'ptch', 'sm', 'am', 'aom'];

interface CreateFormState {
  username: string;
  password: string;
  role: 'Admin' | 'Employee';
  businessRole: BusinessRoleName;
  employeeId: string;
  isGlobalAdmin: boolean;
}

const EMPTY_FORM: CreateFormState = {
  username: '',
  password: '',
  role: 'Employee',
  businessRole: 'staff',
  employeeId: '',
  isGlobalAdmin: false,
};

/** Mật khẩu tạm chỉ hiện đúng một lần: server không lưu bản rõ và không trả lại lần nữa. */
interface RevealedSecret {
  username: string;
  password: string;
  reason: 'created' | 'reset';
}

export const UserAccountsView: React.FC<UserAccountsViewProps> = ({ onNotify }) => {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'' | 'Admin' | 'Employee'>('');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<RevealedSecret | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AdminUser | null>(null);

  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState<CreateFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [employeeQuery, setEmployeeQuery] = useState('');
  const [employeeMatches, setEmployeeMatches] = useState<EmployeeSummary[]>([]);
  const [employeeSearchBusy, setEmployeeSearchBusy] = useState(false);
  const [linkedEmployeeName, setLinkedEmployeeName] = useState('');

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const result = await fetchAdminUsers({
        q: search.trim() || undefined,
        role: roleFilter || undefined,
        page,
        limit,
      });
      setUsers(result.items);
      setTotalItems(result.paging.totalItems);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Không tải được danh sách tài khoản');
    } finally {
      setIsLoading(false);
    }
  }, [search, roleFilter, page, limit]);

  useEffect(() => {
    void load();
  }, [load]);

  const searchEmployees = async () => {
    const term = employeeQuery.trim();
    if (term.length < 2) {
      setEmployeeMatches([]);
      return;
    }
    setEmployeeSearchBusy(true);
    try {
      const result = await fetchEmployees({ q: term, limit: 8 });
      setEmployeeMatches(result.items);
      if (result.items.length === 0) onNotify('Không tìm thấy hồ sơ nhân viên khớp.', 'info');
    } catch (err) {
      onNotify(err instanceof ApiError ? err.message : 'Không tìm được hồ sơ nhân viên', 'error');
    } finally {
      setEmployeeSearchBusy(false);
    }
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError('');
    if (form.username.trim().length < 3) {
      setFormError('Tên đăng nhập phải có ít nhất 3 ký tự.');
      return;
    }
    if (form.password && form.password.length < 8) {
      setFormError('Mật khẩu phải có ít nhất 8 ký tự (hoặc để trống để hệ thống sinh).');
      return;
    }

    setIsCreating(true);
    try {
      const created = await createAdminUser({
        username: form.username.trim(),
        ...(form.password ? { password: form.password } : {}),
        role: form.role,
        ...(form.role === 'Employee' ? { businessRole: form.businessRole } : {}),
        ...(form.employeeId.trim() ? { employeeId: form.employeeId.trim() } : {}),
        ...(form.role === 'Admin' ? { isGlobalAdmin: form.isGlobalAdmin } : {}),
      });
      if (created.temporaryPassword) {
        setRevealed({ username: created.username, password: created.temporaryPassword, reason: 'created' });
      }
      onNotify(`Đã tạo tài khoản ${created.username}.`, 'success', 'Tạo tài khoản');
      setForm(EMPTY_FORM);
      await load();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Không tạo được tài khoản';
      setFormError(message);
    } finally {
      setIsCreating(false);
    }
  };

  const patchUser = async (target: AdminUser, patch: Record<string, unknown>, successMessage: string) => {
    setBusyId(target.id);
    try {
      await updateAdminUser(target.id, patch);
      onNotify(successMessage, 'success', 'Cập nhật tài khoản');
      await load();
    } catch (err) {
      onNotify(err instanceof ApiError ? err.message : 'Không cập nhật được tài khoản', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleReset = async (target: AdminUser) => {
    setBusyId(target.id);
    try {
      const result = await resetAdminUserPassword(target.id);
      setRevealed({ username: result.username, password: result.temporaryPassword, reason: 'reset' });
      onNotify(`Đã đặt lại mật khẩu cho ${target.username}.`, 'success', 'Đặt lại mật khẩu');
      await load();
    } catch (err) {
      onNotify(err instanceof ApiError ? err.message : 'Không đặt lại được mật khẩu', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (target: AdminUser) => {
    setBusyId(target.id);
    try {
      await deleteAdminUser(target.id);
      onNotify(`Đã xoá tài khoản ${target.username}.`, 'success', 'Xoá tài khoản');
      setPendingDelete(null);
      await load();
    } catch (err) {
      onNotify(err instanceof ApiError ? err.message : 'Không xoá được tài khoản', 'error');
    } finally {
      setBusyId(null);
    }
  };

  if (currentUser?.role !== 'Admin') {
    return (
      <div className="empty" role="alert">
        <div style={{ fontSize: '18px', fontWeight: 800, color: '#fda4af' }}>403 — RBAC_DENIED</div>
        <p>Chỉ tài khoản Admin được quản lý tài khoản người dùng.</p>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(totalItems / limit));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#f8fafc' }}>Tài Khoản Người Dùng</h2>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
            {totalItems} tài khoản · tạo / đổi role / đặt lại mật khẩu / xoá
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button type="button" className="btn" onClick={() => void load()} disabled={isLoading}>
            Tải lại
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => {
              setForm(EMPTY_FORM);
              setFormError('');
              setEmployeeQuery('');
              setEmployeeMatches([]);
              setLinkedEmployeeName('');
              setIsCreating(true);
            }}
          >
            Tạo tài khoản
          </button>
        </div>
      </div>

      {revealed && (
        <div className="banner" role="status" style={{ borderColor: 'rgba(16,185,129,0.45)' }}>
          <span>
            Mật khẩu tạm của <strong>{revealed.username}</strong>:{' '}
            <code style={{ fontFamily: 'var(--mono)', fontSize: '13px', color: '#6ee7b7' }}>{revealed.password}</code>
            {' '}— chỉ hiện một lần. Người dùng bắt buộc đổi ở lần đăng nhập đầu.
          </span>
          <button type="button" className="btn btn--sm" onClick={() => setRevealed(null)}>
            Đã ghi lại
          </button>
        </div>
      )}

      <div className="banner" style={{ background: 'rgba(255,255,255,0.03)' }}>
        <span>
          Không thể tự hạ quyền hoặc tự xoá tài khoản đang đăng nhập, và hệ thống luôn phải còn ít nhất một Admin
          toàn quyền. Đổi role có hiệu lực ngay ở request kế tiếp và thu hồi mọi phiên đăng nhập cũ.
        </span>
      </div>

      {loadError && (
        <div className="banner banner--error" role="alert">
          <span>Không tải được danh sách: {loadError}</span>
          <button type="button" className="btn btn--sm" onClick={() => void load()}>
            Thử lại
          </button>
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <input
          className="input"
          style={{ maxWidth: '320px' }}
          placeholder="Tìm theo tên đăng nhập, email hoặc tên nhân viên"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
        <select
          className="input"
          style={{ maxWidth: '180px' }}
          value={roleFilter}
          onChange={(event) => {
            setRoleFilter(event.target.value as '' | 'Admin' | 'Employee');
            setPage(1);
          }}
        >
          <option value="">Mọi role</option>
          <option value="Admin">Admin</option>
          <option value="Employee">Employee</option>
        </select>
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div className="skeleton" style={{ height: '22px', width: '260px' }} />
          <div className="skeleton" style={{ height: '52px' }} />
          <div className="skeleton" style={{ height: '52px' }} />
          <div className="skeleton" style={{ height: '52px' }} />
        </div>
      ) : users.length === 0 ? (
        <div className="empty">
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>Không có tài khoản nào khớp</div>
          <p>Đổi bộ lọc hoặc tạo tài khoản mới.</p>
        </div>
      ) : (
        <div className="card table-wrap" style={{ overflow: 'hidden' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Tên đăng nhập</th>
                <th>Hồ sơ nhân viên</th>
                <th>Role</th>
                <th>Bậc</th>
                <th>Toàn quyền</th>
                <th>Mật khẩu</th>
                <th style={{ textAlign: 'right' }}>Hành động</th>
              </tr>
            </thead>
            <tbody>
              {users.map((item) => {
                const isSelf = item.id === currentUser?.id;
                const busy = busyId === item.id;
                return (
                  <tr key={item.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: '#f8fafc' }}>
                        {item.username}
                        {isSelf && <span className="chip chip--info" style={{ marginLeft: '6px' }}>bạn</span>}
                      </div>
                      {item.email && (
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
                          {item.email}
                        </div>
                      )}
                    </td>
                    <td style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {item.employeeName || '—'}
                    </td>
                    <td>
                      <select
                        className="input"
                        style={{ maxWidth: '120px' }}
                        value={item.role}
                        disabled={busy || isSelf}
                        title={isSelf ? 'Không thể tự đổi role của chính mình' : undefined}
                        onChange={(event) => {
                          const nextRole = event.target.value as 'Admin' | 'Employee';
                          void patchUser(
                            item,
                            { role: nextRole },
                            nextRole === 'Admin'
                              ? `Đã nâng ${item.username} lên Admin.`
                              : `Đã hạ ${item.username} xuống Employee.`
                          );
                        }}
                      >
                        <option value="Admin">Admin</option>
                        <option value="Employee">Employee</option>
                      </select>
                    </td>
                    <td>
                      <span className="chip">{BUSINESS_ROLE_LABEL[(item.businessRole ?? 'staff') as BusinessRoleName] ?? item.businessRole}</span>
                    </td>
                    <td>
                      {item.role === 'Admin' ? (
                        <button
                          type="button"
                          className={`chip ${item.isGlobalAdmin ? 'chip--ok' : 'chip--warn'}`}
                          disabled={busy || isSelf}
                          title="Admin toàn quyền xem được toàn bộ nhân sự và hàng đợi duyệt"
                          onClick={() =>
                            void patchUser(
                              item,
                              { isGlobalAdmin: !item.isGlobalAdmin },
                              item.isGlobalAdmin
                                ? `Đã bỏ quyền toàn hệ thống của ${item.username}.`
                                : `Đã cấp quyền toàn hệ thống cho ${item.username}.`
                            )
                          }
                        >
                          {item.isGlobalAdmin ? 'toàn quyền' : 'theo phòng ban'}
                        </button>
                      ) : (
                        <span className="chip">—</span>
                      )}
                    </td>
                    <td>
                      {item.mustChangePassword ? (
                        <span className="chip chip--warn">phải đổi</span>
                      ) : (
                        <span className="chip chip--ok">đã đổi</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button
                        type="button"
                        className="btn btn--sm"
                        disabled={busy}
                        onClick={() => void handleReset(item)}
                      >
                        Đặt lại MK
                      </button>{' '}
                      <button
                        type="button"
                        className="btn btn--sm"
                        style={{ color: '#fda4af' }}
                        disabled={busy || isSelf}
                        onClick={() => setPendingDelete(item)}
                      >
                        Xoá
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn--sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Trước
          </button>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
            {page} / {totalPages}
          </span>
          <button
            type="button"
            className="btn btn--sm"
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
          >
            Sau
          </button>
        </div>
      )}

      {isCreating && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-account-title"
          style={{ position: 'fixed', inset: 0, zIndex: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(8px)' }}
        >
          <div className="card" style={{ width: '100%', maxWidth: 520, maxHeight: '90dvh', overflowY: 'auto', padding: 20 }}>
            <h3 id="create-account-title" style={{ fontSize: '15px', fontWeight: 700, color: '#f8fafc', marginBottom: '4px' }}>
              Tạo tài khoản
            </h3>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '14px' }}>
              Bỏ trống mật khẩu để hệ thống sinh mật khẩu tạm và hiện đúng một lần.
            </p>
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {formError && <div className="banner banner--error" role="alert"><span>{formError}</span></div>}

              <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Tên đăng nhập (mã nhân viên)
                <input
                  className="input"
                  style={{ width: '100%', marginTop: '4px' }}
                  value={form.username}
                  onChange={(event) => setForm({ ...form, username: event.target.value })}
                  placeholder="vd gt-ch18030009"
                  autoComplete="off"
                />
              </label>

              <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Mật khẩu tạm (tuỳ chọn, ≥ 8 ký tự)
                <input
                  className="input"
                  style={{ width: '100%', marginTop: '4px' }}
                  value={form.password}
                  onChange={(event) => setForm({ ...form, password: event.target.value })}
                  placeholder="để trống = tự sinh"
                  autoComplete="new-password"
                />
              </label>

              <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Role
                <select
                  className="input"
                  style={{ width: '100%', marginTop: '4px' }}
                  value={form.role}
                  onChange={(event) => setForm({ ...form, role: event.target.value as 'Admin' | 'Employee' })}
                >
                  <option value="Employee">Employee</option>
                  <option value="Admin">Admin</option>
                </select>
              </label>

              {form.role === 'Employee' ? (
                <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Bậc nghiệp vụ
                  <select
                    className="input"
                    style={{ width: '100%', marginTop: '4px' }}
                    value={form.businessRole}
                    onChange={(event) => setForm({ ...form, businessRole: event.target.value as BusinessRoleName })}
                  >
                    {EMPLOYEE_ROLE_OPTIONS.map((role) => (
                      <option key={role} value={role}>
                        {BUSINESS_ROLE_LABEL[role]}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#e5e7eb' }}>
                  <input
                    type="checkbox"
                    checked={form.isGlobalAdmin}
                    onChange={(event) => setForm({ ...form, isGlobalAdmin: event.target.checked })}
                  />
                  Admin toàn quyền (xem toàn bộ nhân sự và hàng đợi duyệt)
                </label>
              )}

              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Gắn hồ sơ nhân viên (tuỳ chọn)
                <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                  <input
                    className="input"
                    style={{ flex: 1 }}
                    value={employeeQuery}
                    onChange={(event) => setEmployeeQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        void searchEmployees();
                      }
                    }}
                    placeholder="Tìm theo tên hoặc mã nhân viên"
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    className="btn btn--sm"
                    disabled={employeeSearchBusy}
                    onClick={() => void searchEmployees()}
                  >
                    Tìm
                  </button>
                </div>
                {linkedEmployeeName && (
                  <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span className="chip chip--ok">{linkedEmployeeName}</span>
                    <button
                      type="button"
                      className="btn btn--sm"
                      onClick={() => {
                        setForm({ ...form, employeeId: '' });
                        setLinkedEmployeeName('');
                      }}
                    >
                      Bỏ chọn
                    </button>
                  </div>
                )}
                {employeeMatches.length > 0 && !linkedEmployeeName && (
                  <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '140px', overflowY: 'auto' }}>
                    {employeeMatches.map((employee) => (
                      <button
                        key={employee.employeeId}
                        type="button"
                        className="btn btn--sm"
                        style={{ textAlign: 'left', justifyContent: 'flex-start' }}
                        onClick={() => {
                          setForm({ ...form, employeeId: employee.employeeId });
                          setLinkedEmployeeName(employee.fullName);
                          setEmployeeMatches([]);
                          setEmployeeQuery('');
                        }}
                      >
                        {employee.fullName} · {employee.department} · {employee.level}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}>
                <button type="button" className="btn" disabled={isCreating} onClick={() => setIsCreating(false)}>
                  Huỷ
                </button>
                <button type="submit" className="btn btn--primary" disabled={isCreating}>
                  {isCreating ? 'Đang tạo…' : 'Tạo tài khoản'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {pendingDelete && (
        <div
          role="dialog"
          aria-modal="true"
          style={{ position: 'fixed', inset: 0, zIndex: 130, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(8px)' }}
        >
          <div className="card" style={{ width: '100%', maxWidth: 420, padding: 20 }}>
            <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#fda4af', marginBottom: '6px' }}>Xoá tài khoản?</h3>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
              Tài khoản <strong style={{ color: '#f8fafc' }}>{pendingDelete.username}</strong> sẽ bị xoá, mọi phiên đăng
              nhập bị thu hồi và hồ sơ nhân viên (nếu có) được bỏ liên kết. Hành động này không hoàn tác được.
            </p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button type="button" className="btn" disabled={busyId === pendingDelete.id} onClick={() => setPendingDelete(null)}>
                Huỷ
              </button>
              <button
                type="button"
                className="btn btn--primary"
                disabled={busyId === pendingDelete.id}
                onClick={() => void handleDelete(pendingDelete)}
              >
                {busyId === pendingDelete.id ? 'Đang xoá…' : 'Xoá tài khoản'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
