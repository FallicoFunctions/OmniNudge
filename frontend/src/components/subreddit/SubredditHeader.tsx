import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { User } from '../../types/auth';
import { SubscribeButton } from '../common/SubscribeButton';

interface SubredditHeaderProps {
  subreddit: string;
  iconUrl?: string | null;
  user: User | null;
  isSubscribed?: boolean;
  topSearch?: ReactNode;
  postSearch?: ReactNode;
  filterControls?: ReactNode;
  showActions?: boolean;
}

export function SubredditHeader({
  subreddit,
  iconUrl,
  user,
  isSubscribed,
  topSearch,
  postSearch,
  filterControls,
  showActions,
}: SubredditHeaderProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const isSpecialSubreddit = subreddit === 'popular' || subreddit === 'frontpage';
  const shouldShowActions = showActions ?? !isSpecialSubreddit;

  return (
    <div className="mb-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {iconUrl && (
            <img
              src={iconUrl}
              alt=""
              className="h-12 w-12 flex-shrink-0 rounded-full object-cover"
              loading="lazy"
              decoding="async"
            />
          )}
          <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">r/{subreddit}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {shouldShowActions && (
            <div className="flex items-center gap-2">
              {user ? (
                <SubscribeButton
                  type="subreddit"
                  name={subreddit}
                  initialSubscribed={isSubscribed ?? false}
                />
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    window.dispatchEvent(
                      new CustomEvent('open-auth-modal', {
                        detail: {
                          mode: 'login',
                          redirectTo: `/r/${subreddit}`,
                          redirectState: location.state,
                          action: { type: 'subscribeSubreddit', subreddit },
                        },
                      })
                    )
                  }
                  className="rounded-md bg-[var(--color-surface-elevated)] px-4 py-2 text-sm font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-border)]"
                >
                  Subscribe
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  if (!user) {
                    window.dispatchEvent(
                      new CustomEvent('open-auth-modal', {
                        detail: {
                          mode: 'login',
                          redirectTo: '/posts/create',
                          redirectState: { defaultSubreddit: subreddit, returnTo: `/r/${subreddit}` },
                        },
                      })
                    );
                    return;
                  }
                  navigate('/posts/create', {
                    state: { defaultSubreddit: subreddit, returnTo: `/r/${subreddit}` },
                  });
                }}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Create Post
              </button>
            </div>
          )}
          {topSearch}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] pb-2">
        {filterControls && (
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{filterControls}</div>
        )}
        <div className="flex-shrink-0">{postSearch}</div>
      </div>
    </div>
  );
}
