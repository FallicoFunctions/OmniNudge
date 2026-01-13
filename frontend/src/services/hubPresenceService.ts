import { api } from '../lib/api';

export interface HubActiveUsersResponse {
  hub: string;
  active_users: number;
  window_seconds: number;
}

export const hubPresenceService = {
  async getActiveUsers(hubName: string): Promise<HubActiveUsersResponse> {
    return api.get<HubActiveUsersResponse>(`/hubs/${hubName}/active-users`);
  },

  async ping(hubName: string): Promise<HubActiveUsersResponse> {
    return api.post<HubActiveUsersResponse>(`/hubs/${hubName}/active-users/ping`);
  },
};
