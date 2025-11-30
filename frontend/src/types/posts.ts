export interface PlatformPost {
  id: number;
  title: string;
  content?: string;
  author_id: number;
  author_username: string;
  hub_name: string;
  score: number;
  comment_count: number;
  created_at: string;
  updated_at?: string;
}

export interface PostComment {
  id: number;
  post_id: number;
  author_id: number;
  author_username: string;
  content: string;
  score: number;
  parent_comment_id?: number;
  created_at: string;
  updated_at?: string;
  replies?: PostComment[];
}

export interface CreatePostRequest {
  title: string;
  content?: string;
  hub_name: string;
}

export interface CreateCommentRequest {
  content: string;
  parent_comment_id?: number;
}

export interface PostsResponse {
  posts: PlatformPost[];
  total: number;
  page: number;
  per_page: number;
}
