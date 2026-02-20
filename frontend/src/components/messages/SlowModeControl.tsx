import { useTranslation } from 'react-i18next';

interface SlowModeControlProps {
  currentSeconds: number;
  onSetSlowMode: (seconds: number) => void;
  isLoading?: boolean;
}

const SLOW_MODE_OPTIONS: { labelKey: string; value: number }[] = [
  { labelKey: 'groups.admin.slowModeOff', value: 0 },
  { labelKey: 'groups.admin.slowMode10s', value: 10 },
  { labelKey: 'groups.admin.slowMode30s', value: 30 },
  { labelKey: 'groups.admin.slowMode1m', value: 60 },
  { labelKey: 'groups.admin.slowMode5m', value: 300 },
  { labelKey: 'groups.admin.slowMode10m', value: 600 },
  { labelKey: 'groups.admin.slowMode30m', value: 1800 },
  { labelKey: 'groups.admin.slowMode1h', value: 3600 },
];

export function SlowModeControl({ currentSeconds, onSetSlowMode, isLoading }: SlowModeControlProps) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm font-semibold text-[var(--color-text-primary)]">
        {t('groups.admin.slowMode')}
      </span>
      <select
        value={currentSeconds}
        onChange={(e) => onSetSlowMode(Number(e.target.value))}
        disabled={isLoading}
        className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-2 py-1.5 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none disabled:opacity-60"
      >
        {SLOW_MODE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {t(opt.labelKey)}
          </option>
        ))}
      </select>
    </div>
  );
}
