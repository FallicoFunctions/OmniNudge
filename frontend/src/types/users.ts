import type { PlatformPost, PostComment } from './posts';
import type { FriendEntry } from './friends';

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
  location?: string | null;
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
  total: number;
  limit: number;
  offset: number;
}

export interface UserCommentsResponse {
  comments: PostComment[];
  total: number;
  limit: number;
  offset: number;
}

export interface UserFriendsResponse {
  friends: FriendEntry[];
}

export interface MutualFriendEntry {
  id: number;
  username: string;
  avatar_url?: string | null;
}

export interface MutualFriendsResponse {
  mutual_friends: MutualFriendEntry[];
}

export type WallVisibility = 'public' | 'friends_only' | 'private';

export type WallReactionType = 'like' | 'dislike';

export interface WallPostMedia {
  url: string;
  media_type?: string;
  thumbnail_url?: string;
  width?: number;
  height?: number;
  duration?: number;
}

export interface WallPost {
  id: number;
  profile_user_id: number;
  author_id: number;
  author_username: string;
  author_avatar_url?: string | null;
  body: string;
  media?: WallPostMedia[];
  like_count: number;
  dislike_count: number;
  comment_count: number;
  liked_by_viewer: boolean;
  disliked_by_viewer: boolean;
  created_at: string;
  updated_at: string;
}

export interface WallPostComment {
  id: number;
  wall_post_id: number;
  author_id: number;
  author_username: string;
  author_avatar_url?: string | null;
  body: string;
  like_count: number;
  dislike_count: number;
  liked_by_viewer: boolean;
  disliked_by_viewer: boolean;
  created_at: string;
}

export interface WallReactionResponse {
  liked: boolean;
  disliked: boolean;
  like_count: number;
  dislike_count: number;
}

export interface WallPostsResponse {
  posts: WallPost[];
  can_post: boolean;
  wall_visibility: WallVisibility;
}

export interface WallPostCommentsResponse {
  comments: WallPostComment[];
}
