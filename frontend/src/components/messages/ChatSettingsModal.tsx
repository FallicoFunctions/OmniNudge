import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AutoDeleteDuration } from '../../types/messages';
import { durationToSeconds, isDurationNever } from '../../types/messages';
import { AutoDeleteDurationPicker } from './AutoDeleteDurationPicker';

interface ChatSettingsModalProps {
  /** Current per-chat override as a duration, or null if no override is set. */
  currentDuration: AutoDeleteDuration | null;
  onSave: (totalSeconds: number, applyRetroactive: boolean) => void;
  onClose: () => void;
  isSaving?: boolean;
}

export function ChatSettingsModal({
  currentDuration,
  onSave,
  onClose,
  isSaving,
}: ChatSettingsModalProps) {
  const { t } = useTranslation();

  const [duration, setDuration] = useState<AutoDeleteDuration>(
    currentDuration ?? { days: 0, hours: 0, minutes: 0 }
  );
  const [showRetroConfirm, setShowRetroConfirm] = useState(false);

  const currentSeconds = currentDuration ? durationToSeconds(currentDuration) : 0;
  const selectedSeconds = durationToSeconds(duration);
  const isDirty = selectedSeconds !== currentSeconds;
  const isNever = isDurationNever(duration);

  const handleSaveClick = () => {
    if (isNever) {
      onSave(0, false);
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
              onClick={() => onSave(selectedSeconds, true)}
              disabled={isSaving}
              className="w-full rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
            >
              {t('messages.autoDelete.applyToAll')}
            </button>
            <button
              type="button"
              onClick={() => onSave(selectedSeconds, false)}
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

        {currentDuration === null && (
          <p className="text-xs text-[var(--color-text-muted)] mb-3">
            {t('messages.autoDelete.usingGlobalDefault')}
          </p>
        )}

        <div className="mb-6">
          <label className="block text-sm font-semibold text-[var(--color-text-primary)] mb-3">
            {t('messages.autoDelete.label')}
          </label>
          <AutoDeleteDurationPicker
            value={duration}
            onChange={setDuration}
            disabled={isSaving}
          />
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
