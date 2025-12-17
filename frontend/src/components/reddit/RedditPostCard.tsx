import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatTimestamp } from '../../utils/timeFormat';
import { FlairBadge } from './FlairBadge';
import {
  getDisplayDomain,
  isRedditDomain,
  sanitizeHttpUrl,
  type RedditCrosspostSource,
} from '../../utils/crosspostHelpers';
import { decodeHtmlEntities } from '../../utils/text';

interface RedditPostCardProps {
  post: RedditCrosspostSource & {
    id: string;
    title: string;
    author: string;
    subreddit: string;
    score: number;
    num_comments: number;
    created_utc: number;
    thumbnail?: string;
    url?: string;
    selftext?: string;
    is_self: boolean;
    post_hint?: string;
    is_video?: boolean;
  };
  useRelativeTime: boolean;
  isSaved?: boolean;
  isSaveActionPending?: boolean;
  pendingShouldSave?: boolean;
  onShare?: () => void;
  onToggleSave?: (shouldSave: boolean) => void;
  onHide?: () => void;
  onCrosspost?: () => void;
  hideLabel?: string;
  linkState?: unknown;
}

const IMAGE_URL_REGEX = /\.(jpe?g|png|gif|webp)$/i;

function getExpandableImageUrl(post: RedditPostCardProps['post']): string | undefined {
  const previewUrl = post.preview?.images?.[0]?.source?.url;
  const sanitizedPreview = sanitizeHttpUrl(previewUrl);
  if (sanitizedPreview) {
    return sanitizedPreview;
  }

  const sanitizedPostUrl = sanitizeHttpUrl(post.url);
  if (!sanitizedPostUrl) {
    return undefined;
  }

  if (post.post_hint === 'image' || IMAGE_URL_REGEX.test(sanitizedPostUrl.toLowerCase())) {
    return sanitizedPostUrl;
  }

  return undefined;
}

function getThumbnailUrl(post: RedditPostCardProps['post']): string | null {
  const sanitizedThumbnail = sanitizeHttpUrl(post.thumbnail);
  if (sanitizedThumbnail) {
    return sanitizedThumbnail;
  }

  const previewUrl = post.preview?.images?.[0]?.source?.url;
  const sanitizedPreview = sanitizeHttpUrl(previewUrl);
  if (sanitizedPreview) {
    return sanitizedPreview;
  }

  const oembedThumbnail =
    sanitizeHttpUrl(post.media?.oembed?.thumbnail_url) ??
    sanitizeHttpUrl(post.secure_media?.oembed?.thumbnail_url);
  if (oembedThumbnail) {
    return oembedThumbnail;
  }

  return null;
}

export function RedditPostCard({
  post,
  useRelativeTime,
  isSaved = false,
  isSaveActionPending = false,
  pendingShouldSave = false,
  onShare,
  onToggleSave,
  onHide,
  onCrosspost,
  hideLabel = 'Hide',
  linkState,
}: RedditPostCardProps) {
  const [expandedImageMap, setExpandedImageMap] = useState<Record<string, boolean>>({});

  const toggleInlinePreview = (postId: string) => {
    setExpandedImageMap((prev) => ({
      ...prev,
      [postId]: !prev[postId],
    }));
  };

  const postUrl = `/r/${post.subreddit}/comments/${post.id}`;
  const thumbnail = getThumbnailUrl(post);
  const sanitizedExternalUrl = sanitizeHttpUrl(post.url);
  const externalDomain = getDisplayDomain(sanitizedExternalUrl);
  const isExternalLink = Boolean(
    sanitizedExternalUrl && externalDomain && !isRedditDomain(externalDomain)
  );
  const commentLabel = `${post.num_comments.toLocaleString()} Comments`;
  const previewImageUrl = getExpandableImageUrl(post);
  const isInlinePreviewOpen = !!(previewImageUrl && expandedImageMap[post.id]);

  return (
    <article className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="flex gap-3 p-3">
        {thumbnail && (
          <img src={thumbnail} alt="" className="h-14 w-14 flex-shrink-0 rounded object-cover" />
        )}
        <div className="flex-1 text-left">
          <div className="flex flex-wrap items-center gap-2">
            {isExternalLink ? (
              <a
                href={sanitizedExternalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 text-base font-semibold text-[var(--color-text-primary)] hover:text-[var(--color-primary)]"
              >
                {decodeHtmlEntities(post.title)}
              </a>
            ) : (
              <Link
                to={postUrl}
                state={linkState}
                className="flex-1 text-base font-semibold text-[var(--color-text-primary)] hover:text-[var(--color-primary)]"
              >
                {decodeHtmlEntities(post.title)}
              </Link>
            )}
        <FlairBadge
          text={decodeHtmlEntities(post.link_flair_text)}
              backgroundColor={post.link_flair_background_color}
              textColor={post.link_flair_text_color}
            />
            {isExternalLink && (
              <a
                href={sanitizedExternalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded border border-[var(--color-border)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-secondary)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
              >
                {externalDomain ?? 'external'}
                <svg
                  className="h-3 w-3"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0112.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h5a.75.75 0 010 1.5h-5z"
                    clipRule="evenodd"
                  />
                  <path
                    fillRule="evenodd"
                    d="M6.194 12.753a.75.75 0 001.06.053L16.5 4.44v2.81a.75.75 0 001.5 0v-4.5a.75.75 0 00-.75-.75h-4.5a.75.75 0 000 1.5h2.553l-9.056 8.194a.75.75 0 00-.053 1.06z"
                    clipRule="evenodd"
                  />
                </svg>
              </a>
            )}
          </div>
          <div className="mt-1 flex items-start gap-3 text-[11px] text-[var(--color-text-secondary)]">
            {previewImageUrl && (
              <button
                type="button"
                onClick={() => toggleInlinePreview(post.id)}
                aria-pressed={isInlinePreviewOpen}
                aria-label={isInlinePreviewOpen ? 'Hide image preview' : 'Show image preview'}
                className="flex h-7 w-7 items-center justify-center rounded border border-[var(--color-border)] bg-[var(--color-surface-elevated)] text-[var(--color-text-secondary)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
              >
                <span className="sr-only">
                  {isInlinePreviewOpen ? 'Hide image preview' : 'Show image preview'}
                </span>
                {isInlinePreviewOpen ? (
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <line x1="6" y1="6" x2="18" y2="18" />
                    <line x1="6" y1="18" x2="18" y2="6" />
                  </svg>
                ) : (
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M8 5.5v13l10.5-6.5L8 5.5Z" />
                  </svg>
                )}
              </button>
            )}
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  to={`/r/${post.subreddit}`}
                  className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                >
                  r/{post.subreddit}
                </Link>
                <span>•</span>
                <Link
                  to={`/reddit/user/${post.author}`}
                  className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                >
                  u/{post.author}
                </Link>
                <span>•</span>
                <span>{post.score.toLocaleString()} points</span>
                <span>•</span>
                <span>submitted {formatTimestamp(post.created_utc, useRelativeTime)}</span>
              </div>
              {isInlinePreviewOpen && previewImageUrl && (
                <div className="mt-3 overflow-hidden rounded border border-[var(--color-border)] bg-[var(--color-surface-elevated)]">
                  <img
                    src={previewImageUrl}
                    alt={post.title}
                    className="max-h-[70vh] w-full object-contain"
                  />
                </div>
              )}
              <div className="mt-1 flex flex-wrap items-center gap-3">
            <Link
              to={postUrl}
              state={linkState}
              className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
            >
              {commentLabel}
            </Link>
                {onShare && (
                  <button
                    type="button"
                    onClick={onShare}
                    className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                  >
                    Share
                  </button>
                )}
                {onToggleSave && (
                  <button
                    type="button"
                    onClick={() => onToggleSave(!isSaved)}
                    disabled={isSaveActionPending}
                    className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] disabled:opacity-50"
                  >
                    {isSaveActionPending
                      ? pendingShouldSave
                        ? 'Saving...'
                        : 'Unsaving...'
                      : isSaved
                      ? 'Unsave'
                      : 'Save'}
                  </button>
                )}
                {onHide && (
                  <button
                    type="button"
                    onClick={onHide}
                    className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                  >
                    {hideLabel}
                  </button>
                )}
                {onCrosspost && (
                  <button
                    type="button"
                    onClick={onCrosspost}
                    className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                  >
                    Crosspost
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
