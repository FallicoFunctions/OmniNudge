import { useMemo, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import AudioPlayer from './AudioPlayer';

type PreviewKind = 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'document' | 'file';

interface FilePreviewProps {
  src: string;
  mimeType?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  textPreview?: string | null;
  thumbnailUrl?: string | null;
  maxTextPreviewChars?: number;
  className?: string;
  onOpen?: () => void;
  onAudioLoadedMetadata?: (event: SyntheticEvent<HTMLMediaElement>) => void;
  onVideoLoadedMetadata?: (event: SyntheticEvent<HTMLVideoElement>) => void;
}

const textLikeMimePrefixes = ['text/'];
const textLikeMimeValues = new Set([
  'application/json',
  'application/xml',
  'application/javascript',
  'application/x-javascript',
]);
const documentMimePrefixes = [
  'application/msword',
  'application/vnd.openxmlformats-officedocument',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
];

export function detectPreviewKind(mimeType?: string | null): PreviewKind {
  const mime = (mimeType ?? '').toLowerCase().trim();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime === 'application/pdf') return 'pdf';
  if (textLikeMimePrefixes.some((prefix) => mime.startsWith(prefix)) || textLikeMimeValues.has(mime)) {
    return 'text';
  }
  if (documentMimePrefixes.some((prefix) => mime.startsWith(prefix))) return 'document';
  return 'file';
}

export function formatFileSize(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;

  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars).trimEnd()}...`;
}

function fallbackFileNameFromSrc(src: string, fallbackName: string): string {
  const raw = src.split('?')[0].split('#')[0].split('/').pop();
  return raw && raw.length > 0 ? decodeURIComponent(raw) : fallbackName;
}

export default function FilePreview({
  src,
  mimeType,
  fileName,
  fileSize,
  textPreview,
  thumbnailUrl,
  maxTextPreviewChars = 200,
  className = '',
  onOpen,
  onAudioLoadedMetadata,
  onVideoLoadedMetadata,
}: FilePreviewProps) {
  const { t } = useTranslation();
  const kind = useMemo(() => detectPreviewKind(mimeType), [mimeType]);
  const displayName =
    fileName?.trim() || fallbackFileNameFromSrc(src, t('messages.media.attachmentFallback'));
  const sizeLabel = formatFileSize(fileSize);

  const openLabel = t('messages.media.preview.open');
  const downloadLabel = t('common.download');
  const fileSizePrefix = t('messages.media.preview.fileSize');

  if (kind === 'image') {
    return (
      <div className={className}>
        <img
          src={src}
          alt={t('messages.media.fallbackText')}
          className="max-w-full rounded cursor-pointer object-contain"
          style={{ maxHeight: '50vh' }}
          onClick={() => (onOpen ? onOpen() : window.open(src, '_blank'))}
        />
      </div>
    );
  }

  if (kind === 'video') {
    return (
      <div className={className}>
        <video
          src={src}
          controls
          className="max-w-full rounded cursor-pointer"
          style={{ maxHeight: '50vh' }}
          onLoadedMetadata={onVideoLoadedMetadata}
          onClick={() => (onOpen ? onOpen() : window.open(src, '_blank'))}
        />
      </div>
    );
  }

  if (kind === 'audio') {
    return (
      <div className={className}>
        <AudioPlayer
          src={src}
          mimeType={mimeType}
          fileName={displayName}
          onLoadedMetadata={onAudioLoadedMetadata}
        />
        {fileSize != null && (
          <div className="mt-2 text-xs text-[var(--color-text-muted)]">
            {fileSizePrefix}: {sizeLabel}
          </div>
        )}
      </div>
    );
  }

  if (kind === 'pdf') {
    return (
      <div className={`rounded border border-[var(--color-border)] p-3 ${className}`.trim()}>
        <div className="mb-2 flex items-start gap-3">
          {thumbnailUrl ? (
            <img
              src={thumbnailUrl}
              alt={t('messages.media.preview.pdfThumbnailAlt')}
              className="h-16 w-12 rounded border border-[var(--color-border)] object-cover"
            />
          ) : (
            <div className="flex h-16 w-12 items-center justify-center rounded border border-[var(--color-border)] text-xs font-semibold">
              PDF
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{displayName}</div>
            <div className="text-xs text-[var(--color-text-muted)]">
              {fileSizePrefix}: {sizeLabel}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => (onOpen ? onOpen() : window.open(src, '_blank'))}
            className="rounded bg-[var(--color-primary)] px-2 py-1 text-xs font-semibold text-white"
          >
            {openLabel}
          </button>
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded border border-[var(--color-border)] px-2 py-1 text-xs font-semibold"
            download={displayName}
          >
            {downloadLabel}
          </a>
        </div>
      </div>
    );
  }

  if (kind === 'text' && textPreview?.trim()) {
    return (
      <div className={`rounded border border-[var(--color-border)] p-3 ${className}`.trim()}>
        <div className="mb-2 text-xs text-[var(--color-text-muted)]">
          {displayName} • {fileSizePrefix}: {sizeLabel}
        </div>
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-[var(--color-surface-elevated)] p-2 text-xs">
          {truncateText(textPreview, maxTextPreviewChars)}
        </pre>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => (onOpen ? onOpen() : window.open(src, '_blank'))}
            className="rounded bg-[var(--color-primary)] px-2 py-1 text-xs font-semibold text-white"
          >
            {openLabel}
          </button>
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded border border-[var(--color-border)] px-2 py-1 text-xs font-semibold"
            download={displayName}
          >
            {downloadLabel}
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded border border-[var(--color-border)] p-3 ${className}`.trim()}>
      <div className="mb-1 text-sm font-medium">{displayName}</div>
      <div className="mb-2 text-xs text-[var(--color-text-muted)]">
        {fileSizePrefix}: {sizeLabel}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => (onOpen ? onOpen() : window.open(src, '_blank'))}
          className="rounded bg-[var(--color-primary)] px-2 py-1 text-xs font-semibold text-white"
        >
          {openLabel}
        </button>
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded border border-[var(--color-border)] px-2 py-1 text-xs font-semibold"
          download={displayName}
        >
          {downloadLabel}
        </a>
      </div>
    </div>
  );
}
