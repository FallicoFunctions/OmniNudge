import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ConversationFolder } from '../../types/messages';

const FOLDER_COLORS = [
  '#3b82f6', // blue
  '#10b981', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
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
  const [color, setColor] = useState(folder?.color ?? FOLDER_COLORS[0]);
  const [icon, setIcon] = useState(folder?.icon ?? FOLDER_ICONS[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError(t('messages.folders.namePlaceholder'));
      return;
    }
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
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-sm rounded-xl bg-[var(--color-surface)] p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-[var(--color-text-primary)]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)]"
            aria-label={t('messages.folders.cancel')}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div>
            <label className="mb-1 block text-xs font-semibold text-[var(--color-text-secondary)]">
              {t('messages.folders.nameLabel')}
            </label>
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('messages.folders.namePlaceholder')}
              maxLength={50}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none"
            />
            {error && <p className="mt-1 text-xs text-[var(--color-error)]">{error}</p>}
          </div>

          {/* Color */}
          <div>
            <label className="mb-2 block text-xs font-semibold text-[var(--color-text-secondary)]">
              {t('messages.folders.colorLabel')}
            </label>
            <div className="flex flex-wrap gap-2">
              {FOLDER_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className="h-7 w-7 rounded-full transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
                  style={{
                    backgroundColor: c,
                    outline: color === c ? `3px solid ${c}` : undefined,
                    outlineOffset: color === c ? '2px' : undefined,
                  }}
                  aria-label={c}
                  aria-pressed={color === c}
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
                  className={`flex h-8 w-8 items-center justify-center rounded-lg text-base transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] ${
                    icon === ic
                      ? 'bg-[var(--color-primary)] bg-opacity-15 ring-1 ring-[var(--color-primary)]'
                      : 'hover:bg-[var(--color-hover)]'
                  }`}
                  aria-pressed={icon === ic}
                >
                  {ic}
                </button>
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2">
            <span className="text-sm">{icon}</span>
            <span
              className="text-sm font-semibold"
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
              className="flex-1 rounded-lg border border-[var(--color-border)] py-2 text-sm font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
            >
              {t('messages.folders.cancel')}
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="flex-1 rounded-lg bg-[var(--color-primary)] py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] disabled:opacity-50"
            >
              {saving ? '…' : t('messages.folders.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
