import { useState } from 'react';
import { MarkdownRenderer } from './MarkdownRenderer';

type MarkdownInputProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
  helperText?: string;
};

export function MarkdownInput({
  label,
  value,
  onChange,
  placeholder,
  rows = 8, // Increased for comfortable long-form content (FORM-6)
  maxLength,
  helperText,
}: MarkdownInputProps) {
  const [mode, setMode] = useState<'write' | 'preview'>('write');

  return (
    <div>
      {/* FORM-8: Improved preview toggle placement and styling */}
      <div className="flex items-center justify-between mb-2">
        <label className="block text-sm font-semibold text-[var(--color-text-primary)]">{label}</label>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setMode('write')}
            className={`px-3 py-1 text-xs rounded transition-colors ${
              mode === 'write'
                ? 'bg-[var(--color-primary)] text-white'
                : 'bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)] hover:bg-[var(--color-border)]'
            }`}
          >
            Write
          </button>
          <button
            type="button"
            onClick={() => setMode('preview')}
            className={`px-3 py-1 text-xs rounded transition-colors ${
              mode === 'preview'
                ? 'bg-[var(--color-primary)] text-white'
                : 'bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)] hover:bg-[var(--color-border)]'
            }`}
          >
            Preview
          </button>
        </div>
      </div>

      {mode === 'write' ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg focus:ring-2 focus:ring-[var(--color-primary)] bg-[var(--color-background)] text-[var(--color-text-primary)]"
          rows={rows}
          placeholder={placeholder}
          maxLength={maxLength}
        />
      ) : (
        <div className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-3 min-h-[200px]">
          {value.trim() ? (
            <MarkdownRenderer content={value} className="text-[var(--color-text-primary)]" />
          ) : (
            <div className="text-sm text-[var(--color-text-secondary)] italic">Nothing to preview yet.</div>
          )}
        </div>
      )}

      {helperText ? (
        <p className="mt-1 text-sm text-gray-500">{helperText}</p>
      ) : null}
    </div>
  );
}
