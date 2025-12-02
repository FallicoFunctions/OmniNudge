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

  async deletePost(id: number): Promise<void> {
    await api.delete(`/posts/${id}`);
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

  async updateComment(commentId: number, body: string): Promise<PostComment> {
    return api.put<PostComment>(`/comments/${commentId}`, { body });
  },

  async deleteComment(commentId: number): Promise<void> {
    await api.delete(`/comments/${commentId}`);
  },

  async voteComment(id: number, value: 1 | -1 | 0): Promise<void> {
    let isUpvote: boolean | null;
    if (value === 1) {
      isUpvote = true;
    } else if (value === -1) {
      isUpvote = false;
    } else {
      isUpvote = null;
    }
    await api.post(`/comments/${id}/vote`, { is_upvote: isUpvote });
  },

  async toggleCommentInbox(postId: number, commentId: number, disable: boolean): Promise<void> {
    await api.post(`/posts/${postId}/comments/${commentId}/preferences`, {
      disable_inbox_replies: disable,
    });
  },
};
