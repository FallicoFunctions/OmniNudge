import { useMemo } from 'react';
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
}

export function HubHeader({
  hubName,
  isModerator = false,
  returnTo,
  showCreateHub = true,
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
    <div className="mb-6 flex items-center justify-between">
      <div>
        <h1 className="text-3xl font-bold">{headerLabel}</h1>
      </div>
      <div className="flex items-center gap-2">
        {user && !isSpecialHub && (
          <SubscribeButton
            type="hub"
            name={hubName}
            initialSubscribed={subscriptionStatus?.is_subscribed}
          />
        )}
        {isModerator && !isSpecialHub && (
          <button
            onClick={() => navigate(`/h/${hubName}/mod`)}
            className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
          >
            Mod Tools
          </button>
        )}
        {user && (
          <button
            onClick={() =>
              navigate('/posts/create', {
                state: { defaultHub: hubName, returnTo: defaultReturnTo, originPath: location.pathname },
              })
            }
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Create Post
          </button>
        )}
        {user && showCreateHub && (
          <button
            onClick={() => navigate('/hubs/create', { state: { returnTo: defaultReturnTo } })}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
          >
            Create Hub
          </button>
        )}
      </div>
    </div>
  );
}
