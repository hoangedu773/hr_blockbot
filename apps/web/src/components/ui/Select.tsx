import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Select — the product's own listbox.
 *
 * The OS paints the popup of a native <select> and no CSS reaches it: on
 * Windows it is a grey menu, on macOS a white one. `appearance: none` only
 * restyles the closed box. This component replaces both halves.
 *
 * Deliberate limits, so nobody mistakes it for a general replacement:
 *   - single selection only (no `multiple`)
 *   - flat option list (no <optgroup>)
 *   - controlled value; it does not emit a form field
 *
 * Keyboard model follows the ARIA combobox/listbox pattern: focus stays on the
 * trigger, the active option is announced through aria-activedescendant, and
 * Tab leaves the widget instead of being trapped.
 */

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  id?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  disabled?: boolean;
  /** Rendered when no option matches `value`, and used as the empty-state label. */
  placeholder?: string;
  className?: string;
}

const MENU_MAX_HEIGHT = 280;
const MENU_MIN_HEIGHT = 160;
const TYPEAHEAD_RESET_MS = 500;

export const Select: React.FC<SelectProps> = ({
  value,
  onChange,
  options,
  id,
  disabled = false,
  placeholder = 'Chọn…',
  className,
  ...aria
}) => {
  const reactId = useId();
  const triggerId = id ?? `select-${reactId}`;
  const listboxId = `${triggerId}-listbox`;

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const typeahead = useRef({ buffer: '', at: 0 });

  const selectedIndex = useMemo(() => options.findIndex((o) => o.value === value), [options, value]);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;

  const enabledIndexes = useMemo(
    () => options.reduce<number[]>((acc, o, i) => (o.disabled ? acc : [...acc, i]), []),
    [options],
  );

  const position = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    const height = Math.min(MENU_MAX_HEIGHT, Math.max(MENU_MIN_HEIGHT, options.length * 38 + 8));
    const openUp = spaceBelow < height && r.top > spaceBelow;
    const top = openUp ? Math.max(8, r.top - height - 6) : r.bottom + 6;
    const width = r.width;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    setRect({ top, left, width });
  }, [options.length]);

  const openMenu = useCallback(() => {
    if (disabled) return;
    position();
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : enabledIndexes[0] ?? -1);
    setOpen(true);
  }, [disabled, position, selectedIndex, enabledIndexes]);

  const closeMenu = useCallback((refocus: boolean) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  }, []);

  const commit = useCallback(
    (index: number) => {
      const option = options[index];
      if (!option || option.disabled) return;
      onChange(option.value);
      closeMenu(true);
    },
    [options, onChange, closeMenu],
  );

  // Reposition on any scroll (capture catches scrolling containers) and resize.
  useEffect(() => {
    if (!open) return;
    const sync = () => position();
    window.addEventListener('scroll', sync, { capture: true, passive: true });
    window.addEventListener('resize', sync);
    return () => {
      window.removeEventListener('scroll', sync, { capture: true });
      window.removeEventListener('resize', sync);
    };
  }, [open, position]);

  // Focus deliberately stays on the trigger. The menu is portalled to the end of
  // <body>, so moving focus into it would put the listbox last in tab order and
  // Tab would wrap to the top of the page instead of leaving the widget. Screen
  // readers follow the active option through aria-activedescendant, which is the
  // documented combobox pattern.

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      closeMenu(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [open, closeMenu]);

  const move = useCallback(
    (delta: 1 | -1) => {
      if (!enabledIndexes.length) return;
      const current = enabledIndexes.indexOf(activeIndex);
      const next = current === -1
        ? (delta === 1 ? 0 : enabledIndexes.length - 1)
        : Math.min(enabledIndexes.length - 1, Math.max(0, current + delta));
      setActiveIndex(enabledIndexes[next]);
    },
    [activeIndex, enabledIndexes],
  );

  const onTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;

    if (!open) {
      switch (event.key) {
        case 'ArrowDown':
        case 'ArrowUp':
        case 'Enter':
        case ' ':
          event.preventDefault();
          openMenu();
          return;
        default:
          return;
      }
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        move(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        move(-1);
        break;
      case 'Home':
        event.preventDefault();
        setActiveIndex(enabledIndexes[0] ?? -1);
        break;
      case 'End':
        event.preventDefault();
        setActiveIndex(enabledIndexes[enabledIndexes.length - 1] ?? -1);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        commit(activeIndex);
        break;
      case 'Escape':
        event.preventDefault();
        closeMenu(false);
        break;
      case 'Tab':
        // No preventDefault: the browser moves focus on from the trigger, which
        // is exactly where the user expects to land next.
        closeMenu(false);
        break;
      default: {
        if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return;
        const now = Date.now();
        const state = typeahead.current;
        state.buffer = now - state.at > TYPEAHEAD_RESET_MS ? event.key : state.buffer + event.key;
        state.at = now;
        const needle = state.buffer.toLowerCase();
        const hit = options.findIndex((o, i) => !o.disabled && enabledIndexes.includes(i) && o.label.toLowerCase().startsWith(needle));
        if (hit >= 0) setActiveIndex(hit);
      }
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label={aria['aria-label']}
        aria-labelledby={aria['aria-labelledby']}
        disabled={disabled}
        data-placeholder={selected ? 'false' : 'true'}
        data-open={open ? 'true' : 'false'}
        className={className ? `select-trigger ${className}` : 'select-trigger'}
        onClick={() => (open ? closeMenu(false) : openMenu())}
        onKeyDown={onTriggerKeyDown}
      >
        <span className="select-trigger-label">{selected ? selected.label : placeholder}</span>
        <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && rect
        ? createPortal(
            <div
              ref={menuRef}
              id={listboxId}
              role="listbox"
              tabIndex={-1}
              aria-labelledby={aria['aria-labelledby']}
              aria-label={aria['aria-label']}
              aria-activedescendant={activeIndex >= 0 ? `${triggerId}-option-${activeIndex}` : undefined}
              className="select-menu"
              style={{ top: rect.top, left: rect.left, minWidth: rect.width }}
            >
              {options.map((option, index) => (
                <div
                  key={option.value}
                  id={`${triggerId}-option-${index}`}
                  role="option"
                  aria-selected={index === selectedIndex}
                  aria-disabled={option.disabled ? 'true' : undefined}
                  data-active={index === activeIndex ? 'true' : 'false'}
                  className="select-option"
                  onPointerEnter={() => !option.disabled && setActiveIndex(index)}
                  onPointerDown={(event) => {
                    // Commit on pointerdown so the menu closes before the click
                    // reaches anything underneath the cursor.
                    event.preventDefault();
                    commit(index);
                  }}
                >
                  <span>{option.label}</span>
                  {index === selectedIndex ? (
                    <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  ) : null}
                </div>
              ))}
            </div>,
            document.body,
          )
        : null}
    </>
  );
};
