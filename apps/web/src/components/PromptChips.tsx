import React from 'react';

interface PromptChipsProps {
  onSelectPrompt: (promptText: string) => void;
}

export const PromptChips: React.FC<PromptChipsProps> = ({ onSelectPrompt }) => {
  const chips = [
    { label: '⚡ Tìm 2 bạn Pha chế rảnh ca sáng mai', text: 'Tìm 2 bạn Pha chế rảnh ca sáng mai tại các quán lân cận' },
    { label: '📋 Duyệt nhanh 7 phiếu công tồn', text: 'Duyệt nhanh toàn bộ phiếu giải trình công hợp lệ kỳ 6/5 - 5/6' },
    { label: '💰 Đối soát két ca 1B Nguyễn Kiệm', text: 'Đối soát quỹ két tiền mặt ca gần nhất tại chi nhánh 1B Nguyễn Kiệm' },
    { label: '📖 Tra quy chế quên vân tay', text: 'Quy định quên quẹt vân tay phạt thế nào và hạn chót nộp giải trình là ngày mấy?' }
  ];

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      overflowX: 'auto',
      paddingBottom: '2px',
      scrollbarWidth: 'none'
    }}>
      <span style={{
        fontSize: '11px',
        fontWeight: 700,
        color: 'var(--text-faint)',
        textTransform: 'uppercase',
        fontFamily: 'var(--mono)',
        flexShrink: 0
      }}>
        AI Gợi Ý:
      </span>

      {chips.map((chip, idx) => (
        <button
          key={idx}
          onClick={() => onSelectPrompt(chip.text)}
          style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid var(--border)',
            padding: '5px 12px',
            borderRadius: '999px',
            fontSize: '11px',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            transition: 'all 120ms ease',
            flexShrink: 0
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255, 209, 0, 0.08)';
            e.currentTarget.style.color = 'var(--guta-yellow)';
            e.currentTarget.style.borderColor = 'rgba(255, 209, 0, 0.3)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
            e.currentTarget.style.color = 'var(--text-muted)';
            e.currentTarget.style.borderColor = 'var(--border)';
          }}
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
};
