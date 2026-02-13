import type { CombinedSuggestion } from '../../hooks/useHubSubredditAutocomplete';
import { useTranslation } from 'react-i18next';
import { useFormat } from '../../hooks/useFormat';

interface CombinedSuggestionItemProps {
  suggestion: CombinedSuggestion;
  onSelectHub: (name: string) => void;
  onSelectSubreddit: (name: string) => void;
}

export function CombinedSuggestionItem({
  suggestion,
  onSelectHub,
  onSelectSubreddit,
}: CombinedSuggestionItemProps) {
  const { t } = useTranslation();
  const { formatNumber } = useFormat();

  if (suggestion.type === 'hub') {
    const hub = suggestion.data;
    return (
      <li key={`hub-${hub.name}`}>
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onSelectHub(hub.name)}
          className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-[var(--color-surface-elevated)]"
        >
          <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)] text-[10px] font-semibold text-white">
            h/
          </div>
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium text-[var(--color-text-primary)]">
              h/{hub.name}
            </span>
            {hub.title && (
              <span className="truncate text-[11px] text-[var(--color-text-secondary)]">
                {hub.title}
              </span>
            )}
          </div>
          {typeof hub.subscriber_count === 'number' && hub.subscriber_count > 0 && (
            <span className="ml-auto text-[11px] text-[var(--color-text-secondary)]">
              {formatNumber(hub.subscriber_count)} {t('common.units.subscribersShort')}
            </span>
          )}
        </button>
      </li>
    );
  }

  const subreddit = suggestion.data;
  return (
    <li key={`subreddit-${subreddit.name}`}>
      <button
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => onSelectSubreddit(subreddit.name)}
        className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-[var(--color-surface-elevated)]"
      >
        {subreddit.icon_url ? (
          <img
            src={subreddit.icon_url}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-6 w-6 flex-shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-border)] text-[10px] font-semibold text-[var(--color-text-secondary)]">
            r/
          </div>
        )}
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium text-[var(--color-text-primary)]">
            r/{subreddit.name}
          </span>
          {subreddit.title && (
            <span className="truncate text-[11px] text-[var(--color-text-secondary)]">
              {subreddit.title}
            </span>
          )}
        </div>
        {typeof subreddit.subscribers === 'number' && subreddit.subscribers > 0 && (
          <span className="ml-auto text-[11px] text-[var(--color-text-secondary)]">
            {formatNumber(subreddit.subscribers)} {t('common.units.subscribersShort')}
          </span>
        )}
      </button>
    </li>
  );
}
