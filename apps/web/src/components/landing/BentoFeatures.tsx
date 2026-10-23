import React from 'react';

export const BentoFeatures: React.FC = () => {
  return (
    <section
      id="features"
      style={{
        padding: '80px 24px',
        maxWidth: '1280px',
        margin: '0 auto',
      }}
    >
      <div style={{ textAlign: 'center', marginBottom: '48px' }}>
        <span
          style={{
            fontSize: '11px',
            fontFamily: 'var(--mono)',
            fontWeight: 700,
            color: '#3b82f6',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
          }}
        >
          ĐẶC TẢ TÍNH NĂNG VẬN HÀNH
        </span>
        <h2
          style={{
            fontSize: 'clamp(26px, 3.5vw, 40px)',
            fontWeight: 800,
            color: 'var(--text-primary, #f8fafc)',
            marginTop: '8px',
            letterSpacing: '-0.02em',
          }}
        >
          Bento Grid Kiến Trúc Vận Hành F&amp;B Tinh Gọn
        </h2>
        <p
          style={{
            fontSize: '15px',
            color: 'var(--text-secondary, #94a3b8)',
            maxWidth: '620px',
            margin: '12px auto 0',
          }}
        >
          Mọi dữ liệu từ quầy Barista đến phòng điều hành đều được số hóa, chuẩn hóa và bảo vệ bằng mô hình RBAC theo ca trực.
        </p>
      </div>

      {/* Grid 4 Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '20px',
        }}
      >
        {/* Card 1: Dữ liệu ca trực & Két tiền (Large span) */}
        <div
          style={{
            gridColumn: 'span 1',
            background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.9) 0%, rgba(9, 13, 22, 0.9) 100%)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '16px',
            padding: '28px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            position: 'relative',
            overflow: 'hidden',
            transition: 'border-color 200ms ease, transform 200ms ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'rgba(37, 99, 235, 0.4)';
            e.currentTarget.style.transform = 'translateY(-3px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          <div>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: 'rgba(37, 99, 235, 0.15)',
                border: '1px solid rgba(37, 99, 235, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#3b82f6',
                fontSize: '18px',
                marginBottom: '16px',
              }}
            >
              📊
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#f8fafc', marginBottom: '8px' }}>
              Dữ Liệu Ca &amp; Đối Soát Két Tiền
            </h3>
            <p style={{ fontSize: '13px', color: '#94a3b8', lineHeight: 1.6 }}>
              Kiểm soát số tiền mặt bàn giao giữa các ca sáng - chiều - tối. Cảnh báo chênh lệch két trên 50.000 ₫ và tự động lập biên bản giải trình số.
            </p>
          </div>

          <div
            style={{
              marginTop: '24px',
              padding: '14px',
              borderRadius: '10px',
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#94a3b8', marginBottom: '6px' }}>
              <span>BÀN GIAO CA SÁNG → CHIỀU</span>
              <span style={{ color: '#10b981', fontWeight: 700 }}>KHỚP 100%</span>
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '16px', fontWeight: 700, color: '#f8fafc' }}>
              8.420.000 ₫
            </div>
          </div>
        </div>

        {/* Card 2: AI Copilot & Quyết định phân ca */}
        <div
          style={{
            gridColumn: 'span 1',
            background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.9) 0%, rgba(9, 13, 22, 0.9) 100%)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '16px',
            padding: '28px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            position: 'relative',
            overflow: 'hidden',
            transition: 'border-color 200ms ease, transform 200ms ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'rgba(37, 99, 235, 0.4)';
            e.currentTarget.style.transform = 'translateY(-3px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          <div>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: 'rgba(37, 99, 235, 0.15)',
                border: '1px solid rgba(37, 99, 235, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#3b82f6',
                fontSize: '18px',
                marginBottom: '16px',
              }}
            >
              ✨
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#f8fafc', marginBottom: '8px' }}>
              Guta AI Copilot Tối Ưu Ca Trực
            </h3>
            <p style={{ fontSize: '13px', color: '#94a3b8', lineHeight: 1.6 }}>
              Dự báo nhu cầu khách hàng theo giờ cao điểm khu văn phòng, đề xuất điều chuyển Barista part-time giữa các chi nhánh gần nhau dưới 2km.
            </p>
          </div>

          <div
            style={{
              marginTop: '24px',
              padding: '12px 14px',
              borderRadius: '10px',
              background: 'rgba(37, 99, 235, 0.08)',
              border: '1px solid rgba(37, 99, 235, 0.25)',
              fontSize: '12px',
              color: '#93c5fd',
              lineHeight: 1.5,
            }}
          >
            💬 <em>"Đề xuất bổ sung 1 Barista hỗ trợ máy tại CH Sư Vạn Hạnh từ 11:30 - 13:00 do lưu lượng order online tăng 35%."</em>
          </div>
        </div>

        {/* Card 3: Visual Timeline 24H */}
        <div
          style={{
            gridColumn: 'span 1',
            background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.9) 0%, rgba(9, 13, 22, 0.9) 100%)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '16px',
            padding: '28px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            position: 'relative',
            overflow: 'hidden',
            transition: 'border-color 200ms ease, transform 200ms ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'rgba(37, 99, 235, 0.4)';
            e.currentTarget.style.transform = 'translateY(-3px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          <div>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: 'rgba(37, 99, 235, 0.15)',
                border: '1px solid rgba(37, 99, 235, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#3b82f6',
                fontSize: '18px',
                marginBottom: '16px',
              }}
            >
              ⏱
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#f8fafc', marginBottom: '8px' }}>
              Lịch Trình Phân Ca 24H Trực Quan
            </h3>
            <p style={{ fontSize: '13px', color: '#94a3b8', lineHeight: 1.6 }}>
              Bản đồ timeline phân chia ca sáng, trưa, tối. Trực quan hóa khoảng trống giờ vắng người và cảnh báo xung đột giờ làm việc của nhân sự.
            </p>
          </div>

          <div
            style={{
              marginTop: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '10px', fontFamily: 'var(--mono)', color: '#64748b', width: '50px' }}>CA 1</span>
              <div style={{ flex: 1, height: '8px', borderRadius: '4px', background: '#3b82f6' }} />
              <span style={{ fontSize: '10px', color: '#cbd5e1' }}>06:00 - 14:00</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '10px', fontFamily: 'var(--mono)', color: '#64748b', width: '50px' }}>CA 2</span>
              <div style={{ flex: 1, height: '8px', borderRadius: '4px', background: '#2563eb' }} />
              <span style={{ fontSize: '10px', color: '#cbd5e1' }}>14:00 - 22:00</span>
            </div>
          </div>
        </div>

        {/* Card 4: Thẻ nhân sự xếp tầng cascade 3D */}
        <div
          style={{
            gridColumn: 'span 1',
            background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.9) 0%, rgba(9, 13, 22, 0.9) 100%)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '16px',
            padding: '28px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            position: 'relative',
            overflow: 'hidden',
            transition: 'border-color 200ms ease, transform 200ms ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'rgba(37, 99, 235, 0.4)';
            e.currentTarget.style.transform = 'translateY(-3px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          <div>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: 'rgba(37, 99, 235, 0.15)',
                border: '1px solid rgba(37, 99, 235, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#3b82f6',
                fontSize: '18px',
                marginBottom: '16px',
              }}
            >
              👥
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#f8fafc', marginBottom: '8px' }}>
              Hồ Sơ Nhân Sự &amp; Kỹ Năng Barista
            </h3>
            <p style={{ fontSize: '13px', color: '#94a3b8', lineHeight: 1.6 }}>
              Phân cấp B1, B2, Cửa Hàng Trưởng. Đánh giá tay nghề Espresso, Latte Art, Vận hành máy pha La Marzocco và thái độ phục vụ khách hàng.
            </p>
          </div>

          <div
            style={{
              marginTop: '24px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            {['Phương Anh (SM)', 'Quốc Thái (B2)', 'Kim Ngân (B1)'].map((name, i) => (
              <span
                key={name}
                style={{
                  fontSize: '11px',
                  padding: '4px 8px',
                  borderRadius: '6px',
                  background: i === 0 ? 'rgba(37, 99, 235, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                  border: `1px solid ${i === 0 ? 'rgba(37, 99, 235, 0.4)' : 'rgba(255, 255, 255, 0.08)'}`,
                  color: i === 0 ? '#93c5fd' : '#cbd5e1',
                  fontFamily: 'var(--mono)',
                }}
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
