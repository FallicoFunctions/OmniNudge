import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ConversationFolder } from '../../types/messages';

const FOLDER_COLORS: { hex: string; name: string }[] = [
  { hex: '#3b82f6', name: 'Blue' },
  { hex: '#10b981', name: 'Green' },
  { hex: '#f59e0b', name: 'Amber' },
  { hex: '#ef4444', name: 'Red' },
  { hex: '#8b5cf6', name: 'Purple' },
  { hex: '#ec4899', name: 'Pink' },
  { hex: '#06b6d4', name: 'Cyan' },
  { hex: '#f97316', name: 'Orange' },
];

const FOLDER_ICONS = ['📁', '⭐', '💼', '🏠', '🔖', '💡', '🎯', '🔥', '💬', '🤝', '📌', '🛡️'];
const MAX_NAME_LENGTH = 50;

interface FolderModalProps {
  folder?: ConversationFolder;
  onSave: (data: { name: string; color: string; icon: string }) => Promise<void>;
  onClose: () => void;
}

/**
 * Focus trap: Tab cycles only through elements that are genuinely in the tab order
 * (respects tabIndex=-1 used by roving-tabindex grids).
 */
function useFocusTrap(containerRef: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // S1 fix: exclude tabIndex=-1 from button/input clauses so roving-tabindex
    // grids are not visited by Tab — only the single tabIndex=0 grid entry is.
    const getFocusable = () =>
      Array.from(
        el.querySelectorAll<HTMLElement>(
          'button:not([disabled]):not([tabindex="-1"]), [href]:not([tabindex="-1"]), input:not([disabled]):not([tabindex="-1"]), select:not([disabled]):not([tabindex="-1"]), textarea:not([disabled]):not([tabindex="-1"]), [tabindex]:not([tabindex="-1"])'
        )
      );

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusable = getFocusable();
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    el.addEventListener('keydown', handleKeyDown);
    // Move focus inside on mount
    getFocusable()[0]?.focus();
    return () => el.removeEventListener('keydown', handleKeyDown);
  }, [containerRef]);
}

/**
 * Arrow key navigation for a flat grid with full wrapping (ARIA APG roving tabindex).
 * Uses a stable ref for `onNavigate` so the effect never re-runs due to an inline callback,
 * and skips disabled buttons in navigation.
 */
function useGridKeyNav(
  containerRef: React.RefObject<HTMLElement | null>,
  selector: string,
  cols: number,
  onNavigate: (el: HTMLElement) => void
) {
  // S1: hold latest callback in a ref — never in the dep array
  const onNavigateRef = useRef(onNavigate);
  useEffect(() => {
    onNavigateRef.current = onNavigate;
  });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      // M1: exclude disabled buttons from navigation
      const items = Array.from(el.querySelectorAll<HTMLElement>(`${selector}:not([disabled])`));
      const n = items.length;
      if (n === 0) return;
      const idx = items.indexOf(document.activeElement as HTMLElement);
      if (idx === -1) return;
      let next = -1;
      if (e.key === 'ArrowRight') next = (idx + 1) % n;
      else if (e.key === 'ArrowLeft') next = (idx - 1 + n) % n;
      else if (e.key === 'ArrowDown') next = idx + cols >= n ? idx % cols : idx + cols;
      else if (e.key === 'ArrowUp') next = idx - cols < 0 ? n - (cols - (idx % cols)) : idx - cols;
      if (next !== -1 && next !== idx) {
        e.preventDefault();
        items[next].focus();
        onNavigateRef.current(items[next]);
      }
    };
    el.addEventListener('keydown', handleKeyDown);
    return () => el.removeEventListener('keydown', handleKeyDown);
    // selector and cols are module-level constants — stable, intentionally omitted from deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef]);
}

export function FolderModal({ folder, onSave, onClose }: FolderModalProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(folder?.name ?? '');
  const [color, setColor] = useState(folder?.color ?? FOLDER_COLORS[0].hex);
  const [icon, setIcon] = useState(folder?.icon ?? FOLDER_ICONS[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const uid = useId();
  const titleId = `${uid}-title`;
  const nameInputId = `${uid}-name`;
  const nameErrorId = `${uid}-name-error`;
  const colorLabelId = `${uid}-color-label`;
  const iconLabelId = `${uid}-icon-label`;
  const containerRef = useRef<HTMLDivElement>(null);
  const colorGridRef = useRef<HTMLDivElement>(null);
  const iconGridRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const discardBtnRef = useRef<HTMLButtonElement | null>(null);

  // Capture the element that triggered the modal so focus can return on close
  useEffect(() => {
    triggerRef.current = document.activeElement as HTMLButtonElement;
  }, []);

  const isDirty =
    name !== (folder?.name ?? '') ||
    color !== (folder?.color ?? FOLDER_COLORS[0].hex) ||
    icon !== (folder?.icon ?? FOLDER_ICONS[0]);

  useFocusTrap(containerRef);
  // H1: Override useFocusTrap's default (first focusable = X button) — focus the name input instead
  useEffect(() => {
    nameInputRef.current?.focus();
  }, []);
  useGridKeyNav(colorGridRef, '[data-color-btn]', 8, (el) => {
    const hex = el.getAttribute('data-color-value');
    if (hex) setColor(hex);
  });
  useGridKeyNav(iconGridRef, '[data-icon-btn]', 6, (el) => {
    const ic = el.getAttribute('data-icon-value');
    if (ic) setIcon(ic);
  });

  // S2: Move focus to Discard button when the confirmation overlay appears
  useEffect(() => {
    if (confirmDiscard) {
      discardBtnRef.current?.focus();
    }
  }, [confirmDiscard]);

  // Restore focus on unmount
  useEffect(() => {
    return () => {
      triggerRef.current?.focus();
    };
  }, []);

  // Stable ref holds latest escape-handler state — effect never re-runs due to prop/state churn
  const escapeStateRef = useRef({ saving, isDirty, confirmDiscard, onClose });
  useEffect(() => {
    escapeStateRef.current = { saving, isDirty, confirmDiscard, onClose };
  });

  // Escape key: guard unsaved changes
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const { saving: s, isDirty: d, confirmDiscard: c, onClose: close } = escapeStateRef.current;
      if (s) return;
      if (d && !c) {
        e.preventDefault();
        setConfirmDiscard(true);
      } else {
        close();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []); // stable: all values read via ref

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    setError('');
    setConfirmDiscard(false);
    try {
      await onSave({ name: trimmed, color, icon });
      onClose();
    } catch {
      setError(t('messages.folders.saveError'));
      setSaving(false);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target !== e.currentTarget || saving) return;
    if (isDirty && !confirmDiscard) {
      setConfirmDiscard(true);
      return;
    }
    onClose();
  };

  const title = folder ? t('messages.folders.editFolder') : t('messages.folders.newFolder');
  const charsLeft = MAX_NAME_LENGTH - name.length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={handleBackdropClick}
    >
      <div
        ref={containerRef}
        className="w-full max-w-sm rounded-xl bg-[var(--color-surface)] p-6 shadow-xl"
      >
        {/* Discard confirmation overlay */}
        {confirmDiscard && (
          <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-50/80 p-3 dark:bg-amber-900/20">
            <p className="mb-2 text-sm font-medium text-amber-800 dark:text-amber-200">
              {t('messages.folders.discardChanges')}
            </p>
            <div className="flex gap-2">
              <button
                ref={discardBtnRef}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose();
                }}
                className="rounded-md bg-amber-600 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
              >
                {t('messages.folders.discard')}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmDiscard(false);
                  nameInputRef.current?.focus();
                }}
                className="rounded-md border border-[var(--color-border)] px-3 py-1 text-xs font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
              >
                {t('messages.folders.keepEditing')}
              </button>
            </div>
          </div>
        )}

        <div className="mb-4 flex items-center justify-between">
          <h2 id={titleId} className="text-base font-semibold text-[var(--color-text-primary)]">
            {title}
          </h2>
          <button
            type="button"
            onClick={() => {
              if (isDirty && !confirmDiscard) {
                setConfirmDiscard(true);
                return;
              }
              onClose();
            }}
            disabled={saving}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] disabled:opacity-40"
            aria-label={t('messages.folders.cancel')}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
              <path
                d="M2 2l10 10M12 2L2 12"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label
                htmlFor={nameInputId}
                className="text-xs font-semibold text-[var(--color-text-secondary)]"
              >
                {t('messages.folders.nameLabel')}
              </label>
              <span
                className={`text-[10px] tabular-nums ${charsLeft <= 10 ? 'text-[var(--color-error)]' : 'text-[var(--color-text-muted)]'}`}
                aria-live="polite"
              >
                {charsLeft}
              </span>
            </div>
            <input
              ref={nameInputRef}
              id={nameInputId}
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError('');
                if (confirmDiscard) setConfirmDiscard(false);
              }}
              placeholder={t('messages.folders.namePlaceholder')}
              maxLength={MAX_NAME_LENGTH}
              disabled={saving}
              aria-invalid={!!error}
              aria-describedby={error ? nameErrorId : undefined}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none disabled:opacity-60"
            />
            {error && (
              <p id={nameErrorId} className="mt-1 text-xs text-[var(--color-error)]">
                {error}
              </p>
            )}
          </div>

          {/* Color */}
          <div>
            <p
              id={colorLabelId}
              className="mb-2 text-xs font-semibold text-[var(--color-text-secondary)]"
            >
              {t('messages.folders.colorLabel')}
            </p>
            <div
              ref={colorGridRef}
              role="group"
              className="flex flex-wrap gap-2"
              aria-labelledby={colorLabelId}
            >
              {FOLDER_COLORS.map(({ hex, name: colorName }) => (
                <button
                  key={hex}
                  type="button"
                  data-color-btn
                  data-color-value={hex}
                  onClick={() => setColor(hex)}
                  disabled={saving}
                  aria-pressed={color === hex}
                  tabIndex={color === hex ? 0 : -1}
                  className="h-7 w-7 rounded-full transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--color-primary)] disabled:opacity-60"
                  style={{
                    backgroundColor: hex,
                    boxShadow:
                      color === hex
                        ? `0 0 0 3px ${hex}, 0 0 0 5px var(--color-surface)`
                        : undefined,
                  }}
                  aria-label={`${t('messages.folders.colorLabel')}: ${t(`messages.folders.color${colorName}`)}`}
                />
              ))}
            </div>
          </div>

          {/* Icon */}
          <div>
            <p
              id={iconLabelId}
              className="mb-2 text-xs font-semibold text-[var(--color-text-secondary)]"
            >
              {t('messages.folders.iconLabel')}
            </p>
            <div
              ref={iconGridRef}
              role="group"
              className="flex flex-wrap gap-1.5"
              aria-labelledby={iconLabelId}
            >
              {FOLDER_ICONS.map((ic) => (
                <button
                  key={ic}
                  type="button"
                  data-icon-btn
                  data-icon-value={ic}
                  onClick={() => setIcon(ic)}
                  disabled={saving}
                  aria-pressed={icon === ic}
                  tabIndex={icon === ic ? 0 : -1}
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-lg text-base transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] disabled:opacity-60 ${
                    icon === ic
                      ? 'bg-[var(--color-primary)]/15 ring-1 ring-[var(--color-primary)]'
                      : 'hover:scale-110 hover:bg-[var(--color-hover)]'
                  }`}
                  aria-label={`${t('messages.folders.iconLabel')}: ${ic}`}
                >
                  {ic}
                </button>
              ))}
            </div>
          </div>

          {/* Preview — purely visual; labelled as preview for AT, content aria-hidden */}
          <div
            aria-label={t('messages.folders.previewLabel', {
              name: name.trim() || t('messages.folders.namePlaceholder'),
            })}
            className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2"
          >
            <span
              className="inline-flex flex-shrink-0 items-center text-base leading-none"
              aria-hidden
            >
              {icon}
            </span>
            <span aria-hidden className="flex-1 truncate text-sm font-semibold" style={{ color }}>
              {name.trim() || t('messages.folders.namePlaceholder')}
            </span>
            <span aria-hidden className="flex-shrink-0 text-[10px] text-[var(--color-text-muted)]">
              {t('messages.folders.preview')}
            </span>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                if (isDirty && !confirmDiscard) {
                  setConfirmDiscard(true);
                  return;
                }
                onClose();
              }}
              disabled={saving}
              className="flex-1 rounded-lg border border-[var(--color-border)] py-2 text-sm font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] disabled:opacity-50"
            >
              {t('messages.folders.cancel')}
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="flex-1 rounded-lg bg-[var(--color-primary)] py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] disabled:opacity-50"
            >
              {saving ? (
                <span className="inline-flex items-center justify-center gap-1.5">
                  <svg
                    className="h-3.5 w-3.5 animate-spin"
                    viewBox="0 0 16 16"
                    fill="none"
                    aria-hidden
                  >
                    <circle
                      cx="8"
                      cy="8"
                      r="6"
                      stroke="white"
                      strokeWidth="2"
                      strokeDasharray="9.4 28.3"
                      strokeDashoffset="0"
                    />
                  </svg>
                  {t('messages.folders.save')}
                </span>
              ) : (
                t('messages.folders.save')
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
