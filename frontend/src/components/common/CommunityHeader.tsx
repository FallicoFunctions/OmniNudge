import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { subscriptionService } from '../../services/subscriptionService';
import { useAuth } from '../../contexts/AuthContext';
import { SubscribeButton } from './SubscribeButton';
import { CreateActionButtons } from './CreateActionButtons';

interface CommunityHeaderProps {
  // Common props
  communityType: 'hub' | 'subreddit';
  communityName: string;
  displayTitle?: string | null;

  // Optional props (hub-specific)
  isModerator?: boolean;
  showCreateHub?: boolean;

  // Optional props (subreddit-specific)
  iconUrl?: string | null;
  isSubscribed?: boolean;
  isNsfw?: boolean;

  // Content slots
  searchBars?: ReactNode;
  sortControls?: ReactNode;
}

export function CommunityHeader({
  communityType,
  communityName,
  displayTitle,
  isModerator = false,
  showCreateHub = true,
  iconUrl,
  isSubscribed,
  isNsfw = false,
  searchBars,
  sortControls,
}: CommunityHeaderProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const isHub = communityType === 'hub';
  const isSubreddit = communityType === 'subreddit';

  const isSpecialCommunity =
    (isHub && (communityName === 'popular' || communityName === 'all')) ||
    (isSubreddit && (communityName === 'popular' || communityName === 'frontpage'));

  const headerLabel = useMemo(() => {
    if (isHub) {
      if (communityName === 'popular') return 'h/popular';
      if (communityName === 'all') return 'h/all';
      if (displayTitle) return displayTitle;
      return `h/${communityName}`;
    }
    return `r/${communityName}`;
  }, [isHub, communityName, displayTitle]);

  const defaultReturnTo = isHub ? `/h/${communityName}` : `/r/${communityName}`;

  // Hub subscription query
  const { data: hubSubscriptionStatus } = useQuery({
    queryKey: ['hub-subscription', communityName],
    queryFn: () => subscriptionService.checkHubSubscription(communityName),
    enabled: Boolean(user) && isHub && !isSpecialCommunity,
  });

  const shouldShowSubscribe = !isSpecialCommunity;
  const shouldShowActions = isSubreddit ? !isSpecialCommunity : true;

  // Determine which subscription status to use
  const subscriptionActive = isHub
    ? hubSubscriptionStatus?.is_subscribed
    : isSubscribed;

  if (!communityName) return null;

  return (
    <div className="mb-0 flex flex-col gap-4">
      {/* Row 1: Community name, buttons, and search */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex flex-1 items-center justify-between gap-4">
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
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold">{headerLabel}</h1>
              {isSubreddit && isNsfw && (
                <span className="rounded bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">
                  NSFW
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {shouldShowSubscribe && (
              <>
                {user ? (
                  <SubscribeButton
                    type={communityType}
                    name={communityName}
                    initialSubscribed={subscriptionActive}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      window.dispatchEvent(
                        new CustomEvent('open-auth-modal', {
                          detail: {
                            mode: 'login',
                            redirectTo: isHub ? `/h/${communityName}` : `/r/${communityName}`,
                            redirectState: location.state,
                            action: isHub
                              ? { type: 'subscribeHub', hub: communityName }
                              : { type: 'subscribeSubreddit', subreddit: communityName },
                          },
                        })
                      )
                    }
                    className="px-4 py-2 bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)] rounded hover:bg-[var(--color-border)]"
                  >
                    Subscribe
                  </button>
                )}
              </>
            )}
            {isModerator && isHub && !isSpecialCommunity && (
              <button
                onClick={() => navigate(`/h/${communityName}/mod`)}
                className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
              >
                Mod Tools
              </button>
            )}
            {isHub ? (
              <CreateActionButtons
                user={user}
                onCreatePost={() =>
                  navigate('/posts/create', {
                    state: { defaultHub: communityName, returnTo: defaultReturnTo, originPath: location.pathname },
                  })
                }
                onCreateHub={() => navigate('/hubs/create', { state: { returnTo: defaultReturnTo } })}
                postAuth={{
                  redirectTo: '/posts/create',
                  redirectState: { defaultHub: communityName, returnTo: defaultReturnTo },
                }}
                hubAuth={{
                  redirectTo: '/hubs/create',
                  redirectState: { returnTo: defaultReturnTo },
                }}
                showCreateHub={showCreateHub}
              />
            ) : (
              shouldShowActions && (
                <CreateActionButtons
                  user={user}
                  onCreatePost={() =>
                    navigate('/posts/create', {
                      state: { defaultSubreddit: communityName, returnTo: defaultReturnTo, originPath: location.pathname },
                    })
                  }
                  onCreateHub={() => navigate('/hubs/create', { state: { returnTo: defaultReturnTo } })}
                  postAuth={{
                    redirectTo: '/posts/create',
                    redirectState: { defaultSubreddit: communityName, returnTo: defaultReturnTo },
                  }}
                  hubAuth={{
                    redirectTo: '/hubs/create',
                    redirectState: { returnTo: defaultReturnTo },
                  }}
                  showCreateHub={true}
                />
              )
            )}
          </div>
        </div>
        {searchBars}
      </div>
      {/* Row 2: Sort controls and post search */}
      {sortControls}
    </div>
  );
}
