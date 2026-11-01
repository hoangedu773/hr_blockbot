import { useState } from 'react';
export function WorkflowAuditNotice({ integrity }: { integrity?: string }) {
  if (integrity === 'VALID_LOCAL_CHAIN') return <p role="status">Hash-chain local khớp. Đây không phải bằng chứng neo Blockchain công khai.</p>;
  return <p role="alert">{integrity === 'INVALID' ? 'Lịch sử không khớp hash-chain. Giữ nguyên dữ liệu để đối chiếu; không tiếp tục xử lý bản ghi này.' : 'Bản ghi cũ chưa đủ bằng chứng kiểm chứng lịch sử. Chỉ đối chiếu; không coi là audit đã xác thực.'}</p>;
}
export function WorkflowHistoryNavigation({ page, hasNext, loading, label, onPage, onLookup }: {
  page: number; hasNext: boolean; loading: boolean; label: string; onPage: (page: number) => void; onLookup: (id: string) => Promise<void>;
}) {
  const [id, setId] = useState(''), [looking, setLooking] = useState(false);
  return <div><nav aria-label={'Phân trang ' + label}><button className="btn" disabled={loading || page <= 1} onClick={() => onPage(page - 1)}>Trang trước</button><span>Trang {page}</span><button className="btn" disabled={loading || !hasNext} onClick={() => onPage(page + 1)}>Trang sau</button></nav>
    <form className="crm-work-actions" onSubmit={(event) => { event.preventDefault(); if (looking) return; setLooking(true); void onLookup(id.trim()).finally(() => setLooking(false)); }}>
      <label className="field">Tra cứu lịch sử bằng mã yêu cầu<input className="input" value={id} maxLength={24} pattern="[a-fA-F0-9]{24}" required onChange={(event) => setId(event.target.value)} /></label>
      <button className="btn" disabled={looking || loading}>Xem lịch sử theo mã</button>
    </form><p>Chỉ truy hồi bản ghi thuộc quyền hiện tại. Mã yêu cầu hiển thị trong phần chi tiết.</p>
  </div>;
}
