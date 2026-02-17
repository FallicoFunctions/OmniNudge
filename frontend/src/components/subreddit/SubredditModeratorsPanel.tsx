import { LoadingMessage } from '../common/StatusMessage';
import { EmptyState } from '../empty';
import { useTranslation } from 'react-i18next';
import type { RedditSubredditModerator } from '../../types/reddit';

interface SubredditModeratorsPanelProps {
  moderators?: RedditSubredditModerator[];
  isLoading?: boolean;
  fallbackMessage?: string;
}

export function SubredditModeratorsPanel({
  moderators = [],
  isLoading = false,
  fallbackMessage,
}: SubredditModeratorsPanelProps) {
  const { t } = useTranslation();
  const resolvedFallbackMessage = fallbackMessage ?? t('subreddit.moderatorsPanel.fallback');

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
        {t('subreddit.moderatorsPanel.title')}
      </h3>
      {isLoading ? (
        <LoadingMessage className="mt-3 text-sm">
          {t('subreddit.moderatorsPanel.loading')}
        </LoadingMessage>
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
        <EmptyState illustration="members" title={resolvedFallbackMessage} className="mt-3 py-6" />
      )}
    </div>
  );
}
