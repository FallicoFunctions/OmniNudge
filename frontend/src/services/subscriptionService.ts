import { api } from '../lib/api';

export interface HubSubscription {
  id: number;
  user_id: number;
  hub_id: number;
  subscribed_at: string;
  hub_name?: string;
  hub?: {
    name?: string | null;
    title?: string | null;
  } | null;
}

export interface SubredditSubscription {
  id: number;
  user_id: number;
  subreddit_name: string;
  subscribed_at: string;
}

export interface SubscriptionStatusResponse {
  is_subscribed: boolean;
  subscriber_count?: number;
}

export interface HubSubscriptionsResponse {
  subscriptions: HubSubscription[];
}

export interface SubredditSubscriptionsResponse {
  subscriptions: SubredditSubscription[];
}

export const subscriptionService = {
  // Hub subscriptions
  async subscribeToHub(hubName: string): Promise<SubscriptionStatusResponse> {
    return api.post<SubscriptionStatusResponse>(`/hubs/${hubName}/subscribe`);
  },

  async unsubscribeFromHub(hubName: string): Promise<SubscriptionStatusResponse> {
    return api.delete<SubscriptionStatusResponse>(`/hubs/${hubName}/unsubscribe`);
  },

  async checkHubSubscription(hubName: string): Promise<SubscriptionStatusResponse> {
    return api.get<SubscriptionStatusResponse>(`/hubs/${hubName}/subscription`);
  },

  async getUserHubSubscriptions(): Promise<HubSubscription[]> {
    const response = await api.get<HubSubscriptionsResponse>('/users/me/subscriptions/hubs');
    return response.subscriptions || [];
  },

  // Subreddit subscriptions
  async subscribeToSubreddit(subredditName: string): Promise<SubscriptionStatusResponse> {
    return api.post<SubscriptionStatusResponse>(`/subreddits/${subredditName}/subscribe`);
  },

  async unsubscribeFromSubreddit(subredditName: string): Promise<SubscriptionStatusResponse> {
    return api.delete<SubscriptionStatusResponse>(`/subreddits/${subredditName}/unsubscribe`);
  },

  async checkSubredditSubscription(subredditName: string): Promise<SubscriptionStatusResponse> {
    return api.get<SubscriptionStatusResponse>(`/subreddits/${subredditName}/subscription`);
  },

  async getUserSubredditSubscriptions(): Promise<SubredditSubscription[]> {
    const response = await api.get<SubredditSubscriptionsResponse>('/users/me/subscriptions/subreddits');
    return response.subscriptions || [];
  },
};
