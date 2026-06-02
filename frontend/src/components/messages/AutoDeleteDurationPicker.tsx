import { useTranslation } from 'react-i18next';
import type { AutoDeleteDuration } from '../../types/messages';
import { isDurationNever } from '../../types/messages';

interface AutoDeleteDurationPickerProps {
  value: AutoDeleteDuration;
  onChange: (next: AutoDeleteDuration) => void;
  disabled?: boolean;
}

interface DialProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}

function Dial({ label, value, min, max, onChange, disabled }: DialProps) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n));

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = parseInt(e.target.value, 10);
    if (!isNaN(raw)) onChange(clamp(raw));
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const raw = parseInt(e.target.value, 10);
    onChange(isNaN(raw) ? 0 : clamp(raw));
  };

  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        type="button"
        disabled={disabled || value >= max}
        onClick={() => onChange(clamp(value + 1))}
        className="flex h-7 w-full items-center justify-center rounded-md border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        aria-label={`Increase ${label}`}
      >
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
        </svg>
      </button>

      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={handleChange}
        onBlur={handleBlur}
        disabled={disabled}
        className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-center text-lg font-semibold tabular-nums text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none disabled:opacity-50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        aria-label={label}
      />

      <button
        type="button"
        disabled={disabled || value <= min}
        onClick={() => onChange(clamp(value - 1))}
        className="flex h-7 w-full items-center justify-center rounded-md border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        aria-label={`Decrease ${label}`}
      >
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <span className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">
        {label}
      </span>
    </div>
  );
}

export function AutoDeleteDurationPicker({ value, onChange, disabled }: AutoDeleteDurationPickerProps) {
  const { t } = useTranslation();
  const isNever = isDurationNever(value);

  const set = (key: keyof AutoDeleteDuration) => (v: number) =>
    onChange({ ...value, [key]: v });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <Dial
          label={t('messages.autoDelete.days')}
          value={value.days}
          min={0}
          max={99}
          onChange={set('days')}
          disabled={disabled}
        />
        <Dial
          label={t('messages.autoDelete.hours')}
          value={value.hours}
          min={0}
          max={23}
          onChange={set('hours')}
          disabled={disabled}
        />
        <Dial
          label={t('messages.autoDelete.minutes')}
          value={value.minutes}
          min={0}
          max={59}
          onChange={set('minutes')}
          disabled={disabled}
        />
      </div>

      {isNever && (
        <p className="text-center text-xs text-[var(--color-text-muted)]">
          {t('messages.autoDelete.neverHint')}
        </p>
      )}
    </div>
  );
}
