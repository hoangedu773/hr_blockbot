import { useEffect, useRef, useState } from 'react';
import type { F4Suggestions } from '@hr-blockbot/contracts';
import { fetchReplacementCandidates } from '../services/api';

/** Advice only: a selection updates the form, never invokes an assignment mutation. */
export function CandidateSuggestions({ projectId, projectVersion, disabled, onSelect }: { projectId: string; projectVersion: number; disabled?: boolean; onSelect?: (employeeId: string) => void }) {
  const [data, setData] = useState<F4Suggestions | null>(null), [loading, setLoading] = useState(false), [error, setError] = useState('');
  const sequence = useRef(0);
  useEffect(() => { sequence.current++; setData(null); setError(''); setLoading(false); return () => { sequence.current++; }; }, [projectId, projectVersion]);
  async function load() {
    const current = ++sequence.current; setLoading(true); setData(null); setError('');
    try { const result = await fetchReplacementCandidates(projectId); if (current === sequence.current) {
      if (result.projectVersion !== projectVersion) throw new Error('Công việc đã thay đổi. Tải lại trước khi xem gợi ý.');
      setData(result);
    } } catch (failure) { if (current === sequence.current) setError(failure instanceof Error ? failure.message : 'Không tải được gợi ý. Bạn vẫn có thể chọn người thủ công.'); }
    finally { if (current === sequence.current) setLoading(false); }
  }
  return <section className="crm-work-detail" aria-label="Gợi ý người thay thế">
    <button type="button" className="btn" disabled={disabled || loading} onClick={() => void load()}>{loading ? 'Đang phân tích…' : 'Xem gợi ý người thay thế'}</button>
    {error && <p role="alert">{error}</p>}
    {data && <><h4>Gợi ý tham khảo — quản lý quyết định</h4><p>Nguồn: {data.source === 'PHOBERT' ? `${data.model} · revision ${data.revision}` : data.source === 'BASELINE_FALLBACK' ? 'Baseline dự phòng — PhoBERT chưa khả dụng' : data.source === 'MANUAL' ? 'Chưa đủ dữ liệu hoặc vượt dung lượng — chọn thủ công' : 'Baseline so khớp chính xác — không phải PhoBERT'}.</p>
      <p>Đã xét {data.candidatesConsidered} nhân sự. {data.warning}</p>
      {data.status !== 'READY' && <p role="status">{data.status === 'MODEL_UNAVAILABLE' ? 'Mô hình/cấu hình chưa sẵn sàng; đây là kết quả baseline, không phải inference PhoBERT.' : 'Chưa có kết quả xếp hạng đầy đủ. Không tự suy năng lực từ dữ liệu thiếu.'}</p>}
      {!data.items.length && <p>Không có gợi ý đủ dữ liệu. Danh mục chọn thủ công vẫn được kiểm quyền riêng.</p>}
      {data.items.map((candidate) => <article className="crm-report-card" key={candidate.employeeId}><strong>{candidate.fullName} · {candidate.suitabilityScore === null ? 'Chưa đủ dữ liệu chấm điểm' : `điểm phù hợp ${candidate.suitabilityScore}/100`}</strong>
        <p>{candidate.explanation}</p><p>Khớp chính xác: {candidate.matchedSkills.join(', ') || 'Chưa có'}.</p><p>Chưa khớp chính xác: {candidate.missingSkills.join(', ') || 'Không có'}.</p>
        {candidate.semanticEvidence.map((pair) => <p key={pair.required}>{pair.required} ↔ {pair.matched || 'Chưa có kỹ năng đối sánh'}: cosine {pair.cosine.toFixed(3)} (không là xác suất).</p>)}
        {candidate.missingData.length > 0 && <p>{candidate.missingData.join('; ')}</p>}
        {onSelect && <button className="btn" type="button" disabled={disabled} onClick={() => onSelect(candidate.employeeId)}>Chọn {candidate.fullName} vào biểu mẫu</button>}
      </article>)}</>}
  </section>;
}
