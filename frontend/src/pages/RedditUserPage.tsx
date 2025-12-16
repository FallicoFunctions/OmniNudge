import { useMemo, useState, useEffect } from 'react';
import { Link, useParams, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { redditService } from '../services/redditService';
import { savedService } from '../services/savedService';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { useRedditBlocklist } from '../contexts/RedditBlockContext';
import { MarkdownRenderer } from '../components/common/MarkdownRenderer';
import { RedditPostCard } from '../components/reddit/RedditPostCard';
import type {
  RedditApiPost,
  RedditUserAbout,
  RedditUserComment,
  RedditUserItem,
  RedditUserListingResponse,
  RedditUserTrophy,
  RedditModeratedSubreddit,
} from '../types/reddit';
import { formatTimestamp } from '../utils/timeFormat';

const TAB_OPTIONS = [
  { key: 'overview', label: 'Overview' },
  { key: 'comments', label: 'Comments' },
  { key: 'submitted', label: 'Submitted' },
] as const;

const SORT_OPTIONS = ['new', 'hot', 'top', 'controversial'] as const;

type TabKey = (typeof TAB_OPTIONS)[number]['key'];
type SortKey = (typeof SORT_OPTIONS)[number];

const formatAccountAge = (createdUtc?: number) => {
  if (!createdUtc) return '—';
  const diffMs = Date.now() - createdUtc * 1000;
  const years = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 365));
  if (years >= 1) return `${years} year${years === 1 ? '' : 's'}`;
  const months = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 30));
  if (months >= 1) return `${months} month${months === 1 ? '' : 's'}`;
  const days = Math.max(1, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  return `${days} day${days === 1 ? '' : 's'}`;
};

const formatNumber = (value?: number) => new Intl.NumberFormat('en-US').format(value ?? 0);

export default function RedditUserPage() {
  const { username } = useParams<{ username: string }>();
  const location = useLocation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { useRelativeTime } = useSettings();
  const { blockRedditUser, unblockRedditUser, isRedditUserBlocked } = useRedditBlocklist();
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const originState = useMemo(
    () => ({ originPath: `${location.pathname}${location.search}` }),
    [location.pathname, location.search]
  );
  const [activeSort, setActiveSort] = useState<SortKey>('new');
  const [currentAfter, setCurrentAfter] = useState<string | undefined>(undefined);
  const [pageHistory, setPageHistory] = useState<(string | undefined)[]>([undefined]);

  const isProfileBlocked = isRedditUserBlocked(username);

  const listingQuery = useQuery<RedditUserListingResponse>({
    queryKey: ['reddit-user-listing', username, activeTab, activeSort, currentAfter],
    queryFn: () => redditService.getUserListing(username!, activeTab, activeSort, 50, currentAfter),
    enabled: !!username,
    staleTime: 1000 * 60 * 5,
  });

  const { data: aboutData } = useQuery<RedditUserAbout>({
    queryKey: ['reddit-user-about', username],
    queryFn: () => redditService.getUserAbout(username!),
    enabled: !!username,
    staleTime: 1000 * 60 * 30,
  });

  const { data: trophiesData } = useQuery<RedditUserTrophy[]>({
    queryKey: ['reddit-user-trophies', username],
    queryFn: () => redditService.getUserTrophies(username!),
    enabled: !!username,
    staleTime: 1000 * 60 * 30,
  });

  const { data: moderatedData } = useQuery<RedditModeratedSubreddit[]>({
    queryKey: ['reddit-user-moderated', username],
    queryFn: () => redditService.getUserModerated(username!),
    enabled: !!username,
    staleTime: 1000 * 60 * 30,
  });

  const { data: hiddenPostsData } = useQuery({
    queryKey: ['hidden-items', 'reddit_posts'],
    queryFn: () => savedService.getHiddenItems('reddit_posts'),
    enabled: !!user,
    staleTime: 1000 * 60 * 5,
  });

  const hiddenPostIds = useMemo(
    () =>
      new Set(
        hiddenPostsData?.hidden_reddit_posts?.map(
          (post) => `${post.subreddit}-${post.reddit_post_id}`
        ) ?? []
      ),
    [hiddenPostsData]
  );

  const { data: savedRedditPostsData } = useQuery({
    queryKey: ['saved-items', 'reddit_posts'],
    queryFn: () => savedService.getSavedItems('reddit_posts'),
    enabled: !!user,
  });

  const savedRedditPostIds = useMemo(
    () =>
      new Set(
        savedRedditPostsData?.saved_reddit_posts?.map(
          (post) => `${post.subreddit}-${post.reddit_post_id}`
        ) ?? []
      ),
    [savedRedditPostsData]
  );

  const { data: savedRedditCommentsData } = useQuery({
    queryKey: ['saved-items', 'reddit_comments'],
    queryFn: () => savedService.getSavedItems('reddit_comments'),
    enabled: !!user,
  });

  const savedRedditCommentIds = useMemo(
    () =>
      new Set(
        savedRedditCommentsData?.saved_reddit_comments?.map(
          (comment) => `${comment.subreddit}-${comment.reddit_post_id}-${comment.id}`
        ) ?? []
      ),
    [savedRedditCommentsData]
  );

  const toggleSaveRedditPostMutation = useMutation<void, Error, { post: RedditApiPost; shouldSave: boolean }>({
    mutationFn: ({ post, shouldSave }) =>
      shouldSave
        ? savedService.saveRedditPost(post.subreddit, post.id, {
            title: post.title,
            author: post.author,
            score: post.score,
            num_comments: post.num_comments,
            thumbnail: post.thumbnail ?? null,
            created_utc: post.created_utc,
          })
        : savedService.unsaveRedditPost(post.subreddit, post.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-items', 'reddit_posts'] });
    },
    onError: (err: Error) => {
      alert(`Failed to update save status: ${err.message}`);
    },
  });

  const hideRedditPostMutation = useMutation<void, Error, RedditApiPost>({
    mutationFn: (post: RedditApiPost) => savedService.hideRedditPost(post.subreddit, post.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hidden-items', 'reddit_posts'] });
    },
    onError: (err: Error) => {
      alert(`Failed to hide post: ${err.message}`);
    },
  });

  const toggleSaveRedditCommentMutation = useMutation<void, Error, { comment: RedditUserComment; shouldSave: boolean }>({
    mutationFn: ({ comment, shouldSave }) => {
      const linkedPostId = comment.link_id?.replace('t3_', '') ?? '';
      // Note: The API expects a numeric ID, but we only have string IDs from Reddit
      // This may need backend adjustment to accept string IDs
      return shouldSave
        ? savedService.saveRedditComment(comment.subreddit, linkedPostId, parseInt(comment.id, 36))
        : savedService.unsaveRedditComment(comment.subreddit, linkedPostId, parseInt(comment.id, 36));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-items', 'reddit_comments'] });
    },
    onError: (err: Error) => {
      alert(`Failed to update comment save status: ${err.message}`);
    },
  });

  const handleShareRedditPost = (post: RedditApiPost) => {
    const shareUrl = `${window.location.origin}/r/${post.subreddit}/comments/${post.id}`;
    navigator.clipboard
      .writeText(shareUrl)
      .then(() => alert('Post link copied to clipboard!'))
      .catch(() => alert('Unable to copy link. Please try again.'));
  };

  const handleShareComment = (comment: RedditUserComment) => {
    const permalink = `https://reddit.com${comment.permalink}`;
    navigator.clipboard
      .writeText(permalink)
      .then(() => alert('Comment link copied to clipboard!'))
      .catch(() => alert('Unable to copy link. Please try again.'));
  };

  const listingItems: RedditUserItem[] = listingQuery.data?.items ?? [];

  const handleNextPage = () => {
    if (listingQuery.data?.after) {
      setPageHistory((prev) => [...prev, currentAfter]);
      setCurrentAfter(listingQuery.data.after);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handlePrevPage = () => {
    if (pageHistory.length > 1) {
      const newHistory = [...pageHistory];
      newHistory.pop();
      setPageHistory(newHistory);
      setCurrentAfter(newHistory[newHistory.length - 1]);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const resetPagination = () => {
    setCurrentAfter(undefined);
    setPageHistory([undefined]);
  };

  // Reset pagination when tab or sort changes
  useEffect(() => {
    resetPagination();
  }, [activeTab, activeSort]);

  const renderPostCard = (post: RedditApiPost) => {
    const postKey = `${post.subreddit}-${post.id}`;
    if (hiddenPostIds.has(postKey)) {
      return null;
    }

    if (isProfileBlocked) {
      return (
        <article
          key={`post-${post.id}`}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
        >
          <div className="text-sm italic text-[var(--color-text-muted)]">[BLOCKED]</div>
        </article>
      );
    }

    const isSaved = savedRedditPostIds.has(postKey);
    const isSaveActionPending = toggleSaveRedditPostMutation.isPending &&
      toggleSaveRedditPostMutation.variables?.post.id === post.id;
    const pendingShouldSave = toggleSaveRedditPostMutation.variables?.shouldSave ?? false;

    return (
      <RedditPostCard
        key={`post-${post.id}`}
        post={post}
        useRelativeTime={useRelativeTime}
        isSaved={isSaved}
        isSaveActionPending={isSaveActionPending}
        pendingShouldSave={pendingShouldSave}
        onShare={() => handleShareRedditPost(post)}
        onToggleSave={(shouldSave) => toggleSaveRedditPostMutation.mutate({ post, shouldSave })}
        onHide={() => hideRedditPostMutation.mutate(post)}
        linkState={originState}
      />
    );
  };

  const renderCommentCard = (comment: RedditUserComment) => {
    const linkedPostId = comment.link_id?.replace('t3_', '') ?? '';
    const localPermalink = linkedPostId
      ? `/r/${comment.subreddit}/comments/${linkedPostId}/${comment.id}`
      : `/r/${comment.subreddit}`;
    const fullCommentsLink = linkedPostId
      ? `/r/${comment.subreddit}/comments/${linkedPostId}`
      : `/r/${comment.subreddit}`;

    const commentKey = `${comment.subreddit}-${linkedPostId}-${comment.id}`;
    const isSaved = savedRedditCommentIds.has(commentKey);

    return (
      <article
        key={`comment-${comment.id}`}
        className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-left"
      >
        {isProfileBlocked ? (
          <div className="text-sm italic text-[var(--color-text-muted)]">[BLOCKED]</div>
        ) : (
          <>
            <div className="mb-1 text-left text-[11px] text-[var(--color-text-secondary)]">
              Commented on{' '}
              {comment.link_title ? (
                <Link
                  to={fullCommentsLink}
                  state={originState}
                  className="font-semibold hover:text-[var(--color-primary)]"
                >
                  {comment.link_title}
                </Link>
              ) : (
                <span className="font-semibold">r/{comment.subreddit}</span>
              )}
            </div>
            <MarkdownRenderer content={comment.body} className="text-left text-sm" />
            <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-[var(--color-text-secondary)]">
              <Link
                to={localPermalink}
                state={originState}
                className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
              >
                permalink
              </Link>
              <Link
                to={fullCommentsLink}
                state={originState}
                className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
              >
                context
              </Link>
              <Link
                to={fullCommentsLink}
                state={originState}
                className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
              >
                full comments {comment.link_num_comments != null ? `(${comment.link_num_comments})` : ''}
              </Link>
              <button
                type="button"
                onClick={() => handleShareComment(comment)}
                className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
              >
                share
              </button>
              <button
                type="button"
                onClick={() => toggleSaveRedditCommentMutation.mutate({ comment, shouldSave: !isSaved })}
                disabled={toggleSaveRedditCommentMutation.isPending}
                className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] disabled:opacity-60"
              >
                {toggleSaveRedditCommentMutation.isPending &&
                toggleSaveRedditCommentMutation.variables?.comment.id === comment.id
                  ? 'saving...'
                  : isSaved
                  ? 'unsave'
                  : 'save'}
              </button>
            </div>
            <div className="mt-1 text-[11px] text-[var(--color-text-secondary)]">
              <span>{comment.score.toLocaleString()} points</span>
              <span> • </span>
              <span>submitted {formatTimestamp(comment.created_utc, useRelativeTime)}</span>
            </div>
          </>
        )}
      </article>
    );
  };

  const handleBlockToggle = () => {
    if (!username) return;
    if (isProfileBlocked) {
      unblockRedditUser(username);
    } else {
      blockRedditUser(username);
    }
  };

  return (
    <div className="w-full px-4 py-8">
      <div className="mx-auto flex max-w-[1400px] gap-8">
        <div className="flex-1 space-y-4">
          <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--color-border)] p-4">
              <div className="flex items-center gap-4">
                <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">u/{username}</h1>
                <div className="flex gap-2 text-sm font-semibold uppercase">
                  {TAB_OPTIONS.map((tab) => (
                    <button
                      key={tab.key}
                      onClick={() => setActiveTab(tab.key)}
                      className={`${
                        activeTab === tab.key
                          ? 'text-[var(--color-primary)]'
                          : 'text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={handleBlockToggle}
                className={`rounded border px-3 py-1 text-sm font-medium ${
                  isProfileBlocked
                    ? 'border-red-400 text-red-500 hover:bg-red-50'
                    : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-primary)]'
                }`}
              >
                {isProfileBlocked ? 'Unblock user' : 'Block user'}
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] px-4 py-3 text-sm text-[var(--color-text-secondary)]">
              <span>Sorted by:</span>
              {SORT_OPTIONS.map((option) => (
                <button
                  key={option}
                  onClick={() => setActiveSort(option)}
                  className={`rounded px-2 py-1 ${
                    activeSort === option
                      ? 'bg-[var(--color-primary)] text-white'
                      : 'bg-[var(--color-surface-elevated)] text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]'
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
            <div className="space-y-3 px-4 py-4">
              {listingQuery.isLoading && (
                <div className="text-sm text-[var(--color-text-secondary)]">Loading activity…</div>
              )}
              {listingQuery.isError && (
                <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  Failed to load user activity.
                </div>
              )}
              {!listingQuery.isLoading && !listingQuery.isError && listingItems.length === 0 && (
                <div className="text-sm text-[var(--color-text-secondary)]">
                  No activity found for this tab.
                </div>
              )}
              {!listingQuery.isLoading && !listingQuery.isError && listingItems.length > 0 && (
                <>
                  <div className="space-y-3">
                    {listingItems.map((item) => {
                      if (item.kind === 'post' && item.post) {
                        return renderPostCard(item.post);
                      }
                      if (item.kind === 'comment' && item.comment) {
                        return renderCommentCard(item.comment);
                      }
                      return null;
                    })}
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t border-[var(--color-border)] pt-4">
                    <button
                      type="button"
                      onClick={handlePrevPage}
                      disabled={pageHistory.length <= 1 || listingQuery.isFetching}
                      className="rounded bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      ← Previous
                    </button>
                    <span className="text-sm text-[var(--color-text-secondary)]">
                      Page {pageHistory.length}
                    </span>
                    <button
                      type="button"
                      onClick={handleNextPage}
                      disabled={!listingQuery.data?.after || listingQuery.isFetching}
                      className="rounded bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Next →
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <aside className="w-80 shrink-0 space-y-4">
          <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <div className="text-lg font-semibold text-[var(--color-text-primary)]">User Details</div>
            <div className="mt-3 space-y-2 text-sm text-[var(--color-text-secondary)]">
              <div className="flex justify-between">
                <span>Post karma</span>
                <span className="font-semibold text-[var(--color-text-primary)]">
                  {formatNumber(aboutData?.link_karma)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Comment karma</span>
                <span className="font-semibold text-[var(--color-text-primary)]">
                  {formatNumber(aboutData?.comment_karma)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Reddit age</span>
                <span className="font-semibold text-[var(--color-text-primary)]">
                  {formatAccountAge(aboutData?.created_utc)}
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <div className="text-lg font-semibold text-[var(--color-text-primary)]">Moderator of</div>
            {moderatedData && moderatedData.length > 0 ? (
              <ul className="mt-3 space-y-2 text-sm text-[var(--color-text-secondary)]">
                {moderatedData.map((sub) => (
                  <li key={sub.name}>
                    <Link
                      to={`/r/${sub.name}`}
                      className="font-semibold text-[var(--color-primary)] hover:underline"
                    >
                      r/{sub.name}
                    </Link>
                    {sub.title && <span className="ml-1">— {sub.title}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-[var(--color-text-muted)]">No moderator roles listed.</p>
            )}
          </div>

          <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <div className="text-lg font-semibold text-[var(--color-text-primary)]">Trophy Case</div>
            {trophiesData && trophiesData.length > 0 ? (
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-[var(--color-text-secondary)]">
                {trophiesData.map((trophy) => (
                  <div key={trophy.name} className="flex items-center gap-2">
                    {trophy.icon_url ? (
                      <img src={trophy.icon_url} alt={trophy.name} className="h-10 w-10 rounded" />
                    ) : (
                      <div className="h-10 w-10 rounded bg-[var(--color-border)]" />
                    )}
                    <div>
                      <div className="font-semibold text-[var(--color-text-primary)]">{trophy.name}</div>
                      {trophy.description && <div>{trophy.description}</div>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-[var(--color-text-muted)]">No trophies displayed.</p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
