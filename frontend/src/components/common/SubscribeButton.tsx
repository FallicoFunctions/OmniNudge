import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { subscriptionService } from '../../services/subscriptionService';

interface SubscribeButtonProps {
  type: 'hub' | 'subreddit';
  name: string;
  initialSubscribed?: boolean;
  onSubscriptionChange?: (isSubscribed: boolean) => void;
}

export function SubscribeButton({
  type,
  name,
  initialSubscribed = false,
  onSubscriptionChange,
}: SubscribeButtonProps) {
  const [isSubscribed, setIsSubscribed] = useState(initialSubscribed);
  const queryClient = useQueryClient();

  useEffect(() => {
    setIsSubscribed(initialSubscribed);
  }, [initialSubscribed]);

  const subscribeMutation = useMutation({
    mutationFn: async () => {
      if (type === 'hub') {
        return isSubscribed
          ? subscriptionService.unsubscribeFromHub(name)
          : subscriptionService.subscribeToHub(name);
      }
      return isSubscribed
        ? subscriptionService.unsubscribeFromSubreddit(name)
        : subscriptionService.subscribeToSubreddit(name);
    },
    onSuccess: (data) => {
      const newSubscribed = data.is_subscribed;
      setIsSubscribed(newSubscribed);
      onSubscriptionChange?.(newSubscribed);

      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ['user-subscriptions'] });
      queryClient.invalidateQueries({ queryKey: ['user-subscriptions', type === 'hub' ? 'hubs' : 'subreddits'] });
      if (type === 'hub') {
        queryClient.invalidateQueries({ queryKey: ['hub-subscription', name] });
      } else {
        queryClient.invalidateQueries({ queryKey: ['subreddit-subscription', name] });
      }
    },
  });

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering parent click events
    subscribeMutation.mutate();
  };

  return (
    <button
      onClick={handleClick}
      disabled={subscribeMutation.isPending}
      className={`px-4 py-1.5 rounded font-medium text-sm transition-colors ${
        isSubscribed
          ? 'bg-red-600 text-white hover:bg-red-700 dark:bg-red-500 dark:text-white dark:hover:bg-red-600'
          : 'bg-blue-600 text-white hover:bg-blue-700'
      } ${subscribeMutation.isPending ? 'opacity-50 cursor-wait' : ''}`}
    >
      {subscribeMutation.isPending
        ? 'Loading...'
        : isSubscribed
        ? 'Unsubscribe'
        : 'Subscribe'}
    </button>
  );
}
