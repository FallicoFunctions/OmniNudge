import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { savedService } from '../../services/savedService';
import type { SavedPost, SavedPostComment, SavedRedditPost, SavedRedditAPIComment } from '../../types/saved';
import type { LocalRedditComment } from '../../types/reddit';
import { api } from '../../lib/api';
import { useSettings } from '../../contexts/SettingsContext';
import { RedditPostCard } from '../reddit/RedditPostCard';
import { HubPostCard } from '../hubs/HubPostCard';
import { usePagination } from '../../hooks/usePagination';
import { PaginationControls } from '../common/PaginationControls';
import { sanitizeHttpUrl } from '../../utils/crosspostHelpers';
import { getPostUrl, getPostCommentUrl } from '../../utils/postUrl';
import { ErrorMessage, LoadingMessage } from '../common/StatusMessage';
import type { PlatformPost } from '../../types/posts';
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
        link_flair_text?: string;
        link_flair_background_color?: string;
        link_flair_text_color?: string;
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

type ContentType = 'posts' | 'comments' | 'both';
type SourceFilter = 'omni' | 'reddit' | 'both';

const PAGE_SIZE = 25;

const normalizeRemovedLabel = (value?: string) => value?.trim().toLowerCase() ?? '';

const isRedditPostLikelyRemoved = (post: SavedRedditPost) => {
  const title = normalizeRemovedLabel(post.title);
  if (
    title === '[removed]' ||
    title === '[deleted]' ||
    title.includes('removed by moderator')
  ) {
    return true;
  }

  const author = normalizeRemovedLabel(post.author);
  if (author === '[deleted]') {
    return true;
  }

  return false;
};

type SavedItemsViewProps = {
  withContainer?: boolean;
  showHeading?: boolean;
  className?: string;
};

export function SavedItemsView({
  withContainer = true,
  showHeading = true,
  className = '',
}: SavedItemsViewProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { useRelativeTime, notifyRemovedSavedPosts } = useSettings();
  const { user } = useAuth();
  const originState = useMemo(
    () => ({ originPath: `${location.pathname}${location.search}` }),
    [location.pathname, location.search]
  );
  const [contentType, setContentType] = useState<ContentType>('posts');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('both');
  const [removedNoticeDismissed, setRemovedNoticeDismissed] = useState(false);
  const { data, isLoading, error } = useQuery({
    queryKey: ['saved-items', 'all'],
    queryFn: () => savedService.getSavedItems(),
  });
  const { data: hiddenPostsData } = useQuery({
    queryKey: ['hidden-items', 'reddit_posts'],
    queryFn: () => savedService.getHiddenItems('reddit_posts'),
  });

  const savedPosts = useMemo(
    () => (data?.saved_posts ?? []) as SavedPost[],
    [data?.saved_posts]
  );
  const rawSavedRedditPosts = useMemo(
    () => (data?.saved_reddit_posts ?? []) as SavedRedditPost[],
    [data?.saved_reddit_posts]
  );
  const savedRedditPosts = useMemo(
    () => rawSavedRedditPosts.filter((post) => !isRedditPostLikelyRemoved(post)),
    [rawSavedRedditPosts]
  );
  const savedSiteComments = useMemo(
    () => (data?.saved_post_comments ?? []) as SavedPostComment[],
    [data?.saved_post_comments]
  );
  const savedRedditComments = useMemo(
    () => (data?.saved_reddit_comments ?? []) as LocalRedditComment[],
    [data?.saved_reddit_comments]
  );
  const savedRedditAPIComments = useMemo(
    () => (data?.saved_reddit_api_comments ?? []) as SavedRedditAPIComment[],
    [data?.saved_reddit_api_comments]
  );
  const hiddenRedditPostIds = useMemo(
    () =>
      new Set(
        hiddenPostsData?.hidden_reddit_posts?.map(
          (post) => `${post.subreddit}-${post.reddit_post_id}`
        ) ?? []
      ),
    [hiddenPostsData?.hidden_reddit_posts]
  );
  const autoRemovedRedditPosts = data?.auto_removed_reddit_posts ?? [];

  useEffect(() => {
    setRemovedNoticeDismissed(false);
  }, [autoRemovedRedditPosts.length]);
  const [postDetails, setPostDetails] = useState<Record<string, Partial<SavedRedditPost>>>({});
  const fetchingDetailsRef = useRef<Set<string>>(new Set());
  const [hideTargetPost, setHideTargetPost] = useState<SavedRedditPost | null>(null);
  const [omniPostDetails, setOmniPostDetails] = useState<Record<number, PlatformPost>>({});
  const fetchingOmniDetailsRef = useRef<Set<number>>(new Set());

  const postsNeedingDetails = useMemo(
    () =>
      savedRedditPosts.filter((post) => {
        const titleValue = (post.title ?? '').trim();
        const missingTitle = titleValue.length === 0;
        const missingCounts =
          typeof post.score !== 'number' && typeof post.num_comments !== 'number';
        return missingTitle || missingCounts;
      }),
    [savedRedditPosts]
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
        .get<[RedditListingData, unknown]>(
          `/r/${post.subreddit}/comments/${post.reddit_post_id}`
        )
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
        .catch((fetchError) => {
          console.error('Failed to refresh saved Reddit post details', fetchError);
        })
        .finally(() => {
          fetchingDetailsRef.current.delete(postKey);
        });
    });

    // Execute all fetches concurrently
    Promise.all(fetchPromises);
  }, [postsNeedingDetails, postDetails]);

  useEffect(() => {
    const missingOmniPosts = savedPosts.filter((post) => {
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
            console.error('Failed to refresh saved Omni post details', fetchError);
          })
          .finally(() => {
            fetchingOmniDetailsRef.current.delete(post.id);
          })
      )
    );
  }, [savedPosts, omniPostDetails]);

  const invalidateSavedQueries = () => {
    queryClient.invalidateQueries({ queryKey: ['saved-items', 'all'] });
    queryClient.invalidateQueries({ queryKey: ['saved-items', 'reddit_posts'] });
  };

  const unsaveRedditPostMutation = useMutation({
    mutationFn: async ({ subreddit, reddit_post_id }: { subreddit: string; reddit_post_id: string }) => {
      await savedService.unsaveRedditPost(subreddit, reddit_post_id);
    },
    onSuccess: () => {
      invalidateSavedQueries();
    },
    onError: (mutationError: Error) => {
      alert(`Failed to unsave post: ${mutationError.message}`);
    },
  });

  const unsavePostMutation = useMutation({
    mutationFn: async (postId: number) => {
      await savedService.unsavePost(postId);
    },
    onSuccess: () => {
      invalidateSavedQueries();
    },
    onError: (mutationError: Error) => {
      alert(`Failed to unsave post: ${mutationError.message}`);
    },
  });

  const hideRedditPostMutation = useMutation({
    mutationFn: async ({ subreddit, reddit_post_id }: { subreddit: string; reddit_post_id: string }) => {
      // Unsave and hide concurrently for better performance
      await Promise.all([
        savedService.unsaveRedditPost(subreddit, reddit_post_id),
        savedService.hideRedditPost(subreddit, reddit_post_id),
      ]);
    },
    onSuccess: () => {
      invalidateSavedQueries();
      queryClient.invalidateQueries({ queryKey: ['hidden-items', 'reddit_posts'] });
      setHideTargetPost(null);
    },
    onError: (mutationError) => {
      alert(`Failed to hide post: ${mutationError.message}`);
    },
  });

  const visibleSavedRedditPosts = useMemo(
    () =>
      savedRedditPosts.filter((post) => {
        const postKey = `${post.subreddit}-${post.reddit_post_id}`;
        return !hiddenRedditPostIds.has(postKey);
      }),
    [savedRedditPosts, hiddenRedditPostIds]
  );

  const handleShareRedditPost = (post: SavedRedditPost) => {
    const shareUrl = `${window.location.origin}/r/${post.subreddit}/comments/${post.reddit_post_id}`;
    navigator.clipboard
      .writeText(shareUrl)
      .then(() => alert('Post link copied to clipboard!'))
      .catch(() => alert('Unable to copy link. Please try again.'));
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

  const omniItems = [
    ...savedPosts.map((post) => ({
      key: `omni-post-${post.id}`,
      timestamp: toTimestamp(post.crossposted_at ?? post.created_at),
      node: (() => {
        const savedPostExtras = post as SavedPost & Partial<PlatformPost>;
        const detailedPost = omniPostDetails[post.id];
        const omniPost: PlatformPost = {
          id: post.id,
          title: detailedPost?.title ?? post.title,
          author_id: detailedPost?.author_id ?? savedPostExtras.author_id ?? 0,
          author_username:
            detailedPost?.author_username ??
            post.author_username ??
            savedPostExtras.author_username ??
            'Unknown',
          hub_name: detailedPost?.hub_name ?? post.hub_name ?? savedPostExtras.hub_name ?? 'unknown',
          score: detailedPost?.score ?? post.score,
          comment_count:
            detailedPost?.comment_count ??
            detailedPost?.num_comments ??
            post.comment_count ??
            savedPostExtras.comment_count ??
            0,
          crossposted_at:
            detailedPost?.crossposted_at ??
            post.crossposted_at ??
            savedPostExtras.crossposted_at ??
            null,
          created_at:
            detailedPost?.created_at ??
            post.created_at ??
            savedPostExtras.created_at ??
            new Date().toISOString(),
          body: detailedPost?.body ?? savedPostExtras.body ?? null,
          media_url: detailedPost?.media_url ?? savedPostExtras.media_url ?? null,
          media_type: detailedPost?.media_type ?? savedPostExtras.media_type ?? null,
          thumbnail_url: detailedPost?.thumbnail_url ?? savedPostExtras.thumbnail_url ?? null,
          nsfw: detailedPost?.nsfw ?? savedPostExtras.nsfw ?? undefined,
          target_subreddit: detailedPost?.target_subreddit ?? savedPostExtras.target_subreddit ?? null,
          hub_display_title:
            detailedPost?.hub_display_title ?? savedPostExtras.hub_display_title ?? null,
          hub_id: detailedPost?.hub_id ?? savedPostExtras.hub_id ?? null,
        };
        const isSavePending =
          unsavePostMutation.isPending && unsavePostMutation.variables === post.id;

        return (
          <HubPostCard
            post={omniPost}
            useRelativeTime={useRelativeTime}
            currentUserId={user?.id}
            currentUserRole={user?.role}
            hubDisplayTitle={omniPost.hub_display_title ?? null}
            isSaved={true}
            isSavePending={isSavePending}
            onShare={() => {
              const shareUrl = `${window.location.origin}${getPostUrl(omniPost)}`;
              navigator.clipboard
                .writeText(shareUrl)
                .then(() => alert('Post link copied to clipboard!'))
                .catch(() => alert('Unable to copy link. Please try again.'));
            }}
            onToggleSave={(shouldSave) => {
              if (!shouldSave) {
                unsavePostMutation.mutate(post.id);
              }
            }}
          />
        );
      })(),
    })),
    ...savedSiteComments.map((comment) => ({
      key: `omni-comment-${comment.comment_id}`,
      timestamp: toTimestamp(comment.created_at),
      node: (
        <article className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <div className="mb-2 text-[11px] font-semibold uppercase text-[var(--color-text-muted)]">
            Omni Comment
          </div>
          <div className="text-xs text-[var(--color-text-secondary)]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">u/{comment.username}</span>
              <span>•</span>
              <span>{new Date(comment.created_at).toLocaleString()}</span>
            </div>
            <div className="mt-1">
              <span className="font-semibold">Post:</span>{' '}
              <Link to={getPostUrl({ id: comment.post_id, target_subreddit: null, hub_name: comment.hub_name })} className="text-[var(--color-primary)] hover:underline">
                {comment.post_title}
              </Link>
            </div>
          </div>
          <p className="mt-2 text-sm text-[var(--color-text-primary)]">{comment.content}</p>
          <div className="mt-3 flex items-center gap-4 text-xs text-[var(--color-text-secondary)]">
            <span>{comment.score} points</span>
            <Link
              to={getPostCommentUrl({ id: comment.post_id, target_subreddit: null, hub_name: comment.hub_name }, comment.comment_id)}
              className="text-[var(--color-primary)] hover:underline"
            >
              View thread →
            </Link>
          </div>
        </article>
      ),
    })),
  ].sort((a, b) => b.timestamp - a.timestamp);

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

  const redditItems = [
    ...visibleSavedRedditPosts.map((post) => ({
      key: `reddit-post-${post.subreddit}-${post.reddit_post_id}`,
      timestamp: toTimestamp(post.saved_at),
      node: (() => {
        const postKey = `${post.subreddit}-${post.reddit_post_id}`;
        const mergedPost = { ...post, ...(postDetails[postKey] ?? {}) };
        const isSaved = true; // Always saved in this view
        const isSaveActionPending = unsaveRedditPostMutation.isPending &&
          unsaveRedditPostMutation.variables?.subreddit === post.subreddit &&
          unsaveRedditPostMutation.variables?.reddit_post_id === post.reddit_post_id;

        // Transform SavedRedditPost to match RedditPostCard's expected shape
        const redditPost = {
          id: post.reddit_post_id,
          title: mergedPost.title || `r/${post.subreddit}`,
          author: mergedPost.author || 'unknown',
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
            isSaveActionPending={isSaveActionPending}
            pendingShouldSave={false}
            onShare={() => handleShareRedditPost(mergedPost)}
            onToggleSave={() => unsaveRedditPostMutation.mutate({
              subreddit: post.subreddit,
              reddit_post_id: post.reddit_post_id,
            })}
            onHide={() => setHideTargetPost(post)}
            onCrosspost={() => navigate(`/r/${post.subreddit}/comments/${post.reddit_post_id}`)}
            linkState={originState}
          />
        );
      })(),
    })),
    ...savedRedditComments.map((comment) => ({
      key: `reddit-comment-${comment.id}`,
      timestamp: toTimestamp(comment.created_at),
      node: (() => {
        const permalink = `/r/${comment.subreddit}/comments/${comment.reddit_post_id}/${comment.id}`;
        return (
          <article className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <div className="mb-2 text-[11px] font-semibold uppercase text-[var(--color-text-muted)]">
              Reddit Comment
            </div>
            <div className="text-xs text-[var(--color-text-secondary)]">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">u/{comment.username}</span>
                <span>•</span>
                <span>{new Date(comment.created_at).toLocaleString()}</span>
              </div>
              {comment.reddit_post_title && (
                <div className="mt-1">
                  <span className="font-semibold">Post:</span> <span>{comment.reddit_post_title}</span>
                </div>
              )}
            </div>
            <p className="mt-2 text-sm text-[var(--color-text-primary)]">{comment.content}</p>
            <div className="mt-3 flex items-center gap-4 text-xs text-[var(--color-text-secondary)]">
              <span>{comment.score} points</span>
              <Link to={permalink} className="text-[var(--color-primary)] hover:underline">
                View thread →
              </Link>
            </div>
          </article>
        );
      })(),
    })),
    ...savedRedditAPIComments.map((comment) => ({
      key: `reddit-api-comment-${comment.reddit_comment_id}`,
      timestamp: toTimestamp(comment.saved_at),
      node: (() => {
        const permalink = `/r/${comment.subreddit}/comments/${comment.reddit_post_id}`;
        return (
          <article className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <div className="mb-2 text-[11px] font-semibold uppercase text-[var(--color-text-muted)]">
              Reddit Comment
            </div>
            <div className="text-xs text-[var(--color-text-secondary)]">
              <div className="mb-1">
                on <Link to={permalink} className="text-[var(--color-primary)] hover:underline">{comment.post_title || 'a post'}</Link>{comment.post_author && ` by u/${comment.post_author}`} in r/{comment.subreddit}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">u/{comment.comment_author}</span>
                <span>•</span>
                <span>{comment.score} pts</span>
                {comment.created_utc && (
                  <>
                    <span>•</span>
                    <span>{new Date(comment.created_utc * 1000).toLocaleString()}</span>
                  </>
                )}
              </div>
            </div>
            <p className="mt-2 text-sm text-[var(--color-text-primary)] whitespace-pre-wrap">{comment.comment_body}</p>
            <div className="mt-3 flex items-center gap-4 text-xs">
              <button
                onClick={() => savedService.unsaveRedditAPIComment(comment.reddit_comment_id).then(() => invalidateSavedQueries())}
                className="text-[var(--color-text-muted)] hover:text-cyan-500 transition-colors"
              >
                Unsave
              </button>
              <Link to={permalink} className="text-[var(--color-primary)] hover:underline">
                Full comments →
              </Link>
            </div>
          </article>
        );
      })(),
    })),
  ].sort((a, b) => b.timestamp - a.timestamp);

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

  // Filter items based on content type and source
  const filteredItems = useMemo(() => {
    let items: typeof omniItems = [];

    // Determine which source items to include
    if (sourceFilter === 'both') {
      items = [...omniItems, ...redditItems];
    } else if (sourceFilter === 'omni') {
      items = omniItems;
    } else if (sourceFilter === 'reddit') {
      items = redditItems;
    }

    // Filter by content type
    if (contentType === 'posts') {
      items = items.filter(item =>
        item.key.includes('-post-') ||
        (item.key.includes('reddit-post-') && !item.key.includes('reddit-api-comment-'))
      );
    } else if (contentType === 'comments') {
      items = items.filter(item => item.key.includes('-comment-'));
    }
    // If contentType === 'both', don't filter by type

    return items.sort((a, b) => b.timestamp - a.timestamp);
  }, [omniItems, redditItems, contentType, sourceFilter]);

  const {
    currentItems: pagedItems,
    pageIndex,
    totalPages,
    canGoPrev,
    canGoNext,
    goToPrev,
    goToNext,
    resetPage,
  } = usePagination(filteredItems, PAGE_SIZE);

  const renderContent = () => {
    if (filteredItems.length === 0) {
      const typeText = contentType === 'both' ? 'items' : contentType === 'posts' ? 'posts' : 'comments';
      const sourceText = sourceFilter === 'both' ? 'Omni or Reddit' : sourceFilter === 'omni' ? 'Omni' : 'Reddit';
      return <p className="text-sm text-[var(--color-text-secondary)]">No saved {sourceText} {typeText} yet.</p>;
    }

    return (
      <>
        <div className="space-y-3">
          {pagedItems.map((item) => (
            <Fragment key={item.key}>{item.node}</Fragment>
          ))}
        </div>
        <PaginationControls
          pageIndex={pageIndex}
          totalPages={totalPages}
          onPrev={goToPrev}
          onNext={goToNext}
          canGoPrev={canGoPrev}
          canGoNext={canGoNext}
        />
      </>
    );
  };

  const contentTypeButtonClass = (type: ContentType) =>
    `flex-1 rounded-md px-4 py-2 text-sm font-semibold transition ${
      contentType === type
        ? 'bg-[var(--color-primary)] text-white shadow'
        : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
    }`;

  const sourceFilterButtonClass = (filter: SourceFilter) =>
    `flex-1 rounded-md px-4 py-2 text-sm font-semibold transition ${
      sourceFilter === filter
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
          <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">Saved Items</h1>
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
            Posts, comments, and replies you&apos;ve saved across OmniNudge.
          </p>
        </div>
      )}

      <div className="mb-6 flex flex-wrap gap-4">
        {/* Content Type Toggle */}
        <div className="inline-flex rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-1">
          <button
            type="button"
            className={contentTypeButtonClass('posts')}
            onClick={() => {
              setContentType('posts');
              resetPage();
            }}
          >
            Posts
          </button>
          <button
            type="button"
            className={contentTypeButtonClass('comments')}
            onClick={() => {
              setContentType('comments');
              resetPage();
            }}
          >
            Comments
          </button>
          <button
            type="button"
            className={contentTypeButtonClass('both')}
            onClick={() => {
              setContentType('both');
              resetPage();
            }}
          >
            Both
          </button>
        </div>

        {/* Source Filter */}
        <div className="inline-flex rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-1">
          <button
            type="button"
            className={sourceFilterButtonClass('omni')}
            onClick={() => {
              setSourceFilter('omni');
              resetPage();
            }}
          >
            Omni
          </button>
          <button
            type="button"
            className={sourceFilterButtonClass('reddit')}
            onClick={() => {
              setSourceFilter('reddit');
              resetPage();
            }}
          >
            Reddit
          </button>
          <button
            type="button"
            className={sourceFilterButtonClass('both')}
            onClick={() => {
              setSourceFilter('both');
              resetPage();
            }}
          >
            Both
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <LoadingMessage className="mt-0 text-sm">Loading saved content...</LoadingMessage>
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4">
          <ErrorMessage className="mt-0 text-sm text-red-800">Unable to load saved items.</ErrorMessage>
        </div>
      )}

      {!isLoading && !error && notifyRemovedSavedPosts && !removedNoticeDismissed && autoRemovedRedditPosts.length > 0 && (
        <div className="mb-4 rounded-md border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-900">
          <div className="flex items-start justify-between gap-4">
            <div>
              {autoRemovedRedditPosts.length === 1 ? (
                <span>1 saved Reddit post was removed by moderators and has been cleaned up.</span>
              ) : (
                <span>
                  {autoRemovedRedditPosts.length} saved Reddit posts were removed by moderators and have been cleaned up.
                </span>
              )}
              <div className="mt-1 text-xs">
                <Link to="/settings" className="text-[var(--color-primary)] hover:underline">
                  Manage this alert in Settings
                </Link>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setRemovedNoticeDismissed(true)}
              className="rounded border border-yellow-400 px-2 py-1 text-xs font-semibold text-yellow-900 hover:bg-yellow-100"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {!isLoading && !error && renderContent()}
    </>
  );

  return (
    <>
      <div className={wrapperClassName}>{content}</div>

      {hideTargetPost && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-lg">
            <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">Hide this post?</h3>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              Hiding this post will remove it from your Saved list and add it to your Hidden items. Are you
              sure you want to continue?
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setHideTargetPost(null)}
                className="rounded border border-[var(--color-border)] px-3 py-1 text-sm hover:bg-[var(--color-surface-elevated)]"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  hideTargetPost &&
                  hideRedditPostMutation.mutate({
                    subreddit: hideTargetPost.subreddit,
                    reddit_post_id: hideTargetPost.reddit_post_id,
                  })
                }
                disabled={hideRedditPostMutation.isPending}
                className="rounded bg-[var(--color-primary)] px-3 py-1 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)] disabled:opacity-50"
              >
                {hideRedditPostMutation.isPending ? 'Hiding...' : 'Hide Post'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default SavedItemsView;
