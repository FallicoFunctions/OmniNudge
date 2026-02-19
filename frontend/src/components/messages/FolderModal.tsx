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

interface FolderModalProps {
  /** If provided, we're editing an existing folder. */
  folder?: ConversationFolder;
  onSave: (data: { name: string; color: string; icon: string }) => Promise<void>;
  onClose: () => void;
}

export function FolderModal({ folder, onSave, onClose }: FolderModalProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(folder?.name ?? '');
  const [color, setColor] = useState(folder?.color ?? FOLDER_COLORS[0].hex);
  const [icon, setIcon] = useState(folder?.icon ?? FOLDER_ICONS[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = 'folder-modal-title';

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose, saving]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return; // button is disabled; guard is belt-and-suspenders
    setSaving(true);
    setError('');
    try {
      await onSave({ name: trimmed, color, icon });
      onClose();
    } catch {
      setError(t('messages.folders.error'));
      setSaving(false);
    }
  };

  const title = folder ? t('messages.folders.editFolder') : t('messages.folders.newFolder');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div className="w-full max-w-sm rounded-xl bg-[var(--color-surface)] p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 id={titleId} className="text-base font-semibold text-[var(--color-text-primary)]">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
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
            <label
              htmlFor="folder-name-input"
              className="mb-1 block text-xs font-semibold text-[var(--color-text-secondary)]"
            >
              {t('messages.folders.nameLabel')}
            </label>
            <input
              id="folder-name-input"
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError('');
              }}
              onBlur={() => {
                if (!name.trim()) setError(t('messages.folders.namePlaceholder'));
              }}
              placeholder={t('messages.folders.namePlaceholder')}
              maxLength={50}
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
            <div className="flex flex-wrap gap-2">
              {FOLDER_COLORS.map(({ hex, name: colorName }) => (
                <button
                  key={hex}
                  type="button"
                  onClick={() => setColor(hex)}
                  disabled={saving}
                  className="h-7 w-7 rounded-full transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--color-primary)] disabled:opacity-60"
                  style={{
                    backgroundColor: hex,
                    boxShadow: color === hex ? `0 0 0 3px ${hex}, 0 0 0 5px var(--color-surface)` : undefined,
                  }}
                  aria-label={`${t('messages.folders.colorLabel')}: ${colorName}`}
                  aria-pressed={color === hex}
                />
              ))}
            </div>
          </div>

          {/* Icon */}
          <div>
            <label className="mb-2 block text-xs font-semibold text-[var(--color-text-secondary)]">
              {t('messages.folders.iconLabel')}
            </label>
            <div className="flex flex-wrap gap-1.5">
              {FOLDER_ICONS.map((ic) => (
                <button
                  key={ic}
                  type="button"
                  onClick={() => setIcon(ic)}
                  disabled={saving}
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-lg text-base transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] disabled:opacity-60 ${
                    icon === ic
                      ? 'scale-110 bg-[var(--color-primary)]/15 ring-1 ring-[var(--color-primary)]'
                      : 'hover:scale-110 hover:bg-[var(--color-hover)]'
                  }`}
                  aria-pressed={icon === ic}
                  aria-label={`${t('messages.folders.iconLabel')}: ${ic}`}
                >
                  {ic}
                </button>
              ))}
            </div>
          </div>

          {/* Preview */}
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
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
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
