import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { redditService } from '../services/redditService';
import { savedService } from '../services/savedService';
import { useAuth } from '../contexts/AuthContext';

interface FeedRedditPost {
  id: string;
  title: string;
  author: string;
  subreddit: string;
  score: number;
  num_comments: number;
  created_utc: number;
  thumbnail?: string;
  url?: string;
  selftext?: string;
  is_self: boolean;
}

interface FeedRedditPostsResponse {
  posts: FeedRedditPost[];
}

export default function RedditPage() {
  const navigate = useNavigate();
  const { subreddit: routeSubreddit } = useParams<{ subreddit?: string }>();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [subreddit, setSubreddit] = useState(routeSubreddit ?? 'popular');
  const [sort, setSort] = useState<'hot' | 'new' | 'top' | 'rising'>('hot');
  const [inputValue, setInputValue] = useState('');

  const { data, isLoading, error } = useQuery<FeedRedditPostsResponse>({
    queryKey: ['reddit', subreddit, sort],
    queryFn: () =>
      subreddit === 'frontpage'
        ? redditService.getFrontPage()
        : redditService.getSubredditPosts(subreddit, sort),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // Fetch hidden Reddit posts
  const { data: hiddenPostsData } = useQuery({
    queryKey: ['hidden-items', 'reddit_posts'],
    queryFn: () => savedService.getHiddenItems('reddit_posts'),
    enabled: !!user,
  });

  const savedRedditPostsKey = ['saved-items', 'reddit_posts'] as const;
  const { data: savedRedditPostsData } = useQuery({
    queryKey: savedRedditPostsKey,
    queryFn: () => savedService.getSavedItems('reddit_posts'),
    enabled: !!user,
  });

  const savedRedditPostIds = useMemo(() => {
    const ids = savedRedditPostsData?.saved_reddit_posts?.map(
      (post) => `${post.subreddit}-${post.reddit_post_id}`
    );
    return new Set(ids ?? []);
  }, [savedRedditPostsData]);

  // Filter out hidden posts
  const visiblePosts = useMemo(() => {
    if (!data?.posts) return [];
    if (!hiddenPostsData?.hidden_reddit_posts) return data.posts;

    const hiddenPostIds = new Set(
      hiddenPostsData.hidden_reddit_posts.map(
        (p) => `${p.subreddit}-${p.reddit_post_id}`
      )
    );

    return data.posts.filter(
      (post) => !hiddenPostIds.has(`${post.subreddit}-${post.id}`)
    );
  }, [data?.posts, hiddenPostsData?.hidden_reddit_posts]);
  const toggleSaveRedditPostMutation = useMutation<
    void,
    Error,
    { post: FeedRedditPost; shouldSave: boolean }
  >({
    mutationFn: async ({ post, shouldSave }) => {
      if (shouldSave) {
        const thumbnail =
          post.thumbnail && post.thumbnail.startsWith('http') ? post.thumbnail : null;
        await savedService.saveRedditPost(post.subreddit, post.id, {
          title: post.title,
          author: post.author,
          score: post.score,
          num_comments: post.num_comments,
          thumbnail,
          created_utc: post.created_utc ?? null,
        });
        return;
      }
      await savedService.unsaveRedditPost(post.subreddit, post.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: savedRedditPostsKey });
    },
    onError: (saveError) => {
      alert(`Failed to update save status: ${saveError.message}`);
    },
  });

  const hideRedditPostMutation = useMutation<void, Error, FeedRedditPost>({
    mutationFn: async (post) => {
      await savedService.hideRedditPost(post.subreddit, post.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hidden-items', 'reddit_posts'] });
    },
    onError: (hideError) => {
      alert(`Failed to hide post: ${hideError.message}`);
    },
  });

  useEffect(() => {
    if (routeSubreddit && routeSubreddit !== subreddit) {
      setSubreddit(routeSubreddit);
    } else if (!routeSubreddit && subreddit !== 'popular') {
      setSubreddit('popular');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeSubreddit]);

  const navigateToSubreddit = (value: string) => {
    const normalized = value.trim() || 'popular';
    setSubreddit(normalized);
    navigate(`/reddit/r/${normalized}`);
  };

  const handleSubredditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim()) {
      navigateToSubreddit(inputValue.trim());
      setInputValue('');
    }
  };

  const handleShareRedditPost = (post: FeedRedditPost) => {
    const shareUrl = `${window.location.origin}/reddit/r/${post.subreddit}/comments/${post.id}`;
    navigator.clipboard
      .writeText(shareUrl)
      .then(() => alert('Post link copied to clipboard!'))
      .catch(() => alert('Unable to copy link. Please try again.'));
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
              onClick={() => navigateToSubreddit(sub)}
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

      {visiblePosts && (
        <div className="space-y-3">
          {visiblePosts.map((post) => {
            const postUrl = `/reddit/r/${post.subreddit}/comments/${post.id}`;
            const thumbnail =
              post.thumbnail && post.thumbnail.startsWith('http')
                ? post.thumbnail
                : null;
            const commentLabel = `${post.num_comments.toLocaleString()} Comments`;
            const isSaved = savedRedditPostIds.has(`${post.subreddit}-${post.id}`);
            const isSaveActionPending =
              toggleSaveRedditPostMutation.isPending &&
              toggleSaveRedditPostMutation.variables?.post.id === post.id;
            const pendingShouldSave = toggleSaveRedditPostMutation.variables?.shouldSave;

            return (
              <article
                key={post.id}
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]"
              >
                <div className="flex gap-3 p-3">
                  {thumbnail && (
                    <img
                      src={thumbnail}
                      alt=""
                      className="h-14 w-14 flex-shrink-0 rounded object-cover"
                    />
                  )}
                  <div className="flex-1 text-left">
                    <Link to={postUrl}>
                      <h3 className="text-base font-semibold text-[var(--color-text-primary)] hover:text-[var(--color-primary)]">
                        {post.title}
                      </h3>
                    </Link>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-[var(--color-text-secondary)]">
                      <Link
                        to={`/reddit/r/${post.subreddit}`}
                        className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                      >
                        r/{post.subreddit}
                      </Link>
                      <span>•</span>
                      <Link
                        to={`/reddit/user/${post.author}`}
                        className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                      >
                        u/{post.author}
                      </Link>
                      <span>•</span>
                      <span>{post.score.toLocaleString()} points</span>
                      <span>•</span>
                      <span>{new Date(post.created_utc * 1000).toLocaleDateString()}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-[var(--color-text-secondary)]">
                      <Link
                        to={postUrl}
                        className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                      >
                        {commentLabel}
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleShareRedditPost(post)}
                        className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                      >
                        Share
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          toggleSaveRedditPostMutation.mutate({
                            post,
                            shouldSave: !isSaved,
                          })
                        }
                        disabled={isSaveActionPending}
                        className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] disabled:opacity-50"
                      >
                        {isSaveActionPending
                          ? pendingShouldSave
                            ? 'Saving...'
                            : 'Unsaving...'
                          : isSaved
                          ? 'Unsave'
                          : 'Save'}
                      </button>
                      <button
                        type="button"
                        onClick={() => hideRedditPostMutation.mutate(post)}
                        disabled={
                          hideRedditPostMutation.isPending &&
                          hideRedditPostMutation.variables?.id === post.id
                        }
                        className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] disabled:opacity-50"
                      >
                        {hideRedditPostMutation.isPending &&
                        hideRedditPostMutation.variables?.id === post.id
                          ? 'Hiding...'
                          : 'Hide'}
                      </button>
                      <button
                        type="button"
                        onClick={() => navigate(postUrl)}
                        className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                      >
                        Crosspost
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {visiblePosts && visiblePosts.length === 0 && !isLoading && (
        <div className="text-center text-[var(--color-text-secondary)]">
          No posts found in r/{subreddit}
        </div>
      )}
    </div>
  );
}
