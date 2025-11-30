import { api } from '../lib/api';
import type {
  PlatformPost,
  PostComment,
  CreatePostRequest,
  CreateCommentRequest,
  PostsResponse,
} from '../types/posts';

export const postsService = {
  async getFeed(page = 1, perPage = 25): Promise<PostsResponse> {
    return api.get<PostsResponse>(`/posts/feed?page=${page}&per_page=${perPage}`);
  },

  async getPost(id: number): Promise<PlatformPost> {
    return api.get<PlatformPost>(`/posts/${id}`);
  },

  async createPost(data: CreatePostRequest): Promise<PlatformPost> {
    return api.post<PlatformPost>('/posts', data);
  },

  async votePost(id: number, value: number): Promise<void> {
    await api.post(`/posts/${id}/vote`, { value });
  },

  async getComments(postId: number): Promise<PostComment[]> {
    const response = await api.get<{ comments: PostComment[] }>(`/posts/${postId}/comments`);
    return response.comments;
  },

  async createComment(postId: number, data: CreateCommentRequest): Promise<PostComment> {
    return api.post<PostComment>(`/posts/${postId}/comments`, data);
  },

  async voteComment(id: number, value: number): Promise<void> {
    await api.post(`/comments/${id}/vote`, { value });
  },
};
