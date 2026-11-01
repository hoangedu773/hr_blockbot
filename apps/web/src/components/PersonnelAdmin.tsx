import { useEffect, useRef, useState, type FormEvent } from 'react';
import { editPersonnel, fetchPersonnelManagement, type CrmDepartment } from '../services/api';
import { useAuthorization } from '../context/useAuthorization';
import { CrmDialog } from './ui/CrmDialog';

export function PersonnelAdmin({ editingEmployeeId, onDismissEdit, onChanged }: {
  departments: CrmDepartment[]; editingEmployeeId: string | null; onDismissEdit: () => void; onChanged: () => void;
}) {
  const { can } = useAuthorization();
  const [fullName, setFullName] = useState(''), [phone, setPhone] = useState(''), [skills, setSkills] = useState(''), [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false), [ready, setReady] = useState(false), [error, setError] = useState('');
  const writing = useRef(false), sequence = useRef(0);
  useEffect(() => {
    if (!editingEmployeeId || !can('employees.update_other')) return;
    const current = ++sequence.current; setReady(false); setError('');
    void fetchPersonnelManagement(editingEmployeeId).then((employee) => {
      if (current === sequence.current) { setFullName(employee.fullName); setPhone(employee.phone ?? ''); setSkills(employee.skills.join(', ')); setVersion(employee.profileVersion); setReady(true); }
    }).catch((failure) => { if (current === sequence.current) setError(failure instanceof Error ? failure.message : 'Không tải được hồ sơ.'); });
    return () => { sequence.current++; };
  }, [editingEmployeeId, can('employees.update_other')]);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (writing.current || !editingEmployeeId || !ready) return;
    const entries = [...new Set(skills.split(',').map((value) => value.trim()).filter(Boolean))];
    if (entries.length > 30 || entries.some((value) => value.length > 100)) { setError('Tối đa 30 kỹ năng, mỗi kỹ năng không quá 100 ký tự.'); return; }
    writing.current = true; setBusy(true); setError('');
    try { await editPersonnel(editingEmployeeId, { fullName, phone, skills: entries, expectedVersion: version }); onDismissEdit(); onChanged(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Chưa lưu được. Giữ nguyên bản nhập để đối chiếu; không tự ghi đè phiên bản mới.'); }
    finally { writing.current = false; setBusy(false); }
  };
  if (!can('employees.update_other')) return null;
  return <section aria-label="Cập nhật thông tin thường">
    <p>Nhân viên mới đi qua mục Tiếp nhận nhân viên. Điều chuyển/nghỉ việc/tái kích hoạt cần workflow phê duyệt riêng; đổi cấp bậc và cấu hình phòng ban chưa được mở.</p>
    {editingEmployeeId && <CrmDialog title="Sửa thông tin thường" busy={busy} onClose={() => { if (!busy) onDismissEdit(); }}>
      {error && <p role="alert">{error}</p>}{!ready ? <p role="status">Đang tải hồ sơ trong phạm vi…</p> : <form className="crm-work-form" onSubmit={(event) => void submit(event)}>
        <label className="field">Họ tên<input className="input" value={fullName} required maxLength={200} disabled={busy} onChange={(event) => setFullName(event.target.value)} /></label>
        <label className="field">Điện thoại<input className="input" value={phone} maxLength={30} disabled={busy} onChange={(event) => setPhone(event.target.value)} /></label>
        <label className="field">Kỹ năng, phân cách bằng dấu phẩy<input className="input" value={skills} disabled={busy} onChange={(event) => setSkills(event.target.value)} /></label>
        <button className="btn btn--primary" disabled={busy}>Lưu thông tin thường</button>
      </form>}
    </CrmDialog>}
  </section>;
}
