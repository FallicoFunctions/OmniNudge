export interface PlatformPost {
  id: number;
  title: string;
  body?: string | null;
  content?: string | null;
  author_id: number;
  author_username: string;
  hub_name: string;
  score: number;
  comment_count: number;
  created_at: string;
  updated_at?: string;
  media_url?: string | null;
  media_type?: string | null;
  thumbnail_url?: string | null;
  target_subreddit?: string | null;
  crosspost_origin_subreddit?: string | null;
}

import type { LocalCommentBase } from './comments';

export interface PostComment extends LocalCommentBase {
  post_id: number;
  user_id: number;
}

export interface CreatePostRequest {
  title: string;
  content?: string;
  hub_name: string;
}

export interface CreateCommentRequest {
  body: string;
  parent_comment_id?: number;
}

export interface PostsResponse {
  posts: PlatformPost[];
  total: number;
  page: number;
  per_page: number;
}
