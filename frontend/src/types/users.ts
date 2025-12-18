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
  bio?: string | null;
  karma: number;
  public_key?: string | null;
  created_at: string;
  last_seen: string;
  moderated_hubs?: ModeratedHubSummary[];
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
