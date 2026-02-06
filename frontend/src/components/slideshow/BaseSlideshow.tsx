import { useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';

export interface SlideshowItem {
  id: string | number;
  content: ReactNode;
}

interface BaseSlideshowProps {
  items: SlideshowItem[];
  initialIndex?: number;
  onClose: () => void;
  autoAdvance?: boolean;
  autoAdvanceInterval?: number;
  showControls?: boolean;
  onSlideChange?: (index: number) => void;
  renderControls?: (props: {
    currentIndex: number;
    totalItems: number;
    autoAdvance: boolean;
    autoAdvanceInterval: number;
    onToggleAutoAdvance: () => void;
    onChangeInterval: (interval: number) => void;
  }) => ReactNode;
}

export function BaseSlideshow({
  items,
  initialIndex = 0,
  onClose,
  autoAdvance: initialAutoAdvance = false,
  autoAdvanceInterval: initialInterval = 5000,
  showControls = true,
  onSlideChange,
  renderControls,
}: BaseSlideshowProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [autoAdvance, setAutoAdvance] = useState(initialAutoAdvance);
  const [autoAdvanceInterval, setAutoAdvanceInterval] = useState(initialInterval);

  // Call onSlideChange when currentIndex changes
  useEffect(() => {
    onSlideChange?.(currentIndex);
  }, [currentIndex, onSlideChange]);

  const handlePrevious = useCallback(() => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : items.length - 1));
  }, [items.length]);

  const handleNext = useCallback(() => {
    setCurrentIndex((prev) => (prev < items.length - 1 ? prev + 1 : 0));
  }, [items.length]);

  const handleToggleAutoAdvance = useCallback(() => {
    setAutoAdvance((prev) => !prev);
  }, []);

  const handleChangeInterval = useCallback((interval: number) => {
    setAutoAdvanceInterval(interval);
  }, []);

  // Auto-advance effect
  useEffect(() => {
    if (!autoAdvance) return;

    const timer = setInterval(() => {
      handleNext();
    }, autoAdvanceInterval);

    return () => clearInterval(timer);
  }, [autoAdvance, autoAdvanceInterval, handleNext]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft') {
        handlePrevious();
      } else if (e.key === 'ArrowRight') {
        handleNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePrevious, handleNext, onClose]);

  // Prevent body scroll when slideshow is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  if (!items || items.length === 0) {
    return (
      <div className="fixed inset-0 z-50 bg-black bg-opacity-95 flex items-center justify-center">
        <div className="text-white text-lg">No media found</div>
      </div>
    );
  }

  const currentItem = items[currentIndex];

  return (
    <div
      className="fixed inset-0 z-50 bg-black bg-opacity-95 flex flex-col"
      onClick={onClose}
    >
      {/* Single header row with counter, controls, and close button */}
      {/* MSG-3: Improved lightbox header with clearer counter */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3 z-10">
        {/* Media counter - left */}
        <div className="text-white text-base font-semibold bg-black/60 backdrop-blur-sm px-4 py-2 rounded-lg">
          Image {currentIndex + 1} of {items.length}
        </div>

        {/* Controls (if provided) - center */}
        {showControls && renderControls && (
          <div className="absolute left-1/2 -translate-x-1/2" onClick={(e) => e.stopPropagation()}>
            {renderControls({
              currentIndex,
              totalItems: items.length,
              autoAdvance,
              autoAdvanceInterval,
              onToggleAutoAdvance: handleToggleAutoAdvance,
              onChangeInterval: handleChangeInterval,
            })}
          </div>
        )}

        {/* Close button - right */}
        <button
          onClick={onClose}
          className="bg-black/60 backdrop-blur-sm hover:bg-red-600/80 text-white transition-colors p-2 rounded-lg"
          aria-label="Close slideshow (Esc)"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      {/* Previous button - MSG-3: More prominent navigation */}
      {items.length > 1 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            handlePrevious();
          }}
          className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/60 backdrop-blur-sm hover:bg-white/20 text-white transition-colors z-10 p-3 rounded-full"
          aria-label="Previous (←)"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-8 w-8"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      )}

      {/* Main content area */}
      <div
        className="flex-1 flex items-center justify-center p-4 pt-10"
        onClick={(e) => e.stopPropagation()}
      >
        {currentItem.content}
      </div>

      {/* Next button - MSG-3: More prominent navigation */}
      {items.length > 1 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleNext();
          }}
          className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/60 backdrop-blur-sm hover:bg-white/20 text-white transition-colors z-10 p-3 rounded-full"
          aria-label="Next (→)"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-8 w-8"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}
    </div>
  );
}
