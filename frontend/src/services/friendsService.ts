import { api } from '../lib/api';
import type {
  FriendEntry,
  FriendRequestEntry,
  FriendRequestsResponse,
  FriendshipStatus,
} from '../types/friends';

export const friendsService = {
  async getFriends(): Promise<FriendEntry[]> {
    const res = await api.get<{ friends: FriendEntry[] }>('/users/me/friends');
    return res.friends;
  },

  async getFriendRequests(): Promise<FriendRequestsResponse> {
    return api.get<FriendRequestsResponse>('/users/me/friends/requests');
  },

  async sendFriendRequest(username: string): Promise<{ message: string; result: 'sent' | 'accepted' }> {
    return api.post<{ message: string; result: 'sent' | 'accepted' }>('/users/me/friends/requests', { username });
  },

  async acceptFriendRequest(username: string): Promise<{ message: string }> {
    return api.put<{ message: string }>(`/users/me/friends/requests/${username}/accept`);
  },

  async declineOrCancelFriendRequest(username: string): Promise<{ message: string }> {
    return api.delete<{ message: string }>(`/users/me/friends/requests/${username}`);
  },

  async removeFriend(username: string): Promise<{ message: string }> {
    return api.delete<{ message: string }>(`/users/me/friends/${username}`);
  },

  async getFriendshipStatus(username: string): Promise<FriendshipStatus> {
    const res = await api.get<{ status: FriendshipStatus }>(`/users/${username}/friendship`);
    return res.status;
  },
};

/** Shared React Query keys */
export const friendsQueryKeys = {
  friends: ['friends'] as const,
  requests: ['friends', 'requests'] as const,
  status: (username: string) => ['friends', 'status', username] as const,
};

/** Helper: resolves the action label for a given friendship status */
export function friendActionLabel(
  status: FriendshipStatus,
  t: (key: string) => string
): string {
  switch (status) {
    case 'accepted':
      return t('friends.actions.unfriend');
    case 'pending_outgoing':
      return t('friends.actions.cancelRequest');
    case 'pending_incoming':
      return t('friends.actions.accept');
    default:
      return t('friends.actions.addFriend');
  }
}
