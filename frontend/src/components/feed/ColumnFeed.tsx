import { useRef, useEffect, useState } from 'react';
import { useColumnFeed } from '../../hooks/useColumnFeed';
import { CompactPostCard } from './CompactPostCard';
import type { ColumnConfig } from '../../contexts/MultiColumnFeedContext';

interface ColumnFeedProps {
  columnId: string;
  config: ColumnConfig;
  isActive: boolean;
  showBorder: boolean;
}

export function ColumnFeed({ columnId, config, isActive, showBorder }: ColumnFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [expandedPostIds, setExpandedPostIds] = useState<Set<string>>(new Set());

  const {
    data,
    isLoading,
    isError,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useColumnFeed(columnId, config);

  // Flatten all pages into single array
  const allPosts = data?.pages.flatMap((page: any) => {
    if ('posts' in page) return page.posts; // Home/hub format (CombinedFeedItem[])
    if ('data' in page && page.data?.children) {
      return page.data.children.map((child: any) => child.data); // Reddit format
    }
    if ('conversations' in page) return page.conversations; // Messages format
    if (Array.isArray(page)) return page; // Generic array format
    return [];
  }) ?? [];

  // Infinite scroll: Load more when scrolled near bottom
  useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl || !isActive) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = scrollEl;
      const scrolledPercentage = (scrollTop + clientHeight) / scrollHeight;

      if (scrolledPercentage > 0.8 && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    };

    scrollEl.addEventListener('scroll', handleScroll);
    return () => scrollEl.removeEventListener('scroll', handleScroll);
  }, [isActive, hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Prevent wheel events from bubbling to other columns
  useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;

    const handleWheel = (e: WheelEvent) => {
      if (isActive) {
        e.stopPropagation();
      }
    };

    scrollEl.addEventListener('wheel', handleWheel, { passive: true });
    return () => scrollEl.removeEventListener('wheel', handleWheel);
  }, [isActive]);

  if (isLoading) {
    return (
      <div
        className={`column-feed flex items-center justify-center ${
          showBorder ? 'border-r border-[var(--color-border)]' : ''
        }`}
        style={{ height: '100%' }}
      >
        <div className="text-sm text-[var(--color-text-muted)]">Loading...</div>
      </div>
    );
  }

  if (isError) {
    return (
      <div
        className={`column-feed flex items-center justify-center p-4 ${
          showBorder ? 'border-r border-[var(--color-border)]' : ''
        }`}
        style={{ height: '100%' }}
      >
        <div className="text-sm text-red-500">
          Error: {error instanceof Error ? error.message : 'Failed to load feed'}
        </div>
      </div>
    );
  }

  if (allPosts.length === 0) {
    return (
      <div
        className={`column-feed flex items-center justify-center p-4 ${
          showBorder ? 'border-r border-[var(--color-border)]' : ''
        }`}
        style={{ height: '100%' }}
      >
        <div className="text-sm text-[var(--color-text-muted)]">No posts to display</div>
      </div>
    );
  }

  const handleToggleExpand = (postId: string) => {
    setExpandedPostIds(prev => {
      const next = new Set(prev);
      if (next.has(postId)) {
        next.delete(postId);
      } else {
        next.add(postId);
      }
      return next;
    });
  };

  return (
    <div
      ref={scrollRef}
      className={`column-feed overflow-y-auto ${
        showBorder ? 'border-r border-[var(--color-border)]' : ''
      } ${isActive ? 'ring-2 ring-inset ring-cyan-500/50' : ''}`}
      style={{
        height: '100%',
        scrollbarWidth: 'thin',
        scrollbarColor: 'var(--color-border) transparent',
      }}
    >
      {allPosts.map((post, index) => {
        const postId = post.id || `${config.feedType}-${index}`;
        return (
          <CompactPostCard
            key={postId}
            post={post}
            feedType={config.feedType}
            isExpanded={expandedPostIds.has(postId)}
            onToggleExpand={() => handleToggleExpand(postId)}
          />
        );
      })}

      {isFetchingNextPage && (
        <div className="p-2 text-center text-xs text-[var(--color-text-muted)]">
          Loading more...
        </div>
      )}

      {!hasNextPage && allPosts.length > 10 && (
        <div className="p-2 text-center text-xs text-[var(--color-text-muted)]">
          End of feed
        </div>
      )}
    </div>
  );
}
