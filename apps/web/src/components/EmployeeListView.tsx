import React, { useState, useEffect } from 'react';
import type { EmployeeSummary } from '@hr-blockbot/contracts';
import { fetchEmployees } from '../services/api';

export const EmployeeListView: React.FC = () => {
  const [employees, setEmployees] = useState<EmployeeSummary[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');

  const loadEmployees = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetchEmployees({ q: searchTerm });
      setEmployees(res.items);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi tải danh sách nhân sự';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadEmployees();
  }, [searchTerm]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#fff' }}>
            Danh Sách Nhân Sự Điểm Bán (Allowlist Only)
          </h2>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
            Theo hợp đồng DTO tối thiểu: Không chứa PII nhạy cảm (bank, CCCD, lương)
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Tìm theo tên, mã NV..."
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              color: '#fff',
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '12px',
              outline: 'none',
            }}
          />
          <button
            onClick={loadEmployees}
            style={{
              padding: '6px 12px',
              background: 'var(--surface-card)',
              border: '1px solid var(--border)',
              color: 'var(--text)',
              borderRadius: '6px',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            Làm Mới
          </button>
        </div>
      </div>

      {isLoading && (
        <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
          Đang tải danh sách nhân sự từ API...
        </div>
      )}

      {error && (
        <div style={{ padding: '16px', background: 'rgba(244, 63, 94, 0.1)', border: '1px solid rgba(244, 63, 94, 0.3)', borderRadius: '8px', color: '#fca5a5', fontSize: '12px' }}>
          ⚠️ {error}
        </div>
      )}

      {!isLoading && !error && employees.length === 0 && (
        <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--surface)', borderRadius: '8px' }}>
          Không tìm thấy nhân sự nào phù hợp với bộ lọc.
        </div>
      )}

      {!isLoading && employees.length > 0 && (
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '10px',
            overflow: 'hidden',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: 'rgba(14, 18, 27, 0.8)', borderBottom: '1px solid var(--border)', color: 'var(--text-faint)', fontFamily: 'var(--mono)' }}>
                <th style={{ padding: '10px 14px' }}>MÃ NV / HỌ TÊN</th>
                <th style={{ padding: '10px 14px' }}>CẤP BẬC</th>
                <th style={{ padding: '10px 14px' }}>ĐIỂM BÁN / PHÒNG BAN</th>
                <th style={{ padding: '10px 14px' }}>KỸ NĂNG</th>
                <th style={{ padding: '10px 14px' }}>TRẠNG THÁI</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((emp) => (
                <tr key={emp.employeeId} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                  <td style={{ padding: '12px 14px' }}>
                    <div style={{ fontWeight: 600, color: '#fff' }}>{emp.fullName}</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>{emp.employeeId}</div>
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    <span style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>{emp.level}</span>
                  </td>
                  <td style={{ padding: '12px 14px', color: 'var(--text-muted)' }}>
                    {emp.department}
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {emp.skills.slice(0, 3).map((sk, idx) => (
                        <span
                          key={idx}
                          style={{
                            fontSize: '10px',
                            background: 'rgba(255, 255, 255, 0.06)',
                            padding: '2px 6px',
                            borderRadius: '3px',
                            color: '#cbd5e1',
                          }}
                        >
                          {sk}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    <span style={{ color: emp.status === 'active' ? 'var(--emerald)' : 'var(--rose)', fontWeight: 600 }}>
                      ● {emp.status === 'active' ? 'Hoạt động' : 'Tạm dừng'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
