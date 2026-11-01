import React, { useCallback, useEffect, useState } from 'react';
import type { EmployeeDetail, EmployeeLevel, ProfileTargetFields, ProfileChangeRequest } from '@hr-blockbot/contracts';
import {
  ApiError,
  createProfileChangeRequest,
  fetchMyProfile,
  fetchEmployeeChangeRequests,
  updateEmployeeFields,
} from '../services/api';
import type { NotifyFn } from './Toast';
import { AuthorizationStatus } from './AuthorizationStatus';

interface EmployeeProfileViewProps {
  onLogout: () => void;
  onNotify: NotifyFn;
}

const LEVELS: EmployeeLevel[] = ['Intern', 'Junior', 'Middle', 'Senior', 'Lead'];

export const EmployeeProfileView: React.FC<EmployeeProfileViewProps> = ({ onLogout, onNotify }) => {
  const [profile, setProfile] = useState<EmployeeDetail | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string>('');

  const [isEditingRegular, setIsEditingRegular] = useState<boolean>(false);
  const [phone, setPhone] = useState<string>('');
  const [skills, setSkills] = useState<string>('');
  const [regularError, setRegularError] = useState<string>('');
  const [regularBusy, setRegularBusy] = useState<boolean>(false);

  const [isRequestingChange, setIsRequestingChange] = useState<boolean>(false);
  const [targetLevel, setTargetLevel] = useState<string>('');
  const [targetHiredAt, setTargetHiredAt] = useState<string>('');
  const [targetJobTitle, setTargetJobTitle] = useState<string>('');
  const [changeError, setChangeError] = useState<string>('');
  const [changeBusy, setChangeBusy] = useState<boolean>(false);
  const [lastRequestId, setLastRequestId] = useState<string>('');
  const [requests, setRequests] = useState<ProfileChangeRequest[]>([]);
  const [historyError, setHistoryError] = useState('');

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const result = await fetchMyProfile();
      setProfile(result);
      setPhone(result.phone ?? '');
      setSkills(result.skills.join(', '));
      try { setRequests(await fetchEmployeeChangeRequests(result.employeeId)); setHistoryError(''); }
      catch (failure) { setHistoryError(failure instanceof Error ? failure.message : 'Không tải được lịch sử.'); }
    } catch (err: unknown) {
      const message = err instanceof ApiError ? `${err.code}: ${err.message}` : err instanceof Error ? err.message : 'Lỗi tải hồ sơ';
      setLoadError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saveRegularFields = async () => {
    if (!profile) return;
    setRegularBusy(true);
    setRegularError('');
    try {
      const skillList = skills
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
      const updated = await updateEmployeeFields(profile.employeeId, {
        phone: phone.trim(),
        skills: skillList,
        expectedVersion: profile.profileVersion,
      });
      if ('profileVersion' in updated) setProfile(updated);
      onNotify('Đã cập nhật thông tin thường.', 'success', 'Lưu hồ sơ');
      setIsEditingRegular(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Không lưu được thông tin';
      setRegularError(message);
      onNotify(message, 'error', 'Lỗi lưu hồ sơ');
    } finally {
      setRegularBusy(false);
    }
  };

  const submitChangeRequest = async () => {
    if (!profile) return;
    const targetFields: ProfileTargetFields = {};
    if (targetLevel) targetFields.level = targetLevel as EmployeeLevel;
    if (targetHiredAt) targetFields.hiredAt = new Date(targetHiredAt).toISOString();
    if (targetJobTitle.trim()) targetFields.jobTitle = targetJobTitle.trim();

    if (!targetFields.level && !targetFields.hiredAt && !targetFields.jobTitle) {
      setChangeError('Chọn ít nhất một trường cần thay đổi (level / hiredAt / jobTitle).');
      return;
    }

    setChangeBusy(true);
    setChangeError('');
    try {
      const created = await createProfileChangeRequest(profile.employeeId, {
        targetFields,
        ...(lastRequestId ? { previousRequestId: lastRequestId } : {}),
      });
      setLastRequestId('');
      setRequests((old) => [...old, created]);
      // Submission increments the profile revision without changing sensitive fields.
      try { setProfile(await fetchMyProfile()); }
      catch { setHistoryError('Yêu cầu đã lưu. Hãy làm mới hồ sơ để lấy phiên bản mới trước lần chỉnh sửa tiếp theo.'); }
      onNotify('Đã gửi yêu cầu đổi thông tin nhạy cảm — chờ Admin duyệt.', 'success', 'Gửi yêu cầu');
      setIsRequestingChange(false);
      setTargetLevel('');
      setTargetHiredAt('');
      setTargetJobTitle('');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Không gửi được yêu cầu';
      setChangeError(message);
      onNotify(message, 'error', 'Lỗi gửi yêu cầu');
    } finally {
      setChangeBusy(false);
    }
  };

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div className="skeleton" style={{ height: '72px' }} />
        <div className="skeleton" style={{ height: '120px' }} />
        <div className="skeleton" style={{ height: '120px' }} />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="banner banner--error" role="alert">
        <span>Không tải được hồ sơ: {loadError}</span>
        <button type="button" className="btn btn--sm" onClick={() => void load()}>
          Thử lại
        </button>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="empty">
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>Chưa có hồ sơ</div>
        <p>Tài khoản Employee chưa được liên kết với bản ghi nhân sự.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '980px' }}>
      <AuthorizationStatus />
      <div
        style={{
          background: 'rgba(14, 20, 32, 0.85)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '18px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#f8fafc' }}>{profile.fullName}</h2>
            <span className="chip chip--info">OWN SCOPE</span>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
            Mã NV {profile.employeeCode} · {profile.department} · {profile.level}
          </p>
        </div>
        <button type="button" className="btn btn--ghost" onClick={onLogout}>
          Đăng xuất
        </button>
        <button type="button" className="btn" disabled={regularBusy || changeBusy} onClick={() => void load()}>Làm mới hồ sơ</button>
      </div>
      <section className="card card--pad crm-work-detail" aria-label="Lịch sử thay đổi hồ sơ">
        <h3>Lịch sử yêu cầu & quyết định</h3>
        <p>Quyết định được lưu bền; mở lại hồ sơ để xem kết quả và lý do. Chưa có thông báo đẩy thời gian thực.</p>
        {historyError && <p role="alert">{historyError}</p>}
        {!requests.length && !historyError && <p>Chưa có yêu cầu thay đổi hồ sơ.</p>}
        {[...requests].reverse().map((request) => <article className="crm-report-card" key={request.id}>
          <strong>{request.status === 'PENDING' ? 'Chờ HR có thẩm quyền xử lý' : request.status === 'APPROVED' ? 'Đã duyệt thay đổi' : 'Đã từ chối thay đổi'}</strong>
          <p>{new Date(request.requestedAt).toLocaleString('vi-VN')} · {Object.entries(request.targetFields).map(([key, value]) => `${key}: ${value}`).join(' · ')}</p>
          {request.reviewedAt && <p>Quyết định lúc {new Date(request.reviewedAt).toLocaleString('vi-VN')} · Người duyệt: {request.reviewedBy}</p>}
          {request.rejectionReason && <p>Lý do: {request.rejectionReason}</p>}
          {request.status === 'REJECTED' && !requests.some((item) => item.status === 'PENDING') && <button type="button" className="btn" disabled={changeBusy} onClick={() => { setLastRequestId(request.id); setTargetLevel(request.targetFields.level ?? ''); setTargetHiredAt(request.targetFields.hiredAt?.slice(0, 10) ?? ''); setTargetJobTitle(request.targetFields.jobTitle ?? ''); setIsRequestingChange(true); setChangeError(''); }}>Sửa và gửi lại yêu cầu</button>}
        </article>)}
      </section>

      <div className="banner" style={{ background: 'rgba(16, 185, 129, 0.06)', borderColor: 'rgba(16, 185, 129, 0.25)', color: '#a7f3d0' }}>
        <span>
          <strong>Allowlist:</strong> tài khoản cá nhân chỉ thấy trường được phép. CCCD, tài khoản ngân hàng, lương và lý do
          nghỉ không nằm trong DTO của API.
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
        <div className="card card--pad" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent-primary)', textTransform: 'uppercase' }}>Thông tin cơ bản</h3>
            {!isEditingRegular && (
              <button type="button" className="btn btn--sm" onClick={() => setIsEditingRegular(true)}>
                Sửa
              </button>
            )}
          </div>

          {!isEditingRegular ? (
            <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 14px', fontSize: '12px' }}>
              <dt style={{ color: 'var(--text-muted)' }}>Điện thoại</dt>
              <dd style={{ fontFamily: 'var(--mono)' }}>{profile.phone ?? '—'}</dd>
              <dt style={{ color: 'var(--text-muted)' }}>Ngày vào làm</dt>
              <dd style={{ fontFamily: 'var(--mono)' }}>{profile.hiredAt ?? '—'}</dd>
              <dt style={{ color: 'var(--text-muted)' }}>Kỹ năng</dt>
              <dd style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                {profile.skills.length > 0 ? (
                  profile.skills.map((skill) => (
                    <span key={skill} className="chip chip--warn">
                      {skill}
                    </span>
                  ))
                ) : (
                  <span style={{ color: 'var(--text-faint)' }}>Chưa cập nhật</span>
                )}
              </dd>
            </dl>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div className="field">
                <label className="field__label" htmlFor="own-phone">
                  Điện thoại
                </label>
                <input id="own-phone" className="input" value={phone} onChange={(event) => setPhone(event.target.value)} />
              </div>
              <div className="field">
                <label className="field__label" htmlFor="own-skills">
                  Kỹ năng (phân cách bằng dấu phẩy)
                </label>
                <input id="own-skills" className="input" value={skills} onChange={(event) => setSkills(event.target.value)} />
              </div>
              {regularError && <div className="banner banner--error" role="alert">{regularError}</div>}
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setIsEditingRegular(false)} disabled={regularBusy}>
                  Huỷ
                </button>
                <button type="button" className="btn btn--primary btn--sm" onClick={() => void saveRegularFields()} disabled={regularBusy} aria-busy={regularBusy}>
                  {regularBusy ? <span className="spinner" /> : null}
                  Lưu
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="card card--pad" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <h3 style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent-primary)', textTransform: 'uppercase' }}>
            Yêu cầu thay đổi thông tin cần xét duyệt
          </h3>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Ngày vào làm cần HR độc lập có grant phù hợp duyệt. Đổi cấp bậc/chức danh giữ PENDING đến khi có chính sách riêng; Admin kỹ thuật không duyệt nghiệp vụ này.
          </p>

          {!isRequestingChange ? (
            <button type="button" className="btn btn--primary" onClick={() => setIsRequestingChange(true)} style={{ alignSelf: 'flex-start' }}>
              Tạo yêu cầu
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div className="field">
                <label className="field__label" htmlFor="target-level">
                  Level mong muốn
                </label>
                <select id="target-level" className="select" value={targetLevel} onChange={(event) => setTargetLevel(event.target.value)}>
                  <option value="">Không đổi</option>
                  {LEVELS.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label className="field__label" htmlFor="target-hired-at">
                  Ngày vào làm mong muốn
                </label>
                <input id="target-hired-at" className="input" type="date" value={targetHiredAt} onChange={(event) => setTargetHiredAt(event.target.value)} />
              </div>
              <div className="field">
                <label className="field__label" htmlFor="target-job-title">
                  Chức danh mong muốn
                </label>
                <input id="target-job-title" className="input" value={targetJobTitle} onChange={(event) => setTargetJobTitle(event.target.value)} />
              </div>
              {changeError && <div className="banner banner--error" role="alert">{changeError}</div>}
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setIsRequestingChange(false)} disabled={changeBusy}>
                  Huỷ
                </button>
                <button type="button" className="btn btn--primary btn--sm" onClick={() => void submitChangeRequest()} disabled={changeBusy} aria-busy={changeBusy}>
                  {changeBusy ? <span className="spinner" /> : null}
                  Gửi yêu cầu
                </button>
              </div>
            </div>
          )}
          {lastRequestId && (
            <div style={{ fontSize: '11px', color: 'var(--text-faint)', fontFamily: 'var(--mono)' }}>
              Yêu cầu gần nhất: {lastRequestId}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
