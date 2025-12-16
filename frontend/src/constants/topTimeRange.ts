export type TopTimeRange = 'hour' | 'day' | 'week' | 'year' | 'all' | 'custom';

export const TOP_TIME_OPTIONS: Array<{ value: TopTimeRange; label: string }> = [
  { value: 'day', label: 'Past 24 hours' },
  { value: 'hour', label: 'Past hour' },
  { value: 'week', label: 'Past week' },
  { value: 'year', label: 'Past year' },
  { value: 'all', label: 'All time' },
  { value: 'custom', label: 'Custom range' },
];
