export interface FeedTimeRangeOptions {
  timeRange?: string;
  startDate?: string;
  endDate?: string;
}

export const appendTimeRangeParams = (
  params: URLSearchParams,
  options?: FeedTimeRangeOptions
) => {
  if (!options) {
    return;
  }

  if (options.timeRange) {
    params.append('time_range', options.timeRange);
  }

  if (options.startDate) {
    params.append('start', options.startDate);
  }

  if (options.endDate) {
    params.append('end', options.endDate);
  }
};
