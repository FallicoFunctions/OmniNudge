export interface RedditPost {
  id: string;
  title: string;
  author: string;
  subreddit: string;
  created_utc: number;
  score: number;
  num_comments: number;
  url: string;
  thumbnail?: string;
  selftext?: string;
  permalink: string;
  is_self: boolean;
}

export interface RedditComment {
  id: string;
  author: string;
  body: string;
  created_utc: number;
  score: number;
  replies?: RedditComment[];
}

export interface RedditPostsResponse {
  posts: RedditPost[];
  after?: string;
  before?: string;
}
