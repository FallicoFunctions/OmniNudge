import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { resolveMediaUrl } from '../../utils/mediaUrl';
import type { GalleryImage } from '../../types/posts';

interface ImageCarouselProps {
  images: (string | GalleryImage)[];
  title: string;
  className?: string;
  style?: React.CSSProperties;
  onHoverChange?: (isHovered: boolean) => void;
  currentIndex: number;
  onNavigate: (direction: 'prev' | 'next') => void;
}

export function ImageCarousel({
  images,
  title,
  className = '',
  style = {},
  onHoverChange,
  currentIndex,
  onNavigate,
}: ImageCarouselProps) {
  const { t } = useTranslation();
  const [showArrows, setShowArrows] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  if (!images || images.length === 0) {
    return null;
  }

  const handlePreviousClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onNavigate('prev');
  };

  const handleNextClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onNavigate('next');
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (images.length <= 1) return;

    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const width = rect.width;

    // Show both arrows when mouse is within 150px of either edge
    const edgeThreshold = 150;
    const nearLeftEdge = x < edgeThreshold;
    const nearRightEdge = x > width - edgeThreshold;

    setShowArrows(nearLeftEdge || nearRightEdge);
  };

  const handleMouseLeave = () => {
    setShowArrows(false);
    onHoverChange?.(false);
  };

  const handleMouseEnter = () => {
    onHoverChange?.(true);
  };

  // Get the URL from either string or GalleryImage object
  const getCurrentImageUrl = () => {
    const image = images[currentIndex];
    const url = typeof image === 'string' ? image : image.url;
    return url.startsWith('http') ? url : resolveMediaUrl(url);
  };

  return (
    <div
      ref={containerRef}
      className={`relative ${className}`}
      style={style}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseMove={handleMouseMove}
    >
      {/* Main image */}
      <img
        src={getCurrentImageUrl()}
        alt={t('posts.media.carouselImageAlt', {
          title,
          index: currentIndex + 1,
          total: images.length,
        })}
        className="w-full h-auto"
        style={{ display: 'block', maxHeight: 'calc(100vh - 200px)', objectFit: 'contain' }}
        loading="lazy"
      />

      {/* Navigation buttons - only show when mouse is near edges */}
      {images.length > 1 && showArrows && (
        <>
          {/* Left button */}
          <button
            onClick={handlePreviousClick}
            className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-2 transition-all"
            aria-label={t('common.accessibility.previousImage')}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>

          {/* Right button */}
          <button
            onClick={handleNextClick}
            className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-2 transition-all"
            aria-label={t('common.accessibility.nextImage')}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>

          {/* Image counter - show when arrows are visible */}
          <div className="absolute bottom-2 right-2 bg-black/50 text-white text-xs px-2 py-1 rounded">
            {currentIndex + 1} / {images.length}
          </div>
        </>
      )}
    </div>
  );
}
