import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { subscriptionService } from '../../services/subscriptionService';
import { formatTimestamp } from '../../utils/timeFormat';
import { useSettings } from '../../contexts/SettingsContext';

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
  const { useRelativeTime } = useSettings();

  const hubsQuery = useQuery({
    queryKey: ['user-hub-subscriptions'],
    queryFn: () => subscriptionService.getUserHubSubscriptions(),
  });

  const subredditsQuery = useQuery({
    queryKey: ['user-subreddit-subscriptions'],
    queryFn: () => subscriptionService.getUserSubredditSubscriptions(),
  });

  const hubs = hubsQuery.data ?? [];
  const subreddits = subredditsQuery.data ?? [];
  const isLoading = hubsQuery.isLoading || subredditsQuery.isLoading;
  const hasError = hubsQuery.isError || subredditsQuery.isError;

  const content = (
    <div className={className}>
      {showHeading && (
        <h2 className="mb-4 text-2xl font-bold text-[var(--color-text-primary)]">
          Subscriptions
        </h2>
      )}

      {isLoading ? (
        <p className="text-sm text-[var(--color-text-secondary)]">Loading subscriptions...</p>
      ) : hasError ? (
        <p className="text-sm text-[var(--color-error)]">Failed to load subscriptions.</p>
      ) : hubs.length === 0 && subreddits.length === 0 ? (
        <p className="text-sm text-[var(--color-text-secondary)]">
          No subscriptions yet. Subscribe to hubs or subreddits to see them here.
        </p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Hubs Column */}
          <section>
            <h3 className="mb-3 text-lg font-semibold text-[var(--color-text-primary)]">
              Hubs ({hubs.length})
            </h3>
            {hubs.length === 0 ? (
              <p className="text-sm text-[var(--color-text-secondary)]">
                No hub subscriptions yet.
              </p>
            ) : (
              <div className="space-y-2">
                {hubs.map((subscription) => {
                  const hubName = subscription.hub?.name || subscription.hub_name || 'Unknown';
                  const hubTitle = subscription.hub?.title;

                  return (
                    <article
                      key={subscription.id}
                      className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
                    >
                      <Link
                        to={`/hubs/h/${hubName}`}
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
                        Subscribed {formatTimestamp(subscription.subscribed_at, useRelativeTime)}
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
              Subreddits ({subreddits.length})
            </h3>
            {subreddits.length === 0 ? (
              <p className="text-sm text-[var(--color-text-secondary)]">
                No subreddit subscriptions yet.
              </p>
            ) : (
              <div className="space-y-2">
                {subreddits.map((subscription) => (
                  <article
                    key={subscription.id}
                    className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
                  >
                    <Link
                      to={`/reddit/r/${subscription.subreddit_name}`}
                      className="text-lg font-semibold text-[var(--color-primary)] hover:underline"
                    >
                      r/{subscription.subreddit_name}
                    </Link>
                    <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
                      Subscribed {formatTimestamp(subscription.subscribed_at, useRelativeTime)}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
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
