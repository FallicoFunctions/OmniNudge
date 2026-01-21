import type { SavedItemsResponse, HiddenItemsResponse } from '../types/saved';

export const getSavedPostIdSet = (data?: SavedItemsResponse) =>
  new Set<number>(data?.saved_posts?.map((post) => post.id) ?? []);

export const getHiddenPostIdSet = (data?: HiddenItemsResponse) =>
  new Set<number>(data?.hidden_posts?.map((post) => post.id) ?? []);

export const getHiddenRedditPostIdSet = (data?: HiddenItemsResponse) =>
  new Set<string>(
    data?.hidden_reddit_posts?.map(
      (post) => `${post.subreddit}-${post.reddit_post_id}`
    ) ?? []
  );

export const getSavedRedditPostIdSet = (data?: SavedItemsResponse) =>
  new Set<string>(
    data?.saved_reddit_posts?.map((post) => `${post.subreddit}-${post.reddit_post_id}`) ?? []
  );

export const getSavedCommentIdSet = (data?: SavedItemsResponse) =>
  new Set<number>(
    data?.saved_post_comments?.map((entry) => entry.comment_id ?? entry.id) ?? []
  );

export const getSavedRedditCommentIdSet = (data?: SavedItemsResponse) =>
  new Set<string>(
    data?.saved_reddit_comments?.map(
      (comment) => `${comment.subreddit}-${comment.reddit_post_id}-${comment.id}`
    ) ?? []
  );

export const getSavedRedditCommentIdSetById = (data?: SavedItemsResponse) =>
  new Set<number>(data?.saved_reddit_comments?.map((comment) => comment.id) ?? []);

export const getSavedRedditAPICommentIdSet = (data?: SavedItemsResponse) =>
  new Set<string>(data?.saved_reddit_api_comments?.map((comment) => comment.reddit_comment_id) ?? []);
