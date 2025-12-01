import type { LocalCommentBase } from './comments';

export interface LocalRedditComment extends LocalCommentBase {
  subreddit: string;
  reddit_post_id: string;
  reddit_post_title?: string;
  user_id: number;
}
