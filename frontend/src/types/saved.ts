import type { LocalRedditComment } from './reddit';
import type { LocalCommentBase } from './comments';

export interface SavedPost {
  id: number;
  title: string;
  hub_name: string;
  author_username: string;
  score: number;
  comment_count: number;
  created_at: string;
}

export interface SavedPostComment extends LocalCommentBase {
  comment_id: number;
  post_id: number;
  post_title: string;
  hub_name: string;
}

export interface SavedItemsResponse {
  type: 'all' | 'posts' | 'reddit_comments' | 'post_comments';
  saved_posts?: SavedPost[];
  saved_post_comments?: SavedPostComment[];
  saved_reddit_comments?: LocalRedditComment[];
}
