import React, { useEffect, useRef, useState } from 'react';

/**
 * Tagline reveal — the page's one scroll-linked moment.
 *
 * Each word starts at opacity .3 and resolves in reading order as the block
 * enters the viewport. The stagger is driven by a per-word `--i` index and a
 * CSS transition on `opacity` only, so the work stays on the compositor and
 * the reduced-motion page renders the finished sentence immediately.
 *
 * `revealed` is set once and never reset: replaying a scroll reveal is the
 * "same fade on every block" tell this section exists to break.
 */
export const TAGLINE_COPY =
  'Một ca thiếu người không còn là cuộc gọi lúc 5 giờ sáng. Hệ thống đã biết trước bốn tiếng.';

export interface TaglineRevealProps {
  copy?: string;
  footnote?: string;
}

export const TaglineReveal: React.FC<TaglineRevealProps> = ({
  copy = TAGLINE_COPY,
  footnote = 'Cảnh báo thiếu người, gợi ý người thay ca và xác nhận của quản lý — tất cả trước giờ mở cửa.',
}) => {
  const sectionRef = useRef<HTMLElement>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    if (!('IntersectionObserver' in window)) {
      setRevealed(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          setRevealed(true);
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.1 },
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  const words = copy.split(' ');

  return (
    <section ref={sectionRef} className="tagline-section" aria-label="Điều hệ thống đã biết trước">
      <div className="tagline-inner">
        <p className="tagline-copy" data-revealed={revealed ? 'true' : 'false'}>
          {words.map((word, index) => (
            <React.Fragment key={`${word}-${index}`}>
              <span className="tagline-word" style={{ '--i': index } as React.CSSProperties}>
                {word}
              </span>
              {index < words.length - 1 ? ' ' : null}
            </React.Fragment>
          ))}
        </p>
        <p className="tagline-foot">{footnote}</p>
      </div>
    </section>
  );
};
