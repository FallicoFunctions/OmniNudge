import type { QueryClient } from '@tanstack/react-query';
import type { SavedItemsResponse, HiddenItemsResponse, SavedPost, SavedRedditPost } from '../types/saved';

export const normalizeRedditPostId = (postId: string) => postId.replace(/^t3_/, '');

export const getRedditPostKey = (subreddit: string, postId: string) =>
  `${subreddit}-${normalizeRedditPostId(postId)}`;

export const invalidateSavedItemsQueries = (queryClient: QueryClient) =>
  queryClient.invalidateQueries({ queryKey: ['saved-items'] });

export const invalidateHiddenItemsQueries = (queryClient: QueryClient) =>
  queryClient.invalidateQueries({ queryKey: ['hidden-items'] });

export const markPlatformPostSaved = (
  queryClient: QueryClient,
  post: {
    id: number;
    title: string;
    hub_name: string;
    author_username: string;
    score: number;
    comment_count?: number | null;
    num_comments?: number | null;
    crossposted_at?: string | null;
    created_at: string;
  }
) => {
  const entry: SavedPost = {
    id: post.id,
    title: post.title,
    hub_name: post.hub_name,
    author_username: post.author_username,
    score: post.score,
    comment_count: post.comment_count ?? post.num_comments ?? 0,
    crossposted_at: post.crossposted_at,
    created_at: post.created_at,
  };
  const insert = (list: SavedPost[]): SavedPost[] =>
    list.some((p) => p.id === post.id) ? list : [...list, entry];

  queryClient.setQueryData<SavedItemsResponse>(['saved-items', 'posts'], (old) => ({
    ...(old ?? { type: 'posts' as const }),
    saved_posts: insert(old?.saved_posts ?? []),
  }));
  queryClient.setQueryData<SavedItemsResponse>(['saved-items', 'all'], (old) => ({
    ...(old ?? { type: 'all' as const }),
    saved_posts: insert(old?.saved_posts ?? []),
  }));
};

export const markPlatformPostUnsaved = (queryClient: QueryClient, postId: number) => {
  const remove = (list: SavedPost[]): SavedPost[] => list.filter((p) => p.id !== postId);

  queryClient.setQueryData<SavedItemsResponse>(['saved-items', 'posts'], (old) => ({
    ...(old ?? { type: 'posts' as const }),
    saved_posts: remove(old?.saved_posts ?? []),
  }));
  queryClient.setQueryData<SavedItemsResponse>(['saved-items', 'all'], (old) => ({
    ...(old ?? { type: 'all' as const }),
    saved_posts: remove(old?.saved_posts ?? []),
  }));
};

export const markRedditPostSaved = (
  queryClient: QueryClient,
  subreddit: string,
  postId: string,
  payload: Partial<Pick<SavedRedditPost, 'title' | 'author' | 'score' | 'num_comments' | 'thumbnail' | 'created_utc'>> = {}
) => {
  const normalizedId = normalizeRedditPostId(postId);
  const key = getRedditPostKey(subreddit, normalizedId);
  const entry: SavedRedditPost = {
    subreddit,
    reddit_post_id: normalizedId,
    title: payload.title,
    author: payload.author,
    score: payload.score,
    num_comments: payload.num_comments,
    thumbnail: payload.thumbnail ?? null,
    created_utc: payload.created_utc ?? null,
    saved_at: new Date().toISOString(),
  };
  const insert = (list: SavedRedditPost[]): SavedRedditPost[] =>
    list.some((p) => getRedditPostKey(p.subreddit, p.reddit_post_id) === key) ? list : [...list, entry];

  queryClient.setQueryData<SavedItemsResponse>(['saved-items', 'reddit_posts'], (old) => ({
    ...(old ?? { type: 'reddit_posts' as const }),
    saved_reddit_posts: insert(old?.saved_reddit_posts ?? []),
  }));
  queryClient.setQueryData<SavedItemsResponse>(['saved-items', 'all'], (old) => ({
    ...(old ?? { type: 'all' as const }),
    saved_reddit_posts: insert(old?.saved_reddit_posts ?? []),
  }));
};

export const markRedditPostUnsaved = (queryClient: QueryClient, subreddit: string, postId: string) => {
  const key = getRedditPostKey(subreddit, postId);
  const remove = (list: SavedRedditPost[]): SavedRedditPost[] =>
    list.filter((p) => getRedditPostKey(p.subreddit, p.reddit_post_id) !== key);

  queryClient.setQueryData<SavedItemsResponse>(['saved-items', 'reddit_posts'], (old) => ({
    ...(old ?? { type: 'reddit_posts' as const }),
    saved_reddit_posts: remove(old?.saved_reddit_posts ?? []),
  }));
  queryClient.setQueryData<SavedItemsResponse>(['saved-items', 'all'], (old) => ({
    ...(old ?? { type: 'all' as const }),
    saved_reddit_posts: remove(old?.saved_reddit_posts ?? []),
  }));
};

export const removeFromHiddenCache = (queryClient: QueryClient, postId: number) => {
  const remove = (list: SavedPost[]): SavedPost[] => list.filter((p) => p.id !== postId);

  queryClient.setQueryData<HiddenItemsResponse>(['hidden-items', 'all'], (old) => ({
    ...(old ?? { type: 'all' as const }),
    hidden_posts: remove(old?.hidden_posts ?? []),
  }));
  queryClient.setQueryData<HiddenItemsResponse>(['hidden-items', 'posts'], (old) => ({
    ...(old ?? { type: 'posts' as const }),
    hidden_posts: remove(old?.hidden_posts ?? []),
  }));
};

export const removeRedditFromHiddenCache = (
  queryClient: QueryClient,
  subreddit: string,
  postId: string
) => {
  const key = getRedditPostKey(subreddit, postId);
  const remove = (list: SavedRedditPost[]): SavedRedditPost[] =>
    list.filter((p) => getRedditPostKey(p.subreddit, p.reddit_post_id) !== key);

  queryClient.setQueryData<HiddenItemsResponse>(['hidden-items', 'all'], (old) => ({
    ...(old ?? { type: 'all' as const }),
    hidden_reddit_posts: remove(old?.hidden_reddit_posts ?? []),
  }));
  queryClient.setQueryData<HiddenItemsResponse>(['hidden-items', 'reddit_posts'], (old) => ({
    ...(old ?? { type: 'reddit_posts' as const }),
    hidden_reddit_posts: remove(old?.hidden_reddit_posts ?? []),
  }));
};

export const getSavedPostIdSet = (data?: SavedItemsResponse) =>
  new Set<number>(data?.saved_posts?.map((post) => post.id) ?? []);

export const getHiddenPostIdSet = (data?: HiddenItemsResponse) =>
  new Set<number>(data?.hidden_posts?.map((post) => post.id) ?? []);

export const getHiddenRedditPostIdSet = (data?: HiddenItemsResponse) =>
  new Set<string>(
    data?.hidden_reddit_posts?.map(
      (post) => getRedditPostKey(post.subreddit, post.reddit_post_id)
    ) ?? []
  );

export const getSavedRedditPostIdSet = (data?: SavedItemsResponse) =>
  new Set<string>(
    data?.saved_reddit_posts?.map((post) => getRedditPostKey(post.subreddit, post.reddit_post_id)) ?? []
  );

export const getSavedCommentIdSet = (data?: SavedItemsResponse) =>
  new Set<number>(
    data?.saved_post_comments?.map((entry) => entry.comment_id ?? entry.id) ?? []
  );

export const getSavedRedditCommentIdSet = (data?: SavedItemsResponse) =>
  new Set<string>(
    data?.saved_reddit_comments?.map(
      (comment) => `${comment.subreddit}-${normalizeRedditPostId(comment.reddit_post_id)}-${comment.id}`
    ) ?? []
  );

export const getSavedRedditCommentIdSetById = (data?: SavedItemsResponse) =>
  new Set<number>(data?.saved_reddit_comments?.map((comment) => comment.id) ?? []);

export const getSavedRedditAPICommentIdSet = (data?: SavedItemsResponse) =>
  new Set<string>(data?.saved_reddit_api_comments?.map((comment) => comment.reddit_comment_id) ?? []);
