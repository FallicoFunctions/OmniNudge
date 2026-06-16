function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function parseRedditSlideshowInput(
  input: string,
  hubPrefix: string,
  subredditPrefix: string
): { isHub: boolean; name: string } {
  const trimmed = input.trim();
  const normalized = trimmed.toLowerCase();
  const hubPrefixLower = hubPrefix.toLowerCase();

  const escapedHubPrefix = escapeRegExp(hubPrefix);
  const escapedSubredditPrefix = escapeRegExp(subredditPrefix);
  const localizedPrefixPattern = new RegExp(
    `^(?:${escapedHubPrefix}|${escapedSubredditPrefix})`,
    'i'
  );
  const canonicalPrefixPattern = /^[hr]\//i;

  const isHub = normalized.startsWith(hubPrefixLower) || normalized.startsWith('h/');

  const name = trimmed
    .replace(localizedPrefixPattern, '')
    .replace(canonicalPrefixPattern, '')
    .trim();

  return { isHub, name };
}

export function formatRedditSlideshowInput(
  type: 'hub' | 'subreddit',
  name: string,
  hubPrefix: string,
  subredditPrefix: string
): string {
  const prefix = type === 'hub' ? hubPrefix : subredditPrefix;
  return `${prefix}${name}`;
}
