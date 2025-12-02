import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { redditService } from '../services/redditService';

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

  const { data, isLoading, error } = useQuery<RedditUserPostsResponse>({
    queryKey: ['reddit-user', username],
    queryFn: () => redditService.searchPosts(`author:${username}`),
    enabled: !!username,
  });

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

      {!isLoading && !error && data?.posts && data.posts.length === 0 && (
        <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm text-[var(--color-text-secondary)]">
          No posts found for this user.
        </div>
      )}

      {data?.posts && data.posts.length > 0 && (
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
                {post.thumbnail && post.thumbnail !== 'self' && post.thumbnail !== 'default' && (
                  <img
                    src={post.thumbnail}
                    alt=""
                    className="h-20 w-20 flex-shrink-0 rounded object-cover"
                  />
                )}
                <div className="flex-1">
                  <h2 className="text-lg font-semibold text-[var(--color-text-primary)] hover:text-[var(--color-primary)]">
                    {post.title}
                  </h2>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-[var(--color-text-secondary)]">
                    <span>r/{post.subreddit}</span>
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
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
