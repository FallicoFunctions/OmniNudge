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
  is_self: boolean;
  link_flair_text?: string;
  link_flair_background_color?: string;
  link_flair_text_color?: 'light' | 'dark' | string;
  preview?: {
    images?: Array<{
      source?: { url?: string };
      resolutions?: Array<{ url?: string }>;
    }>;
  };
  gallery_data?: {
    items?: Array<{
      media_id: string;
      id: number;
    }>;
  };
  media_metadata?: Record<string, {
    status: string;
    e: string;
    m?: string;
    s?: {
      y: number;
      x: number;
      u?: string;
    };
    p?: Array<{
      y: number;
      x: number;
      u?: string;
    }>;
  }>;
  media?: {
    reddit_video?: {
      fallback_url?: string;
      dash_url?: string;
      hls_url?: string;
      height?: number;
      width?: number;
    };
    oembed?: {
      thumbnail_url?: string;
      thumbnail_width?: number;
      thumbnail_height?: number;
    };
  };
  secure_media?: {
    reddit_video?: {
      fallback_url?: string;
      dash_url?: string;
      hls_url?: string;
      height?: number;
      width?: number;
    };
    oembed?: {
      thumbnail_url?: string;
      thumbnail_width?: number;
      thumbnail_height?: number;
    };
  };
}

export interface RedditPostsResponse {
  posts: RedditApiPost[];
  after?: string | null;
  before?: string | null;
}

export interface RedditComment {
  id: string;
  author: string;
  body: string;
  created_utc: number;
  score: number;
  parent_id?: string;
  permalink?: string;
  depth?: number;
  replies?: RedditComment[] | string | null;
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
  link_num_comments?: number;
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
