import { Link, useLocation } from 'react-router-dom';
import { useMemo } from 'react';
import type { PointerEvent } from 'react';
import { formatTimestamp } from '../../utils/timeFormat';
import { resolveMediaUrl } from '../../utils/mediaUrl';
import { VoteButtons } from '../VoteButtons';
import type { PlatformPost } from '../../types/posts';
import { canModerateContent, requiresModerator } from '../../utils/permissions';

interface HubPostCardProps {
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

export function HubPostCard({
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
  onShare,
  onToggleSave,
  onHide,
  onCrosspost,
  onTogglePin,
  onPinnedPointerDown,
  onPinnedPointerUp,
  onEdit,
  onDelete,
}: HubPostCardProps) {
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
  const postUrl = `/posts/${post.id}`;

  return (
    <article className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="flex items-start gap-3 p-3">
        {/* Vote buttons */}
        <VoteButtons
          postId={post.id}
          initialScore={post.score}
          initialUserVote={post.user_vote ?? null}
          layout="vertical"
          size="medium"
        />
        {post.thumbnail_url && (
          <img
            src={resolveMediaUrl(post.thumbnail_url)}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-14 w-14 flex-shrink-0 rounded object-cover"
          />
        )}
        <div className="flex-1 space-y-1 text-left">
          <Link to={postUrl} state={originState}>
            <h3 className="text-lg font-semibold leading-snug text-[var(--color-text-primary)] hover:text-[var(--color-primary)]">
              {post.title}
            </h3>
          </Link>

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

          <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] leading-tight text-[var(--color-text-secondary)]">
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
