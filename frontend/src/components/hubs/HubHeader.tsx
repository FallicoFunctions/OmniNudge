import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { subscriptionService } from '../../services/subscriptionService';
import { useAuth } from '../../contexts/AuthContext';
import { SubscribeButton } from '../common/SubscribeButton';
import { CreateActionButtons } from '../common/CreateActionButtons';

interface HubHeaderProps {
  hubName: string;
  displayTitle?: string | null;
  isModerator?: boolean;
  returnTo?: string;
  showCreateHub?: boolean;
  searchBars?: ReactNode;
}

export function HubHeader({
  hubName,
  displayTitle,
  isModerator = false,
  returnTo,
  showCreateHub = true,
  searchBars,
}: HubHeaderProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const isSpecialHub = hubName === 'popular' || hubName === 'all';
  const headerLabel = useMemo(() => {
    if (hubName === 'popular') return 'h/popular';
    if (hubName === 'all') return 'h/all';
    if (displayTitle) return displayTitle;
    return `h/${hubName}`;
  }, [hubName, displayTitle]);

  const defaultReturnTo = returnTo ?? `/h/${hubName}`;
  const { data: subscriptionStatus } = useQuery({
    queryKey: ['hub-subscription', hubName],
    queryFn: () => subscriptionService.checkHubSubscription(hubName),
    enabled: Boolean(user) && !isSpecialHub,
  });

  if (!hubName) return null;

  return (
    <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="flex flex-1 items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{headerLabel}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!isSpecialHub && (
            <>
              {user ? (
                <SubscribeButton
                  type="hub"
                  name={hubName}
                  initialSubscribed={subscriptionStatus?.is_subscribed}
                />
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    window.dispatchEvent(
                      new CustomEvent('open-auth-modal', {
                        detail: {
                          mode: 'login',
                          redirectTo: `/h/${hubName}`,
                          redirectState: location.state,
                          action: { type: 'subscribeHub', hub: hubName },
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
          {isModerator && !isSpecialHub && (
            <button
              onClick={() => navigate(`/h/${hubName}/mod`)}
              className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
            >
              Mod Tools
            </button>
          )}
          <CreateActionButtons
            user={user}
            onCreatePost={() =>
              navigate('/posts/create', {
                state: { defaultHub: hubName, returnTo: defaultReturnTo, originPath: location.pathname },
              })
            }
            onCreateHub={() => navigate('/hubs/create', { state: { returnTo: defaultReturnTo } })}
            postAuth={{
              redirectTo: '/posts/create',
              redirectState: { defaultHub: hubName, returnTo: defaultReturnTo },
            }}
            hubAuth={{
              redirectTo: '/hubs/create',
              redirectState: { returnTo: defaultReturnTo },
            }}
            showCreateHub={showCreateHub}
          />
        </div>
      </div>
      {searchBars}
    </div>
  );
}
