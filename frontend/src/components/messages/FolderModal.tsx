import { useEffect, useRef, useState } from 'react';
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

/** Focus trap: tab cycles within `containerRef`. */
function useFocusTrap(containerRef: React.RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const el = containerRef.current;
    if (!el) return;

    const getFocusable = () =>
      Array.from(
        el.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusable = getFocusable();
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };

    el.addEventListener('keydown', handleKeyDown);
    // Move focus inside on mount
    const focusable = getFocusable();
    focusable[0]?.focus();
    return () => el.removeEventListener('keydown', handleKeyDown);
  }, [active, containerRef]);
}

/** Arrow key navigation for a flat grid of buttons. */
function useGridKeyNav(
  containerRef: React.RefObject<HTMLElement | null>,
  selector: string,
  cols: number,
) {
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const items = Array.from(el.querySelectorAll<HTMLElement>(selector));
      const idx = items.indexOf(document.activeElement as HTMLElement);
      if (idx === -1) return;
      let next = -1;
      if (e.key === 'ArrowRight') next = Math.min(idx + 1, items.length - 1);
      else if (e.key === 'ArrowLeft') next = Math.max(idx - 1, 0);
      else if (e.key === 'ArrowDown') next = Math.min(idx + cols, items.length - 1);
      else if (e.key === 'ArrowUp') next = Math.max(idx - cols, 0);
      if (next !== -1) { e.preventDefault(); items[next].focus(); }
    };
    el.addEventListener('keydown', handleKeyDown);
    return () => el.removeEventListener('keydown', handleKeyDown);
  }, [containerRef, selector, cols]);
}

export function FolderModal({ folder, onSave, onClose }: FolderModalProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(folder?.name ?? '');
  const [color, setColor] = useState(folder?.color ?? FOLDER_COLORS[0].hex);
  const [icon, setIcon] = useState(folder?.icon ?? FOLDER_ICONS[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const titleId = 'folder-modal-title';
  const containerRef = useRef<HTMLDivElement>(null);
  const colorGridRef = useRef<HTMLDivElement>(null);
  const iconGridRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  // Capture the element that triggered the modal so focus can return on close
  useEffect(() => {
    triggerRef.current = document.activeElement as HTMLButtonElement;
  }, []);

  const isDirty =
    name !== (folder?.name ?? '') ||
    color !== (folder?.color ?? FOLDER_COLORS[0].hex) ||
    icon !== (folder?.icon ?? FOLDER_ICONS[0]);

  useFocusTrap(containerRef, true);
  useGridKeyNav(colorGridRef, '[data-color-btn]', 8);
  useGridKeyNav(iconGridRef, '[data-icon-btn]', 6);

  // Restore focus on unmount
  useEffect(() => {
    return () => {
      triggerRef.current?.focus();
    };
  }, []);

  // Escape key: guard unsaved changes
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || saving) return;
      if (isDirty && !confirmDiscard) {
        e.preventDefault();
        setConfirmDiscard(true);
      } else {
        onClose();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose, saving, isDirty, confirmDiscard]);

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
      setError(t('messages.folders.error'));
      setSaving(false);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target !== e.currentTarget || saving) return;
    if (isDirty && !confirmDiscard) { setConfirmDiscard(true); return; }
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
          <div className="mb-4 rounded-lg border border-[var(--color-warning,#f59e0b)]/30 bg-amber-50/80 p-3 dark:bg-amber-900/20">
            <p className="mb-2 text-sm font-medium text-amber-800 dark:text-amber-200">
              Discard unsaved changes?
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md bg-amber-600 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={() => setConfirmDiscard(false)}
                className="rounded-md border border-[var(--color-border)] px-3 py-1 text-xs font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
              >
                Keep editing
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
              if (isDirty && !confirmDiscard) { setConfirmDiscard(true); return; }
              onClose();
            }}
            disabled={saving}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] disabled:opacity-40"
            aria-label={t('messages.folders.cancel')}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label
                htmlFor="folder-name-input"
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
              id="folder-name-input"
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
              aria-label={t('messages.folders.nameLabel')}
              aria-invalid={!!error}
              aria-describedby={error ? 'folder-name-error' : undefined}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none disabled:opacity-60"
            />
            {error && (
              <p id="folder-name-error" className="mt-1 text-xs text-[var(--color-error)]">
                {error}
              </p>
            )}
          </div>

          {/* Color */}
          <div>
            <label className="mb-2 block text-xs font-semibold text-[var(--color-text-secondary)]">
              {t('messages.folders.colorLabel')}
            </label>
            <div ref={colorGridRef} className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('messages.folders.colorLabel')}>
              {FOLDER_COLORS.map(({ hex, name: colorName }) => (
                <button
                  key={hex}
                  type="button"
                  data-color-btn
                  onClick={() => setColor(hex)}
                  disabled={saving}
                  role="radio"
                  aria-checked={color === hex}
                  className="h-7 w-7 rounded-full transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--color-primary)] disabled:opacity-60"
                  style={{
                    backgroundColor: hex,
                    boxShadow: color === hex ? `0 0 0 3px ${hex}, 0 0 0 5px var(--color-surface)` : undefined,
                  }}
                  aria-label={`${t('messages.folders.colorLabel')}: ${colorName}`}
                />
              ))}
            </div>
          </div>

          {/* Icon */}
          <div>
            <label className="mb-2 block text-xs font-semibold text-[var(--color-text-secondary)]">
              {t('messages.folders.iconLabel')}
            </label>
            <div ref={iconGridRef} className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t('messages.folders.iconLabel')}>
              {FOLDER_ICONS.map((ic) => (
                <button
                  key={ic}
                  type="button"
                  data-icon-btn
                  onClick={() => setIcon(ic)}
                  disabled={saving}
                  role="radio"
                  aria-checked={icon === ic}
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-lg text-base transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] disabled:opacity-60 ${
                    icon === ic
                      ? 'scale-110 bg-[var(--color-primary)]/15 ring-1 ring-[var(--color-primary)]'
                      : 'hover:scale-110 hover:bg-[var(--color-hover)]'
                  }`}
                  aria-label={`${t('messages.folders.iconLabel')}: ${ic}`}
                >
                  {ic}
                </button>
              ))}
            </div>
          </div>

          {/* Preview — matches actual FolderRow rendering (color applied, no opacity manipulation) */}
          <div className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2">
            <span className="inline-flex flex-shrink-0 items-center text-base leading-none" aria-hidden>
              {icon}
            </span>
            <span
              className="flex-1 truncate text-sm font-semibold"
              style={{ color }}
            >
              {name.trim() || t('messages.folders.namePlaceholder')}
            </span>
            <span className="flex-shrink-0 text-[10px] text-[var(--color-text-muted)]">
              {t('messages.folders.title')}
            </span>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                if (isDirty && !confirmDiscard) { setConfirmDiscard(true); return; }
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
                  <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 16 16" fill="none" aria-hidden>
                    <circle cx="8" cy="8" r="6" stroke="white" strokeWidth="2" strokeDasharray="28" strokeDashoffset="10" />
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
