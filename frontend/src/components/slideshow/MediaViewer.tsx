import { useState, useEffect } from 'react';

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

export function MediaViewer({ media, className = '', onLoad, onError, autoplay = false }: MediaViewerProps) {
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
    setError(err.message || 'Failed to load media');
    onError?.(err);
  };

  if (error) {
    return (
      <div className={`flex items-center justify-center bg-[var(--color-surface)] rounded ${className}`}>
        <div className="text-center p-8">
          <div className="text-[var(--color-error)] text-lg mb-2">Failed to load media</div>
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
          alt="Media content"
          className="max-w-full max-h-full object-contain"
          onLoad={handleLoad}
          onError={() => handleError(new Error('Image failed to load'))}
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
          onError={() => handleError(new Error('Video failed to load'))}
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
            onError={() => handleError(new Error('Audio failed to load'))}
          />
        </div>
      )}
    </div>
  );
}
