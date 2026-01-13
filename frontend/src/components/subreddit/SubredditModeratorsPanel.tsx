import { EmptyMessage, LoadingMessage } from '../common/StatusMessage';
import type { RedditSubredditModerator } from '../../types/reddit';

const DEFAULT_MODERATORS_FALLBACK = 'Public Reddit API does not provide the moderator list.';

interface SubredditModeratorsPanelProps {
  moderators?: RedditSubredditModerator[];
  isLoading?: boolean;
  fallbackMessage?: string;
}

export function SubredditModeratorsPanel({
  moderators = [],
  isLoading = false,
  fallbackMessage = DEFAULT_MODERATORS_FALLBACK,
}: SubredditModeratorsPanelProps) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
        Moderators
      </h3>
      {isLoading ? (
        <LoadingMessage className="mt-3 text-sm">Loading moderators…</LoadingMessage>
      ) : moderators.length > 0 ? (
        <ul className="mt-3 space-y-2 text-sm text-[var(--color-text-primary)]">
          {moderators.map((mod) => (
            <li key={mod.id} className="flex items-center justify-between">
              <span>u/{mod.name ?? mod.id}</span>
              {mod.mod_permissions && mod.mod_permissions.length > 0 && (
                <span className="text-xs uppercase tracking-wide text-[var(--color-text-secondary)]">
                  {mod.mod_permissions.join(', ')}
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyMessage className="mt-3 text-sm">{fallbackMessage}</EmptyMessage>
      )}
    </div>
  );
}
