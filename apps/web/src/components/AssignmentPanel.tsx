import React, { useEffect, useRef, useState } from 'react';
import type { Project, MeResponse, AssignmentRequest, EmployeeSummary } from '@hr-blockbot/contracts';
import {
  ApiError, respondAssignment, reviewAssignmentRequest, confirmAssignmentHandover, discussAssignment,
  requestJson, fetchProjectById, fetchAssignmentAudit,
  fetchDecisionProofs, prepareDecisionProof, verifyDecisionProof,
} from '../services/api';
import { Select } from './ui/Select';
import { CandidateSuggestions } from './CandidateSuggestions';

export const assignmentLabel = (project: Project): string => {
  if (project.assignmentStatus === 'HANDOVER_PENDING') return 'Chờ xác nhận bàn giao';
  if (project.assignmentStatus === 'MANAGER_REVIEW') return 'Chờ quản lý xử lý';
  if (project.assignmentRequests.some((request) => request.status === 'PENDING')) return project.status === 'IN_PROGRESS' ? 'Đang thực hiện · Có yêu cầu chờ quản lý' : 'Đã tiếp nhận · Có yêu cầu chờ quản lý';
  if (project.status === 'ASSIGNED') return project.assignmentStatus === 'ACCEPTED' ? 'Đã tiếp nhận, chưa bắt đầu' : 'Chờ nhân viên tiếp nhận';
  return { DRAFT: 'Khởi tạo', IN_PROGRESS: 'Đang thực hiện', PENDING_REVIEW: 'Chờ nghiệm thu', COMPLETED: 'Hoàn thành' }[project.status] || project.status;
};
const REQUEST_LABEL = { DECLINE: 'Từ chối tiếp nhận', CHANGE: 'Xin đổi nhiệm vụ', TRANSFER: 'Xin chuyển giao', ESCALATION: 'Chuyển cấp' };
const RESULT_LABEL = { PENDING: 'Chờ quản lý xử lý', REJECTED: 'Yêu cầu bị từ chối', HANDOVER_PENDING: 'Chờ xác nhận bàn giao', TRANSFERRED: 'Đã bàn giao', REASSIGNED: 'Đã giao lại, chờ tiếp nhận', CANCELLED: 'Đã hủy phương án bàn giao' };
const EVENT_LABEL: Record<string, string> = { CREATED: 'Tạo nhiệm vụ', ASSIGNMENT_OFFERED: 'Đề nghị phân công', ACCEPTED: 'Nhân viên tiếp nhận', DECLINE_REQUESTED: 'Từ chối trước tiếp nhận', CHANGE_REQUESTED: 'Xin đổi nhiệm vụ', TRANSFER_REQUESTED: 'Xin chuyển giao', ASSIGNMENT_APPROVE: 'Quản lý phê duyệt', ASSIGNMENT_REJECT: 'Quản lý từ chối', ASSIGNMENT_CANCEL_HANDOVER: 'Quản lý hủy phương án', HANDOVER_CONFIRMED: 'Xác nhận bàn giao', HANDOVER_COMPLETED: 'Hoàn tất chuyển trách nhiệm', HANDOVER_DECLINED: 'Không nhận bàn giao', DISCUSSION_ADDED: 'Trao đổi', ESCALATED: 'Chuyển cấp', STARTED: 'Bắt đầu thực hiện', PROGRESS_UPDATED: 'Cập nhật tiến độ', REPORT_SUBMITTED: 'Nộp báo cáo', REPORT_APPROVED: 'Nghiệm thu', REPORT_REJECTED: 'Trả báo cáo bổ sung', WORK_EDITED: 'Sửa thông tin nhiệm vụ' };
const STATE_LABEL: Record<string, string> = { DRAFT: 'Khởi tạo', ASSIGNED: 'Được đề nghị giao', IN_PROGRESS: 'Đang thực hiện', PENDING_REVIEW: 'Chờ nghiệm thu', COMPLETED: 'Hoàn thành', PENDING_ACCEPTANCE: 'Chờ tiếp nhận', ACCEPTED: 'Đã tiếp nhận', MANAGER_REVIEW: 'Chờ quản lý xử lý', HANDOVER_PENDING: 'Chờ bàn giao' };
const date = (value?: string | null) => value ? new Date(value).toLocaleString('vi-VN') : 'Chưa có mốc xác nhận (dữ liệu cũ)';
type Form = { kind: 'decline' | 'change' | 'review' | 'handover' | 'comment' | 'escalate'; request?: AssignmentRequest } | null;

export function AssignmentPanel({ project, me, onUpdated, onBusyChange }: { project: Project; me: MeResponse; onUpdated: (project: Project) => void; onBusyChange: (busy: boolean) => void }) {
  const [form, setForm] = useState<Form>(null);
  const [reason, setReason] = useState('');
  const [decision, setDecision] = useState('REJECT');
  const [replacement, setReplacement] = useState('');
  const [handoverNote, setHandoverNote] = useState('');
  const [search, setSearch] = useState('');
  const [people, setPeople] = useState<EmployeeSummary[]>([]);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [peopleError, setPeopleError] = useState('');
  const [proofs, setProofs] = useState<Awaited<ReturnType<typeof fetchDecisionProofs>> | null>(null);
  const [audit, setAudit] = useState<Awaited<ReturnType<typeof fetchAssignmentAudit>> | null>(null);
  const [proofEvent, setProofEvent] = useState('');
  const [transaction, setTransaction] = useState('');
  const [proofResult, setProofResult] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const writing = useRef(false);
  const mounted = useRef(true);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const person = (id?: string | null) => id ? project.actorNames?.[id] || id : 'Chưa xác định';
  const own = project.assigneeId === me.employeeId;
  const open = ['ASSIGNED', 'IN_PROGRESS'].includes(project.status);
  const pending = project.assignmentRequests.some((entry) => ['PENDING', 'HANDOVER_PENDING'].includes(entry.status));
  const phase = project.assignmentStatus || (project.status === 'ASSIGNED' ? 'PENDING_ACCEPTANCE' : 'ACCEPTED');
  useEffect(() => () => onBusyChange(false), [onBusyChange]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    let active = true;
    void Promise.all([fetchAssignmentAudit(project.id), fetchDecisionProofs(project.id)]).then(([history, chain]) => {
      if (!active) return;
      setAudit(history); setProofs(chain); setProofEvent((old) => old || history.events[history.events.length - 1]?.id || '');
    }).catch((failure) => { if (active) setError(failure instanceof Error ? failure.message : 'Không tải được lịch sử xác thực.'); });
    return () => { active = false; };
  }, [project.id, project.version]);
  useEffect(() => {
    if (form?.kind !== 'review' || decision !== 'APPROVE') return;
    let active = true;
    setPeopleLoading(true); setPeopleError('');
    const timer = setTimeout(() => {
      void requestJson<{ items: EmployeeSummary[]; paging: { hasNext: boolean } }>(`/projects/${project.id}/eligible-assignees?q=${encodeURIComponent(search)}&page=${page}&limit=30`).then((result) => {
        if (!active) return;
        const allowed = result.items.filter((employee) => employee.employeeId !== project.assigneeId);
        setPeople((old) => page === 1 ? allowed : [...old, ...allowed.filter((employee) => !old.some((item) => item.employeeId === employee.employeeId))]);
        setHasNext(result.paging.hasNext);
      }).catch((failure) => { if (active) setPeopleError(failure instanceof Error ? failure.message : 'Không tải được nhân sự.'); })
        .finally(() => { if (active) setPeopleLoading(false); });
    }, 200);
    return () => { active = false; clearTimeout(timer); };
  }, [form?.kind, decision, project.departmentId, project.assigneeId, search, page]);

  const run = async (action: () => Promise<Project | void>, success: string) => {
    if (writing.current) return;
    writing.current = true; setBusy(true); onBusyChange(true); setError(''); setMessage('');
    try {
      const result = await action();
      if (!mounted.current) return;
      if (result) onUpdated(result);
      setForm(null); setMessage(success);
      requestAnimationFrame(() => { statusRef.current?.focus(); statusRef.current?.scrollIntoView({ block: 'nearest' }); });
    } catch (failure) {
      if (!mounted.current) return;
      setError(failure instanceof Error ? failure.message : 'Không thể thực hiện.');
      if (failure instanceof ApiError && failure.status === 409) {
        try { const latest = await fetchProjectById(project.id); if (mounted.current) onUpdated(latest); } catch { /* original error remains */ }
      }
    } finally { writing.current = false; onBusyChange(false); if (mounted.current) setBusy(false); }
  };
  const show = (kind: NonNullable<Form>['kind'], request?: AssignmentRequest) => {
    setForm({ kind, request }); setReason(''); setError(''); setMessage(''); setReplacement(''); setHandoverNote(''); setDecision('REJECT'); setSearch(''); setPage(1); setPeople([]);
  };
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!form || !reason.trim()) return;
    const version = project.version;
    if (form.kind === 'decline' || form.kind === 'change') void run(() => respondAssignment(project.id, {
      action: form.kind === 'decline' ? 'DECLINE' : 'REQUEST_CHANGE', reason: reason.trim(), expectedVersion: version,
    }), 'Đã gửi yêu cầu cho quản lý; không cập nhật KPI.');
    else if (form.kind === 'review' && form.request) void run(() => reviewAssignmentRequest(project.id, form.request!.id, {
      action: decision as 'APPROVE' | 'REJECT' | 'CANCEL_HANDOVER', reason: reason.trim(), expectedVersion: version,
      ...(decision === 'APPROVE' ? { replacementId: replacement, handoverNote: handoverNote.trim() } : {}),
    }), decision === 'APPROVE' ? 'Đã phê duyệt phương án; tiếp nhận/bàn giao còn phải được xác nhận.' : 'Đã lưu quyết định và thông báo lý do.');
    else if (form.kind === 'handover' && form.request) void run(() => confirmAssignmentHandover(project.id, form.request!.id, {
      action: decision as 'CONFIRM' | 'DECLINE', reason: reason.trim(), expectedVersion: version,
    }), 'Đã ghi nhận xác nhận; chỉ đổi trách nhiệm khi đủ xác nhận của hai bên.');
    else if (form.request) void run(() => discussAssignment(project.id, form.request!.id, { message: reason.trim(), expectedVersion: version }, form.kind === 'escalate'),
      form.kind === 'escalate' ? 'Đã chuyển yêu cầu tới cấp quản lý nghiệp vụ độc lập được xác minh.' : 'Đã lưu trao đổi và thông báo người liên quan.');
  };
  const requestNow = form?.request ? project.assignmentRequests.find((item) => item.id === form.request!.id) : null;
  const reviewEnabled = requestNow && (requestNow.status === 'PENDING' || requestNow.status === 'HANDOVER_PENDING');
  const proofAction = (wallet: boolean) => void run(async () => {
    let txHash = transaction;
    if (wallet) {
      const prepared = await prepareDecisionProof(project.id, proofEvent);
      const ethereum = (window as unknown as { ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> } }).ethereum;
      if (!ethereum) throw new Error('Chưa có ví trình duyệt. Không có giao dịch Blockchain nào được gửi.');
      const chain = await ethereum.request({ method: 'eth_chainId' });
      if (BigInt(String(chain)) !== BigInt(prepared.transaction.chainId)) throw new Error('Ví đang ở mạng khác. Hãy chọn đúng mạng đã cấu hình trước khi xác nhận.');
      const accounts = await ethereum.request({ method: 'eth_requestAccounts' }) as string[];
      if (!accounts[0] || accounts[0].toLowerCase() !== prepared.registrar.toLowerCase()) throw new Error('Ví hiện tại không có quyền registrar của smart contract.');
      txHash = String(await ethereum.request({ method: 'eth_sendTransaction', params: [{ ...prepared.transaction, from: accounts[0] }] }));
      if (mounted.current) setTransaction(txHash);
    }
    const result = await verifyDecisionProof(project.id, proofEvent, txHash.trim());
    if (mounted.current) {
      setProofResult(result.status === 'VERIFIED' ? 'Đã xác minh hash và giao dịch thành công trên Blockchain.' : 'Giao dịch đang chờ đủ xác nhận; chưa được xác thực hoàn tất.');
      setProofs(await fetchDecisionProofs(project.id));
    }
  }, 'Đã kiểm tra bằng chứng; xem trạng thái xác thực bên dưới.');

  return <section className="crm-work-detail" aria-label="Tiếp nhận và bàn giao">
    <h4>Tiếp nhận & trách nhiệm</h4><p>{assignmentLabel(project)} · phiên bản {project.version}</p>
    <p>{project.responsibleEmployeeId ? `Người đang chịu trách nhiệm: ${project.responsibleEmployeeId === project.assigneeId ? project.assigneeName || project.responsibleEmployeeId : project.responsibleEmployeeId}` : 'Chưa có người xác nhận nhận trách nhiệm thực hiện.'}</p>
    <p>AI chỉ đề xuất. Từ chối, xin đổi, quá hạn và bàn giao không tự động trừ KPI.</p>
    <div className="crm-work-actions">
      {own && open && phase === 'PENDING_ACCEPTANCE' && !pending && <><button className="btn btn--primary" disabled={busy} onClick={() => void run(() => respondAssignment(project.id, { action: 'ACCEPT', expectedVersion: project.version }), 'Đã tiếp nhận nhiệm vụ; thời điểm trách nhiệm đã được ghi nhận.')}>Xác nhận tiếp nhận</button><button className="btn" disabled={busy} onClick={() => show('decline')}>Từ chối / Xin đổi trước tiếp nhận</button></>}
      {own && open && phase === 'ACCEPTED' && !pending && <button className="btn" disabled={busy} onClick={() => show('change')}>{project.status === 'IN_PROGRESS' ? 'Xin chuyển giao' : 'Xin đổi nhiệm vụ'}</button>}
    </div>
    {message && <p role="status" ref={statusRef} tabIndex={-1}>{message}</p>}{error && <p role="alert" className="banner banner--error">{error}</p>}
    {me.authorization?.capabilities.includes('projects.assign') && <CandidateSuggestions projectId={project.id} projectVersion={project.version} disabled={busy} />}
    <h4>Yêu cầu & quyết định</h4>
    {!project.assignmentRequests.length && <p>Chưa có yêu cầu đổi/từ chối/chuyển giao.</p>}
    {[...project.assignmentRequests].reverse().map((request) => {
      const requester = request.requestedBy === me.userId;
      const manager = me.authorization?.capabilities.includes(request.kind === 'ESCALATION' ? 'assignment.escalation_review' : 'assignment.review') && !requester && request.employeeId !== me.employeeId && (request.kind !== 'ESCALATION' || project.assignmentRequests.find((item) => item.id === request.parentId)?.reviewedBy !== me.userId);
      const party = me.employeeId === request.employeeId || me.employeeId === request.replacementId;
      return <article className="crm-report-card" key={request.id}>
        <strong>{REQUEST_LABEL[request.kind]} · {RESULT_LABEL[request.status]}</strong><p>{request.reason}</p><p>Người yêu cầu: {person(request.employeeId)} · {date(request.requestedAt)}</p>
        {request.reviewedBy && <p>Quản lý: {person(request.reviewedBy)} · {date(request.reviewedAt)} · Lý do: {request.decisionReason}</p>}
        {request.replacementId && <p>Người thay thế được duyệt: {person(request.replacementId)}</p>}
        {request.progressSnapshot !== undefined && <p>Tiến độ bàn giao: {request.progressSnapshot}% · {request.handoverNote}</p>}
        {request.status === 'HANDOVER_PENDING' && <p>Bên giao: {request.outgoingConfirmedAt ? 'Đã xác nhận' : 'Chưa xác nhận'} · Bên nhận: {request.incomingConfirmedAt ? 'Đã xác nhận' : 'Chưa xác nhận'}. Trách nhiệm chưa chuyển khi còn thiếu xác nhận.</p>}
        {request.transferredAt && <p>Thời điểm chuyển trách nhiệm: {date(request.transferredAt)}</p>}
        {request.comments.map((comment) => <blockquote key={comment.id}><p>{comment.message}</p><small>{person(comment.actorId)} · {date(comment.at)}</small></blockquote>)}
        <div className="crm-work-actions">
          {manager && ['PENDING', 'HANDOVER_PENDING'].includes(request.status) && <button className="btn" disabled={busy} onClick={() => { show('review', request); if (request.status === 'HANDOVER_PENDING') setDecision('CANCEL_HANDOVER'); }}>Xử lý yêu cầu</button>}
          {request.status === 'HANDOVER_PENDING' && party && <button className="btn btn--primary" disabled={busy} onClick={() => { show('handover', request); setDecision('CONFIRM'); }}>Xác nhận bàn giao</button>}
          {(requester || manager || (request.status === 'HANDOVER_PENDING' && party)) && <button className="btn" disabled={busy} onClick={() => show('comment', request)}>Trao đổi</button>}
          {requester && request.status === 'REJECTED' && open && !pending && request.assignmentRound === project.assignmentRound && <button className="btn" disabled={busy} onClick={() => show('escalate', request)}>Chuyển cấp</button>}
        </div>
      </article>;
    })}
    {form && <form className="crm-work-form" onSubmit={submit} aria-label="Phản hồi phân công">
      <h4>{form.kind === 'decline' ? 'Từ chối trước tiếp nhận' : form.kind === 'change' ? 'Yêu cầu đổi / chuyển giao' : form.kind === 'review' ? 'Quyết định của quản lý' : form.kind === 'handover' ? 'Xác nhận bàn giao thực tế' : form.kind === 'escalate' ? 'Đề nghị quản trị cấp trên xem xét' : 'Trao đổi về yêu cầu'}</h4>
      {form.kind === 'review' && <div className="field"><span className="field__label" id="assignment-decision-label">Quyết định</span><Select aria-labelledby="assignment-decision-label" value={decision} onChange={setDecision} disabled={busy} options={requestNow?.status === 'HANDOVER_PENDING' ? [{ value: 'CANCEL_HANDOVER', label: 'Hủy phương án bàn giao, giữ người hiện tại' }] : [{ value: 'REJECT', label: 'Từ chối yêu cầu, thông báo lý do' }, { value: 'APPROVE', label: 'Phê duyệt người thay thế' }]} /></div>}
      {form.kind === 'review' && decision === 'APPROVE' && <>
        <label className="field"><span className="field__label">Tìm nhân sự thay thế</span><input className="input" value={search} maxLength={50} disabled={busy} onChange={(event) => { setSearch(event.target.value); setPage(1); setReplacement(''); }} /></label>
        <div className="field"><span className="field__label" id="assignment-replacement-label">Người thay thế</span><Select aria-labelledby="assignment-replacement-label" value={replacement} onChange={setReplacement} disabled={busy || peopleLoading} options={people.map((person) => ({ value: person.employeeId, label: person.fullName }))} placeholder="Quản lý chọn người thay thế" /></div>
        {peopleError && <p role="alert">{peopleError}</p>}{hasNext && <button className="btn" type="button" disabled={busy || peopleLoading} onClick={() => setPage((old) => old + 1)}>Tải thêm người thay thế</button>}
        {project.status === 'IN_PROGRESS' && <label className="field"><span className="field__label" id="assignment-handover-note-label">Ghi chú bàn giao tại tiến độ {project.progress}%</span><textarea className="textarea" aria-labelledby="assignment-handover-note-label" required maxLength={5000} value={handoverNote} disabled={busy} onChange={(event) => setHandoverNote(event.target.value)} /></label>}
      </>}
      {form.kind === 'handover' && me.employeeId === requestNow?.replacementId && <div className="field"><span className="field__label" id="handover-action-label">Phản hồi bàn giao</span><Select aria-labelledby="handover-action-label" value={decision} onChange={setDecision} disabled={busy} options={[{ value: 'CONFIRM', label: 'Xác nhận tiếp nhận bàn giao' }, { value: 'DECLINE', label: 'Không tiếp nhận phương án này, gửi lại quản lý' }]} /></div>}
      <label className="field"><span className="field__label" id="assignment-reason-label">Lý do / nội dung xác nhận</span><textarea className="textarea" aria-labelledby="assignment-reason-label" required maxLength={2000} value={reason} disabled={busy} onChange={(event) => setReason(event.target.value)} /></label>
      <p>Kiểm tra nội dung trước khi xác nhận. Không có thao tác tự động trừ KPI hoặc chuyển người ngoài quyết định được phê duyệt.</p>
      <div className="crm-work-actions"><button className="btn" type="button" disabled={busy} onClick={() => setForm(null)}>Hủy biểu mẫu</button><button className="btn btn--primary" type="submit" disabled={busy || !reason.trim() || (form.kind === 'review' && (!reviewEnabled || (decision === 'APPROVE' && !replacement)))}>Xác nhận lưu phản hồi</button></div>
    </form>}
    <h4>Khoảng trách nhiệm</h4>
    {!project.responsibilities.length && <p>{project.responsibleEmployeeId ? 'Dữ liệu cũ chưa có mốc tiếp nhận; không tự suy diễn thời điểm.' : 'Chưa có khoảng trách nhiệm thực hiện.'}</p>}
    {project.responsibilities.map((interval, index) => <p key={index}>{person(interval.employeeId)} · từ {date(interval.startAt)} đến {interval.endAt ? date(interval.endAt) : project.status === 'COMPLETED' ? 'đã hoàn thành' : 'hiện tại'} · tiến độ {interval.progressStart}% → {interval.progressEnd ?? project.progress}%</p>)}
    <h4>Lịch sử bất biến & bằng chứng Blockchain</h4>
    <p>{audit ? audit.valid ? 'Hash-chain cục bộ khớp dữ liệu hiện tại.' : 'Cảnh báo: lịch sử/dữ liệu đã thay đổi không khớp hash.' : 'Đang kiểm tra lịch sử…'}</p>
    <p>{proofs?.configured ? 'Đã cấu hình mạng xác thực. Chưa có giao dịch được xác minh không có nghĩa đã ghi Blockchain.' : 'Chưa cấu hình mạng/địa chỉ smart contract; chưa xác thực trên Blockchain thật.'}</p>
    <ol className="crm-work-history">{[...(audit?.events ?? [])].reverse().map((entry) => {
      const proof = proofs?.items.find((item) => item.eventId === entry.id);
      return <li key={entry.id} value={entry.sequence}><strong>{EVENT_LABEL[entry.type] || entry.type} · {person(entry.actorId)}</strong><p>{entry.reason} · {date(entry.at)}</p><p>Trước: {STATE_LABEL[String(entry.before.status)] || 'Chưa tạo'} / {STATE_LABEL[String(entry.before.assignmentStatus)] || 'Chưa phân công'} → Sau: {STATE_LABEL[String(entry.after.status)] || 'Chưa tạo'} / {STATE_LABEL[String(entry.after.assignmentStatus)] || 'Chưa phân công'}</p><code className="crm-audit-hash">{entry.hash}</code><p>Blockchain: {!proof ? 'Chưa có bằng chứng xác thực' : proof.matchesCurrentEvent === false ? 'Bằng chứng không khớp sự kiện hiện tại' : proof.status === 'VERIFIED' ? 'Đã xác minh ở lần kiểm tra trước — có thể kiểm tra lại' : 'Chờ đủ xác nhận'}</p></li>;
    })}</ol>
    {!!audit?.events.length && <>
      <div className="field"><span className="field__label" id="proof-event-label">Quyết định cần xác thực</span><Select aria-labelledby="proof-event-label" value={proofEvent} onChange={(value) => { setProofEvent(value); setTransaction(''); setProofResult(''); }} options={[...audit.events].reverse().map((entry) => ({ value: entry.id, label: `${entry.sequence}. ${EVENT_LABEL[entry.type] || entry.type} · ${date(entry.at)}` }))} /></div>
      <label className="field"><span className="field__label">Mã giao dịch Blockchain</span><input className="input" value={transaction} maxLength={66} disabled={busy} placeholder="0x..." onChange={(event) => setTransaction(event.target.value)} /></label>
      <div className="crm-work-actions">{me.authorization?.capabilities.includes('projects.assign') && <button className="btn" disabled={busy || !audit.valid} onClick={() => proofAction(true)}>Xác thực bằng ví (có thể tốn phí mạng)</button>}<button className="btn" disabled={busy || !audit.valid || !transaction.trim()} onClick={() => proofAction(false)}>Kiểm tra giao dịch</button></div>
      {proofResult && <p role="status">{proofResult}</p>}
      {(proofs?.items ?? []).map((proof) => <p key={proof.eventId + proof.chainId + proof.registryAddress}>Lần kiểm tra trước: {proof.status === 'VERIFIED' ? 'Đã xác minh' : 'Chờ xác nhận'}{proof.matchesCurrentEvent === false ? ' · CẢNH BÁO: không còn khớp sự kiện hiện tại' : ''} · chain {proof.chainId} · {proof.transactionHash}</p>)}
      <p>Chỉ ID ngẫu nhiên và hash có nonce lên chuỗi. Không đưa tên, KPI, lý do hoặc nội dung báo cáo lên Blockchain. Quyết định nghiệp vụ không bị đảo ngược khi RPC/ví lỗi.</p>
    </>}
  </section>;
}
