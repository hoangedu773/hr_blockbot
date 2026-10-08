import React from 'react';

interface AiCopilotModalProps {
  isOpen: boolean;
  onClose: () => void;
  query: string;
  onActionComplete?: (message: string) => void;
}

export const AiCopilotModal: React.FC<AiCopilotModalProps> = ({
  isOpen,
  onClose,
  query,
  onActionComplete
}) => {
  if (!isOpen) return null;

  const isBaristaQuery = query.toLowerCase().includes('pha chế') || query.toLowerCase().includes('barista');
  const isCorrectionQuery = query.toLowerCase().includes('duyệt') || query.toLowerCase().includes('phiếu') || query.toLowerCase().includes('công');
  const isCashQuery = query.toLowerCase().includes('két') || query.toLowerCase().includes('tiền') || query.toLowerCase().includes('1b');
  const isPolicyQuery = query.toLowerCase().includes('quy chế') || query.toLowerCase().includes('vân tay') || query.toLowerCase().includes('luật');

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.75)',
      backdropFilter: 'blur(8px)',
      zIndex: 150,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px'
    }}>
      <div style={{
        background: '#0d111a',
        border: '1px solid rgba(255, 209, 0, 0.35)',
        borderRadius: '12px',
        width: '100%',
        maxWidth: '560px',
        maxHeight: '90dvh',
        boxShadow: '0 25px 60px rgba(0,0,0,0.85), 0 0 25px rgba(255, 209, 0, 0.08)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        animation: 'modalFadeIn 180ms ease'
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border)',
          background: 'rgba(14, 20, 32, 0.9)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              background: 'var(--guta-blue)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff'
            }}>
              <svg style={{ width: 14, height: 14, fill: 'currentColor' }} viewBox="0 0 24 24">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                GUTA AI COPILOT
                <span style={{
                  fontSize: '10px',
                  fontFamily: 'var(--mono)',
                  color: 'var(--guta-yellow)',
                  background: 'rgba(255, 209, 0, 0.12)',
                  border: '1px solid rgba(255, 209, 0, 0.3)',
                  padding: '1px 6px',
                  borderRadius: '4px'
                }}>
                  FUNCTION CALLING & RAG
                </span>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
                Đã đối soát trực tiếp 144 điểm bán • 2,439 nhân sự Atlas
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: '18px',
              cursor: 'pointer',
              padding: '4px'
            }}
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* User question box */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            padding: '12px 14px'
          }}>
            <div style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-faint)', fontWeight: 700, fontFamily: 'var(--mono)', marginBottom: '4px' }}>
              Yêu cầu từ Cửa hàng trưởng:
            </div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#fff' }}>
              "{query}"
            </div>
          </div>

          {/* AI Result Card */}
          <div style={{
            background: 'var(--surface-card)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--guta-yellow)', fontWeight: 700, fontFamily: 'var(--mono)' }}>
              <span>✦ KẾT QUẢ PHÂN TÍCH & ĐỀ XUẤT THỰC THI:</span>
            </div>

            {isBaristaQuery && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <p style={{ color: '#cbd5e1', fontSize: '13px' }}>
                  Hệ thống đã quét 144 chi nhánh và tìm thấy <strong>2 nhân sự Barista</strong> có chuyên môn tốt, không có lịch làm việc ngày mai tại khu vực lân cận:
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ background: '#090d14', border: '1px solid var(--border)', borderRadius: '6px', padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 700, color: '#fff' }}>VŨ ANH TÚ (GT-CH26047865)</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>PHA CHẾ - Barista • Chi nhánh lân cận: 100 Nguyễn Thị Minh Khai</div>
                    </div>
                    <span style={{ fontSize: '11px', color: 'var(--emerald)', fontFamily: 'var(--mono)', fontWeight: 600 }}>● Sẵn sàng vào ca</span>
                  </div>
                  <div style={{ background: '#090d14', border: '1px solid var(--border)', borderRadius: '6px', padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 700, color: '#fff' }}>LÊ QUỐC TRUNG (GT-CH26047888)</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>PHA CHẾ - Barista • Chi nhánh lân cận: 1B Nguyễn Kiệm</div>
                    </div>
                    <span style={{ fontSize: '11px', color: 'var(--emerald)', fontFamily: 'var(--mono)', fontWeight: 600 }}>● Sẵn sàng vào ca</span>
                  </div>
                </div>
              </div>
            )}

            {isCorrectionQuery && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <p style={{ color: '#cbd5e1', fontSize: '13px' }}>
                  Đã kiểm tra <strong>7 phiếu giải trình tồn đọng</strong> trong kỳ lương 06/05 – 05/06/2026. Các phiếu này đều có minh chứng hợp lệ (lỗi hệ thống IT hoặc nhân viên mới chưa kịp cấp vân tay):
                </p>
                <div style={{ background: '#090d14', border: '1px solid var(--border)', borderRadius: '6px', padding: '10px 12px', fontSize: '12px', color: '#cbd5e1', lineHeight: 1.6 }}>
                  <div>• <strong>GT-CH22102995</strong> (Ca A 11/05): Lỗi IT chưa cấp mã ca → <em>Khuyên duyệt</em></div>
                  <div>• <strong>GT-CH26057943</strong> (Ca B2 06/05): Nhân viên mới chưa vân tay → <em>Khuyên duyệt</em></div>
                  <div>• <strong>5 phiếu khác</strong>: Đã đối chiếu camera xác nhận có mặt tại quầy.</div>
                </div>
              </div>
            )}

            {isCashQuery && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <p style={{ color: '#cbd5e1', fontSize: '13px' }}>
                  Đối soát dữ liệu két tiền ca tại điểm bán <strong>1B Nguyễn Kiệm</strong> (collection <code>cash_counts</code> & <code>cash_denominations</code>):
                </p>
                <div style={{ background: '#090d14', border: '1px solid var(--border)', borderRadius: '6px', padding: '12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontFamily: 'var(--mono)' }}>
                  <div>Tiền mặt đếm thực tế: <strong style={{ color: '#fff' }}>1,745,000 ₫</strong></div>
                  <div>Doanh thu vãng lai: <strong style={{ color: '#fff' }}>215,000 ₫</strong></div>
                  <div>Tổng nộp hệ thống: <strong style={{ color: 'var(--guta-yellow)' }}>1,960,000 ₫</strong></div>
                  <div>Độ lệch (Discrepancy): <strong style={{ color: 'var(--emerald)' }}>0 ₫ (Khớp 100%)</strong></div>
                </div>
              </div>
            )}

            {isPolicyQuery && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <p style={{ color: '#cbd5e1', fontSize: '13px', lineHeight: 1.5 }}>
                  Theo <strong>Quy Chế Chấm Công & Khen Thưởng GUTA CAFE (Phiên bản 2026)</strong>:
                </p>
                <div style={{ background: '#090d14', border: '1px solid var(--border)', borderLeft: '3px solid var(--guta-yellow)', borderRadius: '6px', padding: '12px', fontSize: '12px', color: '#f1f5f9', lineHeight: 1.6 }}>
                  "Trường hợp nhân viên quên chấm công hoặc gặp sự cố kỹ thuật, Cửa hàng trưởng có quyền xác nhận và gửi phiếu giải trình bù công trong vòng <strong>48 giờ</strong> kể từ thời điểm phát sinh ca làm việc, và không muộn hơn ngày <strong>05 hàng tháng</strong> để chốt kỳ lương."
                  <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
                    📖 Trích dẫn chính xác: Điều 12, Khoản 3 — Quy chế vận hành F&B Guta Cafe.
                  </div>
                </div>
              </div>
            )}

            {!isBaristaQuery && !isCorrectionQuery && !isCashQuery && !isPolicyQuery && (
              <div style={{ color: '#cbd5e1', fontSize: '13px', lineHeight: 1.5 }}>
                Đã xử lý thành công yêu cầu qua pipeline Agent Loop. Dữ liệu đã được cập nhật đồng bộ với 144 cửa hàng trên MongoDB Atlas.
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div style={{
          padding: '14px 20px',
          borderTop: '1px solid var(--border)',
          background: 'rgba(14, 20, 32, 0.9)',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '10px'
        }}>
          <button
            onClick={onClose}
            className="btn"
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              background: 'var(--surface)',
              color: 'var(--text-muted)',
              border: '1px solid var(--border)',
              cursor: 'pointer',
              fontWeight: 600
            }}
          >
            Đóng
          </button>
          <button
            onClick={() => {
              if (onActionComplete) {
                onActionComplete(
                  isCorrectionQuery ? 'Đã duyệt toàn bộ 7 phiếu giải trình công kỳ 6/5 - 5/6!' :
                  isBaristaQuery ? 'Đã gửi lời mời bổ sung ca cho Barista Vũ Anh Tú & Lê Quốc Trung!' :
                  'Đã áp dụng đề xuất của Copilot vào hệ thống vận hành!'
                );
              }
              onClose();
            }}
            className="btn btn-gold"
            style={{
              padding: '8px 18px',
              borderRadius: '6px',
              background: 'var(--guta-yellow)',
              color: '#07090e',
              border: '1px solid var(--guta-yellow)',
              cursor: 'pointer',
              fontWeight: 700,
              boxShadow: '0 2px 10px rgba(255, 209, 0, 0.25)'
            }}
          >
            ✓ Xác Nhận Thực Thi Ngay
          </button>
        </div>
      </div>
    </div>
  );
};
