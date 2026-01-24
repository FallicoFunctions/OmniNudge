import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useMultiColumnFeed } from '../../contexts/MultiColumnFeedContext';
import { useColumnFeed } from '../../hooks/useColumnFeed';
import { StandardScrollPost } from './StandardScrollPost';
import { StandardScrollControls } from './StandardScrollControls';
import type { CombinedFeedItem } from '../../services/feedService';
import type { RedditApiPost } from '../../types/reddit';
import type { LocalSubredditPost } from '../../services/hubsService';
import type { PlatformPost } from '../../types/posts';

interface StandardScrollProps {
  onClose: () => void;
}

export function StandardScroll({ onClose }: StandardScrollProps) {
  const { state } = useMultiColumnFeed();

  // Use first column config for the feed source
  const config = state.columns[0] || {
    id: 'default',
    feedType: 'home' as const,
    sort: 'hot' as const,
    timeRange: 'day' as const,
    cursorStack: [],
    currentCursor: '',
  };

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useColumnFeed(
    'standard-scroll',
    config
  );

  const [currentIndex, setCurrentIndex] = useState(0);
  const [autoAdvance, setAutoAdvance] = useState(false);
  const [autoAdvanceInterval, setAutoAdvanceInterval] = useState(5000); // 5 seconds default
  const [manualOverride, setManualOverride] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const scrollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const autoAdvanceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastScrollTimeRef = useRef<number>(0);

  type StandardScrollItem = CombinedFeedItem | RedditApiPost | LocalSubredditPost | PlatformPost;

  // Flatten all posts from all pages
  const allPosts = useMemo<StandardScrollItem[]>(() => {
    const pages = data?.pages ?? [];
    return pages.flatMap((page) => {
      if (Array.isArray(page)) return page as StandardScrollItem[];
      if (!page || typeof page !== 'object') return [];
      if ('data' in page) {
        const items = (page as { data?: StandardScrollItem[] }).data;
        if (Array.isArray(items)) {
          return items;
        }
      }
      if ('posts' in page && Array.isArray((page as { posts?: unknown }).posts)) {
        return (page as { posts: StandardScrollItem[] }).posts;
      }
      return [];
    });
  }, [data?.pages]);

  const getPostId = useCallback((post: StandardScrollItem, index: number) => {
    if (post && typeof post === 'object') {
      if ('post' in post) {
        const inner = (post as CombinedFeedItem).post as { id?: string | number };
        if (inner?.id !== undefined) {
          return inner.id;
        }
      }
      if ('id' in post && (post as { id?: string | number }).id !== undefined) {
        return (post as { id: string | number }).id;
      }
    }
    return `standard-scroll-${index}`;
  }, []);

  // Auto-advance logic
  const handleNext = useCallback(() => {
    if (currentIndex < allPosts.length - 1) {
      setCurrentIndex((prev) => prev + 1);

      // Trigger next page fetch when approaching end
      if (currentIndex >= allPosts.length - 3 && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    } else if (hasNextPage && !isFetchingNextPage) {
      // At end of current posts, fetch more
      fetchNextPage();
    }
  }, [currentIndex, allPosts.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handlePrevious = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
    }
  }, [currentIndex]);

  // Auto-advance timer
  useEffect(() => {
    if (!autoAdvance || manualOverride) {
      if (autoAdvanceTimerRef.current) {
        clearInterval(autoAdvanceTimerRef.current);
        autoAdvanceTimerRef.current = null;
      }
      return;
    }

    autoAdvanceTimerRef.current = setInterval(() => {
      handleNext();
    }, autoAdvanceInterval);

    return () => {
      if (autoAdvanceTimerRef.current) {
        clearInterval(autoAdvanceTimerRef.current);
      }
    };
  }, [autoAdvance, autoAdvanceInterval, manualOverride, handleNext]);

  // Manual override timer (pause auto-advance for 3 seconds after user scroll)
  useEffect(() => {
    if (manualOverride) {
      if (scrollTimerRef.current) {
        clearTimeout(scrollTimerRef.current);
      }

      scrollTimerRef.current = setTimeout(() => {
        setManualOverride(false);
      }, 3000);
    }

    return () => {
      if (scrollTimerRef.current) {
        clearTimeout(scrollTimerRef.current);
      }
    };
  }, [manualOverride]);

  // Scroll to current index
  useEffect(() => {
    if (containerRef.current && allPosts.length > 0) {
      const postElement = containerRef.current.children[currentIndex] as HTMLElement;
      if (postElement) {
        postElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }, [currentIndex, allPosts.length]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setManualOverride(true);
        handleNext();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setManualOverride(true);
        handlePrevious();
      } else if (e.key === ' ') {
        e.preventDefault();
        setAutoAdvance((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNext, handlePrevious, onClose]);

  // Wheel scroll detection for manual override
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      const now = Date.now();

      // Debounce wheel events
      if (now - lastScrollTimeRef.current < 100) {
        return;
      }

      lastScrollTimeRef.current = now;
      setManualOverride(true);

      // Determine scroll direction
      if (e.deltaY > 0) {
        handleNext();
      } else if (e.deltaY < 0) {
        handlePrevious();
      }
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener('wheel', handleWheel, { passive: true });
      return () => container.removeEventListener('wheel', handleWheel);
    }
  }, [handleNext, handlePrevious]);

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black z-50 flex items-center justify-center">
        <div className="text-white text-lg">Loading feed...</div>
      </div>
    );
  }

  if (allPosts.length === 0) {
    return (
      <div className="fixed inset-0 bg-black z-50 flex items-center justify-center">
        <div className="text-white text-lg">No posts available</div>
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-white hover:text-cyan-500 transition-colors"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-8 w-8"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="view-mode-standard-scroll fixed inset-0 bg-black z-50 overflow-hidden">
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-white hover:text-cyan-500 transition-colors z-20"
        aria-label="Close Scroll"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-8 w-8"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Controls */}
      <StandardScrollControls
        autoAdvance={autoAdvance}
        autoAdvanceInterval={autoAdvanceInterval}
        currentIndex={currentIndex}
        totalPosts={allPosts.length}
        hasMore={hasNextPage || false}
        onToggleAutoAdvance={() => setAutoAdvance(!autoAdvance)}
        onChangeInterval={setAutoAdvanceInterval}
        onNext={handleNext}
        onPrevious={handlePrevious}
      />

      {/* Snap scroll container */}
      <div
        ref={containerRef}
        className="h-full overflow-y-scroll snap-y snap-mandatory scrollbar-hide"
        style={{
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
      >
        {allPosts.map((post, index) => (
          <StandardScrollPost
            key={`${getPostId(post, index)}-${index}`}
            post={post}
            feedType={config.feedType}
            isActive={index === currentIndex}
          />
        ))}

        {/* Loading indicator at bottom */}
        {isFetchingNextPage && (
          <div className="h-screen flex items-center justify-center snap-start">
            <div className="text-white text-lg">Loading more posts...</div>
          </div>
        )}

        {/* End indicator */}
        {!hasNextPage && allPosts.length > 0 && (
          <div className="h-screen flex items-center justify-center snap-start">
            <div className="text-white text-lg">End of feed</div>
          </div>
        )}
      </div>
    </div>
  );
}
