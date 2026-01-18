import { useState, useMemo } from 'react';
import type { TopTimeRange } from '../constants/topTimeRange';

export function useTimeRangeFilter(sort: string) {
  const [topTimeRange, setTopTimeRange] = useState<TopTimeRange>('day');
  const [customTopStart, setCustomTopStart] = useState('');
  const [customTopEnd, setCustomTopEnd] = useState('');

  const convertInputToISO = (value: string) => {
    if (!value) {
      return undefined;
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return undefined;
    }
    return parsed.toISOString();
  };

  const isTopSort = sort === 'top';
  const isControversialSort = sort === 'controversial';
  const isTimedSort = isTopSort || isControversialSort;
  const isCustomTopRange = isTimedSort && topTimeRange === 'custom';
  const customStartISO = isCustomTopRange ? convertInputToISO(customTopStart) : undefined;
  const customEndISO = isCustomTopRange ? convertInputToISO(customTopEnd) : undefined;
  const isCustomRangeValid = Boolean(customStartISO && customEndISO);

  const timeRangeKey = useMemo(() => {
    if (!isTimedSort) return 'none';
    if (topTimeRange === 'custom') {
      return isCustomRangeValid ? `custom-${customTopStart}-${customTopEnd}` : 'custom-pending';
    }
    return topTimeRange;
  }, [isTimedSort, topTimeRange, isCustomRangeValid, customTopStart, customTopEnd]);

  const timeOptions = useMemo(() => {
    if (!isTimedSort) return undefined;
    if (topTimeRange === 'custom') {
      return isCustomRangeValid
        ? {
            timeRange: 'custom' as const,
            startDate: customStartISO as string,
            endDate: customEndISO as string,
          }
        : undefined;
    }
    return { timeRange: topTimeRange };
  }, [isTimedSort, topTimeRange, isCustomRangeValid, customStartISO, customEndISO]);

  return {
    // State
    topTimeRange,
    customTopStart,
    customTopEnd,

    // Setters
    setTopTimeRange,
    setCustomTopStart,
    setCustomTopEnd,

    // Computed values
    isTopSort,
    isControversialSort,
    isTimedSort,
    isCustomTopRange,
    isCustomRangeValid,
    timeRangeKey,
    timeOptions,
  };
}
