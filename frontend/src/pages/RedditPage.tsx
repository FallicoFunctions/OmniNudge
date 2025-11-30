import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { redditService } from '../services/redditService';

export default function RedditPage() {
  const navigate = useNavigate();
  const [subreddit, setSubreddit] = useState('popular');
  const [sort, setSort] = useState<'hot' | 'new' | 'top' | 'rising'>('hot');
  const [inputValue, setInputValue] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['reddit', subreddit, sort],
    queryFn: () =>
      subreddit === 'frontpage'
        ? redditService.getFrontPage()
        : redditService.getSubredditPosts(subreddit, sort),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const handleSubredditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim()) {
      setSubreddit(inputValue.trim());
      setInputValue('');
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">Reddit Browser</h1>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
          Currently viewing: r/{subreddit}
        </p>
      </div>

      {/* Controls */}
      <div className="mb-6 flex flex-col gap-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 md:flex-row md:items-center md:justify-between">
        {/* Subreddit Input */}
        <form onSubmit={handleSubredditSubmit} className="flex gap-2">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Enter subreddit..."
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
          />
          <button
            type="submit"
            className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)]"
          >
            Go
          </button>
        </form>

        {/* Sort Options */}
        <div className="flex gap-2">
          {(['hot', 'new', 'top', 'rising'] as const).map((sortOption) => (
            <button
              key={sortOption}
              onClick={() => setSort(sortOption)}
              className={`rounded-md px-3 py-2 text-sm font-medium capitalize ${
                sort === sortOption
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)] hover:bg-[var(--color-border)]'
              }`}
            >
              {sortOption}
            </button>
          ))}
        </div>
      </div>

      {/* Popular Subreddits */}
      <div className="mb-6 flex flex-wrap gap-2">
        {['popular', 'all', 'programming', 'technology', 'news', 'worldnews', 'science'].map(
          (sub) => (
            <button
              key={sub}
              onClick={() => setSubreddit(sub)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                subreddit === sub
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-elevated)]'
              }`}
            >
              r/{sub}
            </button>
          )
        )}
      </div>

      {/* Posts List */}
      {isLoading && (
        <div className="text-center text-[var(--color-text-secondary)]">Loading posts...</div>
      )}

      {error && (
        <div className="rounded-md bg-red-50 p-4 text-sm text-red-800 dark:bg-red-900/20 dark:text-red-400">
          Failed to load posts: {error instanceof Error ? error.message : 'Unknown error'}
        </div>
      )}

      {data?.posts && (
        <div className="space-y-4">
          {data.posts.map((post) => (
            <article
              key={post.id}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm transition-shadow hover:shadow-md"
            >
              <div
                onClick={() => navigate(`/reddit/r/${post.subreddit}/comments/${post.id}`)}
                className="flex cursor-pointer gap-4 p-4"
              >
                {/* Thumbnail */}
                {post.thumbnail && post.thumbnail !== 'self' && post.thumbnail !== 'default' && (
                  <img
                    src={post.thumbnail}
                    alt=""
                    className="h-20 w-20 flex-shrink-0 rounded object-cover"
                  />
                )}

                {/* Content */}
                <div className="flex-1">
                  <h2 className="text-lg font-semibold text-[var(--color-text-primary)] hover:text-[var(--color-primary)]">
                    {post.title}
                  </h2>

                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-[var(--color-text-secondary)]">
                    <span>r/{post.subreddit}</span>
                    <span>•</span>
                    <span>u/{post.author}</span>
                    <span>•</span>
                    <span>{post.score} points</span>
                    <span>•</span>
                    <span>{post.num_comments} comments</span>
                    <span>•</span>
                    <span>{new Date(post.created_utc * 1000).toLocaleDateString()}</span>
                  </div>

                  {post.selftext && (
                    <p className="mt-2 line-clamp-3 text-sm text-[var(--color-text-secondary)]">
                      {post.selftext}
                    </p>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 border-t border-[var(--color-border)] px-4 py-2 text-xs">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/reddit/r/${post.subreddit}/comments/${post.id}`);
                  }}
                  className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                >
                  {post.num_comments} Comments
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    // TODO: Implement share functionality
                    console.log('Share post', post.id);
                  }}
                  className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                >
                  Share
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    // TODO: Implement save functionality
                    console.log('Save post', post.id);
                  }}
                  className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                >
                  Save
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    // TODO: Implement hide functionality
                    console.log('Hide post', post.id);
                  }}
                  className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                >
                  Hide
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    // TODO: Implement crosspost functionality
                    console.log('Crosspost', post.id);
                  }}
                  className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                >
                  Crosspost
                </button>
                {!post.is_self && (
                  <a
                    href={post.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                  >
                    Open Link ↗
                  </a>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {data?.posts && data.posts.length === 0 && (
        <div className="text-center text-[var(--color-text-secondary)]">
          No posts found in r/{subreddit}
        </div>
      )}
    </div>
  );
}
