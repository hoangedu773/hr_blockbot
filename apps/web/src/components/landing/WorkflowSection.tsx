import React, { useCallback, useEffect, useRef, useState } from 'react';

export interface WorkflowSectionProps {
  className?: string;
  diagramSrc?: string;
}

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
    <section className={`py-20 md:py-28 relative ${className}`} id="solution">
      <div className="guta-container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
        <header className="guta-section-head text-center max-w-3xl mx-auto mb-10">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold tracking-wider uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 mb-3">
            KIẾN TRÚC &amp; LUỒNG XỬ LÝ AGENTIC
          </span>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-foreground">
            Luồng Vận Hành Tự Động 24/7
          </h2>
          <p className="mt-4 text-base sm:text-lg text-muted-foreground leading-relaxed">
            Hệ thống tự động điều phối luồng hội thoại từ Ingress (Zalo, Telegram, Web), qua Bộ lọc Fast Rule Gate,
            Phân loại Jev AI, Vòng lặp Agent đến Gemini 3.8 Flash và Cổng xác thực con người 2 bước.
          </p>
        </header>

        <div
          ref={containerRef}
          className="workflow-diagram-card relative border border-emerald-500/20 bg-background/80 backdrop-blur-md rounded-2xl overflow-hidden shadow-2xl shadow-emerald-950/20 transition-all duration-300 hover:border-emerald-500/35"
        >
          {/* Frosted Toolbar Header */}
          <div className="workflow-toolbar flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 bg-emerald-950/40 border-b border-emerald-500/20 backdrop-blur-lg">
            <div className="flex items-center gap-2">
              <span
                className={`workflow-status-chip inline-flex items-center gap-2 px-3 py-1 text-xs font-semibold rounded-full transition-all duration-200 ${
                  isPlaying
                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                    : 'bg-muted/40 text-muted-foreground border border-border'
                }`}
              >
                {isPlaying ? (
                  <>
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    <span className="workflow-status-text">🟢 Luồng tín hiệu: Đang chạy liên tục (Live Loop)</span>
                  </>
                ) : (
                  <>
                    <span className="h-2 w-2 rounded-full bg-slate-400"></span>
                    <span className="workflow-status-text">⏸ Luồng tín hiệu: Đã tạm dừng</span>
                  </>
                )}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleFitView}
                className="workflow-btn-fit px-3 py-1.5 text-xs font-medium rounded-lg border border-emerald-500/30 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/50 hover:text-emerald-100 transition-colors cursor-pointer"
                title="Khớp khung hình sơ đồ (Fit View)"
                aria-label="Khớp khung hình sơ đồ"
              >
                Khớp khung hình (Fit View)
              </button>

              <button
                type="button"
                onClick={handleToggleMotion}
                className="workflow-btn-toggle px-3 py-1.5 text-xs font-medium rounded-lg border border-emerald-500/30 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/50 hover:text-emerald-100 transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                title="Tạm dừng / Tiếp tục luồng tín hiệu (Space)"
                aria-label={isPlaying ? 'Tạm dừng luồng' : 'Tiếp tục luồng'}
              >
                <span className="workflow-toggle-icon">{isPlaying ? '⏸' : '▶'}</span>
                <span className="workflow-toggle-text">{isPlaying ? 'Tạm dừng' : 'Tiếp tục'}</span>
              </button>

              <button
                type="button"
                onClick={handleOpenFullscreen}
                className="workflow-btn-fullscreen px-3 py-1.5 text-xs font-medium rounded-lg border border-emerald-500/30 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/50 hover:text-emerald-100 transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                title="Mở toàn màn hình hoặc tab mới"
                aria-label="Mở toàn màn hình mới"
              >
                <span>⛶</span>
                <span>Mở toàn màn hình mới</span>
              </button>
            </div>
          </div>

          {/* Diagram iframe viewport */}
          <div className="workflow-iframe-wrapper relative w-full h-[480px] sm:h-[560px] lg:h-[680px] bg-[#021a16] overflow-hidden">
            <iframe
              ref={iframeRef}
              id="workflow-diagram-iframe"
              src={diagramSrc}
              title="HR BlockBot - Chatbot &amp; Agentic Architecture"
              className="w-full h-full border-0 block"
              loading="lazy"
              allow="fullscreen"
            />
          </div>
        </div>
      </div>
    </section>
  );
};
