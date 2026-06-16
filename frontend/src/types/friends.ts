export type FriendshipStatus = 'none' | 'pending_incoming' | 'pending_outgoing' | 'accepted';

export interface FriendEntry {
  id: number;
  username: string;
  avatar_url: string | null;
  friends_since: string;
}

export interface FriendRequestEntry {
  id: number;
  username: string;
  avatar_url: string | null;
  sent_at: string;
}

export interface FriendRequestsResponse {
  incoming: FriendRequestEntry[];
  outgoing: FriendRequestEntry[];
}
