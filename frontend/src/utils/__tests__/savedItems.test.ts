import { describe, it, expect, beforeEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import {
  markPlatformPostSaved,
  markPlatformPostUnsaved,
  markRedditPostSaved,
  markRedditPostUnsaved,
  removeFromHiddenCache,
  removeRedditFromHiddenCache,
  getRedditPostKey,
} from '../savedItems';
import type { SavedItemsResponse, HiddenItemsResponse } from '../../types/saved';

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

const basePlatformPost = {
  id: 42,
  title: 'Test Post',
  hub_name: 'testHub',
  author_username: 'alice',
  score: 10,
  comment_count: 3,
  crossposted_at: null,
  created_at: '2024-01-01T00:00:00Z',
};

const baseRedditPost = {
  subreddit: 'funny',
  reddit_post_id: 'abc123',
  title: 'Funny post',
  author: 'bob',
  score: 100,
  num_comments: 5,
  thumbnail: 'https://example.com/thumb.jpg',
  created_utc: 1700000000,
};

describe('markPlatformPostSaved', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = makeQueryClient();
  });

  it('inserts into an existing saved_posts cache', () => {
    const initial: SavedItemsResponse = { type: 'posts', saved_posts: [] };
    queryClient.setQueryData(['saved-items', 'posts'], initial);

    markPlatformPostSaved(queryClient, basePlatformPost);

    const result = queryClient.getQueryData<SavedItemsResponse>(['saved-items', 'posts']);
    expect(result?.saved_posts).toHaveLength(1);
    expect(result?.saved_posts?.[0].id).toBe(42);
  });

  it('also updates the all cache', () => {
    const initial: SavedItemsResponse = { type: 'all', saved_posts: [] };
    queryClient.setQueryData(['saved-items', 'all'], initial);

    markPlatformPostSaved(queryClient, basePlatformPost);

    const result = queryClient.getQueryData<SavedItemsResponse>(['saved-items', 'all']);
    expect(result?.saved_posts?.some((p) => p.id === 42)).toBe(true);
  });

  it('does not duplicate if already saved', () => {
    const initial: SavedItemsResponse = { type: 'posts', saved_posts: [{ ...basePlatformPost, comment_count: 3, created_at: '2024-01-01T00:00:00Z' }] };
    queryClient.setQueryData(['saved-items', 'posts'], initial);

    markPlatformPostSaved(queryClient, basePlatformPost);

    const result = queryClient.getQueryData<SavedItemsResponse>(['saved-items', 'posts']);
    expect(result?.saved_posts).toHaveLength(1);
  });

  it('bootstraps the cache when it is cold (undefined)', () => {
    markPlatformPostSaved(queryClient, basePlatformPost);
    const result = queryClient.getQueryData<SavedItemsResponse>(['saved-items', 'posts']);
    expect(result?.saved_posts).toHaveLength(1);
    expect(result?.saved_posts?.[0].id).toBe(42);
    expect(result?.type).toBe('posts');
  });
});

describe('markPlatformPostUnsaved', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = makeQueryClient();
  });

  it('removes the post from saved_posts cache', () => {
    const initial: SavedItemsResponse = {
      type: 'posts',
      saved_posts: [{ ...basePlatformPost, comment_count: 3, created_at: '2024-01-01T00:00:00Z' }],
    };
    queryClient.setQueryData(['saved-items', 'posts'], initial);
    queryClient.setQueryData(['saved-items', 'all'], { type: 'all', saved_posts: [{ ...basePlatformPost, comment_count: 3, created_at: '2024-01-01T00:00:00Z' }] });

    markPlatformPostUnsaved(queryClient, 42);

    const posts = queryClient.getQueryData<SavedItemsResponse>(['saved-items', 'posts']);
    const all = queryClient.getQueryData<SavedItemsResponse>(['saved-items', 'all']);
    expect(posts?.saved_posts).toHaveLength(0);
    expect(all?.saved_posts).toHaveLength(0);
  });

  it('keeps other posts intact', () => {
    const other = { ...basePlatformPost, id: 99 };
    const initial: SavedItemsResponse = {
      type: 'posts',
      saved_posts: [
        { ...basePlatformPost, comment_count: 3, created_at: '2024-01-01T00:00:00Z' },
        { ...other, comment_count: 0, created_at: '2024-01-02T00:00:00Z' },
      ],
    };
    queryClient.setQueryData(['saved-items', 'posts'], initial);

    markPlatformPostUnsaved(queryClient, 42);

    const result = queryClient.getQueryData<SavedItemsResponse>(['saved-items', 'posts']);
    expect(result?.saved_posts).toHaveLength(1);
    expect(result?.saved_posts?.[0].id).toBe(99);
  });
});

describe('markPlatformPostUnsaved cold cache', () => {
  it('bootstraps an empty list when cache is cold', () => {
    const queryClient = makeQueryClient();
    markPlatformPostUnsaved(queryClient, 42);
    const result = queryClient.getQueryData<SavedItemsResponse>(['saved-items', 'posts']);
    expect(result?.saved_posts).toHaveLength(0);
    expect(result?.type).toBe('posts');
  });
});

describe('markRedditPostSaved', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = makeQueryClient();
  });

  it('bootstraps the cache when cold', () => {
    markRedditPostSaved(queryClient, 'funny', 'abc123', baseRedditPost);
    const result = queryClient.getQueryData<SavedItemsResponse>(['saved-items', 'reddit_posts']);
    expect(result?.saved_reddit_posts).toHaveLength(1);
    expect(result?.type).toBe('reddit_posts');
  });

  it('inserts into saved_reddit_posts cache', () => {
    const initial: SavedItemsResponse = { type: 'reddit_posts', saved_reddit_posts: [] };
    queryClient.setQueryData(['saved-items', 'reddit_posts'], initial);

    markRedditPostSaved(queryClient, 'funny', 'abc123', baseRedditPost);

    const result = queryClient.getQueryData<SavedItemsResponse>(['saved-items', 'reddit_posts']);
    expect(result?.saved_reddit_posts).toHaveLength(1);
    expect(result?.saved_reddit_posts?.[0].subreddit).toBe('funny');
  });

  it('normalizes t3_ prefix on reddit_post_id', () => {
    const initial: SavedItemsResponse = { type: 'reddit_posts', saved_reddit_posts: [] };
    queryClient.setQueryData(['saved-items', 'reddit_posts'], initial);

    markRedditPostSaved(queryClient, 'funny', 't3_abc123', baseRedditPost);

    const result = queryClient.getQueryData<SavedItemsResponse>(['saved-items', 'reddit_posts']);
    expect(result?.saved_reddit_posts?.[0].reddit_post_id).toBe('abc123');
  });

  it('does not duplicate if already saved', () => {
    const existing = { subreddit: 'funny', reddit_post_id: 'abc123', saved_at: '2024-01-01T00:00:00Z' };
    const initial: SavedItemsResponse = { type: 'reddit_posts', saved_reddit_posts: [existing] };
    queryClient.setQueryData(['saved-items', 'reddit_posts'], initial);

    markRedditPostSaved(queryClient, 'funny', 'abc123', baseRedditPost);

    const result = queryClient.getQueryData<SavedItemsResponse>(['saved-items', 'reddit_posts']);
    expect(result?.saved_reddit_posts).toHaveLength(1);
  });

  it('updates both reddit_posts and all caches', () => {
    queryClient.setQueryData(['saved-items', 'reddit_posts'], { type: 'reddit_posts', saved_reddit_posts: [] });
    queryClient.setQueryData(['saved-items', 'all'], { type: 'all', saved_reddit_posts: [] });

    markRedditPostSaved(queryClient, 'funny', 'abc123', baseRedditPost);

    const reddit = queryClient.getQueryData<SavedItemsResponse>(['saved-items', 'reddit_posts']);
    const all = queryClient.getQueryData<SavedItemsResponse>(['saved-items', 'all']);
    expect(reddit?.saved_reddit_posts).toHaveLength(1);
    expect(all?.saved_reddit_posts).toHaveLength(1);
  });
});

describe('markRedditPostUnsaved', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = makeQueryClient();
  });

  it('removes reddit post from both caches', () => {
    const key = getRedditPostKey('funny', 'abc123');
    const existing = { subreddit: 'funny', reddit_post_id: 'abc123', saved_at: '2024-01-01T00:00:00Z' };
    queryClient.setQueryData(['saved-items', 'reddit_posts'], { type: 'reddit_posts', saved_reddit_posts: [existing] });
    queryClient.setQueryData(['saved-items', 'all'], { type: 'all', saved_reddit_posts: [existing] });

    markRedditPostUnsaved(queryClient, 'funny', 'abc123');

    const reddit = queryClient.getQueryData<SavedItemsResponse>(['saved-items', 'reddit_posts']);
    const all = queryClient.getQueryData<SavedItemsResponse>(['saved-items', 'all']);
    expect(reddit?.saved_reddit_posts).toHaveLength(0);
    expect(all?.saved_reddit_posts).toHaveLength(0);
    void key; // used for clarity above
  });

  it('matches t3_ prefixed IDs correctly', () => {
    const existing = { subreddit: 'funny', reddit_post_id: 'abc123', saved_at: '2024-01-01T00:00:00Z' };
    queryClient.setQueryData(['saved-items', 'reddit_posts'], { type: 'reddit_posts', saved_reddit_posts: [existing] });

    markRedditPostUnsaved(queryClient, 'funny', 't3_abc123');

    const result = queryClient.getQueryData<SavedItemsResponse>(['saved-items', 'reddit_posts']);
    expect(result?.saved_reddit_posts).toHaveLength(0);
  });

  it('bootstraps an empty list when cache is cold', () => {
    markRedditPostUnsaved(queryClient, 'funny', 'abc123');
    const result = queryClient.getQueryData<SavedItemsResponse>(['saved-items', 'reddit_posts']);
    expect(result?.saved_reddit_posts).toHaveLength(0);
    expect(result?.type).toBe('reddit_posts');
  });
});

describe('removeFromHiddenCache', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = makeQueryClient();
  });

  it('removes the post from hidden_posts in both caches', () => {
    const hiddenPost = { id: 42, title: 'Hidden', hub_name: 'h', author_username: 'a', score: 0, comment_count: 0, created_at: '2024-01-01T00:00:00Z' };
    queryClient.setQueryData(['hidden-items', 'all'], { type: 'all', hidden_posts: [hiddenPost] });
    queryClient.setQueryData(['hidden-items', 'posts'], { type: 'posts', hidden_posts: [hiddenPost] });

    removeFromHiddenCache(queryClient, 42);

    const all = queryClient.getQueryData<HiddenItemsResponse>(['hidden-items', 'all']);
    const posts = queryClient.getQueryData<HiddenItemsResponse>(['hidden-items', 'posts']);
    expect(all?.hidden_posts).toHaveLength(0);
    expect(posts?.hidden_posts).toHaveLength(0);
  });

  it('does not remove other posts', () => {
    const h1 = { id: 42, title: 'H1', hub_name: 'h', author_username: 'a', score: 0, comment_count: 0, created_at: '2024-01-01T00:00:00Z' };
    const h2 = { id: 99, title: 'H2', hub_name: 'h', author_username: 'b', score: 0, comment_count: 0, created_at: '2024-01-01T00:00:00Z' };
    queryClient.setQueryData(['hidden-items', 'all'], { type: 'all', hidden_posts: [h1, h2] });

    removeFromHiddenCache(queryClient, 42);

    const result = queryClient.getQueryData<HiddenItemsResponse>(['hidden-items', 'all']);
    expect(result?.hidden_posts).toHaveLength(1);
    expect(result?.hidden_posts?.[0].id).toBe(99);
  });
});

describe('removeRedditFromHiddenCache', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = makeQueryClient();
  });

  it('removes the reddit post from hidden_reddit_posts in both caches', () => {
    const existing = { subreddit: 'funny', reddit_post_id: 'abc123', saved_at: '2024-01-01T00:00:00Z' };
    queryClient.setQueryData(['hidden-items', 'all'], { type: 'all', hidden_reddit_posts: [existing] });
    queryClient.setQueryData(['hidden-items', 'reddit_posts'], { type: 'reddit_posts', hidden_reddit_posts: [existing] });

    removeRedditFromHiddenCache(queryClient, 'funny', 'abc123');

    const all = queryClient.getQueryData<HiddenItemsResponse>(['hidden-items', 'all']);
    const reddit = queryClient.getQueryData<HiddenItemsResponse>(['hidden-items', 'reddit_posts']);
    expect(all?.hidden_reddit_posts).toHaveLength(0);
    expect(reddit?.hidden_reddit_posts).toHaveLength(0);
  });
});
