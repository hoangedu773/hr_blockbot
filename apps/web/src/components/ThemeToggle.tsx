import React, { useCallback, useEffect, useState } from 'react';

/**
 * One theme control for the whole app.
 *
 * The landing already flipped `<html class="dark">` from its own nav; the
 * product shell had no control at all, so a signed-in user could not leave the
 * dark palette. Both now read and write the same class and the same stored
 * preference, which is why the state lives here rather than in either view.
 *
 * `index.html` applies the stored value before React mounts; this hook only
 * mirrors what is already on the document, so there is no first-paint flash.
 */
export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'guta-theme';

const readTheme = (): Theme =>
  typeof document !== 'undefined' && document.documentElement.classList.contains('dark') ? 'dark' : 'light';

const applyTheme = (theme: Theme) => {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.classList.toggle('light', theme === 'light');
  root.style.colorScheme = theme;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Private mode / blocked storage: the class still applies for this session.
  }
};

export const useTheme = (): [Theme, (next: Theme) => void] => {
  const [theme, setTheme] = useState<Theme>(readTheme);

  useEffect(() => {
    // Another tab may change the preference; keep the control honest.
    const onStorage = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY || !event.newValue) return;
      const next = event.newValue === 'light' ? 'light' : 'dark';
      document.documentElement.classList.toggle('dark', next === 'dark');
      document.documentElement.classList.toggle('light', next === 'light');
      setTheme(next);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const update = useCallback((next: Theme) => {
    applyTheme(next);
    setTheme(next);
  }, []);

  return [theme, update];
};

export interface ThemeToggleProps {
  className?: string;
}

/**
 * Two-state segmented control. Both buttons stay in the DOM and expose their
 * pressed state, so a screen reader announces the current choice instead of
 * only the action.
 */
export const ThemeToggle: React.FC<ThemeToggleProps> = ({ className }) => {
  const [theme, setTheme] = useTheme();

  return (
    <div
      className={className ? `theme-toggle ${className}` : 'theme-toggle'}
      role="group"
      aria-label="Chế độ hiển thị"
    >
      <button
        type="button"
        aria-label="Chế độ sáng"
        aria-pressed={theme === 'light'}
        title="Chuyển chế độ sáng"
        onClick={() => setTheme('light')}
      >
        <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
        </svg>
      </button>
      <button
        type="button"
        aria-label="Chế độ tối"
        aria-pressed={theme === 'dark'}
        title="Chuyển chế độ tối"
        onClick={() => setTheme('dark')}
      >
        <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
        </svg>
      </button>
    </div>
  );
};
