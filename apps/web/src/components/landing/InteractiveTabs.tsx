import React, { useState, useEffect } from 'react';

interface TabItem {
  id: string;
  title: string;
  tag: string;
  headline: string;
  description: string;
  bullets: string[];
  metrics: { label: string; value: string; delta: string }[];
}

const TABS_DATA: TabItem[] = [
  {
    id: 'overview',
    title: '1. Tổng Quan Chuỗi',
    tag: 'REALTIME COMMAND CENTER',
    headline: 'Bảng Điều Khiển Giám Sát Tập Trung 45 Cửa Hàng Guta',
    description: 'Theo dõi nhịp độ bán hàng và trạng thái đóng mở ca của 45 chi nhánh tại TP.HCM trên một màn hình duy nhất, giảm 80% thời gian gọi điện thoại kiểm tra từng cửa hàng.',
    bullets: [
      'Hiển thị tức thì 45/45 cửa hàng đang mở ca sáng đúng quy định.',
      'Định vị nhanh theo Quận (Q1, Q3, Q10, Bình Thạnh, Tân Bình, Phú Nhuận).',
      'Đánh giá tỷ lệ Barista có mặt đầu ca đạt chuẩn 98.6%.',
    ],
    metrics: [
      { label: 'Cửa hàng hoạt động', value: '45 / 45', delta: '100% Online' },
      { label: 'Nhân sự tại quầy', value: '348 NS', delta: 'Đủ biên chế' },
      { label: 'Tỷ lệ đúng giờ', value: '98.6%', delta: '+2.1% tuần này' },
    ],
  },
  {
    id: 'attendance',
    title: '2. Chấm Công & Đi Trễ',
    tag: 'BIOMETRIC INTEGRATION',
    headline: 'Đồng Bộ Máy Chấm Công Vân Tay & Phê Duyệt Giải Trình Số',
    description: 'Dữ liệu check-in/check-out từ máy quét vân tay ZKTeco tại quầy bar được đẩy lên server theo thời gian thực. Hệ thống tự nhận diện các ca đi trễ trên 15 phút.',
    bullets: [
      'Ghi nhận chính xác giây check-in vân tay đầu ca của Barista.',
      'Cơ chế nộp phiếu giải trình kèm minh chứng trực tiếp trên ứng dụng.',
      'Cửa Hàng Trưởng phê duyệt trực tiếp trong 1-Click không cần giấy tờ.',
    ],
    metrics: [
      { label: 'Check-in đúng giờ', value: '343 NS', delta: 'Đạt chuẩn F&B' },
      { label: 'Đi trễ cần giải trình', value: '5 ca', delta: 'Cần duyệt' },
      { label: 'Thời gian duyệt TB', value: '4.2 phút', delta: 'Nhanh hơn 90%' },
    ],
  },
  {
    id: 'ai-schedule',
    title: '3. Phân Ca Tự Động',
    tag: 'HEURISTIC ROSTER ENGINE',
    headline: 'Thuật Toán AI Tối Ưu Lịch Làm Việc & Cân Bằng Ca Trực',
    description: 'Tự động sắp xếp ca làm việc dựa trên lịch đăng ký rảnh của nhân sự Part-time và dự báo giờ cao điểm theo từng vị trí chi nhánh văn phòng hoặc mặt tiền.',
    bullets: [
      'Tự động xếp lịch 24H cho 45 cửa hàng trong vòng chưa đầy 15 giây.',
      'Đảm bảo mỗi ca trực có tối thiểu 1 Barista bậc B2 phụ trách pha chế chính.',
      'Cảnh báo sớm xung đột lịch học của sinh viên làm Part-time.',
    ],
    metrics: [
      { label: 'Tốc độ sinh ca', value: '12.4 giây', delta: 'Toàn hệ thống' },
      { label: 'Tỷ lệ trùng lịch', value: '0.0%', delta: 'Không xung đột' },
      { label: 'Độ hài lòng NS', value: '96.2%', delta: '+14% điểm NPS' },
    ],
  },
  {
    id: 'reports',
    title: '4. Báo Cáo & Quỹ Két',
    tag: 'AUDIT & COMPLIANCE',
    headline: 'Đối Soát Quỹ Tiền Mặt Bàn Giao Ca & Báo Cáo Vận Hành',
    description: 'Chấm dứt tình trạng thất thoát tiền két ca. Số tiền đầu ca và tiền mặt cuối ca được đối chiếu tự động với doanh số ghi nhận trên máy POS.',
    bullets: [
      'Biên bản bàn giao két ca số hóa có chữ ký xác nhận của 2 Barista.',
      'Tự động trừ thưởng chuyên cần nếu phát hiện thất thoát két vô cớ.',
      'Xuất báo cáo định dạng chuẩn CSV / Excel cho phòng Kế toán.',
    ],
    metrics: [
      { label: 'Độ chính xác két', value: '99.94%', delta: 'Khớp hoàn toàn' },
      { label: 'Doanh thu két sáng', value: '184.25M', delta: '+12.4% vs T6' },
      { label: 'Biên bản số hóa', value: '135 / 135', delta: '3 ca x 45 CH' },
    ],
  },
];

export const InteractiveTabs: React.FC = () => {
  const [activeTab, setActiveTab] = useState<number>(0);
  const [progress, setProgress] = useState<number>(0);
  const [isPaused, setIsPaused] = useState<boolean>(false);

  useEffect(() => {
    if (isPaused) return;

    const interval = setInterval(() => {
      setProgress((prev) => {
        // 50ms tick out of 6000ms total
        const next = prev + (50 / 6000) * 100;
        if (next >= 100) {
          setActiveTab((cur) => (cur + 1) % TABS_DATA.length);
          return 0;
        }
        return next;
      });
    }, 50);

    return () => clearInterval(interval);
  }, [isPaused]);

  const handleSelectTab = (index: number) => {
    setActiveTab(index);
    setProgress(0);
  };

  const currentItem = TABS_DATA[activeTab];

  return (
    <section
      id="tabs"
      style={{
        padding: '80px 24px',
        maxWidth: '1280px',
        margin: '0 auto',
      }}
    >
      <div style={{ textAlign: 'center', marginBottom: '40px' }}>
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
          QUY TRÌNH 4 BƯỚC KHÉP KÍN
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
          Khám Phá Chi Tiết Từng Module Vận Hành
        </h2>
        <p
          style={{
            fontSize: '15px',
            color: 'var(--text-secondary, #94a3b8)',
            maxWidth: '620px',
            margin: '12px auto 0',
          }}
        >
          Hệ thống tự động chuyển đổi mô phỏng sau mỗi 6 giây. Bạn có thể di chuột vào để dừng xem chi tiết.
        </p>
      </div>

      {/* Tabs Navigation Header */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '10px',
          marginBottom: '20px',
        }}
      >
        {TABS_DATA.map((tab, idx) => {
          const isActive = idx === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleSelectTab(idx)}
              style={{
                background: isActive ? 'rgba(37, 99, 235, 0.12)' : 'rgba(255, 255, 255, 0.03)',
                border: `1px solid ${isActive ? 'rgba(37, 99, 235, 0.4)' : 'rgba(255, 255, 255, 0.08)'}`,
                borderRadius: '10px',
                padding: '14px 16px',
                textAlign: 'left',
                cursor: 'pointer',
                position: 'relative',
                overflow: 'hidden',
                transition: 'all 160ms ease',
              }}
            >
              <div
                style={{
                  fontSize: '13px',
                  fontWeight: 700,
                  color: isActive ? '#f8fafc' : '#94a3b8',
                }}
              >
                {tab.title}
              </div>

              {/* Progress bar under active tab */}
              {isActive && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    height: '3px',
                    width: `${progress}%`,
                    background: 'linear-gradient(90deg, #2563eb, #60a5fa)',
                    transition: 'width 50ms linear',
                  }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Main Tab Content Card with Pause on Hover */}
      <div
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        style={{
          background: 'rgba(15, 23, 42, 0.85)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '16px',
          padding: '36px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '32px',
          alignItems: 'center',
          backdropFilter: 'blur(16px)',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.4)',
        }}
      >
        {/* Left Column: Descriptions & Bullets */}
        <div>
          <div
            style={{
              display: 'inline-block',
              fontSize: '11px',
              fontFamily: 'var(--mono)',
              fontWeight: 700,
              color: '#3b82f6',
              background: 'rgba(37, 99, 235, 0.15)',
              padding: '2px 8px',
              borderRadius: '4px',
              marginBottom: '12px',
            }}
          >
            {currentItem.tag}
          </div>

          <h3
            style={{
              fontSize: '22px',
              fontWeight: 800,
              color: '#f8fafc',
              lineHeight: 1.3,
              marginBottom: '14px',
            }}
          >
            {currentItem.headline}
          </h3>

          <p
            style={{
              fontSize: '14px',
              color: '#94a3b8',
              lineHeight: 1.6,
              marginBottom: '20px',
            }}
          >
            {currentItem.description}
          </p>

          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            {currentItem.bullets.map((b, i) => (
              <li
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                  fontSize: '13px',
                  color: '#cbd5e1',
                }}
              >
                <span style={{ color: '#10b981', fontWeight: 700 }}>✓</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Right Column: Metric Showcase Box */}
        <div
          style={{
            background: 'rgba(9, 13, 22, 0.75)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '12px',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          <div
            style={{
              fontSize: '11px',
              fontFamily: 'var(--mono)',
              color: '#64748b',
              borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
              paddingBottom: '10px',
            }}
          >
            METRIC SNAPSHOT • {currentItem.id.toUpperCase()}
          </div>

          {currentItem.metrics.map((m, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                background: 'rgba(255, 255, 255, 0.03)',
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.04)',
              }}
            >
              <div>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>{m.label}</div>
                <div style={{ fontSize: '18px', fontWeight: 800, fontFamily: 'var(--mono)', color: '#f8fafc' }}>
                  {m.value}
                </div>
              </div>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  fontFamily: 'var(--mono)',
                  color: '#34d399',
                  background: 'rgba(16, 185, 129, 0.12)',
                  padding: '3px 8px',
                  borderRadius: '9999px',
                }}
              >
                {m.delta}
              </span>
            </div>
          ))}

          <div
            style={{
              fontSize: '11px',
              color: '#64748b',
              textAlign: 'center',
              marginTop: '4px',
            }}
          >
            {isPaused ? '⏸ Đã tạm dừng chuyển tab' : '▶ Đang tự động chuyển sau 6s'}
          </div>
        </div>
      </div>
    </section>
  );
};
