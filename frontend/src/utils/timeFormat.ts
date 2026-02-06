/**
 * Format a timestamp as relative time (e.g., "4 hours ago", "3 days ago")
 * For timestamps older than 30 days, returns absolute date format
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

  if (diffSeconds < 60) {
    return 'just now';
  } else if (diffMinutes < 60) {
    return `${diffMinutes} ${diffMinutes === 1 ? 'minute' : 'minutes'} ago`;
  } else if (diffHours < 24) {
    return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
  } else if (diffDays < 30) {
    return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
  } else {
    // For > 30 days, show absolute date: "Jan 21, 2026"
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }
}

/**
 * Format a timestamp as an absolute date string with time
 */
export function formatAbsoluteDate(timestamp: number | string | Date): string {
  const date = typeof timestamp === 'number'
    ? new Date(timestamp * 1000) // Assuming Unix timestamp in seconds
    : new Date(timestamp);

  return date.toLocaleString();
}

/**
 * Format a timestamp as an exact date/time string for tooltips
 * Example: "January 21, 2026 at 1:30:45 PM"
 */
export function formatExactTimestamp(timestamp: number | string | Date): string {
  const date = typeof timestamp === 'number'
    ? new Date(timestamp * 1000) // Assuming Unix timestamp in seconds
    : new Date(timestamp);

  return date.toLocaleString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });
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
