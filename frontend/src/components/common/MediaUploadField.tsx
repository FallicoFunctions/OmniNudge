import type { ChangeEvent } from 'react';
import { resolveMediaUrl } from '../../utils/mediaUrl';

type MediaUploadFieldProps = {
  id: string;
  label: string;
  value?: string | null;
  previewSrc?: string | null;
  accept: string;
  mediaType: 'image' | 'video';
  uploadButtonLabel: string;
  uploadingLabel?: string;
  clearLabel?: string;
  hint?: string;
  description?: string;
  disabled?: boolean;
  isUploading?: boolean;
  showStoredPath?: boolean;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onClear?: () => void;
};

export default function MediaUploadField({
  id,
  label,
  value,
  previewSrc,
  accept,
  mediaType,
  uploadButtonLabel,
  uploadingLabel = 'Uploading...',
  clearLabel = 'Remove',
  hint,
  description,
  disabled = false,
  isUploading = false,
  showStoredPath = false,
  onFileChange,
  onClear,
}: MediaUploadFieldProps) {
  const mediaSrc = previewSrc || resolveMediaUrl(value || undefined);
  const hasMedia = Boolean(mediaSrc);
  const inputId = `${id}-file`;

  return (
    <div className="space-y-2">
      <span className="block text-sm font-medium text-[var(--color-text-primary)]">{label}</span>

      <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        {hasMedia ? (
          mediaType === 'video' ? (
            <video src={mediaSrc} controls preload="metadata" className="aspect-video w-full bg-black object-contain" />
          ) : (
            <img src={mediaSrc} alt={label} className="max-h-56 w-full bg-black/10 object-contain" />
          )
        ) : (
          <div className="flex min-h-32 items-center justify-center px-4 py-8 text-sm text-[var(--color-text-secondary)]">
            No {mediaType} selected.
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label
          htmlFor={inputId}
          className="inline-flex cursor-pointer items-center rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)]"
        >
          {isUploading ? uploadingLabel : uploadButtonLabel}
        </label>
        <input
          id={inputId}
          type="file"
          accept={accept}
          className="hidden"
          disabled={disabled || isUploading}
          onChange={onFileChange}
        />
        {onClear && hasMedia && (
          <button
            type="button"
            onClick={onClear}
            disabled={disabled || isUploading}
            className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)] disabled:opacity-50"
          >
            {clearLabel}
          </button>
        )}
      </div>

      {hint && <p className="text-xs text-[var(--color-text-secondary)]">{hint}</p>}
      {description && <p className="text-xs text-[var(--color-text-secondary)]">{description}</p>}
      {showStoredPath && value && (
        <p className="break-all rounded-lg bg-[var(--color-surface-elevated)] px-2 py-1 font-mono text-[11px] text-[var(--color-text-secondary)]">
          {value}
        </p>
      )}
    </div>
  );
}
