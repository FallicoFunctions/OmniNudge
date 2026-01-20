import { Link, useLocation } from 'react-router-dom';
import { useMemo, useState } from 'react';
import type { PointerEvent } from 'react';
import { formatTimestamp } from '../../utils/timeFormat';
import { resolveMediaUrl } from '../../utils/mediaUrl';
import { VoteButtons } from '../VoteButtons';
import type { PlatformPost } from '../../types/posts';
import { canModerateContent, requiresModerator } from '../../utils/permissions';
import { PostBodyMarkdown } from '../posts/PostBodyMarkdown';
import { PinnedBadge } from './PinnedBadge';
import { getPostUrl } from '../../utils/postUrl';
import { useSettings } from '../../contexts/SettingsContext';

interface PlatformPostCardProps {
  post: PlatformPost;
  useRelativeTime: boolean;
  currentUserId?: number;
  currentUserRole?: string;
  isModerator?: boolean;
  hubNameMap?: Map<number, string>;
  hubDisplayTitle?: string | null;
  currentHubName?: string;
  isSaved?: boolean;
  isSavePending?: boolean;
  isHiding?: boolean;
  isDeleting?: boolean;
  isPinning?: boolean;
  showPinnedGrabber?: boolean;
  showOmniBadge?: boolean; // For local crossposts on subreddit pages
  voteButtonSize?: 'small' | 'medium';
  thumbnailSize?: 'small' | 'medium';
  showTextPreview?: boolean;
  onShare?: () => void;
  onToggleSave?: (shouldSave: boolean) => void;
  onHide?: () => void;
  onCrosspost?: () => void;
  onTogglePin?: () => void;
  onPinnedPointerDown?: (postId: number, event: PointerEvent<HTMLButtonElement>) => void;
  onPinnedPointerUp?: (postId: number, event: PointerEvent<HTMLButtonElement>) => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

export function PlatformPostCard({
  post,
  useRelativeTime,
  currentUserId,
  currentUserRole,
  isModerator = false,
  hubNameMap,
  hubDisplayTitle,
  currentHubName,
  isSaved = false,
  isSavePending = false,
  isHiding = false,
  isDeleting = false,
  isPinning = false,
  showPinnedGrabber = false,
  showOmniBadge = false,
  voteButtonSize = 'medium',
  thumbnailSize = 'medium',
  showTextPreview = true,
  onShare,
  onToggleSave,
  onHide,
  onCrosspost,
  onTogglePin,
  onPinnedPointerDown,
  onPinnedPointerUp,
  onEdit,
  onDelete,
}: PlatformPostCardProps) {
  const [expandedTextMap, setExpandedTextMap] = useState<Record<number, boolean>>({});
  const { blockNsfwThumbnails } = useSettings();

  const toggleTextPreview = (postId: number) => {
    setExpandedTextMap((prev) => ({
      ...prev,
      [postId]: !prev[postId],
    }));
  };

  const location = useLocation();
  const originState = useMemo(
    () => ({ originPath: `${location.pathname}${location.search}` }),
    [location.pathname, location.search]
  );

  const resolvedHubName =
    currentHubName ||
    post.hub?.name ||
    post.hub_name ||
    (post.hub_id ? hubNameMap?.get(post.hub_id) : undefined);
  const resolvedHubTitle = hubDisplayTitle?.trim() || undefined;

  const displayAuthor =
    post.author_username ||
    post.author?.username ||
    (post.author_id === currentUserId ? 'You' : undefined) ||
    'Unknown';

  const pointsLabel = `${post.score.toLocaleString()} point${post.score === 1 ? '' : 's'}`;
  const submittedLabel = formatTimestamp(
    post.crossposted_at ?? post.created_at,
    useRelativeTime
  );
  const commentsLabel = `${(post.comment_count ?? post.num_comments ?? 0).toLocaleString()} Comment${
    (post.comment_count ?? post.num_comments ?? 0) === 1 ? '' : 's'
  }`;

  const canEdit = currentUserId === post.author_id;
  const canDelete = canModerateContent(currentUserId, post.author_id, currentUserRole, isModerator);
  const canPin = requiresModerator(currentUserRole, isModerator);
  const postUrl = getPostUrl(post);

  const hasBody = Boolean(post.body && post.body.trim());
  const hasInlinePreview = Boolean(post.thumbnail_url || hasBody);
  const isInlinePreviewOpen = !!(hasInlinePreview && expandedTextMap[post.id]);

  const thumbnailClass = thumbnailSize === 'small' ? 'h-16 w-16' : 'h-14 w-14';
  const shouldBlurThumbnail = Boolean(post.nsfw && blockNsfwThumbnails);
  const thumbnailOverlayClass =
    thumbnailSize === 'small' ? 'text-[30px]' : 'text-[26px]';

  return (
    <article className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="flex items-start gap-3 p-3">
        {/* Vote buttons */}
        <VoteButtons
          postId={post.id}
          initialScore={post.score}
          initialUserVote={post.user_vote ?? null}
          layout="vertical"
          size={voteButtonSize}
        />
        {post.thumbnail_url && (
          <div className={`relative ${thumbnailClass} flex-shrink-0`}>
            <img
              src={resolveMediaUrl(post.thumbnail_url)}
              alt=""
              loading="lazy"
              decoding="async"
              className={`h-full w-full rounded object-cover ${shouldBlurThumbnail ? 'blur-sm' : ''}`}
            />
            {shouldBlurThumbnail && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span
                  className={`${thumbnailOverlayClass} inline-flex items-center font-extrabold leading-none text-white`}
                  style={{ textShadow: '0 0 2px #000' }}
                >
                  <span>18</span>
                  <span className="relative" style={{ fontSize: '0.95em', top: '-0.02em' }}>
                    +
                  </span>
                </span>
              </div>
            )}
          </div>
        )}
        <div className="flex-1 space-y-1 text-left">
          <div className="flex flex-wrap items-center gap-2">
            <Link to={postUrl} state={originState} className="flex-1">
              <h3 className="text-lg font-semibold leading-snug text-[var(--color-text-primary)] hover:text-[var(--color-primary)]">
                {post.title}
              </h3>
            </Link>
            {showOmniBadge && (
              <span className="inline-flex items-center rounded bg-blue-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                Omni
              </span>
            )}
            {post.nsfw && (
              <span className="inline-flex items-center rounded bg-red-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                NSFW
              </span>
            )}
            {post.is_pinned && <PinnedBadge />}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[11px] leading-tight text-[var(--color-text-secondary)]">
            {resolvedHubName ? (
              <Link
                to={`/h/${resolvedHubName}`}
                className="font-semibold text-[var(--color-text-primary)] hover:text-[var(--color-primary)]"
              >
                {resolvedHubTitle ?? `h/${resolvedHubName}`}
              </Link>
            ) : (
              <span className="font-semibold text-[var(--color-text-primary)]">h/unknown</span>
            )}
            <span>•</span>
            <span>{displayAuthor}</span>
            <span>•</span>
            <span>{pointsLabel}</span>
            <span>•</span>
            <span>submitted {submittedLabel}</span>
          </div>

          <div className="mt-1 flex items-start gap-3 text-[11px] text-[var(--color-text-secondary)]">
            {showTextPreview && hasInlinePreview && (
              <button
                type="button"
                onClick={() => toggleTextPreview(post.id)}
                aria-pressed={!!expandedTextMap[post.id]}
                aria-label={isInlinePreviewOpen ? 'Hide preview' : 'Show preview'}
                className="flex h-7 w-7 items-center justify-center rounded border border-[var(--color-border)] bg-[var(--color-surface-elevated)] text-[var(--color-text-secondary)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
              >
                <span className="sr-only">
                  {isInlinePreviewOpen ? 'Hide preview' : 'Show preview'}
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
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  to={postUrl}
                  state={originState}
                  className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                >
                  {commentsLabel}
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
                    disabled={isSavePending}
                    className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] disabled:opacity-60"
                  >
                    {isSavePending ? 'Saving...' : isSaved ? 'Unsave' : 'Save'}
                  </button>
                )}
                {onHide && (
                  <button
                    type="button"
                    onClick={onHide}
                    disabled={isHiding}
                    className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] disabled:opacity-60"
                  >
                    {isHiding ? 'Hiding...' : 'Hide'}
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
                {onTogglePin && canPin && (
                  <button
                    type="button"
                    onClick={onTogglePin}
                    disabled={isPinning}
                    className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] disabled:opacity-60"
                  >
                    {isPinning ? 'Updating...' : post.is_pinned ? 'Unpin' : 'Pin'}
                  </button>
                )}
                {canEdit && onEdit && (
                  <button
                    type="button"
                    onClick={onEdit}
                    className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                  >
                    Edit
                  </button>
                )}
                {canDelete && onDelete && (
                  <button
                    type="button"
                    onClick={onDelete}
                    disabled={isDeleting}
                    className="text-red-600 hover:text-red-500 disabled:opacity-60"
                  >
                    {isDeleting ? 'Deleting...' : 'Delete'}
                  </button>
                )}
              </div>
              {showTextPreview && expandedTextMap[post.id] && (
                <div className="mt-3 overflow-hidden rounded border border-[var(--color-border)] bg-[var(--color-surface-elevated)]">
                  {post.thumbnail_url && post.media_url ? (
                    post.media_type?.startsWith('video') ? (
                      <video
                        src={resolveMediaUrl(post.media_url)}
                        className="max-h-[70vh] w-full bg-black"
                        controls
                        playsInline
                        preload="metadata"
                      />
                    ) : (
                      <img
                        src={resolveMediaUrl(post.media_url)}
                        alt={post.title}
                        loading="lazy"
                        decoding="async"
                        className="max-h-[70vh] w-full object-contain"
                      />
                    )
                  ) : hasBody ? (
                    <div className="p-4">
                      <PostBodyMarkdown content={post.body!} />
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </div>
        {showPinnedGrabber && (
          <div className="flex flex-shrink-0 items-start pt-1">
            <button
              type="button"
              onPointerDown={(event) => onPinnedPointerDown?.(post.id, event)}
              onPointerUp={(event) => onPinnedPointerUp?.(post.id, event)}
              className="cursor-grab rounded border border-transparent p-1 text-[var(--color-text-secondary)] hover:border-[var(--color-border)] hover:text-[var(--color-primary)] active:cursor-grabbing"
              aria-label="Reorder pinned post"
              title="Drag to reorder pinned posts"
            >
              <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden="true">
                <circle cx="6" cy="5" r="1.5" />
                <circle cx="14" cy="5" r="1.5" />
                <circle cx="6" cy="10" r="1.5" />
                <circle cx="14" cy="10" r="1.5" />
                <circle cx="6" cy="15" r="1.5" />
                <circle cx="14" cy="15" r="1.5" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
