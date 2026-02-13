import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getPostUrl } from '../../utils/postUrl';
import { resolveMediaUrl } from '../../utils/mediaUrl';
import { sanitizeHttpUrl } from '../../utils/crosspostHelpers';
import { useFormat } from '../../hooks/useFormat';
import type { PlatformPost } from '../../types/posts';
import type { CombinedFeedItem } from '../../services/feedService';
import type { LocalSubredditPost } from '../../services/hubsService';
import type { RedditApiPost } from '../../types/reddit';

const IMAGE_URL_REGEX = /\.(jpe?g|png|gif|webp)$/i;

type ScrollSource = 'home' | 'subreddit' | 'hub' | 'messages' | 'reddit';

type ScrollPost = {
  id?: string | number;
  title?: string;
  author_username?: string | null;
  author?: { username?: string | null } | string | null;
  score?: number;
  comment_count?: number;
  num_comments?: number;
  nsfw?: boolean;
  over_18?: boolean;
  over18?: boolean;
  media_url?: string | null;
  url?: string | null;
  thumbnail_url?: string | null;
  thumbnail?: string | null;
  post_hint?: string | null;
  preview?: { images?: Array<{ source?: { url?: string } }> };
  is_video?: boolean;
  subreddit?: string;
  hub_name?: string | null;
  hub?: { name?: string | null } | null;
  created_at?: string | null;
  created_utc?: number | null;
  crossposted_at?: string | null;
};

function getExpandableImageUrl(post: ScrollPost): string | undefined {
  // Gallery posts are handled separately, don't return thumbnail as preview
  const isGalleryPost = post.url?.includes('/gallery/');
  if (isGalleryPost) {
    return undefined;
  }

  // Check for regular image preview
  const previewUrl = post.preview?.images?.[0]?.source?.url;
  const sanitizedPreview = sanitizeHttpUrl(previewUrl);
  if (sanitizedPreview) {
    return sanitizedPreview;
  }

  // Check direct image URL
  const sanitizedPostUrl = sanitizeHttpUrl(post.url);
  if (!sanitizedPostUrl) {
    return undefined;
  }

  if (post.post_hint === 'image' || IMAGE_URL_REGEX.test(sanitizedPostUrl.toLowerCase())) {
    return sanitizedPostUrl;
  }

  return undefined;
}

interface StandardScrollPostProps {
  post: CombinedFeedItem | RedditApiPost | LocalSubredditPost | PlatformPost;
  feedType: 'home' | 'subreddit' | 'hub' | 'messages';
  isActive: boolean;
}

export function StandardScrollPost({ post, feedType, isActive }: StandardScrollPostProps) {
  const { t } = useTranslation();
  const { formatRelativeTime } = useFormat();
  // Determine post type and extract data
  const isRedditPost = 'subreddit' in post || 'permalink' in post;
  const isHubPost = 'hub_name' in post && !('subreddit' in post);
  const isCombinedItem = 'source' in post && 'post' in post;

  let actualPost: ScrollPost = post as ScrollPost;
  let source: ScrollSource = feedType;

  // Unwrap CombinedFeedItem if needed
  if (isCombinedItem) {
    const combinedItem = post as CombinedFeedItem;
    actualPost = combinedItem.post as ScrollPost;
    source = combinedItem.source === 'reddit' ? 'reddit' : 'hub';
  }

  const title = actualPost.title || t('posts.compact.untitled');
  const author =
    actualPost.author_username ||
    (typeof actualPost.author === 'string' ? actualPost.author : actualPost.author?.username) ||
    t('posts.compact.unknownUser');
  const score = actualPost.score ?? 0;
  const commentCount = actualPost.comment_count ?? actualPost.num_comments ?? 0;
  const nsfw = actualPost.nsfw || actualPost.over_18 || actualPost.over18 || false;

  // Media handling
  let mediaUrl = actualPost.media_url || actualPost.url;
  let thumbnailUrl = actualPost.thumbnail_url || actualPost.thumbnail;

  // For Reddit posts, use the same logic as RedditPostCard
  if (isRedditPost || source === 'reddit') {
    const expandableImageUrl = getExpandableImageUrl(actualPost);
    console.log('[StandardScroll Debug]', {
      postId: actualPost.id,
      title: title.substring(0, 50),
      hasPreviewField: 'preview' in actualPost,
      previewImages: actualPost.preview?.images?.length,
      previewSourceUrl: actualPost.preview?.images?.[0]?.source?.url,
      postHint: actualPost.post_hint,
      postUrl: actualPost.url,
      expandableImageUrl,
      mediaUrl,
    });
    if (expandableImageUrl) {
      mediaUrl = expandableImageUrl;
      // Clear thumbnail when we have high-res image
      thumbnailUrl = null;
    }
  }

  if (
    thumbnailUrl === 'self' ||
    thumbnailUrl === 'default' ||
    thumbnailUrl === 'nsfw' ||
    thumbnailUrl === 'spoiler'
  ) {
    thumbnailUrl = null;
  }

  // Determine if media is video
  const isVideo =
    actualPost.is_video ||
    mediaUrl?.includes('.mp4') ||
    mediaUrl?.includes('.webm') ||
    mediaUrl?.includes('v.redd.it');

  // URL generation
  let postUrl = '#';
  if (isHubPost || source === 'hub') {
    postUrl = getPostUrl(actualPost as PlatformPost);
  } else if (isRedditPost || source === 'reddit') {
    postUrl = `/r/${actualPost.subreddit}/comments/${actualPost.id}`;
  }

  // Time formatting
  let timeAgo = '';
  if (actualPost.created_at) {
    timeAgo = formatRelativeTime(actualPost.created_at);
  } else if (actualPost.created_utc) {
    timeAgo = formatRelativeTime(actualPost.created_utc * 1000);
  } else if (actualPost.crossposted_at) {
    timeAgo = formatRelativeTime(actualPost.crossposted_at);
  }

  // Source badge
  let sourceBadge = '';
  if (isHubPost || source === 'hub') {
    const hubName = actualPost.hub_name || actualPost.hub?.name;
    sourceBadge = hubName ? t('common.format.hubPath', { name: hubName }) : '';
  } else if (isRedditPost || source === 'reddit') {
    const subredditName = actualPost.subreddit;
    sourceBadge = subredditName ? t('common.format.subredditPath', { name: subredditName }) : '';
  }

  return (
    <div className="h-screen w-full flex items-center justify-center snap-start relative bg-black">
      {/* Background media (blurred) */}
      {(mediaUrl || thumbnailUrl) && (
        <div className="absolute inset-0 overflow-hidden opacity-20">
          {isVideo ? (
            <video
              src={mediaUrl?.startsWith('http') ? mediaUrl : resolveMediaUrl(mediaUrl)}
              className="w-full h-full object-cover blur-xl"
              autoPlay
              muted
              loop
              playsInline
            />
          ) : (
            <img
              src={
                mediaUrl?.startsWith('http')
                  ? mediaUrl
                  : thumbnailUrl?.startsWith('http')
                    ? thumbnailUrl
                    : resolveMediaUrl(mediaUrl || thumbnailUrl || '')
              }
              alt=""
              className="w-full h-full object-cover blur-xl"
            />
          )}
        </div>
      )}

      {/* Content container */}
      <div className="relative z-10 w-full h-full flex flex-col p-8 max-w-5xl mx-auto">
        {/* Top metadata bar */}
        <div className="flex items-center justify-between text-white mb-4">
          <div className="flex items-center gap-3">
            {sourceBadge && (
              <span className="px-3 py-1 bg-cyan-500/20 border border-cyan-500/50 rounded-full text-cyan-400 text-sm font-medium">
                {sourceBadge}
              </span>
            )}
            {nsfw && (
              <span className="px-3 py-1 bg-red-500/20 border border-red-500/50 rounded-full text-red-400 text-sm font-medium">
                {t('posts.badges.nsfw')}
              </span>
            )}
          </div>
          <div className="text-gray-400 text-sm">{timeAgo}</div>
        </div>

        {/* Main media area */}
        <div className="flex-1 flex items-center justify-center mb-6">
          {isVideo && mediaUrl ? (
            <video
              src={mediaUrl?.startsWith('http') ? mediaUrl : resolveMediaUrl(mediaUrl)}
              className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
              controls
              autoPlay={isActive}
              loop
              playsInline
            />
          ) : mediaUrl || thumbnailUrl ? (
            <img
              src={
                mediaUrl?.startsWith('http')
                  ? mediaUrl
                  : thumbnailUrl?.startsWith('http')
                    ? thumbnailUrl
                    : resolveMediaUrl(mediaUrl || thumbnailUrl || '')
              }
              alt={title}
              className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-500">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-24 w-24"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
            </div>
          )}
        </div>

        {/* Bottom info */}
        <div className="text-white">
          {/* Title */}
          <Link to={postUrl} className="block group">
            <h2 className="text-2xl font-bold mb-3 group-hover:text-cyan-400 transition-colors line-clamp-3">
              {title}
            </h2>
          </Link>

          {/* Metadata */}
          <div className="flex items-center gap-4 text-gray-400 text-sm">
            <span className="flex items-center gap-1">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
              {author}
            </span>
            <span className="flex items-center gap-1">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 15l7-7 7 7"
                />
              </svg>
              {score}
            </span>
            <span className="flex items-center gap-1">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
              {commentCount}
            </span>
          </div>
        </div>
      </div>

      {/* Scroll hint indicator (only show on first post) */}
      {isActive && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce text-white/50">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-8 w-8"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      )}
    </div>
  );
}
