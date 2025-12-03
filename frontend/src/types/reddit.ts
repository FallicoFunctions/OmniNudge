import type { LocalCommentBase } from './comments';

export interface LocalRedditComment extends LocalCommentBase {
  subreddit: string;
  reddit_post_id: string;
  reddit_post_title?: string;
  user_id: number;
  parent_reddit_comment_id?: string; // Reddit API comment ID this is replying to
}

export interface SubredditSuggestion {
  name: string;
  title?: string;
  subscribers?: number;
  icon_url?: string;
  over_18?: boolean;
}
