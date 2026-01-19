import { api } from '../lib/api';

export interface AccessRequest {
  id: number;
  hub_id: number;
  user_id: number;
  status: 'pending' | 'approved' | 'denied';
  message?: string | null;
  created_at: string;
  updated_at: string;
  username?: string | null;
  hub_name?: string | null;
}

export interface AccessRequestResponse {
  message: string;
  request: {
    id: number;
    hub_id: number;
    status: string;
    message?: string | null;
    created_at: string;
  };
}

export interface AccessRequestStatusResponse {
  has_request: boolean;
  status?: string;
  request_id?: number;
}

export interface AccessRequestsResponse {
  requests: AccessRequest[];
  count: number;
}

export const accessRequestService = {
  async createAccessRequest(hubName: string, message?: string): Promise<AccessRequestResponse> {
    return api.post<AccessRequestResponse>(`/hubs/${hubName}/access-request`, {
      message: message || undefined,
    });
  },

  async getRequestStatus(hubName: string): Promise<AccessRequestStatusResponse> {
    return api.get<AccessRequestStatusResponse>(`/hubs/${hubName}/access-request/status`);
  },

  async getUserRequests(): Promise<AccessRequestsResponse> {
    return api.get<AccessRequestsResponse>('/users/me/access-requests');
  },

  async getPendingRequests(hubName: string): Promise<AccessRequestsResponse> {
    return api.get<AccessRequestsResponse>(`/mod/hubs/${hubName}/access-requests`);
  },

  async addUserAccess(hubName: string, username: string): Promise<AccessRequestResponse> {
    return api.post<AccessRequestResponse>(`/mod/hubs/${hubName}/access-requests/add-user`, {
      username,
    });
  },

  async approveRequest(requestId: number): Promise<{ message: string }> {
    return api.post<{ message: string }>(`/mod/access-requests/${requestId}/approve`);
  },

  async denyRequest(requestId: number): Promise<{ message: string }> {
    return api.post<{ message: string }>(`/mod/access-requests/${requestId}/deny`);
  },
};
