import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { usersService } from '../services/usersService';
import { useSettings } from '../contexts/SettingsContext';
import { useAuth } from '../contexts/AuthContext';
import { formatTimestamp } from '../utils/timeFormat';
import { resolveMediaUrl } from '../utils/mediaUrl';
import type { PlatformPost, PostComment } from '../types/posts';
import type { UserProfile } from '../types/users';
import { MarkdownRenderer } from '../components/common/MarkdownRenderer';
import { PostBodyMarkdown } from '../components/posts/PostBodyMarkdown';
import SavedItemsView from '../components/saved/SavedItemsView';
import HiddenItemsView from '../components/saved/HiddenItemsView';
import SubscribedView from '../components/subscriptions/SubscribedView';
import { getPostUrl } from '../utils/postUrl';
import { Panel } from '../components/common/Panel';
import { ErrorMessage } from '../components/common/StatusMessage';
import { Skeleton } from '../components/common/LoadingStates';

const BASE_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'posts', label: 'Posts' },
  { key: 'comments', label: 'Comments' },
] as const;

const PRIVATE_TABS = [
  { key: 'saved', label: 'Saved' },
  { key: 'hidden', label: 'Hidden' },
  { key: 'subscribed', label: 'Subscribed' },
] as const;

type TabKey = (typeof BASE_TABS)[number]['key'] | (typeof PRIVATE_TABS)[number]['key'];

interface PostNavigationState {
  originPath: string;
}

function formatPoints(count: number): string {
  return `${count.toLocaleString()} ${count === 1 ? 'point' : 'points'}`;
}

function PostsSection({
  posts,
  useRelativeTime,
  linkState,
}: {
  posts: PlatformPost[];
  useRelativeTime: boolean;
  linkState: PostNavigationState;
}) {
  if (!posts.length) {
    return <p className="text-sm text-[var(--color-text-secondary)]">No posts yet.</p>;
  }

  return (
    <div className="space-y-3">
      {posts.map((post) => (
        <article
          key={post.id}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]"
        >
          <div className="flex gap-3 p-4">
            {/* REDDIT-2: Show thumbnails consistently with standard size */}
            {post.thumbnail_url && (
              <img
                src={resolveMediaUrl(post.thumbnail_url)}
                alt={`Preview image for ${post.title}`}
                className="h-24 w-24 flex-shrink-0 rounded-lg object-cover"
              />
            )}
            <div className="flex-1">
              <div className="text-xs text-[var(--color-text-secondary)]">
                <Link
                  to={`/h/${post.hub_name}`}
                  state={linkState}
                  className="font-semibold text-[var(--color-text-primary)] hover:text-[var(--color-primary)]"
                >
                  h/{post.hub_name}
                </Link>
                <span> · </span>
                <span>{formatPoints(post.score)}</span>
                <span> · </span>
                <span>posted {formatTimestamp(post.created_at, useRelativeTime)}</span>
              </div>
              <Link to={getPostUrl(post)} state={linkState}>
                <h3 className="mt-1 text-lg font-semibold text-[var(--color-text-primary)] hover:text-[var(--color-primary)]">
                  {post.title}
                </h3>
              </Link>
              {post.body && (
                <PostBodyMarkdown content={post.body} className="mt-2 text-[var(--color-text-secondary)]" />
              )}
              <div className="mt-2 text-xs font-medium text-[var(--color-text-secondary)]">
                {(post.comment_count ?? post.num_comments ?? 0).toLocaleString()} Comments
              </div>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function CommentsSection({
  comments,
  useRelativeTime,
  linkState,
}: {
  comments: PostComment[];
  useRelativeTime: boolean;
  linkState: PostNavigationState;
}) {
  if (!comments.length) {
    return <p className="text-sm text-[var(--color-text-secondary)]">No comments yet.</p>;
  }

  return (
    <div className="space-y-3">
      {comments.map((comment) => (
        <article
          key={comment.id}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]"
        >
          <div className="p-4">
            <div className="mb-2 text-xs text-[var(--color-text-secondary)]">
              <span>On </span>
              <Link
                to={`/posts/${comment.post_id}`}
                state={linkState}
                className="font-medium text-[var(--color-text-primary)] hover:text-[var(--color-primary)]"
              >
                post #{comment.post_id}
              </Link>
              <span> · </span>
              <span>{formatPoints(comment.score)}</span>
              <span> · </span>
              <span>{formatTimestamp(comment.created_at, useRelativeTime)}</span>
            </div>
            <MarkdownRenderer content={comment.content} className="text-[var(--color-text-primary)]" />

            {/* Prominent "View thread" link */}
            <div className="mt-3 pt-3 border-t border-[var(--color-border)]">
              <Link
                to={`/posts/${comment.post_id}`}
                state={linkState}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-dark)] hover:underline transition"
              >
                View thread
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </Link>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

export default function UserProfilePage() {
  const location = useLocation();
  const { username } = useParams<{ username: string }>();
  const { user } = useAuth();
  const { useRelativeTime } = useSettings();
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const canViewPrivateTabs = user?.username === username;
  const originState = useMemo(
    () => ({ originPath: `${location.pathname}${location.search}` }),
    [location.pathname, location.search]
  );

  const visibleTabs = useMemo(() => {
    if (canViewPrivateTabs) {
      return [...BASE_TABS, ...PRIVATE_TABS];
    }
    return BASE_TABS;
  }, [canViewPrivateTabs]);
  const resolvedActiveTab =
    !canViewPrivateTabs && (activeTab === 'saved' || activeTab === 'hidden' || activeTab === 'subscribed')
      ? 'overview'
      : activeTab;

  const profileQuery = useQuery<UserProfile>({
    queryKey: ['user-profile', username],
    queryFn: () => usersService.getProfile(username!),
    enabled: !!username,
  });
  const { refetch: refetchProfile } = profileQuery;

  const postsQuery = useQuery({
    queryKey: ['user-profile-posts', username],
    queryFn: () => usersService.getPosts(username!),
    enabled: !!username,
    staleTime: 1000 * 60 * 5,
  });

  const commentsQuery = useQuery({
    queryKey: ['user-profile-comments', username],
    queryFn: () => usersService.getComments(username!),
    enabled: !!username,
    staleTime: 1000 * 60 * 5,
  });

  const profile = profileQuery.data;
  const posts = useMemo(() => postsQuery.data?.posts ?? [], [postsQuery.data?.posts]);
  const comments = useMemo(
    () => commentsQuery.data?.comments ?? [],
    [commentsQuery.data?.comments]
  );
  const canMessageUser = user && profile && user.username !== profile.username;

  useEffect(() => {
    if (!user || !username || user.username !== username) {
      return;
    }
    let isActive = true;
    usersService
      .ping()
      .then(() => {
        if (isActive) {
          refetchProfile();
        }
      })
      .catch(() => {
        // Ignore ping failures for profile view
      });
    return () => {
      isActive = false;
    };
  }, [user, username, refetchProfile]);

  const createdLabel = profile ? formatTimestamp(profile.created_at, useRelativeTime) : '';
  const lastSeenLabel = profile ? formatTimestamp(profile.last_seen, useRelativeTime) : '';

  const renderActiveTab = () => {
    if (resolvedActiveTab === 'posts') {
      return <PostsSection posts={posts} useRelativeTime={useRelativeTime} linkState={originState} />;
    }

    if (resolvedActiveTab === 'comments') {
      return (
        <CommentsSection
          comments={comments}
          useRelativeTime={useRelativeTime}
          linkState={originState}
        />
      );
    }

    if (resolvedActiveTab === 'saved') {
      if (!canViewPrivateTabs) {
        return <p className="text-sm text-[var(--color-text-secondary)]">Saved items are private.</p>;
      }
      return (
        <SavedItemsView withContainer={false} showHeading={false} className="space-y-6" />
      );
    }

    if (resolvedActiveTab === 'hidden') {
      if (!canViewPrivateTabs) {
        return <p className="text-sm text-[var(--color-text-secondary)]">Hidden items are private.</p>;
      }
      return (
        <HiddenItemsView withContainer={false} showHeading={false} className="space-y-6" />
      );
    }

    if (resolvedActiveTab === 'subscribed') {
      if (!canViewPrivateTabs) {
        return <p className="text-sm text-[var(--color-text-secondary)]">Subscriptions are private.</p>;
      }
      return (
        <SubscribedView withContainer={false} showHeading={false} className="space-y-6" />
      );
    }

    return (
      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">Recent Posts</h3>
            {posts.length > 0 && (
              <button
                type="button"
                onClick={() => setActiveTab('posts')}
                className="flex items-center gap-1 text-sm font-medium text-[var(--color-primary)] hover:underline transition"
              >
                View all
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}
          </div>
          <PostsSection
            posts={posts.slice(0, 5)}
            useRelativeTime={useRelativeTime}
            linkState={originState}
          />
        </section>
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
              Recent Comments
            </h3>
            {comments.length > 0 && (
              <button
                type="button"
                onClick={() => setActiveTab('comments')}
                className="flex items-center gap-1 text-sm font-medium text-[var(--color-primary)] hover:underline transition"
              >
                View all
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}
          </div>
          <CommentsSection
            comments={comments.slice(0, 5)}
            useRelativeTime={useRelativeTime}
            linkState={originState}
          />
        </section>
      </div>
    );
  };

  if (profileQuery.isLoading) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-8">
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
          <div className="flex items-start gap-6">
            {/* Avatar skeleton */}
            <Skeleton variant="circular" width="80px" height="80px" />

            {/* Profile info skeleton */}
            <div className="flex-1 space-y-3">
              <Skeleton variant="text" width="200px" height="28px" />
              <Skeleton variant="text" width="150px" height="16px" />
              <div className="flex gap-4 mt-4">
                <Skeleton variant="text" width="100px" height="14px" />
                <Skeleton variant="text" width="100px" height="14px" />
              </div>
            </div>
          </div>

          {/* Tabs skeleton */}
          <div className="mt-6 border-t border-[var(--color-border)] pt-4">
            <div className="flex gap-4 mb-4">
              <Skeleton variant="text" width="80px" height="20px" />
              <Skeleton variant="text" width="80px" height="20px" />
              <Skeleton variant="text" width="80px" height="20px" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (profileQuery.isError || !profile) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-8">
        <ErrorMessage>Unable to load user profile.</ErrorMessage>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <Panel>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            {profile.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={`Avatar for ${profile.username}`}
                className="h-16 w-16 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-border)] text-2xl font-semibold text-[var(--color-text-secondary)]">
                {profile.username.charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">
                {profile.username}
              </h1>
              <p className="text-sm text-[var(--color-text-secondary)]">Joined {createdLabel}</p>
              <p className="text-xs text-[var(--color-text-secondary)]">
                Last seen {lastSeenLabel}
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2 text-sm text-[var(--color-text-secondary)] md:items-end md:text-right">
            <div>
              <span className="font-semibold text-[var(--color-text-primary)]">
                {profile.karma.toLocaleString()}
              </span>{' '}
              karma
            </div>
            {canMessageUser && (
              <Link
                to={`/messages?to=${encodeURIComponent(profile.username)}`}
                className="inline-flex items-center justify-center rounded-md border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-text-primary)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
              >
                Message
              </Link>
            )}
          </div>
        </div>
        {profile.bio && (
          <div className="mt-4 rounded-md bg-[var(--color-surface-elevated)] p-4 text-sm text-[var(--color-text-primary)]">
            <MarkdownRenderer content={profile.bio} className="text-[var(--color-text-primary)]" />
          </div>
        )}
      </Panel>

      {profile.moderated_hubs && profile.moderated_hubs.length > 0 && (
        <div className="mt-6 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
            Moderator of
          </h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {profile.moderated_hubs.map((hub) => (
              <Link
                key={hub.id}
                to={`/h/${hub.name}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] px-4 py-1.5 text-sm font-medium text-[var(--color-text-primary)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition"
              >
                <span className="font-semibold">h/{hub.name}</span>
                {hub.title && (
                  <>
                    <span className="text-[var(--color-text-muted)]">·</span>
                    <span className="max-w-[200px] truncate text-xs font-normal text-[var(--color-text-secondary)]">
                      {hub.title}
                    </span>
                  </>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 border-b border-[var(--color-border)]">
        <div className="-mb-px flex gap-4">
          {visibleTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`border-b-2 px-4 py-2 text-sm font-semibold ${
                resolvedActiveTab === tab.key
                  ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                  : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6">{renderActiveTab()}</div>

    </div>
  );
}
