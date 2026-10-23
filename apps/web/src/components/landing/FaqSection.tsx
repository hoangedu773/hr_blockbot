import React, { useState } from 'react';

interface FaqItem {
  question: string;
  answer: string;
}

const FAQS: FaqItem[] = [
  {
    question: '1. Guta Workspace khác gì so với các phần mềm HRM thông thường?',
    answer: 'Guta Workspace được thiết kế chuyên biệt cho ngành F&B chuỗi nhịp độ cao. Thay vì các quy trình hành chính rườm rà, hệ thống tập trung vào phân ca theo giờ, nhận diện Barista B1/B2 theo quầy pha chế, đối soát két ca và cảnh báo thiếu người trực tiếp qua Telegram trong chưa đầy 1 phút.',
  },
  {
    question: '2. Dữ liệu máy chấm công vân tay được đồng bộ như thế nào?',
    answer: 'Hệ thống tích hợp trực tiếp với máy quét vân tay ZKTeco tại 45 chi nhánh thông qua API WebSocket. Ngay khi Barista đặt ngón tay check-in, trạng thái ca trực trên CRM Dashboard sẽ chuyển từ chờ sang "Đúng giờ" hoặc gắn cờ "Đi trễ" tự động.',
  },
  {
    question: '3. Cửa Hàng Trưởng (SM) có thể đổi ca khẩn cấp khi có nhân sự ốm đột xuất không?',
    answer: 'Có. SM có quyền kích hoạt chế độ "Đổi ca khẩn cấp" trên Dashboard. Hệ thống sẽ gợi ý danh sách các Barista Part-time đang rảnh trong khu vực bán kính 2km và gửi tin nhắn yêu cầu nhận ca qua Telegram Bot.',
  },
  {
    question: '4. Hệ thống xử lý thế nào khi Barista đi trễ hoặc vắng mặt không báo trước?',
    answer: 'Nếu sau 15 phút mở ca Barista chưa quét vân tay, hệ thống tự động ghi nhận phiếu vi phạm ca trực và gửi thông báo khẩn cấp tới Cửa Hàng Trưởng và Quản Lý Vùng (AOM) để kịp thời bố trí người thay thế.',
  },
  {
    question: '5. Đối soát tiền két ca trực tiếp trên ứng dụng có đảm bảo minh bạch?',
    answer: 'Toàn bộ dữ liệu tiền mặt đầu ca, doanh thu POS phát sinh và tiền thực tế bàn giao cuối ca đều được lưu vết immutable. Khi có chênh lệch trên 50.000 ₫, biên bản giải trình bắt buộc phải có xác nhận số của cả 2 Barista giao nhận ca.',
  },
  {
    question: '6. Làm thế nào để phân quyền giữa Cửa Hàng Trưởng (SM), Quản Lý Vùng (AOM) và Ban Giám Đốc?',
    answer: 'Hệ thống áp dụng mô hình phân quyền chặt chẽ (RBAC). SM chỉ thấy và thao tác trong phạm vi chi nhánh được giao; AOM quản lý cụm 10-15 cửa hàng trong quận; Admin/Ban Điều Hành có toàn quyền xem số liệu 45 cửa hàng, cấu hình định biên và xuất báo cáo tài chính.',
  },
];

export const FaqSection: React.FC = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggle = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <section
      id="faq"
      style={{
        padding: '80px 24px 100px',
        maxWidth: '860px',
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
          HỎI ĐÁP VẬN HÀNH
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
          Câu Hỏi Thường Gặp Về Guta Workspace
        </h2>
        <p
          style={{
            fontSize: '15px',
            color: 'var(--text-secondary, #94a3b8)',
            marginTop: '10px',
          }}
        >
          Tất cả những điều bạn cần biết về quy chuẩn kỹ thuật và quy trình vận hành chuỗi.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {FAQS.map((faq, index) => {
          const isOpen = openIndex === index;
          return (
            <div
              key={index}
              style={{
                background: 'rgba(15, 23, 42, 0.75)',
                border: `1px solid ${isOpen ? 'rgba(37, 99, 235, 0.4)' : 'rgba(255, 255, 255, 0.08)'}`,
                borderRadius: '12px',
                overflow: 'hidden',
                transition: 'border-color 160ms ease, background 160ms ease',
              }}
            >
              <button
                type="button"
                onClick={() => toggle(index)}
                style={{
                  width: '100%',
                  padding: '18px 22px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '16px',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-primary, #f8fafc)',
                  fontSize: '15px',
                  fontWeight: 700,
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <span>{faq.question}</span>
                <span
                  style={{
                    fontSize: '18px',
                    color: isOpen ? '#3b82f6' : '#64748b',
                    transform: isOpen ? 'rotate(45deg)' : 'rotate(0deg)',
                    transition: 'transform 200ms ease, color 200ms ease',
                  }}
                >
                  +
                </span>
              </button>

              {isOpen && (
                <div
                  style={{
                    padding: '0 22px 18px',
                    color: 'var(--text-secondary, #94a3b8)',
                    fontSize: '13px',
                    lineHeight: 1.65,
                    borderTop: '1px solid rgba(255, 255, 255, 0.04)',
                    paddingTop: '14px',
                  }}
                >
                  {faq.answer}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};
