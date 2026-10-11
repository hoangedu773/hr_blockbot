import React, { useState, useEffect } from 'react';
import type { EmployeeDetail, ScheduleEntry } from '@hr-blockbot/contracts';
import { fetchMyProfile, fetchSchedules } from '../services/api';

interface EmployeeProfileViewProps {
  onLogout: () => void;
}

export const EmployeeProfileView: React.FC<EmployeeProfileViewProps> = ({ onLogout }) => {
  const [profile, setProfile] = useState<EmployeeDetail | null>(null);
  const [schedules, setSchedules] = useState<ScheduleEntry[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const p = await fetchMyProfile();
      setProfile(p);
      const sc = await fetchSchedules();
      // Lọc ca chỉ của riêng nhân sự này (Own only)
      const ownShifts = sc.filter(
        (s) =>
          s.employee_code === p.employeeCode ||
          s.employee_name.toLowerCase() === p.fullName.toLowerCase()
      );
      setSchedules(ownShifts);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi tải hồ sơ nhân sự';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  return (
    <div style={{ padding: '24px', maxWidth: '1000px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Banner */}
      <div
        style={{
          background: 'rgba(14, 20, 32, 0.85)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, rgba(0, 71, 186, 0.4), rgba(56, 189, 248, 0.2))',
              border: '1px solid #38bdf8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#38bdf8',
              fontSize: '20px',
              fontWeight: 800,
            }}
          >
            👤
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#fff' }}>
                {profile?.fullName || 'Hồ Sơ Nhân Viên'}
              </h2>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  fontFamily: 'var(--mono)',
                  color: '#38bdf8',
                  background: 'rgba(56, 189, 248, 0.12)',
                  border: '1px solid rgba(56, 189, 248, 0.3)',
                  padding: '2px 8px',
                  borderRadius: '12px',
                }}
              >
                ROLE: EMPLOYEE (OWN SCOPE)
              </span>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
              Mã NV: {profile?.employeeCode || '...'} • Điểm bán / Phòng ban: {profile?.department || '...'}
            </p>
          </div>
        </div>

        <button
          onClick={onLogout}
          style={{
            padding: '8px 16px',
            borderRadius: '6px',
            background: 'var(--surface)',
            color: 'var(--text-muted)',
            border: '1px solid var(--border)',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Đăng Xuất
        </button>
      </div>

      {/* Security Privacy Notice */}
      <div
        style={{
          background: 'rgba(16, 185, 129, 0.08)',
          border: '1px solid rgba(16, 185, 129, 0.25)',
          borderRadius: '8px',
          padding: '12px 16px',
          fontSize: '12px',
          color: '#a7f3d0',
          lineHeight: 1.5,
        }}
      >
        🔒 <strong>Bảo vệ dữ liệu cá nhân (Allowlist Only):</strong> Theo quy chuẩn kỹ thuật dự án, giao diện này chỉ hiển thị các trường được phép cho tài khoản cá nhân. Các trường nhạy cảm (CCCD, tài khoản ngân hàng, mức lương, lý do vắng việc) được máy chủ bảo vệ tuyệt đối.
      </div>

      {isLoading && (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '14px', marginBottom: '8px' }}>⏳ Đang tải dữ liệu hồ sơ cá nhân...</div>
          <div style={{ fontSize: '11px', color: 'var(--text-faint)', fontFamily: 'var(--mono)' }}>GET /api/auth/me & GET /api/employees/:id</div>
        </div>
      )}

      {error && !isLoading && (
        <div
          style={{
            padding: '24px',
            borderRadius: '8px',
            background: 'rgba(244, 63, 94, 0.1)',
            border: '1px solid rgba(244, 63, 94, 0.3)',
            textAlign: 'center',
          }}
        >
          <div style={{ color: '#fca5a5', fontWeight: 700, marginBottom: '8px' }}>
            ⚠️ Không thể kết nối hoặc tải dữ liệu hồ sơ
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginBottom: '14px' }}>
            {error}
          </p>
          <button
            onClick={loadData}
            className="btn btn-gold"
            style={{
              padding: '6px 16px',
              borderRadius: '6px',
              background: 'var(--guta-yellow)',
              color: '#07090e',
              border: 'none',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Thử Lại
          </button>
        </div>
      )}

      {!isLoading && profile && (
        <>
          {/* Profile Details Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '16px',
            }}
          >
            <div
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: '10px',
                padding: '18px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}
            >
              <h3 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--guta-yellow)', textTransform: 'uppercase' }}>
                Thông Tin Định Danh
              </h3>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Mã nhân viên:</span>
                <span style={{ color: '#fff', fontFamily: 'var(--mono)', fontWeight: 600 }}>{profile.employeeCode}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Cấp bậc chuyên môn:</span>
                <span style={{ color: 'var(--emerald)', fontWeight: 700 }}>{profile.level}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Trạng thái làm việc:</span>
                <span style={{ color: profile.status === 'active' ? 'var(--emerald)' : 'var(--rose)', fontWeight: 600 }}>
                  ● {profile.status === 'active' ? 'Đang hoạt động' : 'Tạm dừng'}
                </span>
              </div>
              {profile.phone && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Số điện thoại:</span>
                  <span style={{ color: '#fff', fontFamily: 'var(--mono)' }}>{profile.phone}</span>
                </div>
              )}
              {profile.hiredAt && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Ngày vào làm:</span>
                  <span style={{ color: '#fff', fontFamily: 'var(--mono)' }}>{profile.hiredAt}</span>
                </div>
              )}
            </div>

            <div
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: '10px',
                padding: '18px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}
            >
              <h3 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--guta-yellow)', textTransform: 'uppercase' }}>
                Chuyên Môn & Kỹ Năng
              </h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {profile.skills.length > 0 ? (
                  profile.skills.map((skill, idx) => (
                    <span
                      key={idx}
                      style={{
                        background: 'rgba(255, 209, 0, 0.1)',
                        border: '1px solid rgba(255, 209, 0, 0.25)',
                        color: 'var(--guta-yellow)',
                        fontSize: '11px',
                        padding: '3px 8px',
                        borderRadius: '4px',
                        fontWeight: 600,
                      }}
                    >
                      {skill}
                    </span>
                  ))
                ) : (
                  <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Chưa cập nhật kỹ năng</span>
                )}
              </div>
              <div style={{ marginTop: 'auto', paddingTop: '10px', borderTop: '1px solid var(--border)', fontSize: '11px', color: 'var(--text-muted)' }}>
                Tải công việc hiện tại (Active Load): <strong style={{ color: '#fff' }}>{profile.activeLoad ?? 0} đề tài</strong>
              </div>
            </div>
          </div>

          {/* Own Schedules Section */}
          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '10px',
              padding: '18px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}
          >
            <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#fff' }}>
              Lịch Ca Của Tôi (Own Schedules)
            </h3>

            {schedules.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                Hiện tại chưa có ca trực nào được phân bổ cho bạn trong tuần này.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {schedules.map((s, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: 'rgba(10, 13, 20, 0.8)',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      padding: '10px 14px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, color: '#fff' }}>
                        Ca {s.shift_code} • Khối {s.block_code}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
                        Ngày làm việc: {s.work_date}
                      </div>
                    </div>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        fontFamily: 'var(--mono)',
                        padding: '3px 8px',
                        borderRadius: '4px',
                        background: s.shift_code.startsWith('A') ? 'rgba(255, 209, 0, 0.15)' : 'rgba(56, 189, 248, 0.15)',
                        color: s.shift_code.startsWith('A') ? 'var(--guta-yellow)' : '#38bdf8',
                        border: `1px solid ${s.shift_code.startsWith('A') ? 'rgba(255, 209, 0, 0.3)' : 'rgba(56, 189, 248, 0.3)'}`,
                      }}
                    >
                      {s.shift_code.startsWith('A') ? '06:00 - 14:00' : '14:00 - 22:00'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
