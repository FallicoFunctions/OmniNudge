import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AutoDeleteInterval } from '../../types/messages';

interface ChatSettingsModalProps {
  currentAutoDelete: AutoDeleteInterval | null;
  onSave: (interval: AutoDeleteInterval, applyRetroactive: boolean) => void;
  onClose: () => void;
  isSaving?: boolean;
}

const AUTO_DELETE_OPTIONS: { labelKey: string; value: AutoDeleteInterval }[] = [
  { labelKey: 'messages.autoDelete.never', value: 'never' },
  { labelKey: 'messages.autoDelete.30m', value: '30m' },
  { labelKey: 'messages.autoDelete.1h', value: '1h' },
  { labelKey: 'messages.autoDelete.5h', value: '5h' },
  { labelKey: 'messages.autoDelete.1d', value: '1d' },
  { labelKey: 'messages.autoDelete.2d', value: '2d' },
  { labelKey: 'messages.autoDelete.7d', value: '7d' },
  { labelKey: 'messages.autoDelete.30d', value: '30d' },
];

export function ChatSettingsModal({
  currentAutoDelete,
  onSave,
  onClose,
  isSaving,
}: ChatSettingsModalProps) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<AutoDeleteInterval>(currentAutoDelete ?? 'never');
  const [showRetroConfirm, setShowRetroConfirm] = useState(false);

  const isDirty = selected !== (currentAutoDelete ?? 'never');

  const handleSaveClick = () => {
    if (selected === 'never') {
      onSave(selected, false);
      return;
    }
    setShowRetroConfirm(true);
  };

  if (showRetroConfirm) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="w-full max-w-sm rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-2xl">
          <h3 className="text-base font-semibold text-[var(--color-text-primary)] mb-2">
            {t('messages.autoDelete.applyRetroTitle')}
          </h3>
          <p className="text-sm text-[var(--color-text-secondary)] mb-6">
            {t('messages.autoDelete.applyRetroBody')}
          </p>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => onSave(selected, true)}
              disabled={isSaving}
              className="w-full rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
            >
              {t('messages.autoDelete.applyToAll')}
            </button>
            <button
              type="button"
              onClick={() => onSave(selected, false)}
              disabled={isSaving}
              className="w-full rounded-md border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)]"
            >
              {t('messages.autoDelete.applyNewOnly')}
            </button>
            <button
              type="button"
              onClick={() => setShowRetroConfirm(false)}
              className="w-full rounded-md px-4 py-2 text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-hover)]"
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-sm rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-2xl">
        <h3 className="text-base font-semibold text-[var(--color-text-primary)] mb-1">
          {t('messages.chatSettings')}
        </h3>
        <p className="text-sm text-[var(--color-text-secondary)] mb-4">
          {t('messages.autoDelete.description')}
        </p>

        <div className="mb-6">
          <label className="block text-sm font-semibold text-[var(--color-text-primary)] mb-2">
            {t('messages.autoDelete.label')}
          </label>
          <div className="grid grid-cols-2 gap-2">
            {AUTO_DELETE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setSelected(opt.value)}
                className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                  selected === opt.value
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                    : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)]'
                }`}
              >
                {t(opt.labelKey)}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-md border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)]"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={handleSaveClick}
            disabled={!isDirty || isSaving}
            className="flex-1 rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            {t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
