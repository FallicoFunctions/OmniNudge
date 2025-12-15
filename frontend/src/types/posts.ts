export interface PlatformPost {
  id: number;
  title: string;
  body?: string | null;
  content?: string | null;
  author_id: number;
  author_username: string;
  hub_name: string;
  hub_id?: number | null;
  score: number;
  comment_count?: number;
  num_comments?: number;
  user_vote?: number | null;
  crossposted_at?: string | null;
  created_at: string;
  updated_at?: string;
  media_url?: string | null;
  media_type?: string | null;
  thumbnail_url?: string | null;
  target_subreddit?: string | null;
  crosspost_origin_subreddit?: string | null;
  hub?: {
    name?: string | null;
  } | null;
  author?: {
    username?: string | null;
  } | null;
}

import type { LocalCommentBase } from './comments';

export interface PostComment extends LocalCommentBase {
  post_id: number;
  user_id: number;
}

export interface CreatePostRequest {
  title: string;
  body?: string;
  tags?: string[];
  media_url?: string;
  media_type?: string;
  thumbnail_url?: string;
  hub_id?: number;
  target_subreddit?: string;
  send_replies_to_inbox?: boolean;
  post_type: 'link' | 'text';
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
