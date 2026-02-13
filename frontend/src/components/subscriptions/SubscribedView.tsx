import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { subscriptionService } from '../../services/subscriptionService';
import { useSettings } from '../../contexts/SettingsContext';
import { EmptyMessage, ErrorMessage, LoadingMessage } from '../common/StatusMessage';
import { useFormat } from '../../hooks/useFormat';

interface SubscribedViewProps {
  withContainer?: boolean;
  showHeading?: boolean;
  className?: string;
}

export default function SubscribedView({
  withContainer = true,
  showHeading = true,
  className = '',
}: SubscribedViewProps) {
  type SortOption = 'alphabetical' | 'recent';

  const { t } = useTranslation();
  const { useRelativeTime } = useSettings();
  const { formatDate, formatRelativeTime } = useFormat();
  // PROFILE-5: Search and sort functionality
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('alphabetical');

  const formatSubscribedAt = useMemo(() => {
    return (timestamp: string | number | Date) => {
      const d = new Date(timestamp);
      if (Number.isNaN(d.getTime())) return t('common.time.recently');

      if (useRelativeTime) {
        return formatRelativeTime(d);
      }

      return formatDate(d, { month: 'short', day: 'numeric', year: 'numeric' });
    };
  }, [formatDate, formatRelativeTime, t, useRelativeTime]);

  const hubsQuery = useQuery({
    queryKey: ['user-hub-subscriptions'],
    queryFn: () => subscriptionService.getUserHubSubscriptions(),
  });

  const subredditsQuery = useQuery({
    queryKey: ['user-subreddit-subscriptions'],
    queryFn: () => subscriptionService.getUserSubredditSubscriptions(),
  });

  const allHubs = useMemo(() => hubsQuery.data ?? [], [hubsQuery.data]);
  const allSubreddits = useMemo(() => subredditsQuery.data ?? [], [subredditsQuery.data]);
  const isLoading = hubsQuery.isLoading || subredditsQuery.isLoading;
  const hasError = hubsQuery.isError || subredditsQuery.isError;

  // Filter and sort hubs
  const hubs = useMemo(() => {
    let filtered = [...allHubs];

    // Apply search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((sub) => {
        const hubName = sub.hub?.name || sub.hub_name || '';
        const hubTitle = sub.hub?.title || '';
        return hubName.toLowerCase().includes(query) || hubTitle.toLowerCase().includes(query);
      });
    }

    // Apply sort
    if (sortBy === 'alphabetical') {
      filtered.sort((a, b) => {
        const nameA = (a.hub?.name || a.hub_name || '').toLowerCase();
        const nameB = (b.hub?.name || b.hub_name || '').toLowerCase();
        return nameA.localeCompare(nameB);
      });
    } else if (sortBy === 'recent') {
      filtered.sort((a, b) => new Date(b.subscribed_at).getTime() - new Date(a.subscribed_at).getTime());
    }

    return filtered;
  }, [allHubs, searchQuery, sortBy]);

  // Filter and sort subreddits
  const subreddits = useMemo(() => {
    let filtered = [...allSubreddits];

    // Apply search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((sub) =>
        sub.subreddit_name.toLowerCase().includes(query)
      );
    }

    // Apply sort
    if (sortBy === 'alphabetical') {
      filtered.sort((a, b) => a.subreddit_name.toLowerCase().localeCompare(b.subreddit_name.toLowerCase()));
    } else if (sortBy === 'recent') {
      filtered.sort((a, b) => new Date(b.subscribed_at).getTime() - new Date(a.subscribed_at).getTime());
    }

    return filtered;
  }, [allSubreddits, searchQuery, sortBy]);

  const content = (
    <div className={className}>
      {showHeading && (
        <h2 className="mb-4 text-2xl font-bold text-[var(--color-text-primary)]">
          {t('subscriptions.title')}
        </h2>
      )}

      {isLoading ? (
        <LoadingMessage className="text-sm">{t('subscriptions.loading')}</LoadingMessage>
      ) : hasError ? (
        <ErrorMessage className="text-sm text-[var(--color-error)]">{t('subscriptions.loadFailed')}</ErrorMessage>
      ) : allHubs.length === 0 && allSubreddits.length === 0 ? (
        <EmptyMessage className="text-sm">
          {t('subscriptions.emptyAll')}
        </EmptyMessage>
      ) : (
        <>
          {/* PROFILE-5: Search and sort controls */}
          <div className="flex gap-4 mb-6 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <input
                type="text"
                placeholder={t('subscriptions.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-2 border border-[var(--color-border)] rounded-lg bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
              />
            </div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="px-4 py-2 border border-[var(--color-border)] rounded-lg bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
            >
              <option value="alphabetical">{t('subscriptions.sort.alphabetical')}</option>
              <option value="recent">{t('subscriptions.sort.recent')}</option>
            </select>
          </div>

          {/* Results summary */}
          {searchQuery && (
            <div className="mb-4 text-sm text-[var(--color-text-secondary)]">
              {t('subscriptions.searchResults', {
                subscriptionCount: hubs.length + subreddits.length,
                query: searchQuery,
              })}
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
          {/* Hubs Column */}
          <section>
            <h3 className="mb-3 text-lg font-semibold text-[var(--color-text-primary)]">
              {t('subscriptions.hubsTitle', { count: hubs.length })}
            </h3>
            {hubs.length === 0 ? (
              <EmptyMessage className="text-sm">{t('subscriptions.emptyHubs')}</EmptyMessage>
            ) : (
              <div className="space-y-2">
                {hubs.map((subscription) => {
                  const hubName = subscription.hub?.name || subscription.hub_name || t('subscriptions.unknownHub');
                  const hubTitle = subscription.hub?.title;

                  return (
                    <article
                      key={subscription.id}
                      className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
                    >
                      <Link
                        to={`/h/${hubName}`}
                        className="text-lg font-semibold text-[var(--color-primary)] hover:underline"
                      >
                        h/{hubName}
                      </Link>
                      {hubTitle && (
                        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                          {hubTitle}
                        </p>
                      )}
                      <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
                        {t('subscriptions.subscribedAt', {
                          time: formatSubscribedAt(subscription.subscribed_at),
                        })}
                      </p>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          {/* Subreddits Column */}
          <section>
            <h3 className="mb-3 text-lg font-semibold text-[var(--color-text-primary)]">
              {t('subscriptions.subredditsTitle', { count: subreddits.length })}
            </h3>
            {subreddits.length === 0 ? (
              <EmptyMessage className="text-sm">{t('subscriptions.emptySubreddits')}</EmptyMessage>
            ) : (
              <div className="space-y-2">
                {subreddits.map((subscription) => (
                  <article
                    key={subscription.id}
                    className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
                  >
                    <Link
                      to={`/r/${subscription.subreddit_name}`}
                      className="text-lg font-semibold text-[var(--color-primary)] hover:underline"
                    >
                      r/{subscription.subreddit_name}
                    </Link>
                    <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
                      {t('subscriptions.subscribedAt', {
                        time: formatSubscribedAt(subscription.subscribed_at),
                      })}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
        </>
      )}
    </div>
  );

  if (!withContainer) {
    return content;
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
        {content}
      </div>
    </div>
  );
}
