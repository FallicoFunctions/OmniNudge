import type { RefObject, CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';

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
  videoRef: RefObject<HTMLVideoElement | null>;
  posterUrl?: string | null;
  embedUrl?: string | null;
  externalVideoUrl?: string | null;
};

function getEmbedSizing(url?: string | null): { className: string; style?: CSSProperties } {
  if (!url) {
    return { className: 'w-full aspect-video block' };
  }
  if (url.includes('tiktok.com')) {
    return {
      className: 'mx-auto block',
      style: {
        height: 'min(80vh, 720px)',
        aspectRatio: '9 / 16',
        width: 'auto',
        maxWidth: '100%',
      },
    };
  }
  return { className: 'w-full aspect-video block' };
}

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
  embedUrl,
  externalVideoUrl,
}: RedditPostMediaProps) {
  const { t } = useTranslation();
  const embedSizing = getEmbedSizing(embedUrl ?? externalVideoUrl ?? undefined);
  return (
    <>
      {embedUrl ? (
        <div className="mb-4 flex flex-col items-start gap-2">
          <div className="relative w-full">
            <div className="overflow-hidden rounded border border-[var(--color-border)] transition-all duration-200">
              <iframe
                src={embedUrl}
                title={decodedTitle}
                className={embedSizing.className}
                style={embedSizing.style}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      ) : externalVideoUrl ? (
        <div className="mb-4 flex flex-col items-start gap-2">
          <div className="relative w-full">
            <div className="overflow-hidden rounded border border-[var(--color-border)] transition-all duration-200">
              <video
                controls
                className={embedSizing.className}
                style={embedSizing.style}
                src={externalVideoUrl}
                preload="metadata"
                playsInline
              />
            </div>
          </div>
        </div>
      ) : inlineImage ? (
        <div className="mb-4 flex flex-col items-start gap-2">
          <div className="relative w-full">
            <div
              className="cursor-pointer overflow-hidden rounded border border-[var(--color-border)] transition-all duration-200"
              onClick={onToggleExpanded}
              title={
                imageExpanded
                  ? t('posts.media.viewer.clickToShrink')
                  : t('posts.media.viewer.clickToEnlarge')
              }
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
                  imageExpanded ? 'max-h-[500px]' : 'max-h-[320px] hover:scale-[1.03]'
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
                  aria-label={t('common.accessibility.previousImage')}
                >
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 19l-7-7 7-7"
                    />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onNextGallery();
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
                  aria-label={t('common.accessibility.nextImage')}
                >
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
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
            {imageExpanded
              ? t('posts.media.viewer.viewSmaller')
              : t('posts.media.viewer.viewFullSize')}
          </button>
        </div>
      ) : null}

      {videoData ? (
        <div
          className="mb-4"
          style={
            {
              isolation: 'isolate',
              transform: 'translateZ(0)',
              WebkitTransform: 'translate3d(0,0,0)',
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              perspective: 1000,
              WebkitPerspective: 1000,
            } as React.CSSProperties
          }
        >
          {/* REDDIT-4: Limit video height to prevent page domination */}
          <video
            ref={videoRef}
            controls
            className="w-full max-h-[500px] rounded border border-[var(--color-border)]"
            preload="metadata"
            poster={posterUrl ?? undefined}
            style={
              {
                transform: 'translate3d(0,0,0)',
                WebkitTransform: 'translate3d(0,0,0)',
                backfaceVisibility: 'hidden',
                WebkitBackfaceVisibility: 'hidden',
                willChange: 'transform',
              } as React.CSSProperties
            }
            playsInline
            webkit-playsinline="true"
          >
            {videoData.kind === 'mp4' && <source src={videoData.url} type="video/mp4" />}
            {t('posts.media.videoUnsupported')}
          </video>
          {!videoData.hasAudio && (
            <div className="mt-2 text-xs text-[var(--color-text-muted)] italic">
              {t('posts.media.videoMayNotHaveAudio')}{' '}
              <span className="text-[var(--color-text-muted)]">
                {t('posts.media.watchOnRedditUnavailable')}
              </span>
            </div>
          )}
        </div>
      ) : null}
    </>
  );
}
