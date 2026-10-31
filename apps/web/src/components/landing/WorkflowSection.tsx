import React, { useEffect, useRef, useState } from 'react';

export interface WorkflowSectionProps {
  className?: string;
  diagramSrc?: string;
}

/**
 * The workflow block is deliberately static: the diagram inside the iframe runs
 * its own live loop, and animating the container on top of it would put two
 * moving things on one screen. The chip mirrors the diagram's reported state;
 * the only control opens the diagram in its own tab.
 */
export const WorkflowSection: React.FC<WorkflowSectionProps> = ({
  className = '',
  diagramSrc = '/diagrams/chatbot-architecture.html',
}) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);

  // The diagram owns its own controls; this block only mirrors the reported
  // state so the chip copy never claims a loop that is not running.
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (iframeRef.current && event.source !== iframeRef.current.contentWindow) return;
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'DIAGRAM_MOTION_CHANGE' && typeof data.state === 'string') {
        setIsPlaying(data.state === 'play');
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  return (
    <section className={`folio-section ${className}`} id="solution">
      <div className="guta-container">
        <header className="guta-section-head">
          <span className="guta-label">Kiến trúc &amp; luồng xử lý agentic</span>
          <h2>Luồng Vận Hành Tự Động 24/7</h2>
          <p>
            Hệ thống tự động điều phối luồng hội thoại từ Ingress (Zalo, Telegram, Web), qua Bộ lọc Fast Rule Gate,
            Phân loại Jev AI, Vòng lặp Agent đến Gemini 3.8 Flash và Cổng xác thực con người 2 bước.
          </p>
        </header>

        <div className="workflow-diagram-card">
          <div className="workflow-toolbar">
            <span className="workflow-status-chip" data-state={isPlaying ? 'play' : 'paused'}>
              <span className="workflow-dot" aria-hidden="true" />
              <span className="workflow-status-text">
                {isPlaying ? 'Luồng tín hiệu: đang chạy liên tục (Live Loop)' : 'Luồng tín hiệu: đã tạm dừng'}
              </span>
            </span>

            <a
              href={diagramSrc}
              target="_blank"
              rel="noopener noreferrer"
              className="workflow-btn-fullscreen"
              title="Mở sơ đồ ở tab mới"
              aria-label="Mở sơ đồ ở tab mới"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M3 16v3a2 2 0 0 0 2 2h3" />
              </svg>
              <span>Mở tab mới</span>
            </a>
          </div>

          <div className="workflow-iframe-wrapper">
            <iframe
              ref={iframeRef}
              id="workflow-diagram-iframe"
              src={diagramSrc}
              title="HR BlockBot - Chatbot &amp; Agentic Architecture"
              className="workflow-iframe"
              loading="lazy"
              allow="fullscreen"
            />
          </div>
        </div>
      </div>
    </section>
  );
};
