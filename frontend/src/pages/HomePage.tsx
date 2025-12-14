import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { feedService, type CombinedFeedItem, type RedditPost } from '../services/feedService';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { formatTimestamp } from '../utils/timeFormat';
import type { PlatformPost } from '../types/posts';

type SortOption = 'hot' | 'new' | 'top' | 'rising';

function HubPostCard({ post, useRelativeTime }: { post: PlatformPost; useRelativeTime: boolean }) {
  return (
    <article className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="flex gap-3">
        {post.thumbnail_url && (
          <img
            src={post.thumbnail_url}
            alt=""
            className="h-16 w-16 flex-shrink-0 rounded object-cover"
          />
        )}
        <div className="flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-[var(--color-text-secondary)]">
            <span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900 dark:text-blue-200">
              OMNI
            </span>
            <Link
              to={`/hubs/h/${post.hub_name}`}
              className="font-semibold text-[var(--color-text-primary)] hover:text-[var(--color-primary)]"
            >
              h/{post.hub_name}
            </Link>
            <span>•</span>
            <span>{post.score.toLocaleString()} points</span>
            <span>•</span>
            <span>posted {formatTimestamp(post.created_at, useRelativeTime)}</span>
          </div>
          <Link to={`/posts/${post.id}`}>
            <h3 className="text-lg font-semibold text-[var(--color-text-primary)] hover:text-[var(--color-primary)]">
              {post.title}
            </h3>
          </Link>
          {post.body && (
            <p className="mt-2 line-clamp-3 text-sm text-[var(--color-text-secondary)]">
              {post.body}
            </p>
          )}
          <div className="mt-2 text-xs font-medium text-[var(--color-text-secondary)]">
            {(post.comment_count ?? post.num_comments ?? 0).toLocaleString()} Comments
          </div>
        </div>
      </div>
    </article>
  );
}

function RedditPostCard({ post }: { post: RedditPost }) {
  const thumbnailUrl =
    post.thumbnail && post.thumbnail !== 'self' && post.thumbnail !== 'default'
      ? post.thumbnail
      : post.preview?.images?.[0]?.source?.url?.replace(/&amp;/g, '&');

  return (
    <article className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="flex gap-3">
        {thumbnailUrl && (
          <img src={thumbnailUrl} alt="" className="h-16 w-16 flex-shrink-0 rounded object-cover" />
        )}
        <div className="flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-[var(--color-text-secondary)]">
            <span className="rounded bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800 dark:bg-orange-900 dark:text-orange-200">
              REDDIT
            </span>
            <Link
              to={`/reddit/r/${post.subreddit}`}
              className="font-semibold text-[var(--color-text-primary)] hover:text-[var(--color-primary)]"
            >
              r/{post.subreddit}
            </Link>
            <span>•</span>
            <span>{post.score.toLocaleString()} points</span>
            <span>•</span>
            <span>by u/{post.author}</span>
          </div>
          <Link to={`/reddit${post.permalink}`}>
            <h3 className="text-lg font-semibold text-[var(--color-text-primary)] hover:text-[var(--color-primary)]">
              {post.title}
            </h3>
          </Link>
          {post.selftext && (
            <p className="mt-2 line-clamp-3 text-sm text-[var(--color-text-secondary)]">
              {post.selftext}
            </p>
          )}
          <div className="mt-2 text-xs font-medium text-[var(--color-text-secondary)]">
            {post.num_comments.toLocaleString()} Comments
          </div>
        </div>
      </div>
    </article>
  );
}

export default function HomePage() {
  const { user } = useAuth();
  const { useRelativeTime } = useSettings();
  const [sort, setSort] = useState<SortOption>('hot');

  const { data, isLoading } = useQuery({
    queryKey: ['home-feed', sort],
    queryFn: () => feedService.getHomeFeed(sort, 50),
    staleTime: 1000 * 60 * 5,
  });

  const posts = data?.posts ?? [];

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">
          {user ? 'Your Feed' : 'Popular Posts'}
        </h1>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          {user
            ? 'Posts from your subscribed hubs and subreddits'
            : 'Popular posts from all hubs and subreddits'}
        </p>
      </div>

      {/* Sort controls */}
      <div className="mb-4 flex gap-2 border-b border-[var(--color-border)] pb-2">
        <button
          type="button"
          onClick={() => setSort('hot')}
          className={`px-4 py-2 text-sm font-semibold ${
            sort === 'hot'
              ? 'text-[var(--color-primary)]'
              : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
          }`}
        >
          Hot
        </button>
        <button
          type="button"
          onClick={() => setSort('new')}
          className={`px-4 py-2 text-sm font-semibold ${
            sort === 'new'
              ? 'text-[var(--color-primary)]'
              : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
          }`}
        >
          New
        </button>
        <button
          type="button"
          onClick={() => setSort('top')}
          className={`px-4 py-2 text-sm font-semibold ${
            sort === 'top'
              ? 'text-[var(--color-primary)]'
              : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
          }`}
        >
          Top
        </button>
        <button
          type="button"
          onClick={() => setSort('rising')}
          className={`px-4 py-2 text-sm font-semibold ${
            sort === 'rising'
              ? 'text-[var(--color-primary)]'
              : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
          }`}
        >
          Rising
        </button>
      </div>

      {/* Posts */}
      {isLoading ? (
        <div className="text-center text-[var(--color-text-secondary)]">Loading feed...</div>
      ) : posts.length === 0 ? (
        <div className="text-center text-[var(--color-text-secondary)]">
          {user ? (
            <div>
              <p className="mb-4">No posts from your subscriptions yet.</p>
              <p className="text-sm">
                <Link
                  to="/hubs"
                  className="font-medium text-[var(--color-primary)] hover:underline"
                >
                  Browse hubs
                </Link>{' '}
                or{' '}
                <Link
                  to="/reddit"
                  className="font-medium text-[var(--color-primary)] hover:underline"
                >
                  browse subreddits
                </Link>{' '}
                to get started.
              </p>
            </div>
          ) : (
            <p>No posts available.</p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map((item: CombinedFeedItem) =>
            item.source === 'hub' ? (
              <HubPostCard
                key={`hub-${(item.post as PlatformPost).id}`}
                post={item.post as PlatformPost}
                useRelativeTime={useRelativeTime}
              />
            ) : (
              <RedditPostCard
                key={`reddit-${(item.post as RedditPost).id}`}
                post={item.post as RedditPost}
              />
            )
          )}
        </div>
      )}
    </div>
  );
}
