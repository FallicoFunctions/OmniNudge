import { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface MuteUserModalProps {
  username: string;
  onConfirm: (durationMinutes: number, reason: string) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

const DURATION_OPTIONS = [
  { label: '1 hour', value: 60 },
  { label: '24 hours', value: 1440 },
  { label: '7 days', value: 10080 },
  { label: 'Permanent', value: 0 },
] as const;

export function MuteUserModal({ username, onConfirm, onCancel, isLoading }: MuteUserModalProps) {
  const { t } = useTranslation();
  const [duration, setDuration] = useState<number>(60);
  const [reason, setReason] = useState('');

  const handleConfirm = () => {
    onConfirm(duration, reason);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-sm rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-2xl">
        <h3 className="text-base font-semibold text-[var(--color-text-primary)] mb-4">
          {t('groups.admin.muteUser')}: <span className="text-[var(--color-primary)]">{username}</span>
        </h3>

        <div className="mb-4">
          <label className="block text-sm font-semibold text-[var(--color-text-primary)] mb-2">
            {t('groups.admin.duration')}
          </label>
          <div className="grid grid-cols-2 gap-2">
            {DURATION_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setDuration(opt.value)}
                className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                  duration === opt.value
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                    : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-semibold text-[var(--color-text-primary)] mb-2">
            {t('groups.admin.reason')} <span className="font-normal text-[var(--color-text-muted)]">(optional)</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('groups.admin.reasonPlaceholder')}
            rows={3}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none resize-none"
          />
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-md border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)]"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isLoading}
            className="flex-1 rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            {isLoading ? '...' : t('groups.admin.mute')}
          </button>
        </div>
      </div>
    </div>
  );
}
