import React from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyMessage, LoadingMessage } from './StatusMessage';

interface FeedSearchBarsProps<T> {
  containerClassName?: string;
  showTopForm?: boolean;
  showPostForm?: boolean;
  topValue: string;
  topPlaceholder: string;
  topButtonLabel?: string;
  onTopChange: (value: string) => void;
  onTopSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onTopFocus?: () => void;
  onTopBlur?: () => void;
  topSuggestions: T[];
  topShouldShowSuggestions: boolean;
  topIsLoading: boolean;
  topEmptyMessage: string;
  renderTopSuggestion: (item: T) => React.ReactNode;
  postValue: string;
  postPlaceholder: string;
  postButtonLabel?: string;
  onPostChange: (value: string) => void;
  onPostSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onPostFocus?: () => void;
  onPostBlur?: () => void;
  postDropdownOpen: boolean;
  postDropdownContent?: React.ReactNode;
  postFormClassName?: string;
  topFormClassName?: string;
}

export function FeedSearchBars<T>({
  containerClassName = 'flex w-full flex-col items-end gap-2 md:w-96',
  showTopForm = true,
  showPostForm = true,
  topValue,
  topPlaceholder,
  topButtonLabel,
  onTopChange,
  onTopSubmit,
  onTopFocus,
  onTopBlur,
  topSuggestions,
  topShouldShowSuggestions,
  topIsLoading,
  topEmptyMessage,
  renderTopSuggestion,
  postValue,
  postPlaceholder,
  postButtonLabel,
  onPostChange,
  onPostSubmit,
  onPostFocus,
  onPostBlur,
  postDropdownOpen,
  postDropdownContent,
  postFormClassName = 'flex w-full gap-2',
  topFormClassName = 'flex w-full gap-2',
}: FeedSearchBarsProps<T>) {
  const { t } = useTranslation();
  const resolvedTopButtonLabel = topButtonLabel ?? t('common.go');
  const resolvedPostButtonLabel = postButtonLabel ?? t('common.search');

  return (
    <div className={containerClassName}>
      {showTopForm && (
        <form onSubmit={onTopSubmit} className={topFormClassName}>
          <div className="relative flex-1">
            <input
              type="text"
              value={topValue}
              onFocus={onTopFocus}
              onBlur={onTopBlur}
              onChange={(event) => onTopChange(event.target.value)}
              placeholder={topPlaceholder}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
            />
            {topShouldShowSuggestions && (
              <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg">
                {topIsLoading ? (
                  <div className="px-3 py-2">
                    <LoadingMessage className="mt-0 text-sm">
                      {t('common.searching')}
                    </LoadingMessage>
                  </div>
                ) : topSuggestions.length === 0 ? (
                  <div className="px-3 py-2">
                    <EmptyMessage className="mt-0 text-sm">{topEmptyMessage}</EmptyMessage>
                  </div>
                ) : (
                  <ul>{topSuggestions.map(renderTopSuggestion)}</ul>
                )}
              </div>
            )}
          </div>
          <button
            type="submit"
            className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)]"
          >
            {resolvedTopButtonLabel}
          </button>
        </form>
      )}

      {showPostForm && (
        <form onSubmit={onPostSubmit} className={postFormClassName}>
          <div className="relative flex-1">
            <input
              type="text"
              value={postValue}
              onFocus={onPostFocus}
              onBlur={onPostBlur}
              onChange={(event) => onPostChange(event.target.value)}
              placeholder={postPlaceholder}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
            />
            {postDropdownOpen && postDropdownContent && (
              <div className="absolute left-0 right-0 top-full z-40 mt-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-lg">
                {postDropdownContent}
              </div>
            )}
          </div>
          <button
            type="submit"
            className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)]"
          >
            {resolvedPostButtonLabel}
          </button>
        </form>
      )}
    </div>
  );
}
