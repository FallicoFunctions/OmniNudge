import { useEffect, useMemo, useState } from 'react';
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
import { Panel } from '../components/common/Panel';
import { ErrorMessage } from '../components/common/StatusMessage';
import { Skeleton } from '../components/common/LoadingStates';
import { useFormat } from '../hooks/useFormat';
import { normalizeReportReason, reportService, type ReportReason } from '../services/reportService';
import EditProfileModal from '../components/profile/EditProfileModal';

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
            {/* REDDIT-2: Show thumbnails consistently with standard size */}
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
                <h3 className="mt-1 text-lg font-semibold text-[var(--color-text-primary)] hover:text-[var(--color-primary)]">
                  {post.title}
                </h3>
              </Link>
              {post.body && (
                <PostBodyMarkdown
                  content={post.body}
                  className="mt-2 text-[var(--color-text-secondary)]"
                />
              )}
              <div className="mt-2 text-xs font-medium text-[var(--color-text-secondary)]">
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
              className="text-[var(--color-text-primary)]"
            />

            {/* Prominent "View thread" link */}
            <div className="mt-3 pt-3 border-t border-[var(--color-border)]">
              <Link
                to={`/posts/${comment.post_id}`}
                state={linkState}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-dark)] hover:underline transition"
              >
                {t('userProfilePage.actions.viewThread')}
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 7l5 5m0 0l-5 5m5-5H6"
                  />
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

  const formatTimestampLabel = (
    timestamp: string | number | Date,
    useRelativeTimeEnabled: boolean
  ) => {
    const d = new Date(timestamp);
    if (Number.isNaN(d.getTime())) return t('common.time.recently');

    if (useRelativeTimeEnabled) {
      return formatRelativeTime(d);
    }

    return formatDate(d, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

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
        (blockedUser) => blockedUser.username.toLowerCase() === profile.username.toLowerCase()
      )
  );

  const blockMutation = useMutation({
    mutationFn: async () => {
      if (!profile) return;
      await usersService.blockUser(profile.username);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['blocked-users'] });
    },
  });

  const unblockMutation = useMutation({
    mutationFn: async () => {
      if (!profile) return;
      await usersService.unblockUser(profile.username);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['blocked-users'] });
    },
  });

  const reportUserMutation = useMutation({
    mutationFn: async (payload: { userId: number; reason: ReportReason; description?: string }) => {
      await reportService.createReport({
        targetType: 'user',
        targetId: payload.userId,
        reason: payload.reason,
        description: payload.description,
      });
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (payload: {
      bio?: string | null;
      avatar_url?: string | null;
      status_text?: string | null;
    }) =>
      usersService.updateProfile(payload),
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

  const createdLabel = profile ? formatTimestampLabel(profile.created_at, useRelativeTime) : '';
  const lastSeenLabel =
    profile?.last_seen ? formatTimestampLabel(profile.last_seen, useRelativeTime) : '';

  const renderActiveTab = () => {
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
      if (!canViewPrivateTabs) {
        return (
          <p className="text-sm text-[var(--color-text-secondary)]">
            {t('userProfilePage.private.saved')}
          </p>
        );
      }
      return <SavedItemsView withContainer={false} showHeading={false} className="space-y-6" />;
    }

    if (resolvedActiveTab === 'hidden') {
      if (!canViewPrivateTabs) {
        return (
          <p className="text-sm text-[var(--color-text-secondary)]">
            {t('userProfilePage.private.hidden')}
          </p>
        );
      }
      return <HiddenItemsView withContainer={false} showHeading={false} className="space-y-6" />;
    }

    if (resolvedActiveTab === 'subscribed') {
      if (!canViewPrivateTabs) {
        return (
          <p className="text-sm text-[var(--color-text-secondary)]">
            {t('userProfilePage.private.subscribed')}
          </p>
        );
      }
      return <SubscribedView withContainer={false} showHeading={false} className="space-y-6" />;
    }

    return (
      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
              {t('userProfilePage.headings.recentPosts')}
            </h3>
            {posts.length > 0 && (
              <button
                type="button"
                onClick={() => setActiveTab('posts')}
                className="flex items-center gap-1 text-sm font-medium text-[var(--color-primary)] hover:underline transition"
              >
                {t('userProfilePage.actions.viewAll')}
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
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
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
              {t('userProfilePage.headings.recentComments')}
            </h3>
            {comments.length > 0 && (
              <button
                type="button"
                onClick={() => setActiveTab('comments')}
                className="flex items-center gap-1 text-sm font-medium text-[var(--color-primary)] hover:underline transition"
              >
                {t('userProfilePage.actions.viewAll')}
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
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
        <ErrorMessage>{t('userProfilePage.errors.loadFailed')}</ErrorMessage>
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
                alt={t('userProfilePage.aria.avatarAlt', { username: profile.username })}
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
              <p className="text-sm text-[var(--color-text-secondary)]">
                {t('userProfilePage.labels.joined', { time: createdLabel })}
              </p>
              {profile.last_seen && (
                <p className="text-xs text-[var(--color-text-secondary)]">
                  {t('userProfilePage.labels.lastSeen', { time: lastSeenLabel })}
                </p>
              )}
              {profile.status_text && (
                <p className="text-sm font-medium text-[var(--color-text-primary)]">
                  {profile.status_text}
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-2 text-sm text-[var(--color-text-secondary)] md:items-end md:text-right">
            <div>
              <span className="font-semibold text-[var(--color-text-primary)]">
                {formatNumber(profile.karma)}
              </span>{' '}
              {t('userProfilePage.labels.karma')}
            </div>
            {canViewPrivateTabs && (
              <button
                type="button"
                onClick={() => setIsEditProfileOpen(true)}
                className="inline-flex items-center justify-center rounded-md border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-text-primary)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
              >
                {t('userProfilePage.actions.editProfile')}
              </button>
            )}
            {canMessageUser && (
              <div className="flex flex-wrap items-center gap-2 md:justify-end">
                {!isBlocked && (
                  <Link
                    to={`/messages?to=${encodeURIComponent(profile.username)}`}
                    className="inline-flex items-center justify-center rounded-md border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-text-primary)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
                  >
                    {t('userProfilePage.actions.message')}
                  </Link>
                )}
                <button
                  type="button"
                  disabled={blockMutation.isPending || unblockMutation.isPending || reportUserMutation.isPending}
                  onClick={() => {
                    if (!profile) return;
                    if (isBlocked) {
                      unblockMutation.mutate();
                    } else if (
                      window.confirm(
                        t('userProfilePage.actions.confirmBlock', { username: profile.username })
                      )
                    ) {
                      blockMutation.mutate();
                    }
                  }}
                  className={`inline-flex items-center justify-center rounded-md border px-4 py-2 text-sm font-semibold transition ${
                    isBlocked
                      ? 'border-[var(--color-success)] text-[var(--color-success)] hover:opacity-80'
                      : 'border-[var(--color-error)] text-[var(--color-error)] hover:opacity-80'
                  } disabled:opacity-50`}
                >
                  {isBlocked
                    ? t('userProfilePage.actions.unblock')
                    : t('userProfilePage.actions.block')}
                </button>
                {isBlocked && (
                  <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                    {t('userProfilePage.labels.blocked')}
                  </span>
                )}
                <button
                  type="button"
                  disabled={reportUserMutation.isPending}
                  onClick={() => {
                    if (!profile) return;
                    const reasonInput = window.prompt(t('reporting.reasonPrompt'));
                    if (reasonInput === null) return;
                    const reason = normalizeReportReason(reasonInput);
                    if (!reason) {
                      alert(t('reporting.invalidReason'));
                      return;
                    }
                    const detailsInput = window.prompt(t('reporting.detailsPrompt'));
                    reportUserMutation.mutate(
                      { userId: profile.id, reason, description: detailsInput ?? undefined },
                      {
                        onSuccess: () => {
                          alert(t('reporting.success'));
                        },
                        onError: (error) => {
                          alert(
                            t('userProfilePage.actions.reportFailed', {
                              message: error instanceof Error ? error.message : t('common.error'),
                            })
                          );
                        },
                      }
                    );
                  }}
                  className="inline-flex items-center justify-center rounded-md border border-[var(--color-error)] px-4 py-2 text-sm font-semibold text-[var(--color-error)] hover:opacity-80 disabled:opacity-50"
                >
                  {t('userProfilePage.actions.report')}
                </button>
              </div>
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
            {t('userProfilePage.headings.moderatorOf')}
          </h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {profile.moderated_hubs.map((hub) => (
              <Link
                key={hub.id}
                to={`/h/${hub.name}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] px-4 py-1.5 text-sm font-medium text-[var(--color-text-primary)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition"
              >
                <span className="font-semibold">
                  {t('common.format.hubPath', { name: hub.name })}
                </span>
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
              {t(tab.labelKey)}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6">{renderActiveTab()}</div>

      <EditProfileModal
        isOpen={isEditProfileOpen}
        onClose={() => setIsEditProfileOpen(false)}
        initialBio={profile.bio}
        initialAvatarUrl={profile.avatar_url}
        initialStatusText={profile.status_text}
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
