import { useEffect, useState, type CSSProperties, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { GalleryImage } from '../../types/posts';
import { HlsVideo } from '../common/HlsVideo';
import { resolveMediaUrl } from '../../utils/mediaUrl';
import { getPlatformExternalEmbed } from '../../utils/platformExternalEmbeds';

type PostDetailMediaProps = {
  mediaUrl?: string | null;
  mediaType?: string | null;
  thumbnailUrl?: string | null;
  galleryImages?: GalleryImage[];
  decodedTitle: string;
  isVideoMedia: boolean;
  imageExpanded: boolean;
  onToggleExpanded: () => void;
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

export function PostDetailMedia({
  mediaUrl,
  mediaType,
  thumbnailUrl,
  galleryImages,
  decodedTitle,
  isVideoMedia,
  imageExpanded,
  onToggleExpanded,
}: PostDetailMediaProps) {
  const { t } = useTranslation();
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [failedImageSrcs, setFailedImageSrcs] = useState<string[]>([]);

  const hasGallery = galleryImages && galleryImages.length > 0;
  const galleryItem = hasGallery ? galleryImages[galleryIndex] : undefined;
  const resolvedMediaUrl = hasGallery
    ? resolveMediaUrl(galleryItem?.url)
    : resolveMediaUrl(mediaUrl);
  const externalMedia = !hasGallery ? getPlatformExternalEmbed(mediaUrl ?? null) : null;
  const embedUrl = externalMedia?.kind === 'iframe' ? externalMedia.src : null;
  const externalVideoUrl = externalMedia?.kind === 'video' ? externalMedia.src : null;
  const resolvedThumbnailUrl = resolveMediaUrl(thumbnailUrl);
  const normalizedMediaType = (mediaType ?? '').toLowerCase();
  const isImageMedia = normalizedMediaType.startsWith('image/');
  const isDirectImageUrl = /\.(avif|bmp|gif|jpe?g|png|svg|webp)(?:[?#].*)?$/i.test(mediaUrl ?? '');
  const shouldUseMediaUrlAsImage = hasGallery || isImageMedia || isDirectImageUrl;
  const shouldUseThumbnailAsImage =
    !hasGallery &&
    !externalMedia &&
    !isVideoMedia &&
    !shouldUseMediaUrlAsImage &&
    Boolean(resolvedThumbnailUrl);
  const displayImage = hasGallery
    ? resolvedMediaUrl
    : shouldUseMediaUrlAsImage
      ? resolvedMediaUrl
      : shouldUseThumbnailAsImage
        ? resolvedThumbnailUrl
        : null;
  const isEmbeddableVideo = Boolean(embedUrl || externalVideoUrl);
  const embedSizing = getEmbedSizing(embedUrl ?? externalVideoUrl ?? undefined);
  const isGalleryVideo =
    (galleryItem?.media_type ?? '').startsWith('video') ||
    /\.(mp4|webm|mov|m4v|ogg)$/i.test(galleryItem?.url ?? '');
  const isPlayableVideo = isEmbeddableVideo || isVideoMedia || (hasGallery && isGalleryVideo);
  const isHlsVideo = Boolean(
    (resolvedMediaUrl ?? resolvedThumbnailUrl)?.toLowerCase().includes('.m3u8') ||
    (mediaUrl ?? '').toLowerCase().includes('.m3u8')
  );
  const inlineVideoSrc = isVideoMedia || (hasGallery && isGalleryVideo) ? resolvedMediaUrl : null;
  const isFailedImageSrc = (src?: string | null): boolean =>
    Boolean(src && failedImageSrcs.includes(src));
  const handleImageError = (event: SyntheticEvent<HTMLImageElement>) => {
    const failedSrc = event.currentTarget.currentSrc || event.currentTarget.src;
    if (!failedSrc) return;
    setFailedImageSrcs((prev) => (prev.includes(failedSrc) ? prev : [...prev, failedSrc]));
  };
  const visibleDisplayImage = displayImage && !isFailedImageSrc(displayImage) ? displayImage : null;
  const visibleThumbnailImage =
    resolvedThumbnailUrl && !isFailedImageSrc(resolvedThumbnailUrl) ? resolvedThumbnailUrl : null;
  const containerClasses = isEmbeddableVideo
    ? embedSizing.className
    : `w-full ${imageExpanded ? 'max-h-[80vh]' : 'max-h-[320px]'}`;

  useEffect(() => {
    setFailedImageSrcs([]);
  }, [mediaUrl, thumbnailUrl, galleryIndex]);

  if (!visibleDisplayImage && !inlineVideoSrc && !embedUrl && !externalVideoUrl) {
    return null;
  }

  const handlePrevGallery = (e: React.MouseEvent) => {
    e.stopPropagation();
    setGalleryIndex((prev) => (prev > 0 ? prev - 1 : (galleryImages?.length ?? 1) - 1));
  };

  const handleNextGallery = (e: React.MouseEvent) => {
    e.stopPropagation();
    setGalleryIndex((prev) => (prev < (galleryImages?.length ?? 1) - 1 ? prev + 1 : 0));
  };

  return (
    <div className="mb-4 flex flex-col items-start gap-2">
      <div className="relative w-full">
        <div
          className={`overflow-hidden rounded border border-[var(--color-border)] transition-all duration-200 ${
            isPlayableVideo ? '' : 'cursor-pointer'
          }`}
          onClick={isPlayableVideo ? undefined : onToggleExpanded}
          title={
            isPlayableVideo
              ? undefined
              : imageExpanded
                ? t('posts.media.viewer.clickToShrink')
                : t('posts.media.viewer.clickToEnlarge')
          }
        >
          {embedUrl ? (
            <iframe
              src={embedUrl}
              title={decodedTitle}
              className={containerClasses}
              style={embedSizing.style}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          ) : externalVideoUrl ? (
            <video
              controls
              className={containerClasses}
              style={embedSizing.style}
              src={externalVideoUrl}
              preload="metadata"
              playsInline
            />
          ) : visibleDisplayImage ? (
            isVideoMedia || (hasGallery && isGalleryVideo) ? (
              isHlsVideo ? (
                <HlsVideo
                  src={inlineVideoSrc ?? ''}
                  className={containerClasses}
                  poster={resolvedThumbnailUrl ?? undefined}
                  preload="metadata"
                  controls
                  playsInline
                />
              ) : (
                <video
                  controls
                  className={containerClasses}
                  src={inlineVideoSrc ?? undefined}
                  preload="metadata"
                  playsInline
                />
              )
            ) : (
              <img
                src={visibleDisplayImage}
                alt={
                  hasGallery
                    ? `${decodedTitle} (${galleryIndex + 1}/${galleryImages.length})`
                    : decodedTitle
                }
                loading="lazy"
                decoding="async"
                onError={handleImageError}
                className={`w-full object-contain transition-transform duration-200 ${
                  imageExpanded ? 'max-h-[80vh]' : 'max-h-[320px] hover:scale-[1.03]'
                }`}
              />
            )
          ) : visibleThumbnailImage ? (
            <img
              src={visibleThumbnailImage}
              alt={decodedTitle}
              loading="lazy"
              decoding="async"
              onError={handleImageError}
              className={`w-full object-contain transition-transform duration-200 ${
                imageExpanded ? 'max-h-[80vh]' : 'max-h-[320px] hover:scale-[1.03]'
              }`}
            />
          ) : null}
        </div>
        {hasGallery && galleryImages.length > 1 && (
          <>
            <button
              type="button"
              onClick={handlePrevGallery}
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
              onClick={handleNextGallery}
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
      {!isPlayableVideo && (
        <button
          type="button"
          onClick={onToggleExpanded}
          className="text-xs text-[var(--color-primary)] hover:underline"
        >
          {imageExpanded
            ? t('posts.media.viewer.viewSmaller')
            : t('posts.media.viewer.viewFullSize')}
        </button>
      )}
    </div>
  );
}
