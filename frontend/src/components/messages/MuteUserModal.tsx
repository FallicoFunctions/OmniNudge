import { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface MuteUserModalProps {
  username: string;
  onConfirm: (durationMinutes: number) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

const DURATION_OPTIONS: { labelKey: string; value: number }[] = [
  { labelKey: 'groups.admin.duration1h', value: 60 },
  { labelKey: 'groups.admin.duration24h', value: 1440 },
  { labelKey: 'groups.admin.duration7d', value: 10080 },
  { labelKey: 'groups.admin.durationPermanent', value: 0 },
];

export function MuteUserModal({ username, onConfirm, onCancel, isLoading }: MuteUserModalProps) {
  const { t } = useTranslation();
  const [duration, setDuration] = useState<number>(60);

  const handleConfirm = () => {
    onConfirm(duration);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-6 shadow-2xl">
        <h3 className="text-base font-semibold text-text-primary mb-4">
          {t('groups.admin.muteUser')}: <span className="text-primary">{username}</span>
        </h3>

        <div className="mb-6">
          <label className="block text-sm font-semibold text-text-primary mb-2">
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
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-text-secondary hover:bg-(--color-hover)'
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
            onClick={onCancel}
            className="flex-1 rounded-md border border-border px-4 py-2 text-sm font-medium text-text-secondary hover:bg-(--color-hover)"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isLoading}
            className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            {isLoading
              ? t('groups.admin.muting', { defaultValue: 'Muting…' })
              : t('groups.admin.mute')}
          </button>
        </div>
      </div>
    </div>
  );
}
