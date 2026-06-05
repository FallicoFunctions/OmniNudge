import type { SubredditSuggestion } from '../../types/reddit';
import { useTranslation } from 'react-i18next';
import { useFormat } from '../../hooks/useFormat';

interface SubredditSuggestionItemProps {
  suggestion: SubredditSuggestion;
  onSelect: (name: string) => void;
}

export function SubredditSuggestionItem({ suggestion, onSelect }: SubredditSuggestionItemProps) {
  const { t } = useTranslation();
  const { formatNumber } = useFormat();

  return (
    <li key={suggestion.name}>
      <button
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => onSelect(suggestion.name)}
        className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-[var(--color-surface-elevated)]"
      >
        {suggestion.icon_url ? (
          <img
            src={suggestion.icon_url}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-6 w-6 flex-shrink-0 rounded-md object-cover"
          />
        ) : (
          <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-[var(--color-border)] text-[10px] font-semibold text-[var(--color-text-secondary)]">
            {t('common.prefix.subreddit')}
          </div>
        )}
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium text-[var(--color-text-primary)]">
            {t('common.format.subredditPath', { name: suggestion.name })}
          </span>
          {suggestion.title && (
            <span className="truncate text-[11px] text-[var(--color-text-secondary)]">
              {suggestion.title}
            </span>
          )}
        </div>
        {typeof suggestion.subscribers === 'number' && suggestion.subscribers > 0 && (
          <span className="ml-auto text-[11px] text-[var(--color-text-secondary)]">
            {formatNumber(suggestion.subscribers)} {t('common.units.subscribersShort')}
          </span>
        )}
      </button>
    </li>
  );
}
