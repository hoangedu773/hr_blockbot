import React, { useCallback, useEffect, useState } from 'react';
import type { EmployeeDetail, EmployeeLevel, ProfileTargetFields } from '@hr-blockbot/contracts';
import {
  ApiError,
  createProfileChangeRequest,
  fetchMyProfile,
  updateEmployeeFields,
} from '../services/api';
import type { NotifyFn } from './Toast';

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

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const result = await fetchMyProfile();
      setProfile(result);
      setPhone(result.phone ?? '');
      setSkills(result.skills.join(', '));
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
        ...(phone.trim() ? { phone: phone.trim() } : {}),
        skills: skillList,
      });
      if ('employeeCode' in updated) setProfile(updated);
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
      setLastRequestId(created.id);
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
      </div>

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
            Yêu cầu đổi thông tin nhạy cảm
          </h3>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            level / hiredAt / jobTitle phải qua hàng đợi duyệt của Admin (FR-003/FR-004). Không tự đổi được.
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
