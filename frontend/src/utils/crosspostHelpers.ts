import type { CrosspostRequest, LocalSubredditPost } from '../services/hubsService';

export interface RedditCrosspostSource {
  id: string;
  title: string;
  subreddit: string;
  selftext?: string;
  url?: string;
  thumbnail?: string;
  post_hint?: string;
  is_video?: boolean;
  link_flair_text?: string;
  link_flair_background_color?: string;
  link_flair_text_color?: 'light' | 'dark' | string;
  preview?: {
    images?: Array<{
      source?: { url?: string };
      resolutions?: Array<{ url?: string }>;
    }>;
  };
  media?: {
    reddit_video?: {
      fallback_url?: string;
      dash_url?: string;
      hls_url?: string;
      height?: number;
      width?: number;
    };
    oembed?: {
      thumbnail_url?: string;
      thumbnail_width?: number;
      thumbnail_height?: number;
    };
  };
  secure_media?: {
    reddit_video?: {
      fallback_url?: string;
      dash_url?: string;
      hls_url?: string;
      height?: number;
      width?: number;
    };
    oembed?: {
      thumbnail_url?: string;
      thumbnail_width?: number;
      thumbnail_height?: number;
    };
  };
}

const imageExtensionRegex = /\.(jpe?g|png|gif|webp)$/i;
export function sanitizeHttpUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  const normalized = url.trim().replace(/&amp;/g, '&');
  if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
    return normalized;
  }
  return undefined;
}

function extractPreviewImageUrl(post: RedditCrosspostSource): string | undefined {
  const previewUrl = post.preview?.images?.[0]?.source?.url;
  if (previewUrl) {
    return sanitizeHttpUrl(previewUrl);
  }
  return undefined;
}

function extractHostname(value?: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.hostname;
  } catch {
    return null;
  }
}

export function getDisplayDomain(value?: string | null): string | null {
  const hostname = extractHostname(value);
  return hostname ? hostname.replace(/^www\./i, '') : null;
}

export function isRedditDomain(value?: string | null): boolean {
  if (!value) return false;
  const hostname = value.includes('/') ? extractHostname(value) : value;
  if (!hostname) return false;
  const normalized = hostname.toLowerCase();
  return (
    normalized === 'redd.it' ||
    normalized.endsWith('.redd.it') ||
    normalized === 'reddit.com' ||
    normalized.endsWith('.reddit.com')
  );
}

export function createRedditCrosspostPayload(
  post: RedditCrosspostSource,
  title: string,
  sendReplies: boolean
): CrosspostRequest {
  const payload: CrosspostRequest = {
    title,
    send_replies_to_inbox: sendReplies,
  };

  const body = post.selftext?.trim();
  if (body) {
    payload.body = body;
  }

  const thumbnailUrl = sanitizeHttpUrl(post.thumbnail);
  if (thumbnailUrl) {
    payload.thumbnail_url = thumbnailUrl;
  }

  const previewImageUrl = extractPreviewImageUrl(post);
  if (previewImageUrl && !payload.thumbnail_url) {
    payload.thumbnail_url = previewImageUrl;
  }

  const mediaUrl = sanitizeHttpUrl(post.url);
  if (mediaUrl) {
    if (post.is_video) {
      payload.media_url = mediaUrl;
      payload.media_type = 'video';
    } else if (post.post_hint === 'image' || imageExtensionRegex.test(mediaUrl.toLowerCase())) {
      payload.media_url = mediaUrl;
      payload.media_type = 'image';
    }
  }

  if (!payload.media_url && previewImageUrl) {
    payload.media_url = previewImageUrl;
    payload.media_type = 'image';
  }

  if (!payload.media_url && mediaUrl) {
    payload.media_url = mediaUrl;
  }

  if (!payload.thumbnail_url && payload.media_url && payload.media_type === 'image') {
    payload.thumbnail_url = payload.media_url;
  }

  return payload;
}

export function createLocalCrosspostPayload(
  post: LocalSubredditPost,
  title: string,
  sendReplies: boolean
): CrosspostRequest {
  const thumbnail = post.thumbnail_url ?? post.media_url ?? undefined;
  return {
    title,
    send_replies_to_inbox: sendReplies,
    body: post.body ?? undefined,
    media_url: post.media_url ?? undefined,
    media_type: post.media_type ?? undefined,
    thumbnail_url: thumbnail,
  };
}
