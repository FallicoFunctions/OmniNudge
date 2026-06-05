import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trans, useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { usersService } from '../services/usersService';
import { useSettings } from '../contexts/SettingsContext';
import { useAuth } from '../contexts/AuthContext';
import { resolveMediaUrl } from '../utils/mediaUrl';
import type { PlatformPost, PostComment } from '../types/posts';
import type { UserProfile } from '../types/users';
import { MarkdownRenderer } from '../components/common/MarkdownRenderer';
import { PostBodyMarkdown } from '../components/posts/PostBodyMarkdown';
import SavedItemsView from '../components/saved/SavedItemsView';
import HiddenItemsView from '../components/saved/HiddenItemsView';
import SubscribedView from '../components/subscriptions/SubscribedView';
import { getPostUrl } from '../utils/postUrl';
import { ErrorMessage } from '../components/common/StatusMessage';
import { Skeleton } from '../components/common/LoadingStates';
import { useFormat } from '../hooks/useFormat';
import EditProfileModal from '../components/profile/EditProfileModal';
import TopFriendsSection from '../components/profile/TopFriendsSection';
import { friendsService, friendsQueryKeys } from '../services/friendsService';
import type { FriendshipStatus } from '../types/friends';
import { useToast } from '../hooks/useToast';

const BASE_TABS = [
  { key: 'overview', labelKey: 'userProfilePage.tabs.overview' },
  { key: 'posts', labelKey: 'userProfilePage.tabs.posts' },
  { key: 'comments', labelKey: 'userProfilePage.tabs.comments' },
] as const;

const PRIVATE_TABS = [
  { key: 'saved', labelKey: 'userProfilePage.tabs.saved' },
  { key: 'hidden', labelKey: 'userProfilePage.tabs.hidden' },
  { key: 'subscribed', labelKey: 'userProfilePage.tabs.subscribed' },
] as const;

type TabKey = (typeof BASE_TABS)[number]['key'] | (typeof PRIVATE_TABS)[number]['key'];

interface PostNavigationState {
  originPath: string;
}

function PostsSection({
  posts,
  useRelativeTime,
  linkState,
  t,
  formatNumber,
  formatTimestampLabel,
}: {
  posts: PlatformPost[];
  useRelativeTime: boolean;
  linkState: PostNavigationState;
  t: TFunction;
  formatNumber: (value: number) => string;
  formatTimestampLabel: (timestamp: string | number | Date, useRelativeTime: boolean) => string;
}) {
  if (!posts.length) {
    return (
      <p className="text-sm text-[var(--color-text-secondary)]">
        {t('userProfilePage.posts.empty')}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {posts.map((post) => (
        <article
          key={post.id}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]"
        >
          <div className="flex gap-3 p-4">
            {post.thumbnail_url && (
              <img
                src={resolveMediaUrl(post.thumbnail_url)}
                alt={t('posts.media.previewImageAlt', { title: post.title })}
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
                  {t('common.format.hubPath', { name: post.hub_name })}
                </Link>
                <span> · </span>
                <span>
                  {t('posts.point', {
                    count: post.score,
                    formattedCount: formatNumber(post.score),
                  })}
                </span>
                <span> · </span>
                <span>
                  {t('posts.submittedAt', {
                    time: formatTimestampLabel(post.created_at, useRelativeTime),
                  })}
                </span>
              </div>
              <Link to={getPostUrl(post)} state={linkState}>
                <h3 className="mt-1 text-base font-semibold text-[var(--color-text-primary)] hover:text-[var(--color-primary)]">
                  {post.title}
                </h3>
              </Link>
              {post.body && (
                <PostBodyMarkdown
                  content={post.body}
                  className="mt-1 text-sm text-[var(--color-text-secondary)]"
                />
              )}
              <div className="mt-1.5 text-xs font-medium text-[var(--color-text-secondary)]">
                {t('posts.comment', {
                  count: post.comment_count ?? post.num_comments ?? 0,
                  formattedCount: formatNumber(post.comment_count ?? post.num_comments ?? 0),
                })}
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
  t,
  formatNumber,
  formatTimestampLabel,
}: {
  comments: PostComment[];
  useRelativeTime: boolean;
  linkState: PostNavigationState;
  t: TFunction;
  formatNumber: (value: number) => string;
  formatTimestampLabel: (timestamp: string | number | Date, useRelativeTime: boolean) => string;
}) {
  if (!comments.length) {
    return <p className="text-sm text-[var(--color-text-secondary)]">{t('comments.noComments')}</p>;
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
              <Trans
                i18nKey="userProfilePage.comments.onPost"
                values={{ id: comment.post_id }}
                components={{
                  link: (
                    <Link
                      to={`/posts/${comment.post_id}`}
                      state={linkState}
                      className="font-medium text-[var(--color-text-primary)] hover:text-[var(--color-primary)]"
                    />
                  ),
                }}
              />
              <span> · </span>
              <span>
                {t('posts.point', {
                  count: comment.score,
                  formattedCount: formatNumber(comment.score),
                })}
              </span>
              <span> · </span>
              <span>{formatTimestampLabel(comment.created_at, useRelativeTime)}</span>
            </div>
            <MarkdownRenderer
              content={comment.content}
              className="text-sm text-[var(--color-text-primary)]"
            />
            <div className="mt-3 pt-3 border-t border-[var(--color-border)]">
              <Link
                to={`/posts/${comment.post_id}`}
                state={linkState}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-dark)] hover:underline transition"
              >
                {t('userProfilePage.actions.viewThread')}
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

function checkOnline(lastSeen?: string | null): boolean {
  if (!lastSeen) return false;
  return Date.now() - new Date(lastSeen).getTime() < 5 * 60 * 1000;
}

function OnlineDot({ lastSeen }: { lastSeen?: string | null }) {
  const [isOnline, setIsOnline] = useState(() => checkOnline(lastSeen));

  useEffect(() => {
    setIsOnline(checkOnline(lastSeen));
    // Re-check every 30 s so the dot flips to offline without a page reload.
    const id = setInterval(() => setIsOnline(checkOnline(lastSeen)), 30_000);
    return () => clearInterval(id);
  }, [lastSeen]);

  return (
    <span
      title={isOnline ? 'Online' : 'Offline'}
      className={`inline-block w-2.5 h-2.5 rounded-full border-2 border-[var(--color-surface)] flex-shrink-0 ${
        isOnline ? 'bg-green-500' : 'bg-[var(--color-text-muted)]'
      }`}
    />
  );
}

export default function UserProfilePage() {
  const { t } = useTranslation();
  const { formatNumber, formatDate, formatRelativeTime } = useFormat();
  const location = useLocation();
  const { username } = useParams<{ username: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { useRelativeTime } = useSettings();
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const canViewPrivateTabs = user?.username === username;
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const { toast } = useToast();
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
    !canViewPrivateTabs &&
    (activeTab === 'saved' || activeTab === 'hidden' || activeTab === 'subscribed')
      ? 'overview'
      : activeTab;

  const formatTimestampLabel = useCallback(
    (timestamp: string | number | Date, useRelativeTimeEnabled: boolean) => {
      const d = new Date(timestamp);
      if (Number.isNaN(d.getTime())) return t('common.time.recently');
      if (useRelativeTimeEnabled) return formatRelativeTime(d);
      return formatDate(d, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
    },
    [t, formatRelativeTime, formatDate]
  );

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

  const blockedUsersQuery = useQuery({
    queryKey: ['blocked-users'],
    queryFn: () => usersService.getBlockedUsers(),
    enabled: Boolean(user && profile && user.username !== profile.username),
    staleTime: 1000 * 30,
  });
  const isBlocked = Boolean(
    profile &&
      blockedUsersQuery.data?.blocked_users?.some(
        (bu) => bu.username.toLowerCase() === profile.username.toLowerCase()
      )
  );

  const blockMutation = useMutation({
    mutationFn: async () => { if (profile) await usersService.blockUser(profile.username); },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['blocked-users'] }),
  });

  const unblockMutation = useMutation({
    mutationFn: async () => { if (profile) await usersService.unblockUser(profile.username); },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['blocked-users'] }),
  });

  const friendshipStatusQuery = useQuery({
    queryKey: friendsQueryKeys.status(username ?? ''),
    queryFn: () => friendsService.getFriendshipStatus(username ?? ''),
    enabled: Boolean(user && username && user.username !== username),
    refetchOnMount: 'always',
    staleTime: 60_000,
    retry: 1,
  });

  const friendshipStatus: FriendshipStatus = friendshipStatusQuery.data ?? 'none';
  const friendActionDisabled = friendshipStatusQuery.isFetching || friendshipStatusQuery.isLoading;

  const setFriendStatus = (status: FriendshipStatus) => {
    queryClient.setQueryData(friendsQueryKeys.status(username ?? ''), status);
  };

  const friendRequestMutation = useMutation({
    mutationFn: () => friendsService.sendFriendRequest(profile!.username),
    onSuccess: (data) => {
      toast.success(data.message);
      setFriendStatus(data.result === 'accepted' ? 'accepted' : 'pending_outgoing');
      queryClient.invalidateQueries({ queryKey: friendsQueryKeys.requests });
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: friendsQueryKeys.status(username ?? '') });
      toast.error(t('friends.errors.sendFailed'));
    },
  });

  const acceptFriendMutation = useMutation({
    mutationFn: () => friendsService.acceptFriendRequest(profile!.username),
    onSuccess: () => {
      toast.success(t('friends.toast.accepted'));
      setFriendStatus('accepted');
      queryClient.invalidateQueries({ queryKey: friendsQueryKeys.friends });
      queryClient.invalidateQueries({ queryKey: friendsQueryKeys.requests });
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: friendsQueryKeys.status(username ?? '') });
      toast.error(t('friends.errors.acceptFailed'));
    },
  });

  const cancelOrDeclineFriendMutation = useMutation({
    mutationFn: () => friendsService.declineOrCancelFriendRequest(profile!.username),
    onSuccess: () => {
      setFriendStatus('none');
      queryClient.invalidateQueries({ queryKey: friendsQueryKeys.requests });
      queryClient.invalidateQueries({ queryKey: friendsQueryKeys.status(username ?? '') });
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: friendsQueryKeys.status(username ?? '') });
      toast.error(t('friends.errors.cancelFailed'));
    },
  });

  const removeFriendMutation = useMutation({
    mutationFn: () => friendsService.removeFriend(profile!.username),
    onSuccess: () => {
      toast.success(t('friends.toast.removed'));
      setFriendStatus('none');
      queryClient.invalidateQueries({ queryKey: friendsQueryKeys.friends });
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: friendsQueryKeys.status(username ?? '') });
      toast.error(t('friends.errors.removeFailed'));
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (payload: {
      bio?: string | null;
      avatar_url?: string | null;
      status_text?: string | null;
      banner_url?: string | null;
    }) => usersService.updateProfile(payload),
    onSuccess: async () => {
      await refetchProfile();
      setIsEditProfileOpen(false);
    },
    onError: (error) => {
      alert(
        t('userProfilePage.edit.errors.saveFailed', {
          message: error instanceof Error ? error.message : t('common.error'),
        })
      );
    },
  });

  useEffect(() => {
    if (!user || !username || user.username !== username) return;
    let isActive = true;
    usersService.ping().then(() => { if (isActive) refetchProfile(); }).catch(() => {});
    return () => { isActive = false; };
  }, [user, username, refetchProfile]);

  const renderTabContent = () => {
    if (resolvedActiveTab === 'posts') {
      return (
        <PostsSection
          posts={posts}
          useRelativeTime={useRelativeTime}
          linkState={originState}
          t={t}
          formatNumber={formatNumber}
          formatTimestampLabel={formatTimestampLabel}
        />
      );
    }
    if (resolvedActiveTab === 'comments') {
      return (
        <CommentsSection
          comments={comments}
          useRelativeTime={useRelativeTime}
          linkState={originState}
          t={t}
          formatNumber={formatNumber}
          formatTimestampLabel={formatTimestampLabel}
        />
      );
    }
    if (resolvedActiveTab === 'saved') {
      if (!canViewPrivateTabs) return <p className="text-sm text-[var(--color-text-secondary)]">{t('userProfilePage.private.saved')}</p>;
      return <SavedItemsView withContainer={false} showHeading={false} className="space-y-4" />;
    }
    if (resolvedActiveTab === 'hidden') {
      if (!canViewPrivateTabs) return <p className="text-sm text-[var(--color-text-secondary)]">{t('userProfilePage.private.hidden')}</p>;
      return <HiddenItemsView withContainer={false} showHeading={false} className="space-y-4" />;
    }
    if (resolvedActiveTab === 'subscribed') {
      if (!canViewPrivateTabs) return <p className="text-sm text-[var(--color-text-secondary)]">{t('userProfilePage.private.subscribed')}</p>;
      return <SubscribedView withContainer={false} showHeading={false} className="space-y-4" />;
    }

    // Overview
    return (
      <div className="space-y-6">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
              {t('userProfilePage.headings.recentPosts')}
            </h3>
            {posts.length > 0 && (
              <button
                type="button"
                onClick={() => setActiveTab('posts')}
                className="text-xs font-medium text-[var(--color-primary)] hover:underline"
              >
                {t('userProfilePage.actions.viewAll')} →
              </button>
            )}
          </div>
          <PostsSection
            posts={posts.slice(0, 5)}
            useRelativeTime={useRelativeTime}
            linkState={originState}
            t={t}
            formatNumber={formatNumber}
            formatTimestampLabel={formatTimestampLabel}
          />
        </section>
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
              {t('userProfilePage.headings.recentComments')}
            </h3>
            {comments.length > 0 && (
              <button
                type="button"
                onClick={() => setActiveTab('comments')}
                className="text-xs font-medium text-[var(--color-primary)] hover:underline"
              >
                {t('userProfilePage.actions.viewAll')} →
              </button>
            )}
          </div>
          <CommentsSection
            comments={comments.slice(0, 5)}
            useRelativeTime={useRelativeTime}
            linkState={originState}
            t={t}
            formatNumber={formatNumber}
            formatTimestampLabel={formatTimestampLabel}
          />
        </section>
      </div>
    );
  };

  // ─── Loading skeleton ───────────────────────────────────────────────────────
  if (profileQuery.isLoading) {
    return (
      <div className="w-full">
        <div className="h-40 md:h-52 bg-[var(--color-surface-elevated)] animate-pulse" />
        <div className="bg-[var(--color-surface)] border-b border-[var(--color-border)] px-4 py-4">
          <div className="max-w-6xl mx-auto flex gap-4">
            <Skeleton variant="rectangular" width="80px" height="80px" />
            <div className="flex-1 space-y-2 mt-1">
              <Skeleton variant="text" width="180px" height="24px" />
              <Skeleton variant="text" width="140px" height="16px" />
            </div>
          </div>
        </div>
        <div className="max-w-6xl mx-auto px-4 py-6 flex gap-6">
          <div className="hidden lg:block w-72 space-y-3">
            <Skeleton variant="rectangular" width="100%" height="120px" />
            <Skeleton variant="rectangular" width="100%" height="90px" />
          </div>
          <div className="flex-1 space-y-3">
            <Skeleton variant="rectangular" width="100%" height="40px" />
            <Skeleton variant="rectangular" width="100%" height="120px" />
            <Skeleton variant="rectangular" width="100%" height="120px" />
          </div>
        </div>
      </div>
    );
  }

  if (profileQuery.isError || !profile) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-8">
        <ErrorMessage>{t('userProfilePage.errors.loadFailed')}</ErrorMessage>
      </div>
    );
  }

  // Join date: respect relative-time preference, but use date-only when absolute
  // (no time-of-day shown for a membership start date).
  const createdLabel = useRelativeTime
    ? formatRelativeTime(new Date(profile.created_at))
    : formatDate(new Date(profile.created_at), { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div className="w-full">

      {/* ── Cover Banner ─────────────────────────────────────────────────── */}
      <div className="relative h-36 md:h-48 overflow-hidden">
        {profile.banner_url ? (
          <img
            src={resolveMediaUrl(profile.banner_url)}
            alt="Profile banner"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-[var(--color-primary)] via-[var(--color-primary-dark)] to-[var(--color-primary-light)] opacity-80" />
        )}
      </div>

      {/* ── Profile Header Bar ───────────────────────────────────────────── */}
      <div className="bg-[var(--color-surface)] border-b border-[var(--color-border)]">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex flex-col sm:flex-row sm:items-end gap-3 sm:gap-4 pb-4 relative">

            {/* Avatar — overlaps the banner */}
            <div className="flex-shrink-0 -mt-10 md:-mt-14 z-10 relative w-20 h-20 md:w-28 md:h-28">
              {profile.avatar_url ? (
                <img
                  src={resolveMediaUrl(profile.avatar_url)}
                  alt={t('userProfilePage.aria.avatarAlt', { username: profile.username })}
                  className="w-full h-full rounded-lg object-cover border-4 border-[var(--color-surface)] shadow-md"
                />
              ) : (
                <div className="w-full h-full rounded-lg bg-[var(--color-border)] border-4 border-[var(--color-surface)] shadow-md flex items-center justify-center text-3xl font-bold text-[var(--color-text-secondary)]">
                  {profile.username.charAt(0).toUpperCase()}
                </div>
              )}
              {/* Online status dot */}
              <div className="absolute bottom-1 right-1">
                <OnlineDot lastSeen={profile.last_seen} />
              </div>
            </div>

            {/* Name + Status */}
            <div className="flex-1 min-w-0 pt-1 sm:pb-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl md:text-2xl font-bold text-[var(--color-text-primary)] leading-tight">
                  {profile.username}
                </h1>
                {isBlocked && (
                  <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                    {t('userProfilePage.labels.blocked')}
                  </span>
                )}
              </div>
              {profile.status_text && (
                <p className="mt-0.5 text-sm italic text-[var(--color-text-secondary)] truncate max-w-sm">
                  "{profile.status_text}"
                </p>
              )}
              <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                {t('userProfilePage.labels.joined', { time: createdLabel })}
                {' · '}
                <span className="font-semibold text-[var(--color-text-secondary)]">
                  {formatNumber(profile.karma)}
                </span>{' '}
                {t('userProfilePage.labels.karma')}
              </p>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap items-center gap-2 sm:pb-1">
              {canViewPrivateTabs && (
                <button
                  type="button"
                  onClick={() => setIsEditProfileOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm font-semibold text-[var(--color-text-primary)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  {t('userProfilePage.actions.editProfile')}
                </button>
              )}
              {canMessageUser && !isBlocked && (
                <Link
                  to={`/messages?to=${encodeURIComponent(profile.username)}`}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm font-semibold text-[var(--color-text-primary)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-3 3v-3z" />
                  </svg>
                  {t('userProfilePage.actions.message')}
                </Link>
              )}
              {/* Friend buttons */}
              {user && canMessageUser && !isBlocked && (
                <>
                  {friendshipStatus === 'accepted' && (
                    <button
                      type="button"
                      disabled={removeFriendMutation.isPending || friendActionDisabled}
                      onClick={() => removeFriendMutation.mutate()}
                      className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-success)] px-3 py-1.5 text-sm font-semibold text-[var(--color-success)] hover:opacity-80 disabled:opacity-50 transition"
                    >
                      ✓ {t('friends.actions.friends')}
                    </button>
                  )}
                  {friendshipStatus === 'pending_outgoing' && (
                    <button
                      type="button"
                      disabled={cancelOrDeclineFriendMutation.isPending || friendActionDisabled}
                      onClick={() => cancelOrDeclineFriendMutation.mutate()}
                      className="inline-flex items-center rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm font-semibold text-[var(--color-text-secondary)] hover:border-[var(--color-error)] hover:text-[var(--color-error)] disabled:opacity-50 transition"
                    >
                      {t('friends.actions.cancelRequest')}
                    </button>
                  )}
                  {friendshipStatus === 'pending_incoming' && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={acceptFriendMutation.isPending || friendActionDisabled}
                        onClick={() => acceptFriendMutation.mutate()}
                        className="inline-flex items-center rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 transition"
                      >
                        {t('friends.actions.accept')}
                      </button>
                      <button
                        type="button"
                        disabled={cancelOrDeclineFriendMutation.isPending || friendActionDisabled}
                        onClick={() => cancelOrDeclineFriendMutation.mutate()}
                        className="inline-flex items-center rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm font-semibold text-[var(--color-text-secondary)] hover:border-[var(--color-error)] hover:text-[var(--color-error)] disabled:opacity-50 transition"
                      >
                        {t('friends.actions.decline')}
                      </button>
                    </div>
                  )}
                  {friendshipStatus === 'none' && (
                    <button
                      type="button"
                      disabled={friendRequestMutation.isPending || friendActionDisabled}
                      onClick={() => friendRequestMutation.mutate()}
                      className="inline-flex items-center gap-1 rounded-md border border-[var(--color-primary)] px-3 py-1.5 text-sm font-semibold text-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-white disabled:opacity-50 transition"
                    >
                      + {t('friends.actions.addFriend')}
                    </button>
                  )}
                </>
              )}
              {canMessageUser && (
                <button
                  type="button"
                  disabled={blockMutation.isPending || unblockMutation.isPending}
                  onClick={() => {
                    if (isBlocked) {
                      unblockMutation.mutate();
                    } else if (window.confirm(t('userProfilePage.actions.confirmBlock', { username: profile.username }))) {
                      blockMutation.mutate();
                    }
                  }}
                  className={`inline-flex items-center rounded-md border px-3 py-1.5 text-sm font-semibold transition disabled:opacity-50 ${
                    isBlocked
                      ? 'border-[var(--color-success)] text-[var(--color-success)] hover:opacity-80'
                      : 'border-[var(--color-error)] text-[var(--color-error)] hover:opacity-80'
                  }`}
                >
                  {isBlocked ? t('userProfilePage.actions.unblock') : t('userProfilePage.actions.block')}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Body: sidebar + main ─────────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex gap-6 items-start">

          {/* ── Left Sidebar (desktop only) ─────────────────────────────── */}
          <aside className="hidden lg:flex flex-col gap-4 w-72 flex-shrink-0">

            {/* About Me */}
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)] mb-3">
                About Me
              </h3>
              {profile.bio ? (
                <MarkdownRenderer
                  content={profile.bio}
                  className="text-sm text-[var(--color-text-primary)]"
                />
              ) : (
                <p className="text-sm text-[var(--color-text-muted)] italic">
                  {canViewPrivateTabs ? 'Add a bio to tell people about yourself.' : 'No bio yet.'}
                </p>
              )}
            </div>

            {/* Stats */}
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)] mb-3">
                Stats
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-[var(--color-text-secondary)]">Karma</span>
                  <span className="font-bold text-[var(--color-text-primary)]">
                    {formatNumber(profile.karma)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--color-text-secondary)]">Posts</span>
                  <span className="font-semibold text-[var(--color-text-primary)]">
                    {postsQuery.isLoading ? '—' : formatNumber(posts.length)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--color-text-secondary)]">Comments</span>
                  <span className="font-semibold text-[var(--color-text-primary)]">
                    {commentsQuery.isLoading ? '—' : formatNumber(comments.length)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--color-text-secondary)]">Member since</span>
                  <span className="font-semibold text-[var(--color-text-primary)] text-xs text-right">
                    {createdLabel}
                  </span>
                </div>
              </div>
            </div>

            {/* Moderated Hubs */}
            {profile.moderated_hubs && profile.moderated_hubs.length > 0 && (
              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)] mb-3">
                  {t('userProfilePage.headings.moderatorOf')}
                </h3>
                <div className="space-y-1.5">
                  {profile.moderated_hubs.map((hub) => (
                    <Link
                      key={hub.id}
                      to={`/h/${hub.name}`}
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-[var(--color-surface-elevated)] transition group"
                    >
                      <span className="text-sm font-semibold text-[var(--color-text-primary)] group-hover:text-[var(--color-primary)] transition">
                        {t('common.format.hubPath', { name: hub.name })}
                      </span>
                      {hub.title && (
                        <span className="text-xs text-[var(--color-text-muted)] truncate">
                          {hub.title}
                        </span>
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Top Friends */}
            {username && (
              <TopFriendsSection username={username} isOwnProfile={canViewPrivateTabs} />
            )}
          </aside>

          {/* ── Main Content ────────────────────────────────────────────── */}
          <main className="flex-1 min-w-0 space-y-4">

            {/* Mobile: collapsible sidebar cards */}
            <div className="lg:hidden space-y-3">
              {/* About + Stats row on mobile */}
              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)] mb-2">
                  About
                </h3>
                {profile.bio ? (
                  <MarkdownRenderer content={profile.bio} className="text-sm text-[var(--color-text-primary)]" />
                ) : (
                  <p className="text-sm text-[var(--color-text-muted)] italic">No bio yet.</p>
                )}
                <div className="mt-3 pt-3 border-t border-[var(--color-border)] flex gap-4 text-sm">
                  <div>
                    <span className="font-bold text-[var(--color-text-primary)]">{formatNumber(profile.karma)}</span>
                    <span className="text-[var(--color-text-secondary)] ml-1">karma</span>
                  </div>
                  <div>
                    <span className="font-semibold text-[var(--color-text-primary)]">{posts.length}</span>
                    <span className="text-[var(--color-text-secondary)] ml-1">posts</span>
                  </div>
                </div>
              </div>

              {/* Mobile top friends */}
              {username && (
                <TopFriendsSection username={username} isOwnProfile={canViewPrivateTabs} />
              )}
            </div>

            {/* Tab navigation */}
            <div className="border-b border-[var(--color-border)]">
              <div className="-mb-px flex gap-1 overflow-x-auto">
                {visibleTabs.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className={`border-b-2 px-3 py-2 text-sm font-semibold whitespace-nowrap transition ${
                      resolvedActiveTab === tab.key
                        ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                        : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                    }`}
                  >
                    {t(tab.labelKey)}
                  </button>
                ))}
              </div>
            </div>

            {/* Tab content */}
            <div>{renderTabContent()}</div>
          </main>

        </div>
      </div>

      <EditProfileModal
        isOpen={isEditProfileOpen}
        onClose={() => setIsEditProfileOpen(false)}
        initialBio={profile.bio}
        initialAvatarUrl={profile.avatar_url}
        initialStatusText={profile.status_text}
        initialBannerUrl={profile.banner_url}
        onUploadAvatar={async (file) => {
          const uploadResult = await usersService.uploadAvatar(file);
          return uploadResult.avatar_url;
        }}
        isSaving={updateProfileMutation.isPending}
        onSave={async (payload) => {
          await updateProfileMutation.mutateAsync(payload);
        }}
      />
    </div>
  );
}
