import type { RefObject } from 'react';

type VideoData = {
  url: string;
  hasAudio: boolean;
  kind: 'hls' | 'dash' | 'mp4';
};

type RedditPostMediaProps = {
  inlineImage?: string | null;
  decodedTitle: string;
  hasGallery: boolean;
  galleryImages: string[];
  galleryIndex: number;
  imageExpanded: boolean;
  onToggleExpanded: () => void;
  onPrevGallery: () => void;
  onNextGallery: () => void;
  videoData?: VideoData;
  videoRef: RefObject<HTMLVideoElement>;
  posterUrl?: string | null;
};

export function RedditPostMedia({
  inlineImage,
  decodedTitle,
  hasGallery,
  galleryImages,
  galleryIndex,
  imageExpanded,
  onToggleExpanded,
  onPrevGallery,
  onNextGallery,
  videoData,
  videoRef,
  posterUrl,
}: RedditPostMediaProps) {
  return (
    <>
      {inlineImage ? (
        <div className="mb-4 flex flex-col items-start gap-2">
          <div className="relative w-full">
            <div
              className="cursor-pointer overflow-hidden rounded border border-[var(--color-border)] transition-all duration-200"
              onClick={onToggleExpanded}
              title={imageExpanded ? 'Click to shrink' : 'Click to enlarge'}
            >
              <img
                src={inlineImage}
                alt={
                  hasGallery
                    ? `${decodedTitle} (${galleryIndex + 1}/${galleryImages.length})`
                    : decodedTitle
                }
                loading="lazy"
                decoding="async"
                className={`w-full object-contain transition-transform duration-200 ${
                  imageExpanded ? 'max-h-[80vh]' : 'max-h-[320px] hover:scale-[1.03]'
                }`}
              />
            </div>
            {hasGallery && galleryImages.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onPrevGallery();
                  }}
                  className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
                  aria-label="Previous image"
                >
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onNextGallery();
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
                  aria-label="Next image"
                >
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-sm text-white">
                  {galleryIndex + 1} / {galleryImages.length}
                </div>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={onToggleExpanded}
            className="text-xs text-[var(--color-primary)] hover:underline"
          >
            {imageExpanded ? 'View smaller' : 'View full size'}
          </button>
        </div>
      ) : null}

      {videoData ? (
        <div className="mb-4">
          <video
            ref={videoRef}
            controls
            className="w-full max-h-[600px] rounded border border-[var(--color-border)]"
            preload="metadata"
            poster={posterUrl ?? undefined}
          >
            {videoData.kind === 'mp4' && <source src={videoData.url} type="video/mp4" />}
            Your browser does not support the video tag.
          </video>
          {!videoData.hasAudio && (
            <div className="mt-2 text-xs text-[var(--color-text-muted)] italic">
              Note: This video may not have audio. Reddit serves audio separately.{' '}
              <span className="text-[var(--color-text-muted)]">
                Watch on Reddit is not available from OmniNudge.
              </span>
            </div>
          )}
        </div>
      ) : null}
    </>
  );
}
