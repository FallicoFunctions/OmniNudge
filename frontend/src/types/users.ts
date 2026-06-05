import type { PlatformPost, PostComment } from './posts';

export interface ModeratedHubSummary {
  id: number;
  name: string;
  title?: string | null;
}

export interface UserProfile {
  id: number;
  username: string;
  avatar_url?: string | null;
  banner_url?: string | null;
  bio?: string | null;
  status_text?: string | null;
  karma: number;
  public_key?: string | null;
  created_at: string;
  last_seen?: string | null;
  moderated_hubs?: ModeratedHubSummary[];
}

export interface TopFriendEntry {
  username: string;
  avatar_url?: string | null;
}

export interface TopFriendsResponse {
  count: number;
  best_friend?: string | null;
  friends: TopFriendEntry[];
}

export interface TopFriendsConfig {
  count: 0 | 2 | 4 | 6 | 8;
  best_friend?: string | null;
  friends: string[];
}

export interface UserPostsResponse {
  posts: PlatformPost[];
  limit: number;
  offset: number;
}

export interface UserCommentsResponse {
  comments: PostComment[];
  limit: number;
  offset: number;
}
