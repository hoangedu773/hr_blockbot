import { useState } from 'react';
import { AppIcon } from './ui/AppIcon';

export type HashChainBlockItem = {
  id?: string;
  at: string;
  type?: string;
  to?: string;
  reason?: string;
  previousHash?: string | null;
  hash?: string;
  termsHash?: string;
  stateHash?: string;
  payloadHash?: string;
  actor?: string;
  actorId?: string;
  actorUserId?: string;
};

const BLOCK_TYPE_LABELS: Record<string, string> = {
  REQUESTED: 'Khởi tạo đề nghị (REQUESTED)',
  SUBMITTED: 'Gửi HR duyệt (SUBMITTED)',
  HR_APPROVED: 'HR độc lập phê duyệt (HR_APPROVED)',
  HR_REJECTED: 'HR từ chối (HR_REJECTED)',
  PROVISIONED: 'Khởi tạo hồ sơ & tài khoản (PROVISIONED)',
  ACTIVATION_ISSUED: 'Phát hành token kích hoạt (ACTIVATION_ISSUED)',
  DELIVERED: 'Đã gửi link kích hoạt (DELIVERED)',
  ACTIVATED: 'Kích hoạt hoàn tất (ACTIVATED)',
  STORE_MANAGER_CONFIRMED: 'Quản lý cửa hàng xác nhận (STORE_CONFIRMED)',
  WAITING_MANAGERS: 'Chờ quản lý nguồn/đích xác nhận (WAITING_MANAGERS)',
  WAITING_EFFECTIVE_DATE: 'Chờ ngày hiệu lực (WAITING_EFFECTIVE_DATE)',
  COMPLETED: 'Hoàn tất áp dụng (COMPLETED)',
  PENDING: 'Khởi tạo đề nghị ủy quyền (PENDING)',
  APPROVED: 'Cấp trên phê duyệt (APPROVED)',
  REJECTED: 'Từ chối (REJECTED)',
  REVOKED: 'Thu hồi hiệu lực (REVOKED)',
  PROPOSED: 'Đề xuất ban đầu (PROPOSED)',
  APPLIED: 'Đã áp dụng chính thức (APPLIED)',
  APPROVE: 'Phê duyệt (APPROVE)',
  REJECT: 'Từ chối (REJECT)',
  REVOKE: 'Thu hồi (REVOKE)',
};

const shortHash = (h?: string | null, isGenesis = false) => {
  if (!h || /^0+$/.test(h)) {
    return isGenesis ? '00000000...0000 (Genesis)' : '00000000...0000';
  }
  if (h.length <= 18) return h;
  return `${h.slice(0, 10)}...${h.slice(-8)}`;
};

export function HashChainLedger({
  entries,
  integrity = 'VALID_LOCAL_CHAIN',
  title = 'Sổ cái Chuỗi băm Bất biến (SHA-256 Hash-chain Audit Trail)',
}: {
  entries: HashChainBlockItem[];
  integrity?: string;
  title?: string;
}) {
  const [expandedBlock, setExpandedBlock] = useState<number | null>(null);
  const valid = integrity === 'VALID_LOCAL_CHAIN';
  const headHash = entries[entries.length - 1]?.hash;

  return (
    <div
      style={{
        padding: '14px',
        borderRadius: '12px',
        background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.82) 0%, rgba(9, 14, 28, 0.92) 100%)',
        border: `1px solid ${valid ? 'rgba(16, 185, 129, 0.28)' : 'rgba(239, 68, 68, 0.35)'}`,
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '8px',
          paddingBottom: '8px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AppIcon name="chain" size={18} style={{ color: '#60a5fa' }} />
          <div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
              {title}
            </div>
            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
              Genesis <code style={{ color: '#64748b' }}>0000...0000</code> ➔ Head{' '}
              <code style={{ color: '#34d399' }}>{shortHash(headHash)}</code>
            </div>
          </div>
        </div>
        <span
          style={{
            fontSize: '11px',
            fontWeight: 600,
            padding: '3px 10px',
            borderRadius: '999px',
            background: valid ? 'rgba(16, 185, 129, 0.14)' : 'rgba(239, 68, 68, 0.14)',
            color: valid ? '#34d399' : '#f87171',
            border: `1px solid ${valid ? 'rgba(16, 185, 129, 0.32)' : 'rgba(239, 68, 68, 0.32)'}`,
          }}
        >
          {valid ? `✓ ${entries.length} Khối SHA-256 hợp lệ` : <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><AppIcon name="alert" size={14} /><span>Lỗi liên kết chuỗi băm</span></span>}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '280px', overflowY: 'auto', paddingRight: '4px' }}>
        {entries.map((entry, index) => {
          const rawType = entry.type || entry.to || 'EVENT';
          const label = BLOCK_TYPE_LABELS[rawType] || rawType;
          const isOpen = expandedBlock === index;
          const commitmentHash = entry.stateHash || entry.termsHash || entry.payloadHash;

          return (
            <div
              key={entry.id || index}
              style={{
                padding: '10px 12px',
                borderRadius: '10px',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderLeft: `3px solid ${index === entries.length - 1 ? '#10b981' : '#3b82f6'}`,
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span
                    style={{
                      fontSize: '10.5px',
                      fontWeight: 700,
                      fontFamily: 'monospace',
                      padding: '2px 7px',
                      borderRadius: '5px',
                      background: index === entries.length - 1 ? 'rgba(16, 185, 129, 0.16)' : 'rgba(59, 130, 246, 0.16)',
                      color: index === entries.length - 1 ? '#34d399' : '#60a5fa',
                      border: `1px solid ${index === entries.length - 1 ? 'rgba(16, 185, 129, 0.32)' : 'rgba(59, 130, 246, 0.32)'}`,
                    }}
                  >
                    BLOCK #{index + 1}
                  </span>
                  <strong style={{ fontSize: '12.5px', color: '#f1f5f9' }}>{label}</strong>
                </div>
                <span style={{ fontSize: '11px', color: '#94a3b8', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <AppIcon name="clock" size={14} />
                  <span>{new Date(entry.at).toLocaleString('vi-VN')}</span>
                </span>
              </div>

              {entry.reason && (
                <div style={{ fontSize: '12.5px', color: '#cbd5e1', lineHeight: 1.45 }}>
                  {entry.reason}
                </div>
              )}

              {/* Mini Blockchain Hash Strip */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '6px',
                  padding: '6px 9px',
                  borderRadius: '6px',
                  background: 'rgba(0, 0, 0, 0.35)',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                  fontFamily: 'monospace',
                  fontSize: '11px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  <span style={{ color: '#94a3b8' }} title={entry.previousHash || '0'.repeat(64)}>
                    prev: <span style={{ color: '#cbd5e1' }}>{shortHash(entry.previousHash, index === 0)}</span>
                  </span>
                  <span style={{ color: '#60a5fa', fontWeight: 700 }}>➔</span>
                  <span style={{ color: '#94a3b8' }} title={entry.hash || ''}>
                    SHA-256: <strong style={{ color: '#34d399' }}>{shortHash(entry.hash)}</strong>
                  </span>
                  {commitmentHash && (
                    <span style={{ color: '#64748b', marginLeft: '4px' }} title={commitmentHash}>
                      · state: {shortHash(commitmentHash)}
                    </span>
                  )}
                </div>
                {entry.hash && (
                  <button
                    type="button"
                    onClick={() => setExpandedBlock(isOpen ? null : index)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#60a5fa',
                      fontSize: '10.5px',
                      cursor: 'pointer',
                      padding: '0 4px',
                      fontFamily: 'inherit',
                    }}
                  >
                    {isOpen ? 'Thu gọn hash' : 'Xem đủ 256-bit'}
                  </button>
                )}
              </div>

              {isOpen && entry.hash && (
                <div
                  style={{
                    padding: '8px 10px',
                    borderRadius: '6px',
                    background: 'rgba(2, 6, 23, 0.85)',
                    border: '1px solid rgba(59, 130, 246, 0.25)',
                    fontFamily: 'monospace',
                    fontSize: '10.5px',
                    color: '#cbd5e1',
                    overflowWrap: 'anywhere',
                    display: 'grid',
                    gap: '4px',
                  }}
                >
                  <div>
                    <span style={{ color: '#94a3b8' }}>previousHash: </span>
                    <span style={{ color: '#e2e8f0' }}>{entry.previousHash || '0'.repeat(64)}</span>
                  </div>
                  <div>
                    <span style={{ color: '#94a3b8' }}>blockHash (SHA-256): </span>
                    <span style={{ color: '#34d399', fontWeight: 700 }}>{entry.hash}</span>
                  </div>
                  {entry.termsHash && (
                    <div>
                      <span style={{ color: '#94a3b8' }}>termsHash: </span>
                      <span style={{ color: '#93c5fd' }}>{entry.termsHash}</span>
                    </div>
                  )}
                  {entry.stateHash && (
                    <div>
                      <span style={{ color: '#94a3b8' }}>stateHash: </span>
                      <span style={{ color: '#93c5fd' }}>{entry.stateHash}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function WorkflowAuditNotice({ integrity }: { integrity?: string }) {
  if (integrity === 'VALID_LOCAL_CHAIN') {
    return <p role="status">Hash-chain local khớp. Đây không phải bằng chứng neo Blockchain công khai.</p>;
  }
  return (
    <p role="alert">
      {integrity === 'INVALID'
        ? 'Lịch sử không khớp hash-chain. Giữ nguyên dữ liệu để đối chiếu; không tiếp tục xử lý bản ghi này.'
        : 'Bản ghi cũ chưa đủ bằng chứng kiểm chứng lịch sử. Chỉ đối chiếu; không coi là audit đã xác thực.'}
    </p>
  );
}

export function WorkflowHistoryNavigation({
  page,
  hasNext,
  loading,
  label,
  onPage,
  onLookup,
}: {
  page: number;
  hasNext: boolean;
  loading: boolean;
  label: string;
  onPage: (page: number) => void;
  onLookup: (id: string) => Promise<void>;
}) {
  const [id, setId] = useState('');
  const [looking, setLooking] = useState(false);
  return (
    <div style={{ marginTop: '14px' }}>
      <nav aria-label={'Phân trang ' + label} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
        <button className="btn" disabled={loading || page <= 1} onClick={() => onPage(page - 1)}>
          Trang trước
        </button>
        <span>Trang {page}</span>
        <button className="btn" disabled={loading || !hasNext} onClick={() => onPage(page + 1)}>
          Trang sau
        </button>
      </nav>
      <form
        className="crm-work-actions"
        onSubmit={(event) => {
          event.preventDefault();
          if (looking) return;
          setLooking(true);
          void onLookup(id.trim()).finally(() => setLooking(false));
        }}
      >
        <label className="field" style={{ margin: 0 }}>
          <span>Tra cứu lịch sử & kiểm chứng chuỗi băm theo mã yêu cầu</span>
          <input
            className="input"
            placeholder="Nhập mã yêu cầu 24 ký tự hex..."
            value={id}
            maxLength={24}
            pattern="[a-fA-F0-9]{24}"
            required
            onChange={(event) => setId(event.target.value)}
          />
        </label>
        <button className="btn" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }} disabled={looking || loading}>
          <AppIcon name="search" size={16} />
          <span>Kiểm chứng lịch sử theo mã</span>
        </button>
      </form>
      <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '6px' }}>
        Chỉ truy hồi bản ghi thuộc quyền hiện tại. Mã yêu cầu và chuỗi băm SHA-256 hiển thị trong phần chi tiết.
      </p>
    </div>
  );
}
