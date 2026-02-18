import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { savedService } from '../../services/savedService';
import type { HiddenItemsResponse, SavedPost, SavedRedditPost } from '../../types/saved';
import { api } from '../../lib/api';
import { usePagination } from '../../hooks/usePagination';
import { PaginationControls } from '../common/PaginationControls';
import { sanitizeHttpUrl } from '../../utils/crosspostHelpers';
import { RedditPostCard } from '../reddit/RedditPostCard';
import { HubPostCard } from '../hubs/HubPostCard';
import { useSettings } from '../../contexts/SettingsContext';
import { ErrorMessage, LoadingMessage } from '../common/StatusMessage';
import type { PlatformPost } from '../../types/posts';
import { getPostUrl } from '../../utils/postUrl';
import { postsService } from '../../services/postsService';
import { useAuth } from '../../contexts/AuthContext';

type RedditListingData = {
  data?: {
    children?: Array<{
      data?: {
        title?: string;
        author?: string;
        score?: number;
        num_comments?: number;
        thumbnail?: string;
        url?: string;
        selftext?: string;
        is_self?: boolean;
        post_hint?: string;
        is_video?: boolean;
        created_utc?: number;
        link_flair_text?: string | null;
        link_flair_background_color?: string | null;
        link_flair_text_color?: string | null;
        over18?: boolean;
        over_18?: boolean;
        preview?: {
          images?: Array<{
            source?: { url?: string };
          }>;
        };
        media?: {
          oembed?: {
            thumbnail_url?: string;
          };
        };
        secure_media?: {
          oembed?: {
            thumbnail_url?: string;
          };
        };
      };
    }>;
  };
};

type TabKey = 'omni' | 'reddit';

const PAGE_SIZE = 25;

const normalizeRemovedLabel = (value?: string | null) => {
  if (!value) {
    return '';
  }
  const normalized = value
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return normalized;
};

const isRemovedText = (value?: string | null) => {
  const normalized = normalizeRemovedLabel(value);
  if (!normalized) {
    return false;
  }
  const stripped = normalized.replace(/[()\]]/g, '').replace(/\[/g, '');
  return (
    normalized === '[removed]' ||
    normalized === '[deleted]' ||
    normalized.includes('removed by moderator') ||
    stripped === 'removed' ||
    stripped === 'deleted' ||
    stripped === 'removed by moderator'
  );
};

const isRedditPostLikelyRemoved = (post: SavedRedditPost, overrides?: Partial<SavedRedditPost>) => {
  if (isRemovedText(post.title) || isRemovedText(post.author)) {
    return true;
  }
  if (overrides && (isRemovedText(overrides.title) || isRemovedText(overrides.author))) {
    return true;
  }
  return false;
};

const getPostKey = (post: SavedRedditPost) => `${post.subreddit}-${post.reddit_post_id}`;

type HiddenItemsViewProps = {
  withContainer?: boolean;
  showHeading?: boolean;
  className?: string;
};

export function HiddenItemsView({
  withContainer = true,
  showHeading = true,
  className = '',
}: HiddenItemsViewProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { useRelativeTime } = useSettings();
  const { user } = useAuth();
  const emptyData: HiddenItemsResponse = { type: 'all', hidden_posts: [], hidden_reddit_posts: [] };
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('omni');
  const { data = emptyData, isLoading } = useQuery<HiddenItemsResponse>({
    queryKey: ['hidden-items', 'all'],
    queryFn: async () => {
      try {
        const response = await savedService.getHiddenItems();
        setLoadError(null);
        return response;
      } catch (err) {
        console.error('Failed to load hidden items', err);
        setLoadError(err as Error);
        return emptyData;
      }
    },
  });

  const hiddenPosts = useMemo(
    () => (data?.hidden_posts ?? []) as SavedPost[],
    [data?.hidden_posts]
  );
  const hiddenRedditPosts = useMemo(
    () => (data?.hidden_reddit_posts ?? []) as SavedRedditPost[],
    [data?.hidden_reddit_posts]
  );
  const [postDetails, setPostDetails] = useState<Record<string, Partial<SavedRedditPost>>>({});
  const [omniPostDetails, setOmniPostDetails] = useState<Record<number, PlatformPost>>({});
  const fetchingOmniDetailsRef = useRef<Set<number>>(new Set());
  const visibleHiddenRedditPosts = useMemo(
    () =>
      hiddenRedditPosts.filter(
        (post) => !isRedditPostLikelyRemoved(post, postDetails[getPostKey(post)])
      ),
    [hiddenRedditPosts, postDetails]
  );
  const removedHiddenRedditPosts = useMemo(
    () =>
      hiddenRedditPosts.filter((post) =>
        isRedditPostLikelyRemoved(post, postDetails[getPostKey(post)])
      ),
    [hiddenRedditPosts, postDetails]
  );
  const fetchingDetailsRef = useRef<Set<string>>(new Set());
  const [saveConfirmTarget, setSaveConfirmTarget] = useState<SavedRedditPost | null>(null);

  const postsNeedingDetails = useMemo(
    () =>
      visibleHiddenRedditPosts.filter((post) => {
        const postKey = getPostKey(post);
        return !postDetails[postKey];
      }),
    [visibleHiddenRedditPosts, postDetails]
  );

  useEffect(() => {
    // Fetch all post details concurrently for better performance
    const fetchPromises = postsNeedingDetails.map((post) => {
      const postKey = `${post.subreddit}-${post.reddit_post_id}`;
      if (postDetails[postKey] || fetchingDetailsRef.current.has(postKey)) {
        return Promise.resolve();
      }
      fetchingDetailsRef.current.add(postKey);
      return api
        .get<[RedditListingData, unknown]>(`/reddit/r/${post.subreddit}/comments/${post.reddit_post_id}`)
        .then((response) => {
          const listing = response[0];
          const remotePost = listing?.data?.children?.[0]?.data;
          if (!remotePost) {
            return;
          }
          const normalizedThumbnail =
            sanitizeHttpUrl(remotePost.thumbnail) ??
            sanitizeHttpUrl(remotePost.preview?.images?.[0]?.source?.url) ??
            sanitizeHttpUrl(remotePost.media?.oembed?.thumbnail_url) ??
            sanitizeHttpUrl(remotePost.secure_media?.oembed?.thumbnail_url) ??
            null;
          setPostDetails((prev) => ({
            ...prev,
            [postKey]: {
              title: remotePost.title,
              author: remotePost.author,
              url: remotePost.url,
              selftext: remotePost.selftext,
              is_self: remotePost.is_self,
              post_hint: remotePost.post_hint,
              is_video: remotePost.is_video,
              score:
                typeof remotePost.score === 'number' ? remotePost.score : prev[postKey]?.score,
              num_comments:
                typeof remotePost.num_comments === 'number'
                  ? remotePost.num_comments
                  : prev[postKey]?.num_comments,
              thumbnail: normalizedThumbnail,
              created_utc: remotePost.created_utc ?? prev[postKey]?.created_utc ?? null,
              link_flair_text: remotePost.link_flair_text ?? prev[postKey]?.link_flair_text ?? null,
              link_flair_background_color:
                remotePost.link_flair_background_color ??
                prev[postKey]?.link_flair_background_color ??
                null,
              link_flair_text_color:
                remotePost.link_flair_text_color ?? prev[postKey]?.link_flair_text_color ?? null,
              over18:
                remotePost.over18 ??
                remotePost.over_18 ??
                prev[postKey]?.over18 ??
                null,
              preview: remotePost.preview ?? prev[postKey]?.preview ?? null,
              media: remotePost.media ?? prev[postKey]?.media ?? null,
              secure_media: remotePost.secure_media ?? prev[postKey]?.secure_media ?? null,
            },
          }));
        })
        .catch(() => {
          // Swallow errors; the fallback UI will still show basic info
        })
        .finally(() => {
          fetchingDetailsRef.current.delete(postKey);
        });
    });

    // Execute all fetches concurrently
    Promise.all(fetchPromises);
  }, [postsNeedingDetails, postDetails]);

  useEffect(() => {
    const missingOmniPosts = hiddenPosts.filter((post) => {
      if (omniPostDetails[post.id] || fetchingOmniDetailsRef.current.has(post.id)) {
        return false;
      }
      return true;
    });

    if (missingOmniPosts.length === 0) {
      return;
    }

    missingOmniPosts.forEach((post) => {
      fetchingOmniDetailsRef.current.add(post.id);
    });

    Promise.all(
      missingOmniPosts.map((post) =>
        postsService
          .getPost(post.id)
          .then((details) => {
            setOmniPostDetails((prev) => ({
              ...prev,
              [post.id]: details,
            }));
          })
          .catch((fetchError) => {
            console.error('Failed to refresh hidden Omni post details', fetchError);
          })
          .finally(() => {
            fetchingOmniDetailsRef.current.delete(post.id);
          })
      )
    );
  }, [hiddenPosts, omniPostDetails]);

  const invalidateHiddenQueries = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['hidden-items', 'all'] });
    queryClient.invalidateQueries({ queryKey: ['hidden-items', 'reddit_posts'] });
  }, [queryClient]);

  useEffect(() => {
    if (removedHiddenRedditPosts.length === 0) {
      return;
    }
    let isCancelled = false;
    const cleanupRemovedPosts = async () => {
      // Unhide all posts concurrently for better performance
      const unhidePromises = removedHiddenRedditPosts.map((post) =>
        savedService.unhideRedditPost(post.subreddit, post.reddit_post_id)
          .catch((cleanupError) => {
            console.error('Failed to auto-unhide removed Reddit post', cleanupError);
          })
      );

      await Promise.allSettled(unhidePromises);

      if (!isCancelled) {
        invalidateHiddenQueries();
      }
    };

    cleanupRemovedPosts();
    return () => {
      isCancelled = true;
    };
  }, [removedHiddenRedditPosts, invalidateHiddenQueries]);

  const unhidePostMutation = useMutation({
    mutationFn: async (postId: number) => {
      await savedService.unhidePost(postId);
    },
    onSuccess: () => invalidateHiddenQueries(),
    onError: (mutationError: Error) => {
      alert(t('alerts.unhideFailed', { message: mutationError.message }));
    },
  });

  const unhideRedditPostMutation = useMutation({
    mutationFn: async ({ subreddit, reddit_post_id }: { subreddit: string; reddit_post_id: string }) => {
      await savedService.unhideRedditPost(subreddit, reddit_post_id);
    },
    onSuccess: () => invalidateHiddenQueries(),
    onError: (mutationError: Error) => {
      alert(t('alerts.unhideFailed', { message: mutationError.message }));
    },
  });

  const resaveRedditPostMutation = useMutation({
    mutationFn: async ({ subreddit, reddit_post_id }: { subreddit: string; reddit_post_id: string }) => {
      await Promise.all([
        savedService.unhideRedditPost(subreddit, reddit_post_id),
        savedService.saveRedditPost(subreddit, reddit_post_id),
      ]);
    },
    onSuccess: () => {
      invalidateHiddenQueries();
      queryClient.invalidateQueries({ queryKey: ['saved-items', 'reddit_posts'] });
      setSaveConfirmTarget(null);
    },
    onError: (mutationError: Error) => {
      alert(t('alerts.saveFailed', { message: mutationError.message }));
    },
  });

  const handleShareRedditPost = (post: SavedRedditPost) => {
    const shareUrl = `${window.location.origin}/r/${post.subreddit}/comments/${post.reddit_post_id}`;
    navigator.clipboard
      .writeText(shareUrl)
      .then(() => alert(t('alerts.linkCopied')))
      .catch(() => alert(t('alerts.linkCopyFailed')));
  };

  const toTimestamp = (value?: string | number | null) => {
    if (!value) {
      return 0;
    }
    if (typeof value === 'number') {
      return value > 1_000_000_000_000 ? value : value * 1000;
    }
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  };

  const omniItems = hiddenPosts
    .map((post) => ({
      key: `hidden-omni-post-${post.id}`,
      timestamp: toTimestamp(post.crossposted_at ?? post.created_at),
      node: (() => {
        const hiddenPostExtras = post as SavedPost & Partial<PlatformPost>;
        const detailedPost = omniPostDetails[post.id];
        const omniPost: PlatformPost = {
          id: post.id,
          title: detailedPost?.title ?? post.title,
          author_id: detailedPost?.author_id ?? hiddenPostExtras.author_id ?? 0,
          author_username:
            detailedPost?.author_username ??
            post.author_username ??
            hiddenPostExtras.author_username ??
            t('posts.unknownAuthor'),
          hub_name:
            detailedPost?.hub_name ??
            post.hub_name ??
            hiddenPostExtras.hub_name ??
            t('posts.unknownHub'),
          score: detailedPost?.score ?? post.score,
          comment_count:
            detailedPost?.comment_count ??
            detailedPost?.num_comments ??
            post.comment_count ??
            hiddenPostExtras.comment_count ??
            0,
          crossposted_at:
            detailedPost?.crossposted_at ??
            post.crossposted_at ??
            hiddenPostExtras.crossposted_at ??
            null,
          created_at:
            detailedPost?.created_at ??
            post.created_at ??
            hiddenPostExtras.created_at ??
            new Date().toISOString(),
          body: detailedPost?.body ?? hiddenPostExtras.body ?? null,
          media_url: detailedPost?.media_url ?? hiddenPostExtras.media_url ?? null,
          media_type: detailedPost?.media_type ?? hiddenPostExtras.media_type ?? null,
          thumbnail_url: detailedPost?.thumbnail_url ?? hiddenPostExtras.thumbnail_url ?? null,
          nsfw: detailedPost?.nsfw ?? hiddenPostExtras.nsfw ?? undefined,
          target_subreddit: detailedPost?.target_subreddit ?? hiddenPostExtras.target_subreddit ?? null,
          hub_display_title:
            detailedPost?.hub_display_title ?? hiddenPostExtras.hub_display_title ?? null,
          hub_id: detailedPost?.hub_id ?? hiddenPostExtras.hub_id ?? null,
        };

        return (
          <HubPostCard
            post={omniPost}
            useRelativeTime={useRelativeTime}
            currentUserId={user?.id}
            currentUserRole={user?.role}
            hubDisplayTitle={omniPost.hub_display_title ?? null}
            isSaved={false}
            onShare={() => {
              const shareUrl = `${window.location.origin}${getPostUrl(omniPost)}`;
              navigator.clipboard
                .writeText(shareUrl)
                .then(() => alert(t('alerts.linkCopied')))
                .catch(() => alert(t('alerts.linkCopyFailed')));
            }}
            onHide={() => unhidePostMutation.mutate(post.id)}
            isHiding={unhidePostMutation.isPending}
            hideLabel={t('posts.actions.unhide')}
          />
        );
      })(),
    }))
    .sort((a, b) => b.timestamp - a.timestamp);

  const {
    currentItems: pagedOmniItems,
    pageIndex: omniPageIndex,
    totalPages: omniTotalPages,
    canGoPrev: canOmniGoPrev,
    canGoNext: canOmniGoNext,
    goToPrev: goToPrevOmni,
    goToNext: goToNextOmni,
    resetPage: resetOmniPage,
  } = usePagination(omniItems, PAGE_SIZE);

  const redditItems = visibleHiddenRedditPosts
    .map((post) => ({
      key: `hidden-reddit-post-${post.subreddit}-${post.reddit_post_id}`,
      timestamp: toTimestamp(post.saved_at),
      node: (() => {
        const postKey = `${post.subreddit}-${post.reddit_post_id}`;
        const mergedPost = { ...post, ...(postDetails[postKey] ?? {}) };
        const isSaved = false; // Never saved in hidden view

        // Transform SavedRedditPost to match RedditPostCard's expected shape
        const redditPost = {
          id: post.reddit_post_id,
          title: mergedPost.title || t('common.format.subredditPath', { name: post.subreddit }),
          author: mergedPost.author || t('posts.unknownAuthor'),
          subreddit: post.subreddit,
          score: mergedPost.score ?? 0,
          num_comments: mergedPost.num_comments ?? 0,
          created_utc: mergedPost.created_utc ?? Date.parse(post.saved_at) / 1000,
          thumbnail: mergedPost.thumbnail ?? undefined,
          url: mergedPost.url ?? undefined,
          selftext: mergedPost.selftext ?? undefined,
          is_self: mergedPost.is_self ?? false,
          post_hint: mergedPost.post_hint ?? undefined,
          is_video: mergedPost.is_video ?? false,
          preview: mergedPost.preview ?? undefined,
          media: mergedPost.media ?? undefined,
          secure_media: mergedPost.secure_media ?? undefined,
          link_flair_text: mergedPost.link_flair_text ?? undefined,
          link_flair_background_color: mergedPost.link_flair_background_color ?? undefined,
          link_flair_text_color: mergedPost.link_flair_text_color ?? undefined,
          over18: mergedPost.over18 ?? undefined,
        };

        return (
          <RedditPostCard
            post={redditPost}
            useRelativeTime={useRelativeTime}
            isSaved={isSaved}
            isSaveActionPending={false}
            pendingShouldSave={false}
            onShare={() => handleShareRedditPost(mergedPost)}
            onToggleSave={() => setSaveConfirmTarget(post)}
            onHide={() => unhideRedditPostMutation.mutate({
              subreddit: post.subreddit,
              reddit_post_id: post.reddit_post_id,
            })}
            onCrosspost={() => navigate(`/r/${post.subreddit}/comments/${post.reddit_post_id}`, { state: { isHidden: true } })}
            hideLabel={t('posts.actions.unhide')}
          />
        );
      })(),
    }))
    .sort((a, b) => b.timestamp - a.timestamp);

  const {
    currentItems: pagedRedditItems,
    pageIndex: redditPageIndex,
    totalPages: redditTotalPages,
    canGoPrev: canRedditGoPrev,
    canGoNext: canRedditGoNext,
    goToPrev: goToPrevReddit,
    goToNext: goToNextReddit,
    resetPage: resetRedditPage,
  } = usePagination(redditItems, PAGE_SIZE);

  const renderActiveTab = () => {
    if (activeTab === 'omni') {
      if (omniItems.length === 0) {
        return <p className="text-sm text-[var(--color-text-secondary)]">{t('hidden.empty.omni')}</p>;
      }
      return (
        <>
          <div className="space-y-3">
            {pagedOmniItems.map((item) => (
              <Fragment key={item.key}>{item.node}</Fragment>
            ))}
          </div>
          <PaginationControls
            pageIndex={omniPageIndex}
            totalPages={omniTotalPages}
            onPrev={goToPrevOmni}
            onNext={goToNextOmni}
            canGoPrev={canOmniGoPrev}
            canGoNext={canOmniGoNext}
          />
        </>
      );
    }

    if (redditItems.length === 0) {
      return <p className="text-sm text-[var(--color-text-secondary)]">{t('hidden.empty.reddit')}</p>;
    }

    return (
      <>
        <div className="space-y-3">
          {pagedRedditItems.map((item) => (
            <Fragment key={item.key}>{item.node}</Fragment>
          ))}
        </div>
        <PaginationControls
          pageIndex={redditPageIndex}
          totalPages={redditTotalPages}
          onPrev={goToPrevReddit}
          onNext={goToNextReddit}
          canGoPrev={canRedditGoPrev}
          canGoNext={canRedditGoNext}
        />
      </>
    );
  };

  const tabButtonClass = (tab: TabKey) =>
    `flex-1 rounded-md px-4 py-2 text-sm font-semibold transition ${
      activeTab === tab
        ? 'bg-[var(--color-primary)] text-white shadow'
        : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
    }`;

  const wrapperClassName = withContainer
    ? ['mx-auto max-w-4xl px-4 py-8', className].filter(Boolean).join(' ')
    : className;

  const content = (
    <>
      {showHeading && (
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">{t('hidden.headingTitle')}</h1>
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">{t('hidden.headingDescription')}</p>
        </div>
      )}

      <div className="mb-6 inline-flex w-full max-w-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-1">
        <button
          type="button"
          className={tabButtonClass('omni')}
          onClick={() => {
            setActiveTab('omni');
            resetOmniPage();
          }}
        >
          {t('hidden.tabs.omni')}
        </button>
        <button
          type="button"
          className={tabButtonClass('reddit')}
          onClick={() => {
            setActiveTab('reddit');
            resetRedditPage();
          }}
        >
          {t('hidden.tabs.reddit')}
        </button>
      </div>

      {isLoading && (
        <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <LoadingMessage className="mt-0 text-sm">{t('hidden.loading')}</LoadingMessage>
        </div>
      )}

      {loadError && (
        <div className="rounded-md border border-yellow-200 bg-yellow-50 p-4">
          <ErrorMessage className="mt-0 text-sm text-yellow-800">
            {t('hidden.loadError')}
          </ErrorMessage>
        </div>
      )}

      {!isLoading && renderActiveTab()}

      {saveConfirmTarget && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-lg">
            <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">{t('hidden.modal.saveTitle')}</h3>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              {t('hidden.modal.saveDescription')}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setSaveConfirmTarget(null)}
                className="rounded border border-[var(--color-border)] px-3 py-1 text-sm hover:bg-[var(--color-surface-elevated)]"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={() =>
                  saveConfirmTarget &&
                  resaveRedditPostMutation.mutate({
                    subreddit: saveConfirmTarget.subreddit,
                    reddit_post_id: saveConfirmTarget.reddit_post_id,
                  })
                }
                disabled={resaveRedditPostMutation.isPending}
                className="rounded bg-[var(--color-primary)] px-3 py-1 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)] disabled:opacity-50"
              >
                {resaveRedditPostMutation.isPending ? t('posts.status.saving') : t('hidden.modal.moveToSaved')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  return <div className={wrapperClassName}>{content}</div>;
}

export default HiddenItemsView;
