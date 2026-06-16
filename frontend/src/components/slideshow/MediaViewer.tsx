import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

export interface MediaItem {
  id: string | number;
  url: string;
  type: 'image' | 'video' | 'audio';
  mimeType?: string;
  encrypted?: boolean;
  encryptionKey?: string;
  encryptionIv?: string;
}

interface MediaViewerProps {
  media: MediaItem;
  className?: string;
  onLoad?: () => void;
  onError?: (error: Error) => void;
  autoplay?: boolean;
}

export function MediaViewer({
  media,
  className = '',
  onLoad,
  onError,
  autoplay = false,
}: MediaViewerProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
  }, [media.id]);

  const handleLoad = () => {
    setLoading(false);
    onLoad?.();
  };

  const handleError = (err: Error) => {
    setLoading(false);
    setError(err.message || t('mediaViewer.errors.failedToLoad'));
    onError?.(err);
  };

  if (error) {
    return (
      <div
        className={`flex items-center justify-center bg-[var(--color-surface)] rounded ${className}`}
      >
        <div className="text-center p-8">
          <div className="text-[var(--color-error)] text-lg mb-2">
            {t('mediaViewer.errors.failedToLoad')}
          </div>
          <div className="text-[var(--color-text-secondary)] text-sm">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--color-surface)]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--color-primary)]" />
        </div>
      )}

      {media.type === 'image' && (
        <img
          src={media.url}
          alt={t('mediaViewer.mediaAlt')}
          className="max-w-full max-h-full object-contain"
          onLoad={handleLoad}
          onError={() => handleError(new Error(t('mediaViewer.errors.imageFailed')))}
          style={{ display: loading ? 'none' : 'block' }}
        />
      )}

      {media.type === 'video' && (
        <video
          src={media.url}
          controls
          autoPlay={autoplay}
          className="max-w-full max-h-full"
          onLoadedData={handleLoad}
          onError={() => handleError(new Error(t('mediaViewer.errors.videoFailed')))}
          style={{ display: loading ? 'none' : 'block' }}
        />
      )}

      {media.type === 'audio' && (
        <div className="flex items-center justify-center p-8 bg-[var(--color-surface)] rounded">
          <audio
            src={media.url}
            controls
            autoPlay={autoplay}
            className="w-full max-w-md"
            onLoadedData={handleLoad}
            onError={() => handleError(new Error(t('mediaViewer.errors.audioFailed')))}
          />
        </div>
      )}
    </div>
  );
}
