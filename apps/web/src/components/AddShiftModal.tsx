import React, { useState } from 'react';
import { ScheduleEntry } from '../services/api';

interface AddShiftModalProps {
  isOpen: boolean;
  onClose: () => void;
  storeName: string;
  onAddShift: (shift: ScheduleEntry) => void;
}

export const AddShiftModal: React.FC<AddShiftModalProps> = ({
  isOpen,
  onClose,
  storeName,
  onAddShift
}) => {
  const [empName, setEmpName] = useState('BÙI VIỆT HÙNG');
  const [empCode, setEmpCode] = useState('GT-CH25036607');
  const [shiftCode, setShiftCode] = useState('A');
  const [workDate, setWorkDate] = useState('2026-10-06');
  const [blockCode, setBlockCode] = useState('1BNK');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newEntry: ScheduleEntry = {
      id: Date.now(),
      employee_code: empCode,
      employee_name: empName,
      block_code: blockCode,
      work_date: workDate,
      shift_code: shiftCode,
      schedule_type: 'actual'
    };
    onAddShift(newEntry);
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
        maxWidth: '480px',
        boxShadow: '0 25px 60px rgba(0,0,0,0.85), 0 0 25px rgba(255, 209, 0, 0.08)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
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
              cursor: 'pointer'
            }}
          >
            ✕
          </button>
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
              style={{
                width: '100%',
                background: '#161d2b',
                color: '#fff',
                border: '1px solid var(--border)',
                padding: '8px 10px',
                borderRadius: '6px',
                fontSize: '12px',
                outline: 'none'
              }}
            >
              <option value="BÙI VIỆT HÙNG">BÙI VIỆT HÙNG (GT-CH25036607 - Bếp)</option>
              <option value="NGUYỄN THỊ THANH THÚY">NGUYỄN THỊ THANH THÚY (GT-CH18030009 - Bếp)</option>
              <option value="VŨ ANH TÚ">VŨ ANH TÚ (GT-CH26047865 - Barista)</option>
              <option value="NGUYỄN MINH HẢI">NGUYỄN MINH HẢI (GT-CH26047890 - Thu ngân)</option>
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
                style={{
                  width: '100%',
                  background: '#161d2b',
                  color: '#fff',
                  border: '1px solid var(--border)',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  outline: 'none'
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
                style={{
                  width: '100%',
                  background: '#161d2b',
                  color: '#fff',
                  border: '1px solid var(--border)',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  outline: 'none',
                  fontFamily: 'var(--mono)'
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
              style={{
                width: '100%',
                background: '#161d2b',
                color: '#fff',
                border: '1px solid var(--border)',
                padding: '8px 10px',
                borderRadius: '6px',
                fontSize: '12px',
                outline: 'none'
              }}
            >
              <option value="A">Ca A (06:00 - 14:00 • Ca sáng chuẩn)</option>
              <option value="A1.749">Ca A1.749 (06:00 - 14:00 • Ca gãy tăng cường)</option>
              <option value="A1B1">Ca A1B1 (06:00 - 14:00 • Ca xuyên trưa)</option>
              <option value="B">Ca B (14:00 - 22:00 • Ca chiều chuẩn)</option>
              <option value="B2">Ca B2 (14:00 - 22:00 • Ca tối kết ca)</option>
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
                cursor: 'pointer'
              }}
            >
              Hủy
            </button>
            <button
              type="submit"
              className="btn btn-gold"
              style={{
                padding: '8px 18px',
                borderRadius: '6px',
                background: 'var(--guta-yellow)',
                color: '#07090e',
                border: '1px solid var(--guta-yellow)',
                cursor: 'pointer',
                fontWeight: 700
              }}
            >
              + Tạo & Phân Ca
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
