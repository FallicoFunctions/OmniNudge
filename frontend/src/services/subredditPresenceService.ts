import { api } from '../lib/api';

export interface SubredditActiveUsersResponse {
  subreddit: string;
  active_users: number;
  window_seconds: number;
}

export const subredditPresenceService = {
  async getActiveUsers(subreddit: string): Promise<SubredditActiveUsersResponse> {
    return api.get<SubredditActiveUsersResponse>(`/subreddits/${subreddit}/active-users`);
  },

  async ping(subreddit: string): Promise<SubredditActiveUsersResponse> {
    return api.post<SubredditActiveUsersResponse>(`/subreddits/${subreddit}/active-users/ping`);
  },
};
