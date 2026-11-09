import { useEffect, useRef, useState } from 'react';
import type { TaskTemplate } from '@hr-blockbot/contracts';
import { newClientMessageId } from '../services/api';
import { performancePost, performanceSuggest, performanceTemplates } from '../services/performance-kpi-api';

export function WorkRubricFields({ storeId, title, description, dueDate, templateId, weight, onTemplate, onWeight, disabled, onBusy }: {
  storeId: string; title: string; description: string; dueDate: string; templateId: string; weight: string;
  onTemplate: (id: string) => void; onWeight: (weight: string) => void; disabled: boolean; onBusy: (busy: boolean) => void;
}) {
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [suggestion, setSuggestion] = useState<Awaited<ReturnType<typeof performanceSuggest>> | null>(null);
  const [role, setRole] = useState<'STAFF' | 'PTCH' | 'SM'>('STAFF');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const proposalKey = useRef<{ payload: string; id: string }>();
  const period = dueDate.slice(0, 7);
  useEffect(() => {
    let current = true;
    setLoading(true);
    setError('');
    void performanceTemplates()
      .then(result => { if (current) setTemplates(result.items); })
      .catch(error => { if (current) setError(error instanceof Error ? error.message : 'Chưa tải được mẫu chấm.'); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [revision]);
  useEffect(() => { setSuggestion(null); setNotice(''); }, [storeId, title, description, dueDate, role]);
  const scoped = templates.filter(template => !template.proposalStoreId || template.proposalStoreId === storeId);
  const published = scoped.filter(template => template.status === 'PUBLISHED' && (!period ||
    template.content.effectiveFrom <= period && (!template.content.effectiveTo || template.content.effectiveTo >= period)));
  const selected = published.find(template => template.id === templateId);

  async function suggest() {
    onBusy(true); setError(''); setNotice(''); setSuggestion(null);
    try {
      setSuggestion(await performanceSuggest({ title, description, storeId, templateCode: null, role }));
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Chưa lấy được gợi ý.');
    } finally { onBusy(false); }
  }

  async function propose() {
    if (!suggestion || !period) return;
    onBusy(true); setError('');
    try {
      const input = {
        storeId, reason: 'Đề nghị duyệt mẫu chấm cho công việc.',
        content: { ...suggestion.content, name: title.trim(), effectiveFrom: period, effectiveTo: null },
      };
      const payload = JSON.stringify(input);
      if (proposalKey.current?.payload !== payload) proposalKey.current = { payload, id: newClientMessageId() };
      const created = await performancePost<TaskTemplate>('/tasks/templates/proposals', { ...input, expectedVersion: 0, clientRequestId: proposalKey.current.id });
      setTemplates(items => [...items.filter(template => template.id !== created.id), created]);
      setSuggestion(null);
      setNotice('Đã gửi mẫu cho HR. Sau khi mẫu được công bố, tải lại danh sách mẫu để chọn.');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Chưa gửi được mẫu chấm.');
    } finally { onBusy(false); }
  }

  return <fieldset className="crm-work-rubric" disabled={disabled}>
    <legend>Thang điểm KPI</legend>
    <p>Nhân viên sẽ thấy tiêu chí khi nhận việc. Quản lý chấm các tiêu chí lúc nghiệm thu.</p>
    <label className="field">Mẫu nhiệm vụ đã công bố
      <select className="input" value={selected?.id ?? ''} required onChange={event => onTemplate(event.target.value)}>
        <option value="">{loading ? 'Đang tải mẫu…' : 'Chọn mẫu đã công bố'}</option>
        {published.map(template => <option key={template.id} value={template.id}>{template.content.name}</option>)}
      </select>
    </label>
    <button type="button" className="btn" disabled={loading} onClick={() => setRevision(value => value + 1)}>Tải lại mẫu chấm</button>
    <label className="field">Mức quan trọng (5–50%)
      <input className="input" type="number" min={5} max={50} value={weight} required onChange={event => onWeight(event.target.value)} />
    </label>
    {selected && <p>{selected.content.qualityCriteria.map(item => item.name + ' ' + item.maxScore + ' điểm').join(' · ')}</p>}
    <details>
      <summary>Gợi ý thang điểm</summary>
      <label className="field">Vai trò nhận công việc
        <select className="input" value={role} onChange={event => setRole(event.target.value as typeof role)}>
          <option value="STAFF">Nhân viên</option><option value="PTCH">PTCH</option><option value="SM">Cửa hàng trưởng</option>
        </select>
      </label>
      <button type="button" className="btn" disabled={!storeId || title.trim().length < 3 || !description.trim()} onClick={() => void suggest()}>AI đề xuất mẫu mới</button>
      {suggestion && <div className="crm-work-detail">
        <strong>{suggestion.degraded ? 'Mẫu dự phòng' : 'Bản nháp AI đề xuất'}</strong>
        <p>{suggestion.rationale}</p>
        <ul>{suggestion.content.steps.map(step => <li key={step.code}>{step.name} · {step.progressWeightPercent}%</li>)}</ul>
        <ul>{suggestion.content.qualityCriteria.map(item => <li key={item.code}>{item.name} · {item.maxScore} điểm · {item.description}</li>)}</ul>
        <p>Bằng chứng: {suggestion.content.requiredEvidence.map(item => item.name).join(', ') || 'Theo tiêu chí chấm'}</p>
        <button type="button" className="btn" disabled={!period} onClick={() => void propose()}>Gửi mẫu cho HR duyệt</button>
        {!period && <p>Chọn hạn hoàn thành để xác định tháng áp dụng mẫu.</p>}
      </div>}
      {scoped.filter(t => t.proposalStoreId && t.status !== 'PUBLISHED').map(t => <p key={t.id}>{t.content.name} · {t.status === 'DRAFT' ? 'Chờ HR duyệt' : 'Đã từ chối. ' + (t.history[t.history.length - 1]?.reason ?? '')}</p>)}
    </details>
    {notice && <p role="status">{notice}</p>}
    {error && <p role="alert" className="banner banner--error">{error}</p>}
  </fieldset>;
}
