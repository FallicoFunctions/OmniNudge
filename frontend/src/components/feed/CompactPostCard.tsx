import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { getPostUrl } from '../../utils/postUrl';
import { resolveMediaUrl } from '../../utils/mediaUrl';
import { HlsVideo } from '../common/HlsVideo';
import type { PlatformPost } from '../../types/posts';
import type { CombinedFeedItem } from '../../services/feedService';
import type { Conversation } from '../../types/messages';

interface CompactPostCardProps {
  post: PlatformPost | any; // Can be RedditPost, PlatformPost, or Conversation
  feedType: 'home' | 'subreddit' | 'hub' | 'messages';
}

export function CompactPostCard({ post, feedType }: CompactPostCardProps) {
  // Handle messages differently
  if (feedType === 'messages') {
    const conversation = post as Conversation;
    const otherUser = conversation.other_user;
    const lastMessage = conversation.latest_message;

    return (
      <article className="compact-post-card">
        <Link
          to={`/messages/${conversation.id}`}
          className="block hover:bg-[var(--color-hover)] transition-colors"
        >
          <div className="flex items-start gap-2 p-2">
            {/* Avatar */}
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-[var(--color-background)] overflow-hidden">
              {otherUser?.avatar_url ? (
                <img
                  src={resolveMediaUrl(otherUser.avatar_url)}
                  alt={otherUser.username || 'User'}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[var(--color-text-muted)]">
                  {(otherUser?.username?.[0] || '?').toUpperCase()}
                </div>
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-medium leading-tight text-[var(--color-text)]">
                {otherUser?.username || 'Unknown User'}
              </h3>
              {lastMessage && lastMessage.encrypted_content && (
                <p className="text-xs text-[var(--color-text-muted)] mt-1 line-clamp-1">
                  {lastMessage.encrypted_content}
                </p>
              )}
              <div className="text-xs text-[var(--color-text-muted)] mt-1">
                {conversation.last_message_at && formatDistanceToNow(new Date(conversation.last_message_at), { addSuffix: true })}
              </div>
            </div>
          </div>
        </Link>
        <div className="border-b border-[var(--color-border)]" />
      </article>
    );
  }

  // Determine post type and extract data
  const isRedditPost = 'subreddit' in post || 'permalink' in post;
  const isHubPost = 'hub_name' in post && !('subreddit' in post);
  const isCombinedItem = 'source' in post && 'post' in post;

  let actualPost = post;
  let source: 'home' | 'subreddit' | 'hub' | 'messages' | 'reddit' = feedType;

  // Unwrap CombinedFeedItem if needed
  if (isCombinedItem) {
    const combinedItem = post as CombinedFeedItem;
    actualPost = combinedItem.post;
    source = combinedItem.source as any; // CombinedFeedItem can have 'reddit' source
  }

  const title = actualPost.title || 'Untitled';
  const author = actualPost.author_username || actualPost.author?.username || actualPost.author || 'Unknown';
  const score = actualPost.score ?? 0;
  const commentCount = actualPost.comment_count ?? actualPost.num_comments ?? 0;
  const nsfw = actualPost.nsfw || actualPost.over_18 || actualPost.over18 || false;

  // Media handling - prioritize actual media over thumbnails
  let mediaUrl = actualPost.media_url || actualPost.url;
  let thumbnail = actualPost.thumbnail_url || actualPost.thumbnail;

  // Clean up invalid thumbnails
  if (thumbnail === 'self' || thumbnail === 'default' || thumbnail === 'nsfw' || thumbnail === 'spoiler') {
    thumbnail = null;
  }

  // For Reddit videos, get HLS URL (has audio+video in one stream)
  const redditVideo = actualPost.secure_media?.reddit_video || actualPost.media?.reddit_video;
  const redditHlsUrl = redditVideo?.hls_url;
  const isRedditVideo = Boolean(redditHlsUrl);

  // Determine media type and URL
  const isVideo = actualPost.is_video ||
    isRedditVideo ||
    mediaUrl?.includes('.mp4') ||
    mediaUrl?.includes('.webm') ||
    mediaUrl?.includes('v.redd.it') ||
    mediaUrl?.includes('redgifs.com') ||
    mediaUrl?.includes('gfycat.com');

  const isImage = !isVideo && (
    mediaUrl?.match(/\.(jpg|jpeg|png|gif|webp)$/i) ||
    mediaUrl?.includes('i.redd.it') ||
    mediaUrl?.includes('preview.redd.it') ||
    mediaUrl?.includes('/gallery/') ||
    thumbnail?.includes('i.redd.it') ||
    thumbnail?.includes('preview.redd.it')
  );

  // Determine what media to display
  let displayMedia = null;
  if (isVideo) {
    // For Reddit videos, use HLS URL (contains audio+video)
    if (isRedditVideo && redditHlsUrl) {
      displayMedia = redditHlsUrl;
    } else if (mediaUrl) {
      displayMedia = mediaUrl;
    }
  } else if (isImage) {
    // For images, prefer the full media URL over thumbnail
    if (mediaUrl && (mediaUrl.includes('i.redd.it') || mediaUrl.includes('preview.redd.it') || mediaUrl.match(/\.(jpg|jpeg|png|gif|webp)$/i))) {
      displayMedia = mediaUrl;
    } else if (thumbnail) {
      displayMedia = thumbnail;
    }
  } else if (thumbnail) {
    // Fall back to thumbnail for any post
    displayMedia = thumbnail;
  }

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
    timeAgo = formatDistanceToNow(new Date(actualPost.created_at), { addSuffix: true });
  } else if (actualPost.created_utc) {
    timeAgo = formatDistanceToNow(new Date(actualPost.created_utc * 1000), { addSuffix: true });
  } else if (actualPost.crossposted_at) {
    timeAgo = formatDistanceToNow(new Date(actualPost.crossposted_at), { addSuffix: true });
  }

  // Source badge
  let sourceBadge = '';
  if (isHubPost || source === 'hub') {
    sourceBadge = `h/${actualPost.hub_name || actualPost.hub?.name || 'unknown'}`;
  } else if (isRedditPost || source === 'reddit') {
    sourceBadge = `r/${actualPost.subreddit || 'unknown'}`;
  }

  // Get video poster/preview image
  const videoPoster = isVideo && thumbnail ? (thumbnail.startsWith('http') ? thumbnail : resolveMediaUrl(thumbnail)) : undefined;

  return (
    <article className="compact-post-card">
      {/* Media (full width if available) */}
      {displayMedia && (
        <div className="w-full">
          {isVideo ? (
            <HlsVideo
              src={displayMedia.startsWith('http') ? displayMedia : resolveMediaUrl(displayMedia)}
              poster={videoPoster}
              className="w-full h-auto"
              style={{ display: 'block' }}
              controls
              loop
              playsInline
              preload="metadata"
            />
          ) : (
            <img
              src={displayMedia.startsWith('http') ? displayMedia : resolveMediaUrl(displayMedia)}
              alt={title}
              className="w-full h-auto"
              style={{ display: 'block' }}
              loading="lazy"
            />
          )}
        </div>
      )}

      {/* Content below media */}
      <div className="p-2 bg-[var(--color-surface)] flex gap-2">
        {/* Left side - Text content */}
        <div className="flex-1 min-w-0">
          {/* Title */}
          <Link to={postUrl} className="hover:underline">
            <h3 className="text-sm font-medium leading-tight line-clamp-2" style={{ color: 'var(--ac-text, #e8e8f0)' }}>
              {nsfw && <span className="text-red-500 text-xs mr-1">NSFW</span>}
              {title}
            </h3>
          </Link>

          {/* Source badge */}
          {sourceBadge && (
            <div className="mt-1 overflow-hidden">
              <span className="text-xs block" style={{ color: 'var(--ac-text-muted, #8a8a9a)' }}>{sourceBadge}</span>
            </div>
          )}

          {/* Metadata */}
          <div className="flex items-center gap-1.5 mt-1 text-xs flex-wrap" style={{ color: 'var(--ac-text-muted, #8a8a9a)' }}>
            <span className="truncate" style={{ maxWidth: '80px' }}>{author}</span>
            <span>•</span>
            <span>{score}</span>
            <span>•</span>
            <span>{commentCount}</span>
            {timeAgo && (
              <>
                <span>•</span>
                <span className="whitespace-nowrap">{timeAgo}</span>
              </>
            )}
          </div>
        </div>

        {/* Right side - Vote buttons (only for hub/omni posts) */}
        {(isHubPost || source === 'hub') && (
          <div className="flex flex-col items-center justify-center gap-1">
            <button
              onClick={(e) => {
                e.preventDefault();
                // Upvote functionality placeholder
              }}
              className="text-[var(--color-text-muted)] hover:text-cyan-500 transition-colors"
              aria-label="Upvote"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
            </button>
            <span className="text-xs font-semibold" style={{ color: 'var(--ac-text, #e8e8f0)' }}>
              {score}
            </span>
            <button
              onClick={(e) => {
                e.preventDefault();
                // Downvote functionality placeholder
              }}
              className="text-[var(--color-text-muted)] hover:text-red-500 transition-colors"
              aria-label="Downvote"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M12 5v14M19 12l-7 7-7-7" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Bottom border only (no rounded corners) */}
      <div className="border-b border-[var(--color-border)]" />
    </article>
  );
}
