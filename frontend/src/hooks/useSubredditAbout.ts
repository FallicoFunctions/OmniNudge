import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { redditService } from '../services/redditService';
import type { RedditSubredditAbout } from '../types/reddit';
import { sanitizeHttpUrl } from '../utils/crosspostHelpers';

export const useSubredditAbout = (subreddit?: string | null, enabled: boolean = true) => {
  const query = useQuery<RedditSubredditAbout>({
    queryKey: ['subreddit-about', subreddit],
    queryFn: () => redditService.getSubredditAbout(subreddit ?? ''),
    enabled: enabled && Boolean(subreddit),
    staleTime: 1000 * 60 * 10,
  });

  const iconUrl = useMemo(() => {
    const about = query.data;
    if (!about) return null;
    const candidates = [
      about.community_icon,
      about.icon_img,
      about.banner_img,
      about.banner_background_image,
    ];
    for (const candidate of candidates) {
      if (!candidate) continue;
      const stripped = candidate.split('?')[0];
      const sanitized = sanitizeHttpUrl(stripped);
      if (sanitized) return sanitized;
    }
    return null;
  }, [query.data]);

  return { ...query, iconUrl };
};
