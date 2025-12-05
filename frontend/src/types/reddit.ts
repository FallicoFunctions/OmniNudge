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

export interface RedditApiPost {
  id: string;
  subreddit: string;
  title: string;
  author: string;
  selftext?: string;
  url?: string;
  permalink: string;
  thumbnail?: string;
  score: number;
  num_comments: number;
  created_utc: number;
  over_18?: boolean;
  post_hint?: string;
  is_video?: boolean;
  is_self?: boolean;
}

export interface RedditUserComment {
  id: string;
  body: string;
  author: string;
  subreddit: string;
  score: number;
  created_utc: number;
  permalink: string;
  parent_id: string;
  link_id: string;
  link_title?: string;
  link_permalink?: string;
  link_author?: string;
}

export interface RedditUserItem {
  kind: 'post' | 'comment';
  post?: RedditApiPost;
  comment?: RedditUserComment;
}

export interface RedditUserListingResponse {
  username: string;
  section: string;
  sort: string;
  after?: string;
  before?: string;
  items: RedditUserItem[];
}

export interface RedditUserAbout {
  name: string;
  icon_img?: string;
  created_utc: number;
  total_karma: number;
  comment_karma: number;
  link_karma: number;
}

export interface RedditUserTrophy {
  name: string;
  description?: string;
  icon_url?: string;
}

export interface RedditModeratedSubreddit {
  name: string;
  title?: string;
  subscribers?: number;
}
