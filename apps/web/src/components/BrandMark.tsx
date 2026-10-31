import React, { useEffect, useState } from 'react';

/**
 * The mark is a single-path glyph painted `currentColor`, which resolves to
 * black inside an `<img>` sandbox and disappears on every dark ground this
 * product uses. Two pre-painted assets replace the old `filter: invert()`
 * hacks — a filter forced each consumer to repeat the same magic value and
 * silently produced an invisible mark wherever it was forgotten.
 *
 * The theme is read synchronously during render, so the first painted frame is
 * already the right glyph: no black logo flash on the dark splash. The landing's
 * toggle flips `<html class>` imperatively, hence the attribute observer.
 */
const MARK_WHITE = '/assets/logos/guta-mark-white.svg';
const MARK_INK = '/assets/logos/guta-mark-ink.svg';

const isDarkDocument = () =>
  typeof document !== 'undefined' && document.documentElement.classList.contains('dark');

export interface BrandMarkProps {
  /** Accessible name. Pass `''` when the mark repeats a visible wordmark. */
  alt?: string;
  className?: string;
  /** Pins the variant for grounds that stay dark in both themes (the splash). */
  tone?: 'auto' | 'dark' | 'light';
  width?: number | string;
  height?: number | string;
  style?: React.CSSProperties;
  fetchPriority?: 'high' | 'low' | 'auto';
}

export const BrandMark: React.FC<BrandMarkProps> = ({
  alt = '',
  className,
  tone = 'auto',
  width,
  height,
  style,
  fetchPriority,
}) => {
  const [dark, setDark] = useState(isDarkDocument);

  useEffect(() => {
    if (tone !== 'auto') return;
    const sync = () => setDark(isDarkDocument());
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, [tone]);

  const useWhite = tone === 'dark' || (tone === 'auto' && dark);

  return (
    <img
      src={useWhite ? MARK_WHITE : MARK_INK}
      alt={alt}
      className={className}
      width={width}
      height={height}
      style={style}
      decoding="async"
      fetchPriority={fetchPriority}
      draggable={false}
    />
  );
};
