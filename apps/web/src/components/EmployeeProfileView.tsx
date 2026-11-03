import React, { useCallback, useEffect, useState } from 'react';
import type { EmployeeDetail, ProfileChangeRequest } from '@hr-blockbot/contracts';
import { ApiError, createProfileChangeRequest, fetchMyProfile, fetchEmployeeChangeRequests, updateEmployeeFields } from '../services/api';
import type { NotifyFn } from './Toast';
import { useAuthorization } from '../context/useAuthorization';
import { SmAppointments, isSmPositionCandidate } from './SmAppointments';
import { employeeLocationLabel, employeeJobLabel, profileDate } from '../services/employee-display';
import '../styles/employee-profile.css';

interface EmployeeProfileViewProps { onLogout: () => void; onNotify: NotifyFn }
const labels: Record<string, string> = { level: 'Cấp bậc', hiredAt: 'Ngày vào làm', jobTitle: 'Chức danh' };
const dateOnlyRequest = (r: ProfileChangeRequest) => !!r.targetFields.hiredAt && Object.keys(r.targetFields).every(k => k === 'hiredAt');

export const EmployeeProfileView: React.FC<EmployeeProfileViewProps> = ({ onNotify }) => {
  const { can } = useAuthorization();
  const canEditRegular = can('profile.update_self_basic'), canRequestChange = can('profile.request_self');
  const [profile, setProfile] = useState<EmployeeDetail | null>(null), [isLoading, setIsLoading] = useState(true), [loadError, setLoadError] = useState('');
  const [isEditingRegular, setIsEditingRegular] = useState(false), [phone, setPhone] = useState(''), [skills, setSkills] = useState('');
  const [regularError, setRegularError] = useState(''), [regularBusy, setRegularBusy] = useState(false);
  const [isRequestingChange, setIsRequestingChange] = useState(false), [targetHiredAt, setTargetHiredAt] = useState('');
  const [changeError, setChangeError] = useState(''), [changeBusy, setChangeBusy] = useState(false), [lastRequestId, setLastRequestId] = useState('');
  const [requests, setRequests] = useState<ProfileChangeRequest[]>([]), [historyError, setHistoryError] = useState('');
  const load = useCallback(async () => {
    setIsLoading(true); setLoadError('');
    try {
      const result = await fetchMyProfile(); setProfile(result); setPhone(result.phone ?? ''); setSkills(result.skills.join(', '));
      try { setRequests(await fetchEmployeeChangeRequests(result.employeeId)); setHistoryError(''); }
      catch (e) { setHistoryError(e instanceof Error ? e.message : 'Không tải được lịch sử yêu cầu.'); }
    } catch (e) { setLoadError(e instanceof ApiError || e instanceof Error ? e.message : 'Không tải được hồ sơ.'); }
    finally { setIsLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (!canEditRegular) setIsEditingRegular(false); if (!canRequestChange) setIsRequestingChange(false); }, [canEditRegular, canRequestChange]);

  const saveRegularFields = async () => {
    if (!canEditRegular || !profile || regularBusy) return;
    setRegularBusy(true); setRegularError('');
    try {
      const updated = await updateEmployeeFields(profile.employeeId, { phone: phone.trim(), skills: skills.split(',').map(s => s.trim()).filter(Boolean), expectedVersion: profile.profileVersion });
      if ('profileVersion' in updated) setProfile(updated);
      onNotify('Đã cập nhật điện thoại và kỹ năng.', 'success', 'Lưu hồ sơ'); setIsEditingRegular(false);
    } catch (e) { const message = e instanceof Error ? e.message : 'Không lưu được thông tin.'; setRegularError(message); onNotify(message, 'error', 'Lỗi lưu hồ sơ'); }
    finally { setRegularBusy(false); }
  };
  const submitChangeRequest = async () => {
    if (!canRequestChange || !profile || changeBusy) return;
    if (!targetHiredAt) { setChangeError('Chọn ngày vào làm cần điều chỉnh.'); return; }
    const value = new Date(targetHiredAt + 'T00:00:00Z');
    if (!Number.isFinite(value.getTime())) { setChangeError('Ngày vào làm không hợp lệ.'); return; }
    if (targetHiredAt === profile.hiredAt?.slice(0, 10)) { setChangeError('Ngày đề nghị đang trùng với ngày vào làm hiện tại.'); return; }
    setChangeBusy(true); setChangeError('');
    try {
      const created = await createProfileChangeRequest(profile.employeeId, { targetFields: { hiredAt: value.toISOString() }, ...(lastRequestId ? { previousRequestId: lastRequestId } : {}) });
      setLastRequestId(''); setRequests(old => [...old, created]);
      try { setProfile(await fetchMyProfile()); } catch { setHistoryError('Yêu cầu đã gửi. Làm mới hồ sơ để xem thông tin mới nhất.'); }
      onNotify('Đã gửi yêu cầu chỉnh sửa ngày vào làm, chờ HR xét duyệt.', 'success', 'Gửi yêu cầu');
      setIsRequestingChange(false); setTargetHiredAt('');
    } catch (e) { const message = e instanceof Error ? e.message : 'Không gửi được yêu cầu.'; setChangeError(message); onNotify(message, 'error', 'Lỗi gửi yêu cầu'); }
    finally { setChangeBusy(false); }
  };
  if (isLoading) return <div className="employee-profile" aria-label="Đang tải hồ sơ"><div className="skeleton" style={{ height: 110 }} /><div className="skeleton" style={{ height: 240 }} /></div>;
  if (loadError) return <div className="banner banner--error" role="alert">Không tải được hồ sơ: {loadError}<button className="btn" onClick={() => void load()}>Thử lại</button></div>;
  if (!profile) return <div className="empty"><h3>Chưa có hồ sơ</h3><p>Liên hệ HR để liên kết tài khoản với hồ sơ nhân viên.</p></div>;
  const pending = requests.some(r => r.status === 'PENDING');
  return <section className="employee-profile" aria-label="Hồ sơ của tôi">
    <header className="card card--pad employee-profile-header">
      <div><h2>{profile.fullName}</h2><p className="employee-profile-code">Mã nhân viên: {profile.employeeCode || 'Chưa cập nhật'}</p>
        <p className="employee-profile-job">{employeeJobLabel(profile.jobTitle)}</p><p className="employee-profile-location">{employeeLocationLabel(profile)}</p></div>
      <button className="btn" disabled={regularBusy || changeBusy} onClick={() => void load()}>Làm mới hồ sơ</button>
    </header>
    <div className="employee-profile-columns">
      <section className="card card--pad employee-profile-card" aria-label="Thông tin cơ bản">
        <div className="employee-profile-card-heading"><h3>Thông tin cơ bản</h3>{canEditRegular && !isEditingRegular && <button className="btn btn--sm" onClick={() => setIsEditingRegular(true)}>Sửa</button>}</div>
        {!isEditingRegular || !canEditRegular ? <dl className="employee-profile-fields">
          <dt>Điện thoại</dt><dd>{profile.phone?.trim() || 'Chưa cập nhật'}</dd><dt>Ngày vào làm</dt><dd>{profileDate(profile.hiredAt)}</dd>
          <dt>Kỹ năng</dt><dd className="employee-profile-skills">{profile.skills.length ? profile.skills.map(skill => <span key={skill} className="chip">{skill}</span>) : 'Chưa cập nhật'}</dd>
        </dl> : <form className="employee-profile-form" onSubmit={e => { e.preventDefault(); void saveRegularFields(); }}>
          <label className="field" htmlFor="own-phone">Điện thoại<input id="own-phone" type="tel" className="input" disabled={regularBusy} value={phone} onChange={e => setPhone(e.target.value)} /></label>
          <label className="field" htmlFor="own-skills">Kỹ năng<input id="own-skills" className="input" disabled={regularBusy} value={skills} onChange={e => setSkills(e.target.value)} /><small>Phân cách các kỹ năng bằng dấu phẩy.</small></label>
          {regularError && <p className="banner banner--error" role="alert">{regularError}</p>}
          <div className="employee-profile-actions"><button type="button" className="btn" disabled={regularBusy} onClick={() => { setPhone(profile.phone ?? ''); setSkills(profile.skills.join(', ')); setRegularError(''); setIsEditingRegular(false); }}>Huỷ</button><button className="btn btn--primary" disabled={regularBusy}>{regularBusy ? 'Đang lưu…' : 'Lưu'}</button></div>
        </form>}
      </section>
      <section className="card card--pad employee-profile-card" aria-label="Chỉnh sửa ngày vào làm">
        <h3>Chỉnh sửa ngày vào làm</h3><p>Gửi ngày đúng để HR kiểm tra và cập nhật hồ sơ.</p>
        {!canRequestChange ? <p role="status">Tài khoản hiện chỉ được xem hồ sơ; chưa được cấp quyền gửi yêu cầu thay đổi.</p>
          : pending && !isRequestingChange ? <p role="status">Bạn có yêu cầu đang chờ HR xử lý. Xem trạng thái bên dưới.</p>
          : !isRequestingChange ? <button className="btn" onClick={() => { setLastRequestId(''); setTargetHiredAt(''); setChangeError(''); setIsRequestingChange(true); }}>Tạo yêu cầu</button>
          : <form className="employee-profile-form" onSubmit={e => { e.preventDefault(); void submitChangeRequest(); }}>
            <label className="field" htmlFor="target-hired-at">Ngày vào làm đề nghị<input id="target-hired-at" className="input" type="date" required disabled={changeBusy} value={targetHiredAt} onChange={e => setTargetHiredAt(e.target.value)} /></label>
            {changeError && <p className="banner banner--error" role="alert">{changeError}</p>}
            <div className="employee-profile-actions"><button type="button" className="btn" disabled={changeBusy} onClick={() => { setIsRequestingChange(false); setLastRequestId(''); }}>Huỷ</button><button className="btn btn--primary" disabled={changeBusy}>{changeBusy ? 'Đang gửi…' : 'Gửi yêu cầu'}</button></div>
          </form>}
      </section>
    </div>
    <details className="card card--pad employee-profile-secondary" open={requests.length > 0}>
      <summary>Yêu cầu chỉnh sửa hồ sơ{requests.length ? ` (${requests.length})` : ''}</summary>
      {historyError && <p role="alert">{historyError}</p>}{!requests.length && !historyError && <p>Chưa có yêu cầu thay đổi hồ sơ.</p>}
      {[...requests].reverse().map(request => <article className="crm-report-card" key={request.id}>
        <strong>{request.status === 'PENDING' ? 'Chờ HR xử lý' : request.status === 'APPROVED' ? 'Đã duyệt' : 'Đã từ chối'}</strong>
        <p>Gửi ngày {new Date(request.requestedAt).toLocaleString('vi-VN')}</p>
        <p>{Object.entries(request.targetFields).map(([field, value]) => `${labels[field] || 'Thông tin'}: ${field === 'hiredAt' ? profileDate(String(value)) : value}`).join(' · ')}</p>
        {request.reviewedAt && <p>Xử lý ngày {new Date(request.reviewedAt).toLocaleString('vi-VN')}</p>}{request.rejectionReason && <p>Lý do: {request.rejectionReason}</p>}
        {canRequestChange && request.status === 'REJECTED' && !pending && dateOnlyRequest(request) && <button className="btn" disabled={changeBusy} onClick={() => { setLastRequestId(request.id); setTargetHiredAt(request.targetFields.hiredAt?.slice(0, 10) || ''); setChangeError(''); setIsRequestingChange(true); }}>Sửa và gửi lại yêu cầu</button>}
      </article>)}
    </details>
    {isSmPositionCandidate(profile.jobTitle) && <details className="card card--pad employee-profile-secondary"><summary>Phân công cửa hàng</summary><SmAppointments key={profile.employeeId} employeeId={profile.employeeId} /></details>}
  </section>;
};
