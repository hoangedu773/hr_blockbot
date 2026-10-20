import React, { useState } from 'react';
import type { ScheduleEntry } from '../services/api';

interface AddShiftModalProps {
  isOpen: boolean;
  onClose: () => void;
  storeName: string;
  onAddShift?: (shift: ScheduleEntry) => void;
}

export const AddShiftModal: React.FC<AddShiftModalProps> = ({
  isOpen,
  onClose,
  storeName,
}) => {
  const [empName, setEmpName] = useState('BÙI VIỆT HÙNG');
  const [empCode, setEmpCode] = useState('GT-CH25036607');
  const [shiftCode, setShiftCode] = useState('A');
  const [workDate, setWorkDate] = useState('2026-10-06');
  const [blockCode, setBlockCode] = useState('1BNK');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Ngoài phạm vi bootstrap: không tạo fake action
    onClose();
  };

  const handleEmpChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === 'BÙI VIỆT HÙNG') {
      setEmpName('BÙI VIỆT HÙNG');
      setEmpCode('GT-CH25036607');
    } else if (val === 'NGUYỄN THỊ THANH THÚY') {
      setEmpName('NGUYỄN THỊ THANH THÚY');
      setEmpCode('GT-CH18030009');
    } else if (val === 'VŨ ANH TÚ') {
      setEmpName('VŨ ANH TÚ');
      setEmpCode('GT-CH26047865');
    } else {
      setEmpName('NGUYỄN MINH HẢI');
      setEmpCode('GT-CH26047890');
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        zIndex: 150,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        style={{
          background: '#0d111a',
          border: '1px solid rgba(255, 209, 0, 0.35)',
          borderRadius: '12px',
          width: '100%',
          maxWidth: '480px',
          boxShadow: '0 25px 60px rgba(0,0,0,0.85), 0 0 25px rgba(255, 209, 0, 0.08)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
            background: 'rgba(14, 20, 32, 0.9)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#fff' }}>
              Xếp Ca Làm Việc Mới
            </h3>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
              {storeName}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: '18px',
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>

        {/* Feature Notice */}
        <div
          style={{
            margin: '16px 20px 0',
            padding: '10px 12px',
            borderRadius: '6px',
            background: 'rgba(245, 158, 11, 0.1)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            fontSize: '11px',
            color: '#fbbf24',
            lineHeight: 1.5,
          }}
        >
          ℹ️ <strong>Tính năng đang cập nhật:</strong> Cơ chế xếp ca động và lưu trữ biểu mẫu trực tiếp vào MongoDB Atlas nằm ngoài phạm vi bootstrap foundation. Không tạo hành động ghi giả tại frontend.
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '5px', fontWeight: 600 }}>
              Nhân Viên Phân Ca:
            </label>
            <select
              value={empName}
              onChange={handleEmpChange}
              disabled
              style={{
                width: '100%',
                background: '#161d2b',
                color: 'var(--text-muted)',
                border: '1px solid var(--border)',
                padding: '8px 10px',
                borderRadius: '6px',
                fontSize: '12px',
                outline: 'none',
                cursor: 'not-allowed',
              }}
            >
              <option value="BÙI VIỆT HÙNG">BÙI VIỆT HÙNG ({empCode})</option>
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '5px', fontWeight: 600 }}>
                Ngày Làm Việc:
              </label>
              <input
                type="date"
                value={workDate}
                onChange={(e) => setWorkDate(e.target.value)}
                disabled
                style={{
                  width: '100%',
                  background: '#161d2b',
                  color: 'var(--text-muted)',
                  border: '1px solid var(--border)',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  outline: 'none',
                  cursor: 'not-allowed',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '5px', fontWeight: 600 }}>
                Khối Ca (Block):
              </label>
              <input
                type="text"
                value={blockCode}
                onChange={(e) => setBlockCode(e.target.value)}
                disabled
                style={{
                  width: '100%',
                  background: '#161d2b',
                  color: 'var(--text-muted)',
                  border: '1px solid var(--border)',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  outline: 'none',
                  fontFamily: 'var(--mono)',
                  cursor: 'not-allowed',
                }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '5px', fontWeight: 600 }}>
              Mã Ca Làm Việc:
            </label>
            <select
              value={shiftCode}
              onChange={(e) => setShiftCode(e.target.value)}
              disabled
              style={{
                width: '100%',
                background: '#161d2b',
                color: 'var(--text-muted)',
                border: '1px solid var(--border)',
                padding: '8px 10px',
                borderRadius: '6px',
                fontSize: '12px',
                outline: 'none',
                cursor: 'not-allowed',
              }}
            >
              <option value="A">Ca A (06:00 - 14:00 • Ca sáng chuẩn)</option>
            </select>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
            <button
              type="button"
              onClick={onClose}
              className="btn"
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                background: 'var(--surface)',
                color: 'var(--text-muted)',
                border: '1px solid var(--border)',
                cursor: 'pointer',
              }}
            >
              Đóng
            </button>
            <button
              type="submit"
              disabled
              className="btn"
              style={{
                padding: '8px 18px',
                borderRadius: '6px',
                background: 'rgba(255, 209, 0, 0.2)',
                color: 'var(--text-muted)',
                border: '1px solid rgba(255, 209, 0, 0.2)',
                cursor: 'not-allowed',
                fontWeight: 700,
              }}
            >
              Tính Năng Đang Cập Nhật
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
