import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { redditService } from '../services/redditService';
import { savedService } from '../services/savedService';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { formatTimestamp } from '../utils/timeFormat';

interface RedditUserPost {
  id: string;
  title: string;
  author: string;
  subreddit: string;
  score: number;
  num_comments: number;
  created_utc: number;
  thumbnail?: string;
  selftext?: string;
  is_self: boolean;
}

interface RedditUserPostsResponse {
  posts: RedditUserPost[];
}

export default function RedditUserPage() {
  const { username } = useParams<{ username: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { useRelativeTime } = useSettings();
  const [hideTargetPost, setHideTargetPost] = useState<RedditUserPost | null>(null);

  const { data, isLoading, error } = useQuery<RedditUserPostsResponse>({
    queryKey: ['reddit-user', username],
    queryFn: () => redditService.searchPosts(`author:${username}`),
    enabled: !!username,
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
    { post: RedditUserPost; shouldSave: boolean }
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

  const hideRedditPostMutation = useMutation<void, Error, RedditUserPost>({
    mutationFn: async (post) => {
      await savedService.hideRedditPost(post.subreddit, post.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hidden-items', 'reddit_posts'] });
      setHideTargetPost(null);
    },
    onError: (hideError) => {
      alert(`Failed to hide post: ${hideError.message}`);
    },
  });

  const handleShareRedditPost = (post: RedditUserPost) => {
    const shareUrl = `${window.location.origin}/reddit/r/${post.subreddit}/comments/${post.id}`;
    navigator.clipboard
      .writeText(shareUrl)
      .then(() => alert('Post link copied to clipboard!'))
      .catch(() => alert('Unable to copy link. Please try again.'));
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">u/{username}</h1>
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
            Recent posts shared by this Reddit user.
          </p>
        </div>
        <button
          onClick={() => navigate(-1)}
          className="rounded-md border border-[var(--color-border)] px-3 py-1 text-sm text-[var(--color-text-primary)] hover:border-[var(--color-primary)]"
        >
          Go back
        </button>
      </div>

      {isLoading && (
        <div className="text-center text-[var(--color-text-secondary)]">Loading posts...</div>
      )}

      {error && (
        <div className="rounded-md bg-red-50 p-4 text-sm text-red-800 dark:bg-red-900/20 dark:text-red-400">
          Failed to load user activity: {error instanceof Error ? error.message : 'Unknown error'}
        </div>
      )}

      {!isLoading && !error && visiblePosts && visiblePosts.length === 0 && (
        <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm text-[var(--color-text-secondary)]">
          No posts found for this user.
        </div>
      )}

      {visiblePosts && visiblePosts.length > 0 && (
        <div className="space-y-3">
          {visiblePosts.map((post) => {
            const postUrl = `/reddit/r/${post.subreddit}/comments/${post.id}`;
            const thumbnail =
              post.thumbnail && post.thumbnail.startsWith('http') ? post.thumbnail : null;
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
                      <span>{post.score.toLocaleString()} points</span>
                      <span>•</span>
                      <span>submitted {formatTimestamp(post.created_utc, useRelativeTime)}</span>
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
                        onClick={() => setHideTargetPost(post)}
                        className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                      >
                        Hide
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

      {hideTargetPost && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-lg">
            <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">Hide this post?</h3>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              Are you sure? Hidden posts can be found at{' '}
              <Link to="/hidden" className="text-[var(--color-primary)] hover:underline">
                your hidden posts page
              </Link>.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setHideTargetPost(null)}
                className="rounded border border-[var(--color-border)] px-3 py-1 text-sm hover:bg-[var(--color-surface-elevated)]"
              >
                Cancel
              </button>
              <button
                onClick={() => hideTargetPost && hideRedditPostMutation.mutate(hideTargetPost)}
                disabled={hideRedditPostMutation.isPending}
                className="rounded bg-[var(--color-primary)] px-3 py-1 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)] disabled:opacity-50"
              >
                {hideRedditPostMutation.isPending ? 'Hiding...' : 'Hide Post'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
