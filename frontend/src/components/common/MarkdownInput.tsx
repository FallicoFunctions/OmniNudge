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
  rows = 6,
  maxLength,
  helperText,
}: MarkdownInputProps) {
  const [mode, setMode] = useState<'write' | 'preview'>('write');

  return (
    <div>
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium mb-2">{label}</label>
        <div className="flex gap-2 text-xs">
          <button
            type="button"
            onClick={() => setMode('write')}
            className={`rounded px-2 py-1 ${
              mode === 'write' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'
            }`}
          >
            Write
          </button>
          <button
            type="button"
            onClick={() => setMode('preview')}
            className={`rounded px-2 py-1 ${
              mode === 'preview' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'
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
          className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
          rows={rows}
          placeholder={placeholder}
          maxLength={maxLength}
        />
      ) : (
        <div className="w-full rounded-lg border bg-white p-3">
          {value.trim() ? (
            <MarkdownRenderer content={value} className="text-[var(--color-text-primary)]" />
          ) : (
            <div className="text-sm text-gray-500">Nothing to preview yet.</div>
          )}
        </div>
      )}

      {helperText ? (
        <p className="mt-1 text-sm text-gray-500">{helperText}</p>
      ) : null}
    </div>
  );
}
