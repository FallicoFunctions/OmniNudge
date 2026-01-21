import type { ReactNode } from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { SkeletonList } from './SkeletonCard';

type VirtualizedListProps<T> = {
  items: T[];
  estimateSize?: number;
  overscan?: number;
  className?: string;
  getKey?: (item: T, index: number) => string | number;
  renderItem: (item: T, index: number) => ReactNode;
  isLoading?: boolean;
  emptyState?: ReactNode;
};

export function VirtualizedList<T>({
  items,
  estimateSize = 120,
  overscan = 6,
  className = '',
  getKey,
  renderItem,
  isLoading = false,
  emptyState,
}: VirtualizedListProps<T>) {
  const virtualizer = useWindowVirtualizer({
    count: items.length,
    estimateSize: () => estimateSize,
    overscan,
  });

  if (isLoading) {
    return <SkeletonList count={Math.ceil((window.innerHeight / estimateSize) * 1.5)} />;
  }

  if (items.length === 0) {
    return emptyState ? <>{emptyState}</> : null;
  }

  return (
    <div className={`relative ${className}`} style={{ height: virtualizer.getTotalSize() }}>
      {virtualizer.getVirtualItems().map((virtualItem) => {
        const item = items[virtualItem.index];
        const key = getKey ? getKey(item, virtualItem.index) : virtualItem.index;

        return (
          <div
            key={key}
            ref={virtualizer.measureElement}
            data-index={virtualItem.index}
            className="absolute left-0 top-0 w-full"
            style={{ transform: `translateY(${virtualItem.start}px)` }}
          >
            {renderItem(item, virtualItem.index)}
          </div>
        );
      })}
    </div>
  );
}
