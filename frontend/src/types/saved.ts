import type { LocalRedditComment } from './reddit';
import type { LocalCommentBase } from './comments';

export interface SavedPost {
  id: number;
  title: string;
  hub_name: string;
  author_username: string;
  score: number;
  comment_count: number;
  crossposted_at?: string | null;
  created_at: string;
}

export interface SavedPostComment extends LocalCommentBase {
  comment_id: number;
  post_id: number;
  post_title: string;
  hub_name: string;
}

export interface SavedRedditPost {
  subreddit: string;
  reddit_post_id: string;
  title?: string;
  author?: string;
  score?: number;
  num_comments?: number;
  thumbnail?: string | null;
  created_utc?: number | null;
  url?: string;
  selftext?: string;
  is_self?: boolean;
  post_hint?: string;
  is_video?: boolean;
  preview?: unknown;
  media?: unknown;
  secure_media?: unknown;
  link_flair_text?: string | null;
  link_flair_background_color?: string | null;
  link_flair_text_color?: string | null;
  over18?: boolean | null;
  saved_at: string;
}

export interface SaveRedditPostPayload {
  title?: string;
  author?: string;
  score?: number;
  num_comments?: number;
  thumbnail?: string | null;
  created_utc?: number | null;
  link_flair_text?: string | null;
  link_flair_background_color?: string | null;
  link_flair_text_color?: string | null;
  over18?: boolean | null;
}

export interface SavedRedditAPIComment {
  subreddit: string;
  reddit_post_id: string;
  reddit_comment_id: string;
  post_title?: string | null;
  post_author?: string | null;
  comment_author: string;
  comment_body: string;
  score: number;
  created_utc?: number | null;
  parent_id?: string | null;
  saved_at: string;
}

export interface SavedItemsResponse {
  type:
    | 'all'
    | 'posts'
    | 'reddit_posts'
    | 'reddit_comments'
    | 'post_comments'
    | 'reddit_api_comments';
  saved_posts?: SavedPost[];
  saved_reddit_posts?: SavedRedditPost[];
  saved_post_comments?: SavedPostComment[];
  saved_reddit_comments?: LocalRedditComment[];
  saved_reddit_api_comments?: SavedRedditAPIComment[];
  auto_removed_reddit_posts?: Array<{
    subreddit: string;
    reddit_post_id: string;
  }>;
}

export interface HiddenItemsResponse {
  type: 'all' | 'posts' | 'reddit_posts';
  hidden_posts?: SavedPost[];
  hidden_reddit_posts?: SavedRedditPost[];
}
