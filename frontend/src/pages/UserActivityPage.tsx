import { useCallback, useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
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
import { LoadingMessage } from '../components/common/StatusMessage';
import { useFormat } from '../hooks/useFormat';

const BASE_TABS = [
  { key: 'posts', labelKey: 'userProfilePage.tabs.posts' },
  { key: 'comments', labelKey: 'userProfilePage.tabs.comments' },
  { key: 'communities', labelKey: 'userProfilePage.tabs.communities' },
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

function CommunitiesSection({ profile, t }: { profile?: UserProfile; t: TFunction }) {
  const hubs = profile?.moderated_hubs ?? [];

  if (hubs.length === 0) {
    return (
      <p className="text-sm text-[var(--color-text-secondary)]">
        {t('userProfilePage.communities.empty')}
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      {hubs.map((hub) => (
        <Link
          key={hub.id}
          to={`/h/${hub.name}`}
          className="flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 hover:bg-[var(--color-surface-elevated)] transition group"
        >
          <span className="text-sm font-semibold text-[var(--color-text-primary)] group-hover:text-[var(--color-primary)] transition">
            {t('common.format.hubPath', { name: hub.name })}
          </span>
          {hub.title && (
            <span className="text-xs text-[var(--color-text-muted)] truncate">{hub.title}</span>
          )}
        </Link>
      ))}
    </div>
  );
}

export default function UserActivityPage() {
  const { t } = useTranslation();
  const { formatNumber, formatDate, formatRelativeTime } = useFormat();
  const location = useLocation();
  const { username } = useParams<{ username: string }>();
  const { user } = useAuth();
  const { useRelativeTime } = useSettings();
  const [activeTab, setActiveTab] = useState<TabKey>(() => {
    const tab = new URLSearchParams(location.search).get('tab');
    if (tab === 'posts' || tab === 'comments' || tab === 'communities' || tab === 'saved' || tab === 'hidden' || tab === 'subscribed') {
      return tab;
    }
    return 'posts';
  });
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
    !canViewPrivateTabs &&
    (activeTab === 'saved' || activeTab === 'hidden' || activeTab === 'subscribed')
      ? 'posts'
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

  const posts = useMemo(() => postsQuery.data?.posts ?? [], [postsQuery.data?.posts]);
  const comments = useMemo(
    () => commentsQuery.data?.comments ?? [],
    [commentsQuery.data?.comments]
  );

  const renderTabContent = () => {
    if (resolvedActiveTab === 'posts') {
      if (postsQuery.isLoading) return <LoadingMessage>{t('common.loading')}</LoadingMessage>;
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
      if (commentsQuery.isLoading) return <LoadingMessage>{t('common.loading')}</LoadingMessage>;
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
    if (resolvedActiveTab === 'communities') {
      return <CommunitiesSection profile={profileQuery.data} t={t} />;
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

    return null;
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8">
      <div className="mb-6">
        <Link
          to={`/users/${username}`}
          className="text-sm font-medium text-[var(--color-primary)] hover:underline"
        >
          ← {t('userProfilePage.activityPage.backToProfile')}
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-[var(--color-text-primary)]">
          {t('userProfilePage.activityPage.title', { username })}
        </h1>
      </div>

      <div className="border-b border-[var(--color-border)] mb-4">
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

      <div>{renderTabContent()}</div>
    </div>
  );
}
