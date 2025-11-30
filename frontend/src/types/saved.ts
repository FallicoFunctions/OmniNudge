import type { LocalRedditComment } from './reddit';

export interface SavedPost {
  id: number;
  title: string;
  hub_name: string;
  author_username: string;
  score: number;
  comment_count: number;
  created_at: string;
}

export interface SavedItemsResponse {
  type: 'all' | 'posts' | 'reddit_comments';
  saved_posts?: SavedPost[];
  saved_reddit_comments?: LocalRedditComment[];
}
