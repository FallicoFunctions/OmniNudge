import { Link, useLocation } from 'react-router-dom';
import { useMemo } from 'react';
import { formatTimestamp } from '../../utils/timeFormat';
import { VoteButtons } from '../VoteButtons';
import type { PlatformPost } from '../../types/posts';

interface HubPostCardProps {
  post: PlatformPost;
  useRelativeTime: boolean;
  currentUserId?: number;
  hubNameMap?: Map<number, string>;
  currentHubName?: string;
  isSaved?: boolean;
  isSavePending?: boolean;
  isHiding?: boolean;
  isDeleting?: boolean;
  onShare?: () => void;
  onToggleSave?: (shouldSave: boolean) => void;
  onHide?: () => void;
  onCrosspost?: () => void;
  onDelete?: () => void;
}

export function HubPostCard({
  post,
  useRelativeTime,
  currentUserId,
  hubNameMap,
  currentHubName,
  isSaved = false,
  isSavePending = false,
  isHiding = false,
  isDeleting = false,
  onShare,
  onToggleSave,
  onHide,
  onCrosspost,
  onDelete,
}: HubPostCardProps) {
  const location = useLocation();
  const originState = useMemo(
    () => ({ originPath: `${location.pathname}${location.search}` }),
    [location.pathname, location.search]
  );
  const resolvedHubName =
    currentHubName ||
    post.hub_name ||
    post.hub?.name ||
    (post.hub_id ? hubNameMap?.get(post.hub_id) : undefined);

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

  const canDelete = currentUserId === post.author_id;
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
            src={post.thumbnail_url}
            alt=""
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
                to={`/hubs/h/${resolvedHubName}`}
                className="font-semibold text-[var(--color-text-primary)] hover:text-[var(--color-primary)]"
              >
                h/{resolvedHubName}
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
      </div>
    </article>
  );
}
