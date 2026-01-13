import { useState } from 'react';
import type { GalleryImage } from '../../types/posts';
import { resolveMediaUrl } from '../../utils/mediaUrl';

type PostDetailMediaProps = {
  mediaUrl?: string | null;
  thumbnailUrl?: string | null;
  galleryImages?: GalleryImage[];
  decodedTitle: string;
  isVideoMedia: boolean;
  imageExpanded: boolean;
  onToggleExpanded: () => void;
};

export function PostDetailMedia({
  mediaUrl,
  thumbnailUrl,
  galleryImages,
  decodedTitle,
  isVideoMedia,
  imageExpanded,
  onToggleExpanded,
}: PostDetailMediaProps) {
  const [galleryIndex, setGalleryIndex] = useState(0);

  const hasGallery = galleryImages && galleryImages.length > 0;
  const galleryItem = hasGallery ? galleryImages[galleryIndex] : undefined;
  const displayImage = hasGallery
    ? resolveMediaUrl(galleryItem?.url)
    : resolveMediaUrl(mediaUrl);
  const resolvedThumbnailUrl = resolveMediaUrl(thumbnailUrl);
  const isGalleryVideo =
    (galleryItem?.media_type ?? '').startsWith('video') ||
    /\.(mp4|webm|mov|m4v|ogg)$/i.test(galleryItem?.url ?? '');

  if (!displayImage && !resolvedThumbnailUrl) {
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
          className="cursor-pointer overflow-hidden rounded border border-[var(--color-border)] transition-all duration-200"
          onClick={onToggleExpanded}
          title={imageExpanded ? 'Click to shrink' : 'Click to enlarge'}
        >
          {displayImage ? (
            isVideoMedia || (hasGallery && isGalleryVideo) ? (
              <video
                controls
                className={`w-full object-contain ${imageExpanded ? 'max-h-[80vh]' : 'max-h-[320px]'}`}
                src={displayImage}
                preload="metadata"
              />
            ) : (
              <img
                src={displayImage}
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
            )
          ) : (
            <img
              src={resolvedThumbnailUrl ?? ''}
              alt={decodedTitle}
              loading="lazy"
              decoding="async"
              className={`w-full object-contain transition-transform duration-200 ${
                imageExpanded ? 'max-h-[80vh]' : 'max-h-[320px] hover:scale-[1.03]'
              }`}
            />
          )}
        </div>
        {hasGallery && galleryImages.length > 1 && (
          <>
            <button
              type="button"
              onClick={handlePrevGallery}
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
              aria-label="Previous image"
            >
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              type="button"
              onClick={handleNextGallery}
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
  );
}
