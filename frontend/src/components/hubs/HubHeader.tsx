import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { subscriptionService } from '../../services/subscriptionService';
import { useAuth } from '../../contexts/AuthContext';
import { SubscribeButton } from '../common/SubscribeButton';

interface HubHeaderProps {
  hubName: string;
  isModerator?: boolean;
  returnTo?: string;
  showCreateHub?: boolean;
  searchBars?: ReactNode;
}

export function HubHeader({
  hubName,
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
    return `h/${hubName}`;
  }, [hubName]);

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
          <button
            onClick={() => {
              if (!user) {
                window.dispatchEvent(
                  new CustomEvent('open-auth-modal', {
                    detail: {
                      mode: 'login',
                      redirectTo: '/posts/create',
                      redirectState: { defaultHub: hubName, returnTo: defaultReturnTo },
                    },
                  })
                );
                return;
              }
              navigate('/posts/create', {
                state: { defaultHub: hubName, returnTo: defaultReturnTo, originPath: location.pathname },
              });
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Create Post
          </button>
          {showCreateHub && (
            <button
              onClick={() => {
                if (!user) {
                  window.dispatchEvent(
                    new CustomEvent('open-auth-modal', {
                      detail: {
                        mode: 'login',
                        redirectTo: '/hubs/create',
                        redirectState: { returnTo: defaultReturnTo },
                      },
                    })
                  );
                  return;
                }
                navigate('/hubs/create', { state: { returnTo: defaultReturnTo } });
              }}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              Create Hub
            </button>
          )}
        </div>
      </div>
      {searchBars}
    </div>
  );
}
