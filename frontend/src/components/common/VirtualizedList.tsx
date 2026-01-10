import type { ReactNode } from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';

type VirtualizedListProps<T> = {
  items: T[];
  estimateSize?: number;
  overscan?: number;
  className?: string;
  getKey?: (item: T, index: number) => string | number;
  renderItem: (item: T, index: number) => ReactNode;
};

export function VirtualizedList<T>({
  items,
  estimateSize = 220,
  overscan = 6,
  className = '',
  getKey,
  renderItem,
}: VirtualizedListProps<T>) {
  const virtualizer = useWindowVirtualizer({
    count: items.length,
    estimateSize: () => estimateSize,
    overscan,
  });

  if (items.length === 0) {
    return null;
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
