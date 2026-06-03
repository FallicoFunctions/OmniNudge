import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { AutoDeleteDuration } from '../../types/messages';

interface AutoDeleteDurationPickerProps {
  value: AutoDeleteDuration;
  onChange: (next: AutoDeleteDuration) => void;
  disabled?: boolean;
}

interface DialProps {
  label: string;
  value: number;
  max: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}

function Dial({ label, value, max, onChange, disabled }: DialProps) {
  const isActive = value > 0;

  const increment = () => onChange(Math.min(max, value + 1));
  const decrement = () => onChange(Math.max(0, value - 1));

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const n = parseInt(e.target.value, 10);
    if (!isNaN(n)) onChange(Math.min(max, Math.max(0, n)));
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const n = parseInt(e.target.value, 10);
    onChange(isNaN(n) ? 0 : Math.min(max, Math.max(0, n)));
  };

  // Keep a ref to the latest increment/decrement so the wheel listener never
  // holds a stale closure. Without this, scrolling dial A captures the old
  // onChange for dial B (before A's value changed), causing A to reset when
  // B is scrolled next.
  const incrementRef = useRef(increment);
  const decrementRef = useRef(decrement);
  incrementRef.current = increment;
  decrementRef.current = decrement;

  // Attach once — non-passive so preventDefault() works to block page scroll.
  // stopPropagation prevents the event reaching adjacent dials.
  const pillRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = pillRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      if (disabled) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.deltaY > 0) incrementRef.current();
      else decrementRef.current();
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  // Only re-register when disabled changes — refs handle the rest.
  }, [disabled]);

  return (
    <div className="flex flex-col items-center gap-2">
      {/* Unified pill: chevron + number + chevron */}
      <div
        ref={pillRef}
        className={[
          'w-full rounded-2xl overflow-hidden transition-all duration-200',
          isActive
            ? 'bg-[var(--color-primary)]/10 ring-1 ring-[var(--color-primary)]/25 shadow-sm'
            : 'bg-[var(--color-surface-elevated)]',
        ].join(' ')}
      >
        {/* Top button = decrement (matches scroll-up = lower value) */}
        <button
          type="button"
          disabled={disabled || value <= 0}
          onClick={decrement}
          tabIndex={-1}
          className={[
            'w-full flex items-center justify-center py-2.5 transition-colors duration-150',
            'disabled:opacity-20 disabled:cursor-not-allowed',
            isActive
              ? 'hover:bg-[var(--color-primary)]/15 active:bg-[var(--color-primary)]/20'
              : 'hover:bg-[var(--color-border)]/60 active:bg-[var(--color-border)]',
          ].join(' ')}
          aria-label={`Decrease ${label}`}
        >
          <svg
            className={`w-4 h-4 transition-colors ${isActive ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-muted)]'}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </button>

        {/* Number input */}
        <input
          type="number"
          min={0}
          max={max}
          value={value}
          onChange={handleChange}
          onBlur={handleBlur}
          disabled={disabled}
          aria-label={label}
          className={[
            'w-full bg-transparent text-center text-4xl font-bold tabular-nums py-1 leading-none',
            'focus:outline-none transition-all duration-200 cursor-default',
            'disabled:cursor-not-allowed',
            '[appearance:textfield]',
            '[&::-webkit-outer-spin-button]:appearance-none',
            '[&::-webkit-inner-spin-button]:appearance-none',
            isActive
              ? 'text-[var(--color-primary)]'
              : 'text-[var(--color-text-muted)] opacity-40',
          ].join(' ')}
        />

        {/* Bottom button = increment (matches scroll-down = higher value) */}
        <button
          type="button"
          disabled={disabled || value >= max}
          onClick={increment}
          tabIndex={-1}
          className={[
            'w-full flex items-center justify-center py-2.5 transition-colors duration-150',
            'disabled:opacity-20 disabled:cursor-not-allowed',
            isActive
              ? 'hover:bg-[var(--color-primary)]/15 active:bg-[var(--color-primary)]/20'
              : 'hover:bg-[var(--color-border)]/60 active:bg-[var(--color-border)]',
          ].join(' ')}
          aria-label={`Increase ${label}`}
        >
          <svg
            className={`w-4 h-4 transition-colors ${isActive ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-muted)]'}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>

      {/* Label */}
      <span
        className={`text-xs font-semibold tracking-wide transition-colors duration-200 ${
          isActive ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-muted)]'
        }`}
      >
        {label}
      </span>
    </div>
  );
}

export function AutoDeleteDurationPicker({ value, onChange, disabled }: AutoDeleteDurationPickerProps) {
  const { t } = useTranslation();

  const set = (key: keyof AutoDeleteDuration) => (v: number) =>
    onChange({ ...value, [key]: v });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <Dial
          label={t('messages.autoDelete.days')}
          value={value.days}
          max={99}
          onChange={set('days')}
          disabled={disabled}
        />
        <Dial
          label={t('messages.autoDelete.hours')}
          value={value.hours}
          max={23}
          onChange={set('hours')}
          disabled={disabled}
        />
        <Dial
          label={t('messages.autoDelete.minutes')}
          value={value.minutes}
          max={59}
          onChange={set('minutes')}
          disabled={disabled}
        />
      </div>

      <p className="text-center text-xs text-[var(--color-text-muted)]">
        {t('messages.autoDelete.neverHint')}
      </p>
    </div>
  );
}
