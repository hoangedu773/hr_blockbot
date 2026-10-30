import React, { useCallback, useEffect, useRef, useState } from 'react';

export interface WorkflowSectionProps {
  className?: string;
  diagramSrc?: string;
}

/**
 * The workflow block is deliberately static: the diagram inside the iframe runs
 * its own live loop, and animating the container on top of it would put two
 * moving things on one screen. The toolbar is the only thing that changes state.
 */
export const WorkflowSection: React.FC<WorkflowSectionProps> = ({
  className = '',
  diagramSrc = '/diagrams/chatbot-architecture.html',
}) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);

  // Sync postMessage communication with embedded diagram
  const postToDiagram = useCallback((message: { type: string; [key: string]: unknown }) => {
    if (iframeRef.current && iframeRef.current.contentWindow) {
      iframeRef.current.contentWindow.postMessage(message, '*');
    }
  }, []);

  const handleToggleMotion = useCallback(() => {
    postToDiagram({ type: 'TOGGLE_MOTION' });
    setIsPlaying((prev) => !prev);
  }, [postToDiagram]);

  const handleFitView = useCallback(() => {
    postToDiagram({ type: 'FIT_VIEW' });
  }, [postToDiagram]);

  const handleOpenFullscreen = useCallback(() => {
    const container = containerRef.current;
    if (container && typeof container.requestFullscreen === 'function') {
      container.requestFullscreen().catch(() => {
        window.open(diagramSrc, '_blank', 'noopener,noreferrer');
      });
    } else {
      window.open(diagramSrc, '_blank', 'noopener,noreferrer');
    }
  }, [diagramSrc]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (iframeRef.current && event.source !== iframeRef.current.contentWindow) return;
      const data = event.data;
      if (!data || typeof data !== 'object') return;

      if (data.type === 'DIAGRAM_MOTION_CHANGE') {
        if (typeof data.state === 'string') {
          setIsPlaying(data.state === 'play');
        }
      } else if (data.type === 'DIAGRAM_READY') {
        postToDiagram({ type: 'GET_STATE' });
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [postToDiagram]);

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

        <div ref={containerRef} className="workflow-diagram-card">
          <div className="workflow-toolbar">
            <span className="workflow-status-chip" data-state={isPlaying ? 'play' : 'paused'}>
              <span className="workflow-dot" aria-hidden="true" />
              <span className="workflow-status-text">
                {isPlaying ? 'Luồng tín hiệu: đang chạy liên tục (Live Loop)' : 'Luồng tín hiệu: đã tạm dừng'}
              </span>
            </span>

            <div className="workflow-actions">
              <button
                type="button"
                onClick={handleFitView}
                className="workflow-btn-fit"
                title="Khớp khung hình sơ đồ (Fit View)"
                aria-label="Khớp khung hình sơ đồ"
              >
                Khớp khung hình (Fit View)
              </button>

              <button
                type="button"
                onClick={handleToggleMotion}
                className="workflow-btn-toggle"
                data-state={isPlaying ? 'play' : 'paused'}
                title="Tạm dừng / Tiếp tục luồng tín hiệu (Space)"
                aria-label={isPlaying ? 'Tạm dừng luồng' : 'Tiếp tục luồng'}
              >
                <svg className="workflow-icon-pause" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M9 5v14M15 5v14" />
                </svg>
                <svg className="workflow-icon-play" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M7 4.5v15l13-7.5z" />
                </svg>
                <span className="workflow-toggle-text">{isPlaying ? 'Tạm dừng' : 'Tiếp tục'}</span>
              </button>

              <button
                type="button"
                onClick={handleOpenFullscreen}
                className="workflow-btn-fullscreen"
                title="Mở toàn màn hình hoặc tab mới"
                aria-label="Mở toàn màn hình mới"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M3 16v3a2 2 0 0 0 2 2h3" />
                </svg>
                <span>Mở toàn màn hình mới</span>
              </button>
            </div>
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
