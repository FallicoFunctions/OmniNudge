/**
 * Format a timestamp as relative time (e.g., "4 hours ago", "3 days ago")
 */
export function formatRelativeTime(timestamp: number | string | Date): string {
  const date = typeof timestamp === 'number'
    ? new Date(timestamp * 1000) // Assuming Unix timestamp in seconds
    : new Date(timestamp);

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);

  if (diffSeconds < 60) {
    return 'just now';
  } else if (diffMinutes < 60) {
    return `${diffMinutes} ${diffMinutes === 1 ? 'minute' : 'minutes'} ago`;
  } else if (diffHours < 24) {
    return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
  } else if (diffDays < 30) {
    return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
  } else if (diffMonths < 12) {
    return `${diffMonths} ${diffMonths === 1 ? 'month' : 'months'} ago`;
  } else {
    return `${diffYears} ${diffYears === 1 ? 'year' : 'years'} ago`;
  }
}

/**
 * Format a timestamp as an absolute date string
 */
export function formatAbsoluteDate(timestamp: number | string | Date): string {
  const date = typeof timestamp === 'number'
    ? new Date(timestamp * 1000) // Assuming Unix timestamp in seconds
    : new Date(timestamp);

  return date.toLocaleDateString();
}

/**
 * Format a timestamp based on user preference
 */
export function formatTimestamp(
  timestamp: number | string | Date,
  useRelativeTime: boolean = true
): string {
  return useRelativeTime
    ? formatRelativeTime(timestamp)
    : formatAbsoluteDate(timestamp);
}
