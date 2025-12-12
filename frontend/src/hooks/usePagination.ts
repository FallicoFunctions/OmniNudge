import { useCallback, useMemo, useState } from 'react';

interface PaginationResult<T> {
  pageIndex: number;
  totalPages: number;
  currentItems: T[];
  canGoPrev: boolean;
  canGoNext: boolean;
  goToPrev: () => void;
  goToNext: () => void;
  resetPage: () => void;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export function usePagination<T>(items: T[], pageSize = 25): PaginationResult<T> {
  const [pageIndex, setPageIndex] = useState(0);

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePageIndex = Math.min(pageIndex, Math.max(0, totalPages - 1));

  const currentItems = useMemo(() => {
    const start = safePageIndex * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, safePageIndex, pageSize]);

  const canGoPrev = safePageIndex > 0;
  const canGoNext = safePageIndex < totalPages - 1;

  const goToPrev = useCallback(() => {
    if (!canGoPrev) return;
    setPageIndex((prev) => clamp(prev - 1, 0, totalPages - 1));
  }, [canGoPrev, totalPages]);

  const goToNext = useCallback(() => {
    if (!canGoNext) return;
    setPageIndex((prev) => clamp(prev + 1, 0, totalPages - 1));
  }, [canGoNext, totalPages]);

  const resetPage = useCallback(() => setPageIndex(0), []);

  return {
    pageIndex: safePageIndex,
    totalPages,
    currentItems,
    canGoPrev,
    canGoNext,
    goToPrev,
    goToNext,
    resetPage,
  };
}
