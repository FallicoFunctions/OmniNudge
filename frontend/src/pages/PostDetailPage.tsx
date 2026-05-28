import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useFormat } from '../hooks/useFormat';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { postsService } from '../services/postsService';
import { hubsService } from '../services/hubsService';
import { savedService } from '../services/savedService';
import { buildUserReport, reportService } from '../services/reportService';
import { moderationService } from '../services/moderationService';
import { subscriptionService } from '../services/subscriptionService';
import type { PlatformPost, PostComment } from '../types/posts';
import { CommentItem } from '../components/comments/CommentItem';
import type { CommentActionHandlers } from '../components/comments/CommentItem';
import { MarkdownInput } from '../components/common/MarkdownInput';
import { PostBodyMarkdown } from '../components/posts/PostBodyMarkdown';
import { FormattingHelpTable } from '../components/common/FormattingHelpTable';
import { decodeHtmlEntities } from '../utils/text';
import { VoteButtons } from '../components/VoteButtons';
import { ModMailModal } from '../components/modmail/ModMailModal';
import HubModeratorsPanel from '../components/hubs/HubModeratorsPanel';
import HubAboutPanel from '../components/hubs/HubAboutPanel';
import { useHubModerators } from '../hooks/useHubModerators';
import { useHubDetails } from '../hooks/useHubDetails';
import { useHubSettings } from '../hooks/useHubSettings';
import { Panel } from '../components/common/Panel';
import SubredditAboutPanel from '../components/reddit/SubredditAboutPanel';
import { useSubredditAbout } from '../hooks/useSubredditAbout';
import { useSavedItems } from '../hooks/useSavedItems';
import {
  getSavedCommentIdSet,
  getSavedPostIdSet,
  invalidateHiddenItemsQueries,
  invalidateSavedItemsQueries,
  markPlatformPostSaved,
  markPlatformPostUnsaved,
} from '../utils/savedItems';
import { PostCardSkeleton, CommentSkeleton } from '../components/common/LoadingStates';
import { PostDetailMedia } from '../components/posts/PostDetailMedia';
import { PostHeader } from '../components/posts/PostHeader';
import { canModerateContent } from '../utils/permissions';
import { isUserHubModerator } from '../utils/moderation';
import { PostEditModal } from '../components/posts/PostEditModal';
import { CommunityHeader } from '../components/common/CommunityHeader';
import { MobileOnly } from '../components/common/MobileOnly';
import { FeedSearchBars } from '../components/common/FeedSearchBars';
import NotFoundPage from './NotFoundPage';
import { SubredditSuggestionItem } from '../components/subreddit/SubredditSuggestionItem';
import { useSubredditAutocomplete } from '../hooks/useSubredditAutocomplete';
import { SubredditModeratorsPanel } from '../components/subreddit/SubredditModeratorsPanel';
import { useSubredditActiveUsers } from '../hooks/useSubredditActiveUsers';
import { useHubActiveUsers } from '../hooks/useHubActiveUsers';
import { buildPostUpdateRequest } from '../utils/postUpdate';
import { useHubSubredditAutocomplete } from '../hooks/useHubSubredditAutocomplete';
import { CombinedSuggestionItem } from '../components/common/CombinedSuggestionItem';
import HubAIDesignLayout from '../components/hubDesign/HubAIDesignLayout';
import { useActiveHubAIDesign } from '../hooks/useActiveHubAIDesign';
import { splitAIDesignHTML } from '../utils/splitAIDesignHTML';

export default function PostDetailPage() {
  const { postId, commentId, hubname, subreddit } = useParams<{
    postId: string;
    commentId?: string;
    hubname?: string;
    subreddit?: string;
  }>();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { t } = useTranslation();
  const { formatNumber, formatDate, formatRelativeTime } = useFormat();
  const { useRelativeTime, stayOnPostAfterHide, searchIncludeNsfwByDefault, blockAllNsfw } =
    useSettings();

  const formatSubmittedAt = (timestamp: string | number | Date) => {
    const d = new Date(timestamp);
    if (Number.isNaN(d.getTime())) return t('common.time.recently');

    if (useRelativeTime) {
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

  const [commentText, setCommentText] = useState('');
  const [showFormattingHelp, setShowFormattingHelp] = useState(false);
  const [replyingTo, setReplyingTo] = useState<number | null>(null);
  const [embedTarget, setEmbedTarget] = useState<PostComment | null>(null);
  const [embedCopied, setEmbedCopied] = useState(false);
  const [imageExpanded, setImageExpanded] = useState(false);
  const [showModMailModal, setShowModMailModal] = useState(false);
  const [deleteCommentTarget, setDeleteCommentTarget] = useState<{
    commentId: number;
    authorId: number;
  } | null>(null);
  const [deleteCommentReason, setDeleteCommentReason] = useState('');
  const [deletePostTarget, setDeletePostTarget] = useState<{
    postId: number;
    authorId: number;
  } | null>(null);
  const [deletePostReason, setDeletePostReason] = useState('');
  const [editPostTarget, setEditPostTarget] = useState<PlatformPost | null>(null);
  const [subredditInputValue, setSubredditInputValue] = useState('');
  const [isAutocompleteOpen, setIsAutocompleteOpen] = useState(false);
  const [postSearchInput, setPostSearchInput] = useState('');
  const [isSearchDropdownOpen, setIsSearchDropdownOpen] = useState(false);
  const [limitSearchToContext, setLimitSearchToContext] = useState(true);
  const [includeNsfwSearch, setIncludeNsfwSearch] = useState(false);
  const [hubInputValue, setHubInputValue] = useState('');
  const [hubIsAutocompleteOpen, setHubIsAutocompleteOpen] = useState(false);
  const [hubPostSearchInput, setHubPostSearchInput] = useState('');
  const [hubIsSearchDropdownOpen, setHubIsSearchDropdownOpen] = useState(false);
  const [hubLimitSearchToContext, setHubLimitSearchToContext] = useState(true);
  const [hubIncludeNsfwSearch, setHubIncludeNsfwSearch] = useState(false);

  const parsedPostId = postId ? Number(postId) : NaN;
  const focusedCommentId = commentId ? Number(commentId) : null;

  type PostResponse = PlatformPost | { post: PlatformPost };
  const {
    data: postDataRaw,
    isLoading: loadingPost,
    isError: postLoadError,
    error: postLoadErrorDetails,
  } = useQuery<PostResponse>({
    queryKey: ['posts', parsedPostId, hubname ?? ''],
    queryFn: async () => {
      const response = await postsService.getPost(parsedPostId, hubname);
      return response;
    },
    enabled: Number.isFinite(parsedPostId),
    retry: false,
  });

  // Unwrap the response if it's wrapped in a "post" property
  const postData = useMemo<PlatformPost | null>(() => {
    if (!postDataRaw) return null;
    const unwrapped = 'post' in postDataRaw ? postDataRaw.post : postDataRaw;
    return unwrapped;
  }, [postDataRaw]);
  const decodedTitle = postData ? decodeHtmlEntities(postData.title) : '';
  const hubName = useMemo(() => postData?.hub?.name ?? postData?.hub_name, [postData]);
  const isHubPost = Boolean(hubName);
  const { data: aiDesignData } = useActiveHubAIDesign(hubName, Boolean(hubName));
  const activeAIDesign = aiDesignData?.design ?? null;
  const supportsHubAIDesignShell = useMemo(() => {
    if (!hubName || !activeAIDesign?.html_content) return false;
    return Array.from(splitAIDesignHTML(activeAIDesign.html_content).slotsByMarker.values()).some(
      (slot) => slot.id === 'hub-content' || slot.id === 'hub-feed',
    );
  }, [activeAIDesign?.html_content, hubName]);
  const targetSubreddit = useMemo(
    () => postData?.target_subreddit ?? postData?.crosspost_origin_subreddit ?? null,
    [postData]
  );
  // Use URL param as fallback for posts accessed via /r/:subreddit/comments/:postId
  // This handles old posts (created before migration 024) that have target_subreddit = NULL
  const normalizedSubreddit = targetSubreddit?.trim() || subreddit?.trim() || '';

  useEffect(() => {
    if (!normalizedSubreddit) return;
    setIncludeNsfwSearch(!blockAllNsfw && searchIncludeNsfwByDefault);
    setLimitSearchToContext(true);
  }, [blockAllNsfw, normalizedSubreddit, searchIncludeNsfwByDefault]);

  const {
    trimmedInput: trimmedSubredditInput,
    suggestions: subredditSuggestions,
    isLoading: isAutocompleteLoading,
    shouldShowSuggestions,
  } = useSubredditAutocomplete(subredditInputValue, isAutocompleteOpen);

  const navigateToSubreddit = (value: string) => {
    const normalized = value.trim();
    if (!normalized) return;
    navigate(`/r/${normalized}`);
    setIsAutocompleteOpen(false);
  };

  const handleSubredditSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!trimmedSubredditInput) return;
    navigateToSubreddit(trimmedSubredditInput);
    setSubredditInputValue('');
  };

  const handleSubredditInputChange = (value: string) => {
    setSubredditInputValue(value);
    if (!isAutocompleteOpen) {
      setIsAutocompleteOpen(true);
    }
  };

  const handleSelectSubredditSuggestion = (name: string) => {
    navigateToSubreddit(name);
    setSubredditInputValue('');
    setIsAutocompleteOpen(false);
  };

  const handlePostSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = postSearchInput.trim();
    if (!query || !normalizedSubreddit) return;
    if (limitSearchToContext) {
      navigate(`/r/${normalizedSubreddit}`, { state: { scopedSearchQuery: query } });
      return;
    }
    navigate(
      `/search?q=${encodeURIComponent(query)}&sort=relevance${includeNsfwSearch && !blockAllNsfw ? '&include_nsfw=true' : ''}`
    );
  };

  useEffect(() => {
    if (!hubName) return;
    setHubIncludeNsfwSearch(!blockAllNsfw && searchIncludeNsfwByDefault);
    setHubLimitSearchToContext(true);
  }, [blockAllNsfw, hubName, searchIncludeNsfwByDefault]);

  const {
    trimmedInput: trimmedHubInput,
    suggestions: hubSuggestions,
    isLoading: isHubAutocompleteLoading,
    shouldShowSuggestions: shouldShowHubSuggestions,
  } = useHubSubredditAutocomplete(hubInputValue, hubIsAutocompleteOpen);

  const navigateToHubOrSubreddit = async (value: string) => {
    const normalized = value.trim();
    if (!normalized) return;
    try {
      await hubsService.getHub(normalized);
      navigate(`/h/${normalized}`);
    } catch {
      navigate(`/r/${normalized}`);
    }
    setHubIsAutocompleteOpen(false);
  };

  const handleHubSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!trimmedHubInput) return;
    await navigateToHubOrSubreddit(trimmedHubInput);
    setHubInputValue('');
  };

  const handleHubInputChange = (value: string) => {
    setHubInputValue(value);
    if (!hubIsAutocompleteOpen) {
      setHubIsAutocompleteOpen(true);
    }
  };

  const handleSelectHubSuggestion = (name: string) => {
    navigate(`/h/${name}`);
    setHubInputValue('');
    setHubIsAutocompleteOpen(false);
  };

  const handleSelectHubSubredditSuggestion = (name: string) => {
    navigate(`/r/${name}`);
    setHubInputValue('');
    setHubIsAutocompleteOpen(false);
  };

  const handleHubPostSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = hubPostSearchInput.trim();
    if (!query || !hubName) return;
    if (hubLimitSearchToContext) {
      navigate(`/h/${hubName}`, { state: { scopedSearchQuery: query } });
      return;
    }
    navigate(
      `/search?q=${encodeURIComponent(query)}&sort=relevance${hubIncludeNsfwSearch && !blockAllNsfw ? '&include_nsfw=true' : ''}`
    );
  };

  const commentsQueryKey = ['posts', parsedPostId, 'comments'] as const;
  const { data: postComments, isLoading: loadingComments } = useQuery<PostComment[]>({
    queryKey: commentsQueryKey,
    queryFn: async () => {
      const response = await postsService.getComments(parsedPostId);
      console.log('[PostDetailPage] Comments response:', response);
      return response;
    },
    enabled: Number.isFinite(parsedPostId) && !postLoadError,
  });
  const commentsList = useMemo(() => postComments ?? [], [postComments]);

  const { data: subredditSubscriptionStatus } = useQuery({
    queryKey: ['subreddit-subscription', normalizedSubreddit],
    queryFn: () => subscriptionService.checkSubredditSubscription(normalizedSubreddit),
    enabled:
      !!user &&
      !!normalizedSubreddit &&
      normalizedSubreddit !== 'popular' &&
      normalizedSubreddit !== 'frontpage',
    staleTime: 1000 * 60 * 5,
  });

  const savedSiteCommentsKey = ['saved-items', 'post_comments'] as const;
  const { data: savedPostsData } = useSavedItems('posts', !!user);
  const { data: savedSiteCommentsData } = useSavedItems('post_comments', !!user, 1000 * 60 * 5);

  const savedPostIds = useMemo(() => getSavedPostIdSet(savedPostsData), [savedPostsData]);
  const isPostSaved = useMemo(
    () => Number.isFinite(parsedPostId) && savedPostIds.has(parsedPostId),
    [parsedPostId, savedPostIds]
  );

  const savedCommentIds = useMemo(
    () => getSavedCommentIdSet(savedSiteCommentsData),
    [savedSiteCommentsData]
  );

  const handleCreateComment = useMutation({
    mutationFn: (content: string) =>
      postsService.createComment(parsedPostId, { body: content, parent_comment_id: undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: commentsQueryKey });
      setCommentText('');
    },
  });

  const savePostMutation = useMutation({
    mutationFn: async (shouldSave: boolean) => {
      if (!user) {
        throw new Error(t('alerts.signInToSave'));
      }
      if (!Number.isFinite(parsedPostId)) {
        throw new Error(t('posts.errors.invalidPost'));
      }
      if (shouldSave) {
        await savedService.savePost(parsedPostId);
      } else {
        await savedService.unsavePost(parsedPostId);
      }
    },
    onSuccess: (_data, shouldSave) => {
      if (postData) {
        if (shouldSave) {
          markPlatformPostSaved(queryClient, postData);
        } else {
          markPlatformPostUnsaved(queryClient, parsedPostId);
        }
      }
    },
  });

  const hidePostMutation = useMutation({
    mutationFn: async () => {
      if (!user) {
        throw new Error(t('alerts.signInToHide'));
      }
      if (!Number.isFinite(parsedPostId)) {
        throw new Error(t('posts.errors.invalidPost'));
      }
      await savedService.hidePost(parsedPostId);
      await invalidateSavedItemsQueries(queryClient);
    },
    onSuccess: () => {
      invalidateHiddenItemsQueries(queryClient);
    },
  });

  const updatePostMutation = useMutation<
    PlatformPost,
    Error,
    { post: PlatformPost; title: string; body: string }
  >({
    mutationFn: async ({ post, title, body }) =>
      postsService.updatePost(post.id, buildPostUpdateRequest(post, { title, body })),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['posts', variables.post.id] });
      if (hubName) {
        queryClient.invalidateQueries({ queryKey: ['hub-posts', hubName] });
      }
      setEditPostTarget(null);
    },
    onError: (err) => {
      alert(t('alerts.updatePostFailed', { message: err.message }));
    },
  });

  const commentHandlers: CommentActionHandlers<PostComment> = {
    vote: async (comment, value) => {
      await postsService.voteComment(comment.id, value);
      await queryClient.invalidateQueries({ queryKey: commentsQueryKey });
    },
    reply: async (comment, text) => {
      await postsService.createComment(parsedPostId, { body: text, parent_comment_id: comment.id });
      await queryClient.invalidateQueries({ queryKey: commentsQueryKey });
    },
    edit: async (comment, text) => {
      await postsService.updateComment(comment.id, text);
      await queryClient.invalidateQueries({ queryKey: commentsQueryKey });
    },
    remove: async (comment) => {
      // Check if this is a moderator action (deleting someone else's comment)
      const isModeratorAction = user && comment.user_id !== user.id;

      if (isModeratorAction) {
        // Show reason modal for moderator actions
        setDeleteCommentTarget({ commentId: comment.id, authorId: comment.user_id });
      } else {
        // For own comments, just confirm and delete
        if (!window.confirm(t('modals.delete.confirmComment'))) {
          return;
        }
        await postsService.deleteComment(comment.id);
        await queryClient.invalidateQueries({ queryKey: commentsQueryKey });
      }
    },
    toggleInbox: async (comment, nextValue) => {
      await postsService.toggleCommentInbox(parsedPostId, comment.id, nextValue);
      await queryClient.invalidateQueries({ queryKey: commentsQueryKey });
    },
    toggleSave: async (comment, shouldSave) => {
      if (shouldSave) {
        await savedService.savePostComment(comment.id);
      } else {
        await savedService.unsavePostComment(comment.id);
      }
      await queryClient.invalidateQueries({ queryKey: savedSiteCommentsKey });
    },
    report: async (comment) => {
      const reasonInput = window.prompt(t('reporting.reasonPrompt'));
      if (reasonInput === null) return;
      const detailsInput = window.prompt(t('reporting.detailsPrompt'));
      const { reason, description } = buildUserReport(reasonInput, detailsInput);
      await reportService.createReport({
        targetType: 'comment',
        targetId: comment.id,
        reason,
        description,
      });
      alert(t('reporting.success'));
    },
    permalink: (comment) => {
      const url = hubName
        ? `/h/${hubName}/comments/${postId}/${comment.id}`
        : `/posts/${postId}/comments/${comment.id}`;
      navigate(url);
    },
    embed: (comment) => {
      setEmbedCopied(false);
      setEmbedTarget(comment);
    },
  };

  const handleConfirmDeleteComment = async () => {
    if (!deleteCommentTarget) return;
    if (!deleteCommentReason.trim()) {
      alert(t('alerts.provideDeleteReason'));
      return;
    }
    try {
      await postsService.deleteComment(deleteCommentTarget.commentId, deleteCommentReason);
      await queryClient.invalidateQueries({ queryKey: commentsQueryKey });
      setDeleteCommentTarget(null);
      setDeleteCommentReason('');
    } catch (err) {
      alert(
        t('alerts.deleteCommentFailed', {
          message: err instanceof Error ? err.message : t('common.error'),
        })
      );
    }
  };

  const topLevelComments = useMemo(() => {
    console.log('[PostDetailPage] Computing topLevelComments, commentsList:', commentsList);
    console.log('[PostDetailPage] focusedCommentId:', focusedCommentId);
    if (focusedCommentId) {
      const target = commentsList.find((c) => c.id === focusedCommentId);
      return target ? [target] : [];
    }
    const filtered = commentsList.filter((c) => {
      console.log(
        '[PostDetailPage] Filtering comment:',
        c.id,
        'parent_comment_id:',
        c.parent_comment_id
      );
      return c.parent_comment_id === null || c.parent_comment_id === undefined;
    });
    console.log('[PostDetailPage] topLevelComments filtered result:', filtered);
    return filtered;
  }, [commentsList, focusedCommentId]);

  const totalCommentsCount = commentsList.length;
  const commentNotFound = Boolean(
    focusedCommentId && totalCommentsCount > 0 && topLevelComments.length === 0
  );

  const embedOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const embedPermalink =
    embedTarget && postId
      ? hubName
        ? `${embedOrigin}/h/${hubName}/comments/${postId}/${embedTarget.id}`
        : `${embedOrigin}/posts/${postId}/comments/${embedTarget.id}`
      : '';
  const embedCode = embedTarget
    ? `<iframe src="${embedPermalink}" width="600" height="250" frameborder="0"></iframe>`
    : '';

  const {
    data: hubDetails,
    isLoading: loadingHubDetails,
    isError: hubDetailsError,
  } = useHubDetails(hubName, Boolean(hubName));
  const { data: hubSettings } = useHubSettings(hubName, Boolean(hubName));
  const hubDisplayTitle = hubSettings?.display_title?.trim() || hubDetails?.title?.trim() || null;
  const { data: hubActiveUsersData } = useHubActiveUsers(hubName, user);

  const {
    moderators: hubModerators,
    isLoading: loadingHubModerators,
    isError: hubModeratorsError,
  } = useHubModerators(hubName, Boolean(hubName));

  // Check if current user is a moderator of this hub (or admin)
  const isModerator = useMemo(
    () => isUserHubModerator(user, hubModerators ?? [], hubDetails),
    [user, hubModerators, hubDetails]
  );

  const canEditPost = useMemo(() => {
    if (!postData) return false;
    return user?.id === postData.author_id;
  }, [postData, user]);
  const canDeletePost = useMemo(() => {
    if (!postData) return false;
    return canModerateContent(user?.id, postData.author_id, user?.role, isModerator);
  }, [postData, user, isModerator]);
  const canPinPost = Boolean(isHubPost && isModerator);

  const {
    data: subredditAbout,
    isLoading: loadingSubredditAbout,
    isError: subredditAboutError,
    iconUrl: subredditIcon,
  } = useSubredditAbout(targetSubreddit, Boolean(targetSubreddit));
  const { data: activeUsersData } = useSubredditActiveUsers(targetSubreddit, user);

  const bodyText = postData?.body ?? postData?.content ?? undefined;
  const mediaUrl = postData?.media_url ?? undefined;
  const thumbnailUrl = postData?.thumbnail_url ?? undefined;
  const isVideoMedia = (postData?.media_type ?? '').toLowerCase() === 'video';

  const copyEmbedCode = async () => {
    if (!embedCode) return;
    try {
      await navigator.clipboard.writeText(embedCode);
      setEmbedCopied(true);
    } catch {
      setEmbedCopied(false);
    }
  };

  const handleSharePost = async () => {
    if (!postData) return;
    try {
      await navigator.clipboard.writeText(window.location.href);
      alert(t('alerts.linkCopied'));
    } catch {
      alert(t('alerts.linkCopyFailed'));
    }
  };

  const handleSavePost = async () => {
    try {
      await savePostMutation.mutateAsync(!isPostSaved);
    } catch (error) {
      const err = error as Error;
      alert(t('alerts.saveFailed', { message: err.message }));
    }
  };

  const originPathFromState = (location.state as { originPath?: string } | undefined)?.originPath;

  const deletePostMutation = useMutation<void, Error, { postId: number; reason?: string }>({
    mutationFn: async ({ postId, reason }) => postsService.deletePost(postId, reason),
    onSuccess: () => {
      invalidateSavedItemsQueries(queryClient);
      invalidateHiddenItemsQueries(queryClient);
      setDeletePostTarget(null);
      setDeletePostReason('');
      navigate(originPathFromState ?? (hubName ? `/h/${hubName}` : '/'));
    },
    onError: (err) => {
      alert(t('alerts.deletePostFailed', { message: err.message }));
    },
  });

  const togglePinMutation = useMutation<void, Error, { postId: number; isPinned: boolean }>({
    mutationFn: async ({ postId, isPinned }) => {
      if (isPinned) {
        await moderationService.unpinPost(postId);
      } else {
        await moderationService.pinPost(postId);
      }
    },
    onSuccess: (_data, variables) => {
      if (hubName) {
        queryClient.invalidateQueries({ queryKey: ['hub-posts', hubName] });
      }
      queryClient.invalidateQueries({ queryKey: ['posts', variables.postId] });
    },
  });

  const handleDeletePost = () => {
    if (!postData) return;
    const isModeratorAction = user && postData.author_id !== user.id;
    if (isModeratorAction) {
      setDeletePostTarget({ postId: postData.id, authorId: postData.author_id });
      return;
    }
    if (!window.confirm(t('modals.delete.confirmOwn'))) {
      return;
    }
    deletePostMutation.mutate({ postId: postData.id });
  };

  const handleConfirmDeletePost = () => {
    if (!deletePostTarget) return;
    if (!deletePostReason.trim()) {
      alert(t('alerts.provideDeleteReason'));
      return;
    }
    deletePostMutation.mutate({ postId: deletePostTarget.postId, reason: deletePostReason });
  };

  const handleHidePost = async () => {
    if (!user) {
      alert(t('alerts.signInToHide'));
      return;
    }
    const shouldWarn = isPostSaved;
    const confirmed = shouldWarn
      ? confirm(t('modals.hide.confirmSaved'))
      : window.confirm(t('modals.hide.confirmSimple'));
    if (!confirmed) {
      return;
    }
    try {
      await hidePostMutation.mutateAsync();
      if (!stayOnPostAfterHide) {
        navigate(originPathFromState ?? '/hidden', { replace: true });
      }
    } catch (error) {
      const err = error as Error;
      alert(t('alerts.hideFailed', { message: err.message }));
    }
  };

  const handleCrosspost = async () => {
    // TODO: Implement crosspost functionality
    alert(t('posts.actions.crosspostSoon'));
  };

  if (!postId || Number.isNaN(parsedPostId)) {
    return (
      <div className="mx-auto max-w-4xl px-0 py-8 md:px-4">
        <div className="text-[var(--color-text-secondary)]">{t('posts.errors.invalidUrl')}</div>
      </div>
    );
  }

  if (loadingPost) {
    return (
      <div className="mx-auto max-w-4xl px-0 py-8 md:px-4">
        <PostCardSkeleton />
      </div>
    );
  }

  if (postLoadError) {
    const message =
      postLoadErrorDetails instanceof Error
        ? postLoadErrorDetails.message
        : t('posts.errors.loadFailed');
    if (message.toLowerCase().includes('not found')) {
      return <NotFoundPage />;
    }
    return (
      <div className="mx-auto max-w-4xl px-0 py-8 md:px-4">
        <div className="text-[var(--color-text-secondary)]">
          {t('posts.errors.loadFailed')}: {message}
        </div>
      </div>
    );
  }

  if (hubname && hubName && hubname.toLowerCase() !== hubName.toLowerCase()) {
    return <NotFoundPage />;
  }

  const postDetailMainContent = (
    <div className="mt-4 grid gap-6 px-4 md:px-0 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-6">
        {postData && (
          <Panel>
            <PostHeader
              title={decodedTitle}
              titleBadges={
                postData?.nsfw ? (
                  <span className="inline-flex items-center rounded bg-red-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                    {t('posts.badges.nsfw')}
                  </span>
                ) : undefined
              }
              metadataItems={[
                ...(hubName
                  ? [
                      <Link
                        key="hub"
                        to={`/h/${hubName}`}
                        className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                      >
                        {hubDisplayTitle ?? t('common.format.hubPath', { name: hubName })}
                      </Link>,
                    ]
                  : []),
                ...(targetSubreddit
                  ? [
                      <Link
                        key="subreddit"
                        to={`/r/${targetSubreddit}`}
                        className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                      >
                        {t('common.format.subredditPath', { name: targetSubreddit })}
                      </Link>,
                    ]
                  : []),
                <span key="author">
                  {t('posts.postedByLabel')}{' '}
                  <Link
                    to={`/users/${postData?.author?.username ?? postData?.author_username}`}
                    className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                  >
                    {postData?.author?.username ?? postData?.author_username}
                  </Link>
                </span>,
                <span key="submitted">
                  {t('posts.submittedAt', {
                    time: formatSubmittedAt(postData.crossposted_at ?? postData.created_at),
                  })}
                </span>,
              ]}
            />

            <PostDetailMedia
              mediaUrl={mediaUrl}
              thumbnailUrl={thumbnailUrl}
              galleryImages={postData?.gallery_images}
              decodedTitle={decodedTitle}
              isVideoMedia={isVideoMedia}
              imageExpanded={imageExpanded}
              onToggleExpanded={() => setImageExpanded((prev) => !prev)}
            />

            {bodyText && <PostBodyMarkdown content={bodyText} className="mb-4" />}

            <div className="flex flex-wrap items-center gap-4">
              <VoteButtons
                postId={postData.id}
                initialScore={postData.score}
                initialUserVote={postData.user_vote}
                layout="horizontal"
                size="medium"
              />
              <div className="flex flex-wrap gap-4 text-xs text-[var(--color-text-secondary)]">
                <span>
                  {t('posts.comment', {
                    count: postData.comment_count ?? postData.num_comments ?? 0,
                    formattedCount: formatNumber(postData.comment_count ?? postData.num_comments ?? 0),
                  })}
                </span>
                <span>•</span>
                <button onClick={handleSharePost} className="hover:underline">
                  {t('posts.actions.share')}
                </button>
                <span>•</span>
                <button
                  onClick={handleSavePost}
                  disabled={savePostMutation.isPending}
                  className="hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {savePostMutation.isPending
                    ? t('posts.status.saving')
                    : isPostSaved
                      ? t('posts.actions.unsave')
                      : t('posts.actions.save')}
                </button>
                <span>•</span>
                <button onClick={handleHidePost} className="hover:underline">
                  {t('posts.actions.hide')}
                </button>
                <span>•</span>
                <button onClick={handleCrosspost} className="hover:underline">
                  {t('posts.actions.crosspost')}
                </button>
                {canPinPost && postData && (
                  <>
                    <span>•</span>
                    <button
                      onClick={() =>
                        togglePinMutation.mutate({
                          postId: postData.id,
                          isPinned: Boolean(postData.is_pinned),
                        })
                      }
                      disabled={togglePinMutation.isPending}
                      className="hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {togglePinMutation.isPending
                        ? t('posts.status.updating')
                        : postData.is_pinned
                          ? t('posts.actions.unpin')
                          : t('posts.actions.pin')}
                    </button>
                  </>
                )}
                {canEditPost && (
                  <>
                    <span>•</span>
                    <button
                      onClick={() => postData && setEditPostTarget(postData)}
                      className="hover:underline"
                    >
                      {t('common.edit')}
                    </button>
                  </>
                )}
                {canDeletePost && (
                  <>
                    <span>•</span>
                    <button onClick={handleDeletePost} className="text-red-600 hover:underline">
                      {t('common.delete')}
                    </button>
                  </>
                )}
              </div>
            </div>
          </Panel>
        )}

        <Panel>
          <h2 className="mb-4 text-xl font-semibold text-[var(--color-text-primary)]">
            {t('comments.title')}
          </h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!user) {
                window.dispatchEvent(new CustomEvent('open-auth-modal', { detail: 'login' }));
                return;
              }
              if (!commentText.trim()) return;
              handleCreateComment.mutate(commentText.trim());
            }}
            className="mb-6"
          >
            <MarkdownInput
              label={t('comments.addComment')}
              value={commentText}
              onChange={setCommentText}
              placeholder={t('comments.shareThoughts')}
              rows={4}
            />
            <div className="mt-2 flex justify-start text-xs text-[var(--color-text-secondary)]">
              <button
                type="button"
                onClick={() => setShowFormattingHelp((prev) => !prev)}
                className="hover:text-[var(--color-primary)]"
              >
                {showFormattingHelp ? t('comments.formatting.hide') : t('comments.formatting.show')}
              </button>
            </div>
            {showFormattingHelp && (
              <div className="mt-2 w-[70%] rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-[13px] text-[var(--color-text-primary)] shadow-sm">
                <p className="text-sm text-[var(--color-text-primary)]">
                  {t('comments.formatting.description')}{' '}
                  <a
                    href="https://www.markdownguide.org/basic-syntax/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--color-primary)] underline"
                  >
                    {t('comments.formatting.markdownLinkText')}
                  </a>{' '}
                  {t('comments.formatting.descriptionSuffix')}
                </p>
                <div className="mt-2">
                  <FormattingHelpTable />
                </div>
              </div>
            )}
            <button
              type="submit"
              disabled={handleCreateComment.isPending || !commentText.trim()}
              className="mt-2 rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)] disabled:opacity-50"
            >
              {handleCreateComment.isPending ? t('comments.status.posting') : t('comments.addComment')}
            </button>
          </form>

          {loadingComments && (
            <div className="space-y-3">
              <CommentSkeleton showReplies={true} />
              <CommentSkeleton showReplies={true} />
              <CommentSkeleton showReplies={false} />
            </div>
          )}

          {commentNotFound && (
            <div className="mb-4 rounded border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-900">
              {t('comments.errors.notFound')}
            </div>
          )}

          {focusedCommentId && !commentNotFound && (
            <div className="mb-4 rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
              <div>{t('posts.viewingThread')}</div>
              <button
                onClick={() => navigate(hubName ? `/h/${hubName}/comments/${postId}` : `/posts/${postId}`)}
                className="mt-1 font-semibold text-[var(--color-primary)] hover:underline"
              >
                {t('comments.viewRest')}
              </button>
            </div>
          )}

          {commentsList.length === 0 && !loadingComments && (
            <div className="text-sm text-[var(--color-text-secondary)]">
              {t('comments.emptyBeFirstOnPost')}
            </div>
          )}

          {topLevelComments.length > 0 && (
            <div className="space-y-4">
              {topLevelComments.map((comment) => (
                <CommentItem
                  key={comment.id}
                  comment={comment}
                  allComments={commentsList}
                  replyingTo={replyingTo}
                  onReplySelect={(commentId) => {
                    if (!user) {
                      window.dispatchEvent(new CustomEvent('open-auth-modal', { detail: 'login' }));
                      return;
                    }
                    setReplyingTo(commentId);
                  }}
                  onCancelReply={() => setReplyingTo(null)}
                  handlers={commentHandlers}
                  savedCommentIds={savedCommentIds}
                  currentUsername={user?.username}
                  currentUserRole={user?.role}
                  isModerator={isModerator}
                />
              ))}
            </div>
          )}
        </Panel>
      </div>

      {(hubName || targetSubreddit) && (
        <aside className="min-w-0 space-y-4">
          {hubName && (
            <>
              <HubAboutPanel
                hubDetails={hubDetails}
                displayTitle={hubDisplayTitle}
                sidebarMarkdown={hubSettings?.sidebar_markdown ?? null}
                isLoading={loadingHubDetails}
                isError={hubDetailsError}
                showStats
                activeOmniUsers={hubActiveUsersData?.active_users ?? null}
              />

              <HubModeratorsPanel
                moderators={hubModerators}
                isLoading={loadingHubModerators}
                isError={hubModeratorsError}
                hubName={hubName}
                showMessageButton={Boolean(user && hubName)}
                onMessageMods={() => setShowModMailModal(true)}
              />
            </>
          )}

          {targetSubreddit && (
            <>
              <SubredditAboutPanel
                about={subredditAbout}
                iconUrl={subredditIcon}
                isLoading={loadingSubredditAbout}
                isError={subredditAboutError}
                activeOmniUsers={activeUsersData?.active_users ?? null}
              />

              <SubredditModeratorsPanel />
            </>
          )}
        </aside>
      )}
    </div>
  );

  const postDetailOverlays = (
    <>
      {embedTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-lg rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
                {t('posts.embed.title')}
              </h3>
              <button
                onClick={() => {
                  setEmbedTarget(null);
                  setEmbedCopied(false);
                }}
                className="text-xl text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                aria-label={t('posts.embed.closeLabel')}
              >
                ×
              </button>
            </div>
            <p className="text-sm text-[var(--color-text-secondary)]">{t('posts.embed.instruction')}</p>
            <textarea
              value={embedCode}
              readOnly
              rows={4}
              className="mt-3 w-full rounded border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-sm text-[var(--color-text-primary)]"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={copyEmbedCode}
                className="rounded bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)]"
              >
                {embedCopied ? t('common.copied') : t('posts.actions.copyEmbed')}
              </button>
              <button
                onClick={() => {
                  setEmbedTarget(null);
                  setEmbedCopied(false);
                }}
                className="rounded border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-elevated)]"
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      )}
      {showModMailModal && hubName && (
        <ModMailModal hubName={hubName} onClose={() => setShowModMailModal(false)} />
      )}

      <PostEditModal
        isOpen={Boolean(editPostTarget)}
        title={editPostTarget?.title ?? ''}
        body={editPostTarget?.body ?? editPostTarget?.content ?? ''}
        maxLength={10000}
        isSaving={updatePostMutation.isPending}
        onClose={() => setEditPostTarget(null)}
        onSave={({ title, body }) => {
          if (!editPostTarget) return;
          updatePostMutation.mutate({ post: editPostTarget, title, body });
        }}
      />

      {deleteCommentTarget && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-lg">
            <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
              {t('modals.delete.titleComm')}
            </h3>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              {t('modals.delete.moderatorMessage')}
            </p>
            <div className="mt-4">
              <label className="mb-1 block text-xs font-medium text-[var(--color-text-secondary)]">
                {t('moderation.deleteReason')} <span className="text-red-500">*</span>
              </label>
              <textarea
                value={deleteCommentReason}
                onChange={(e) => setDeleteCommentReason(e.target.value)}
                placeholder={t('moderation.deleteReasonPlaceholder')}
                className="w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                rows={4}
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => {
                  setDeleteCommentTarget(null);
                  setDeleteCommentReason('');
                }}
                className="rounded border border-[var(--color-border)] px-3 py-1 text-sm hover:bg-[var(--color-surface-elevated)]"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleConfirmDeleteComment}
                disabled={!deleteCommentReason.trim()}
                className="rounded bg-red-600 px-3 py-1 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
              >
                {t('comments.actions.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
      {deletePostTarget && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-lg">
            <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
              {t('modals.delete.title')}
            </h3>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              {t('modals.delete.moderatorMessage')}
            </p>
            <div className="mt-4">
              <label className="mb-1 block text-xs font-medium text-[var(--color-text-secondary)]">
                {t('moderation.deleteReason')} <span className="text-red-500">*</span>
              </label>
              <textarea
                value={deletePostReason}
                onChange={(e) => setDeletePostReason(e.target.value)}
                placeholder={t('moderation.deleteReasonPlaceholder')}
                className="w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                rows={4}
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => {
                  setDeletePostTarget(null);
                  setDeletePostReason('');
                }}
                className="rounded border border-[var(--color-border)] px-3 py-1 text-sm hover:bg-[var(--color-surface-elevated)]"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleConfirmDeletePost}
                disabled={!deletePostReason.trim() || deletePostMutation.isPending}
                className="rounded bg-red-600 px-3 py-1 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
              >
                {deletePostMutation.isPending ? t('posts.status.deleting') : t('posts.actions.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  if (hubName && activeAIDesign && supportsHubAIDesignShell) {
    return (
      <>
        <HubAIDesignLayout
          hubName={hubName}
          htmlContent={activeAIDesign.html_content}
          user={user}
          isModerator={isModerator}
          routeVariant="post"
        >
          {postDetailMainContent}
        </HubAIDesignLayout>
        {postDetailOverlays}
      </>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-0 py-8 md:px-4">
      {normalizedSubreddit && (
        <CommunityHeader
          communityType="subreddit"
          communityName={normalizedSubreddit}
          iconUrl={subredditIcon}
          isSubscribed={subredditSubscriptionStatus?.is_subscribed ?? false}
          isNsfw={subredditAbout?.over18 ?? false}
          hubSearch={
            <FeedSearchBars
              showPostForm={false}
              topValue={subredditInputValue}
              topPlaceholder={t('home.search.enterHubOrSubreddit')}
              onTopChange={handleSubredditInputChange}
              onTopFocus={() => setIsAutocompleteOpen(true)}
              onTopBlur={() => setIsAutocompleteOpen(false)}
              onTopSubmit={handleSubredditSubmit}
              topSuggestions={subredditSuggestions}
              topShouldShowSuggestions={shouldShowSuggestions}
              topIsLoading={isAutocompleteLoading}
              topEmptyMessage={t('home.search.noResults')}
              renderTopSuggestion={(suggestion) => (
                <SubredditSuggestionItem
                  key={suggestion.name}
                  suggestion={suggestion}
                  onSelect={handleSelectSubredditSuggestion}
                />
              )}
              postValue=""
              postPlaceholder=""
              onPostChange={() => {}}
              onPostSubmit={(event) => event.preventDefault()}
              postDropdownOpen={false}
            />
          }
          postSearch={
            <FeedSearchBars
              containerClassName="w-full md:w-96"
              showTopForm={false}
              topValue={subredditInputValue}
              topPlaceholder={t('home.search.enterHubOrSubreddit')}
              onTopChange={handleSubredditInputChange}
              onTopFocus={() => setIsAutocompleteOpen(true)}
              onTopBlur={() => setIsAutocompleteOpen(false)}
              onTopSubmit={handleSubredditSubmit}
              topSuggestions={subredditSuggestions}
              topShouldShowSuggestions={shouldShowSuggestions}
              topIsLoading={isAutocompleteLoading}
              topEmptyMessage={t('home.search.noResults')}
              renderTopSuggestion={(suggestion) => (
                <SubredditSuggestionItem
                  key={suggestion.name}
                  suggestion={suggestion}
                  onSelect={handleSelectSubredditSuggestion}
                />
              )}
              postValue={postSearchInput}
              postPlaceholder={t('home.search.searchPosts')}
              onPostChange={(value) => {
                setPostSearchInput(value);
                if (!isSearchDropdownOpen) {
                  setIsSearchDropdownOpen(true);
                }
              }}
              onPostFocus={() => setIsSearchDropdownOpen(true)}
              onPostBlur={() => setTimeout(() => setIsSearchDropdownOpen(false), 120)}
              onPostSubmit={handlePostSearchSubmit}
              postDropdownOpen={isSearchDropdownOpen}
              postDropdownContent={
                <div className="space-y-2 text-sm text-[var(--color-text-primary)]">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={limitSearchToContext}
                      onChange={(e) => setLimitSearchToContext(e.target.checked)}
                    />
                    <span>
                      {t('home.search.limitToSubreddit', { subreddit: normalizedSubreddit })}
                    </span>
                  </label>
                  {!blockAllNsfw && (
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={includeNsfwSearch}
                        onChange={(e) => setIncludeNsfwSearch(e.target.checked)}
                      />
                      <span>{t('home.search.includeNsfw')}</span>
                    </label>
                  )}
                  {blockAllNsfw && (
                    <div className="text-xs text-[var(--color-text-secondary)]">
                      {t('home.search.nsfwBlocked')}
                    </div>
                  )}
                </div>
              }
            />
          }
        />
      )}
      {normalizedSubreddit && (
        <MobileOnly>
          <FeedSearchBars
            containerClassName="w-full px-4 flex flex-col gap-4 mt-4"
            showTopForm={true}
            topValue={subredditInputValue}
            topPlaceholder={t('home.search.enterHubOrSubreddit')}
            onTopChange={handleSubredditInputChange}
            onTopFocus={() => setIsAutocompleteOpen(true)}
            onTopBlur={() => setIsAutocompleteOpen(false)}
            onTopSubmit={handleSubredditSubmit}
            topSuggestions={subredditSuggestions}
            topShouldShowSuggestions={shouldShowSuggestions}
            topIsLoading={isAutocompleteLoading}
            topEmptyMessage={t('home.search.noResults')}
            renderTopSuggestion={(suggestion) => (
              <SubredditSuggestionItem
                key={suggestion.name}
                suggestion={suggestion}
                onSelect={handleSelectSubredditSuggestion}
              />
            )}
            postValue={postSearchInput}
            postPlaceholder={t('home.search.searchPosts')}
            onPostChange={(value) => {
              setPostSearchInput(value);
              if (!isSearchDropdownOpen) {
                setIsSearchDropdownOpen(true);
              }
            }}
            onPostFocus={() => setIsSearchDropdownOpen(true)}
            onPostBlur={() => setTimeout(() => setIsSearchDropdownOpen(false), 120)}
            onPostSubmit={handlePostSearchSubmit}
            postDropdownOpen={isSearchDropdownOpen}
            postDropdownContent={
              <div className="space-y-2 text-sm text-[var(--color-text-primary)]">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={limitSearchToContext}
                    onChange={(e) => setLimitSearchToContext(e.target.checked)}
                  />
                  <span>
                    {t('home.search.limitToSubreddit', { subreddit: normalizedSubreddit })}
                  </span>
                </label>
                {!blockAllNsfw && (
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={includeNsfwSearch}
                      onChange={(e) => setIncludeNsfwSearch(e.target.checked)}
                    />
                    <span>{t('home.search.includeNsfw')}</span>
                  </label>
                )}
                {blockAllNsfw && (
                  <div className="text-xs text-[var(--color-text-secondary)]">
                    {t('home.search.nsfwBlocked')}
                  </div>
                )}
              </div>
            }
          />
        </MobileOnly>
      )}
      {hubName && (
        <CommunityHeader
          communityType="hub"
          communityName={hubName}
          displayTitle={hubDisplayTitle}
          isNsfw={hubDetails?.nsfw ?? hubSettings?.nsfw ?? false}
          isModerator={isModerator}
          hubSearch={
            <FeedSearchBars
              showPostForm={false}
              topValue={hubInputValue}
              topPlaceholder={t('home.search.enterHubOrSubreddit')}
              onTopChange={handleHubInputChange}
              onTopFocus={() => setHubIsAutocompleteOpen(true)}
              onTopBlur={() => setHubIsAutocompleteOpen(false)}
              onTopSubmit={handleHubSubmit}
              topSuggestions={hubSuggestions}
              topShouldShowSuggestions={shouldShowHubSuggestions}
              topIsLoading={isHubAutocompleteLoading}
              topEmptyMessage={t('home.search.noResults')}
              renderTopSuggestion={(suggestion) => (
                <CombinedSuggestionItem
                  key={`${suggestion.type}-${suggestion.data.name}`}
                  suggestion={suggestion}
                  onSelectHub={handleSelectHubSuggestion}
                  onSelectSubreddit={handleSelectHubSubredditSuggestion}
                />
              )}
              postValue=""
              postPlaceholder=""
              onPostChange={() => {}}
              onPostSubmit={(event) => event.preventDefault()}
              postDropdownOpen={false}
            />
          }
          postSearch={
            <FeedSearchBars
              containerClassName="w-full md:w-96"
              showTopForm={false}
              topValue={hubInputValue}
              topPlaceholder={t('home.search.enterHubOrSubreddit')}
              onTopChange={handleHubInputChange}
              onTopFocus={() => setHubIsAutocompleteOpen(true)}
              onTopBlur={() => setHubIsAutocompleteOpen(false)}
              onTopSubmit={handleHubSubmit}
              topSuggestions={hubSuggestions}
              topShouldShowSuggestions={shouldShowHubSuggestions}
              topIsLoading={isHubAutocompleteLoading}
              topEmptyMessage={t('home.search.noResults')}
              renderTopSuggestion={(suggestion) => (
                <CombinedSuggestionItem
                  key={`${suggestion.type}-${suggestion.data.name}`}
                  suggestion={suggestion}
                  onSelectHub={handleSelectHubSuggestion}
                  onSelectSubreddit={handleSelectHubSubredditSuggestion}
                />
              )}
              postValue={hubPostSearchInput}
              postPlaceholder={t('home.search.searchPosts')}
              onPostChange={(value) => {
                setHubPostSearchInput(value);
                if (!hubIsSearchDropdownOpen) {
                  setHubIsSearchDropdownOpen(true);
                }
              }}
              onPostFocus={() => setHubIsSearchDropdownOpen(true)}
              onPostBlur={() => setTimeout(() => setHubIsSearchDropdownOpen(false), 120)}
              onPostSubmit={handleHubPostSearchSubmit}
              postDropdownOpen={hubIsSearchDropdownOpen}
              postDropdownContent={
                <div className="space-y-2 text-sm text-[var(--color-text-primary)]">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={hubLimitSearchToContext}
                      onChange={(e) => setHubLimitSearchToContext(e.target.checked)}
                    />
                    <span>{t('home.search.limitToHub', { hub: hubName })}</span>
                  </label>
                  {!blockAllNsfw && (
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={hubIncludeNsfwSearch}
                        onChange={(e) => setHubIncludeNsfwSearch(e.target.checked)}
                      />
                      <span>{t('home.search.includeNsfw')}</span>
                    </label>
                  )}
                  {blockAllNsfw && (
                    <div className="text-xs text-[var(--color-text-secondary)]">
                      {t('home.search.nsfwBlocked')}
                    </div>
                  )}
                </div>
              }
            />
          }
        />
      )}
      {hubName && (
        <MobileOnly>
          <FeedSearchBars
            containerClassName="w-full px-4 flex flex-col gap-4 mt-4"
            showTopForm={true}
            topValue={hubInputValue}
            topPlaceholder={t('home.search.enterHubOrSubreddit')}
            onTopChange={handleHubInputChange}
            onTopFocus={() => setHubIsAutocompleteOpen(true)}
            onTopBlur={() => setHubIsAutocompleteOpen(false)}
            onTopSubmit={handleHubSubmit}
            topSuggestions={hubSuggestions}
            topShouldShowSuggestions={shouldShowHubSuggestions}
            topIsLoading={isHubAutocompleteLoading}
            topEmptyMessage={t('home.search.noResults')}
            renderTopSuggestion={(suggestion) => (
              <CombinedSuggestionItem
                key={`${suggestion.type}-${suggestion.data.name}`}
                suggestion={suggestion}
                onSelectHub={handleSelectHubSuggestion}
                onSelectSubreddit={handleSelectHubSubredditSuggestion}
              />
            )}
            postValue={hubPostSearchInput}
            postPlaceholder={t('home.search.searchPosts')}
            onPostChange={(value) => {
              setHubPostSearchInput(value);
              if (!hubIsSearchDropdownOpen) {
                setHubIsSearchDropdownOpen(true);
              }
            }}
            onPostFocus={() => setHubIsSearchDropdownOpen(true)}
            onPostBlur={() => setTimeout(() => setHubIsSearchDropdownOpen(false), 120)}
            onPostSubmit={handleHubPostSearchSubmit}
            postDropdownOpen={hubIsSearchDropdownOpen}
            postDropdownContent={
              <div className="space-y-2 text-sm text-[var(--color-text-primary)]">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={hubLimitSearchToContext}
                    onChange={(e) => setHubLimitSearchToContext(e.target.checked)}
                  />
                  <span>{t('home.search.limitToHub', { hub: hubName })}</span>
                </label>
                {!blockAllNsfw && (
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={hubIncludeNsfwSearch}
                      onChange={(e) => setHubIncludeNsfwSearch(e.target.checked)}
                    />
                    <span>{t('home.search.includeNsfw')}</span>
                  </label>
                )}
                {blockAllNsfw && (
                  <div className="text-xs text-[var(--color-text-secondary)]">
                    {t('home.search.nsfwBlocked')}
                  </div>
                )}
              </div>
            }
          />
        </MobileOnly>
      )}
      <div className="mt-4 grid gap-6 px-4 md:px-0 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          {postData && (
            <Panel>
              <PostHeader
                title={decodedTitle}
                titleBadges={
                  postData?.nsfw ? (
                    <span className="inline-flex items-center rounded bg-red-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                      {t('posts.badges.nsfw')}
                    </span>
                  ) : undefined
                }
                metadataItems={[
                  ...(hubName
                    ? [
                        <Link
                          key="hub"
                          to={`/h/${hubName}`}
                          className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                        >
                          {hubDisplayTitle ?? t('common.format.hubPath', { name: hubName })}
                        </Link>,
                      ]
                    : []),
                  ...(targetSubreddit
                    ? [
                        <Link
                          key="subreddit"
                          to={`/r/${targetSubreddit}`}
                          className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                        >
                          {t('common.format.subredditPath', { name: targetSubreddit })}
                        </Link>,
                      ]
                    : []),
                  <span key="author">
                    {t('posts.postedByLabel')}{' '}
                    <Link
                      to={`/users/${postData?.author?.username ?? postData?.author_username}`}
                      className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                    >
                      {postData?.author?.username ?? postData?.author_username}
                    </Link>
                  </span>,
                  <span key="submitted">
                    {t('posts.submittedAt', {
                      time: formatSubmittedAt(postData.crossposted_at ?? postData.created_at),
                    })}
                  </span>,
                ]}
              />

              <PostDetailMedia
                mediaUrl={mediaUrl}
                thumbnailUrl={thumbnailUrl}
                galleryImages={postData?.gallery_images}
                decodedTitle={decodedTitle}
                isVideoMedia={isVideoMedia}
                imageExpanded={imageExpanded}
                onToggleExpanded={() => setImageExpanded((prev) => !prev)}
              />

              {/* Post Body */}
              {bodyText && <PostBodyMarkdown content={bodyText} className="mb-4" />}

              {/* Vote Buttons and Post Stats */}
              <div className="flex flex-wrap items-center gap-4">
                <VoteButtons
                  postId={postData.id}
                  initialScore={postData.score}
                  initialUserVote={postData.user_vote}
                  layout="horizontal"
                  size="medium"
                />
                <div className="flex flex-wrap gap-4 text-xs text-[var(--color-text-secondary)]">
                  <span>
                    {t('posts.comment', {
                      count: postData.comment_count ?? postData.num_comments ?? 0,
                      formattedCount: formatNumber(
                        postData.comment_count ?? postData.num_comments ?? 0
                      ),
                    })}
                  </span>
                  <span>•</span>
                  <button onClick={handleSharePost} className="hover:underline">
                    {t('posts.actions.share')}
                  </button>
                  <span>•</span>
                  <button
                    onClick={handleSavePost}
                    disabled={savePostMutation.isPending}
                    className="hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {savePostMutation.isPending
                      ? t('posts.status.saving')
                      : isPostSaved
                        ? t('posts.actions.unsave')
                        : t('posts.actions.save')}
                  </button>
                  <span>•</span>
                  <button onClick={handleHidePost} className="hover:underline">
                    {t('posts.actions.hide')}
                  </button>
                  <span>•</span>
                  <button onClick={handleCrosspost} className="hover:underline">
                    {t('posts.actions.crosspost')}
                  </button>
                  {canPinPost && postData && (
                    <>
                      <span>•</span>
                      <button
                        onClick={() =>
                          togglePinMutation.mutate({
                            postId: postData.id,
                            isPinned: Boolean(postData.is_pinned),
                          })
                        }
                        disabled={togglePinMutation.isPending}
                        className="hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {togglePinMutation.isPending
                          ? t('posts.status.updating')
                          : postData.is_pinned
                            ? t('posts.actions.unpin')
                            : t('posts.actions.pin')}
                      </button>
                    </>
                  )}
                  {canEditPost && (
                    <>
                      <span>•</span>
                      <button
                        onClick={() => postData && setEditPostTarget(postData)}
                        className="hover:underline"
                      >
                        {t('common.edit')}
                      </button>
                    </>
                  )}
                  {canDeletePost && (
                    <>
                      <span>•</span>
                      <button onClick={handleDeletePost} className="text-red-600 hover:underline">
                        {t('common.delete')}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </Panel>
          )}

          <Panel>
            <h2 className="mb-4 text-xl font-semibold text-[var(--color-text-primary)]">
              {t('comments.title')}
            </h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!user) {
                  window.dispatchEvent(new CustomEvent('open-auth-modal', { detail: 'login' }));
                  return;
                }
                if (!commentText.trim()) return;
                handleCreateComment.mutate(commentText.trim());
              }}
              className="mb-6"
            >
              <MarkdownInput
                label={t('comments.addComment')}
                value={commentText}
                onChange={setCommentText}
                placeholder={t('comments.shareThoughts')}
                rows={4}
              />
              <div className="mt-2 flex justify-start text-xs text-[var(--color-text-secondary)]">
                <button
                  type="button"
                  onClick={() => setShowFormattingHelp((prev) => !prev)}
                  className="hover:text-[var(--color-primary)]"
                >
                  {showFormattingHelp
                    ? t('comments.formatting.hide')
                    : t('comments.formatting.show')}
                </button>
              </div>
              {showFormattingHelp && (
                <div className="mt-2 w-[70%] rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-[13px] text-[var(--color-text-primary)] shadow-sm">
                  <p className="text-sm text-[var(--color-text-primary)]">
                    {t('comments.formatting.description')}{' '}
                    <a
                      href="https://www.markdownguide.org/basic-syntax/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--color-primary)] underline"
                    >
                      {t('comments.formatting.markdownLinkText')}
                    </a>{' '}
                    {t('comments.formatting.descriptionSuffix')}
                  </p>
                  <div className="mt-2">
                    <FormattingHelpTable />
                  </div>
                </div>
              )}
              <button
                type="submit"
                disabled={handleCreateComment.isPending || !commentText.trim()}
                className="mt-2 rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)] disabled:opacity-50"
              >
                {handleCreateComment.isPending
                  ? t('comments.status.posting')
                  : t('comments.addComment')}
              </button>
            </form>

            {loadingComments && (
              <div className="space-y-3">
                <CommentSkeleton showReplies={true} />
                <CommentSkeleton showReplies={true} />
                <CommentSkeleton showReplies={false} />
              </div>
            )}

            {commentNotFound && (
              <div className="mb-4 rounded border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-900">
                {t('comments.errors.notFound')}
              </div>
            )}

            {focusedCommentId && !commentNotFound && (
              <div className="mb-4 rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                <div>{t('posts.viewingThread')}</div>
                <button
                  onClick={() =>
                    navigate(hubName ? `/h/${hubName}/comments/${postId}` : `/posts/${postId}`)
                  }
                  className="mt-1 font-semibold text-[var(--color-primary)] hover:underline"
                >
                  {t('comments.viewRest')}
                </button>
              </div>
            )}

            {commentsList.length === 0 && !loadingComments && (
              <div className="text-sm text-[var(--color-text-secondary)]">
                {t('comments.emptyBeFirstOnPost')}
              </div>
            )}

            {topLevelComments.length > 0 && (
              <div className="space-y-4">
                {topLevelComments.map((comment) => (
                  <CommentItem
                    key={comment.id}
                    comment={comment}
                    allComments={commentsList}
                    replyingTo={replyingTo}
                    onReplySelect={(commentId) => {
                      if (!user) {
                        window.dispatchEvent(
                          new CustomEvent('open-auth-modal', { detail: 'login' })
                        );
                        return;
                      }
                      setReplyingTo(commentId);
                    }}
                    onCancelReply={() => setReplyingTo(null)}
                    handlers={commentHandlers}
                    savedCommentIds={savedCommentIds}
                    currentUsername={user?.username}
                    currentUserRole={user?.role}
                    isModerator={isModerator}
                  />
                ))}
              </div>
            )}
          </Panel>
        </div>

        {(hubName || targetSubreddit) && (
          <aside className="min-w-0 space-y-4">
            {hubName && (
              <>
                <HubAboutPanel
                  hubDetails={hubDetails}
                  displayTitle={hubDisplayTitle}
                  sidebarMarkdown={hubSettings?.sidebar_markdown ?? null}
                  isLoading={loadingHubDetails}
                  isError={hubDetailsError}
                  showStats
                  activeOmniUsers={hubActiveUsersData?.active_users ?? null}
                />

                <HubModeratorsPanel
                  moderators={hubModerators}
                  isLoading={loadingHubModerators}
                  isError={hubModeratorsError}
                  hubName={hubName}
                  showMessageButton={Boolean(user && hubName)}
                  onMessageMods={() => setShowModMailModal(true)}
                />
              </>
            )}

            {targetSubreddit && (
              <>
                <SubredditAboutPanel
                  about={subredditAbout}
                  iconUrl={subredditIcon}
                  isLoading={loadingSubredditAbout}
                  isError={subredditAboutError}
                  activeOmniUsers={activeUsersData?.active_users ?? null}
                />

                <SubredditModeratorsPanel />
              </>
            )}
          </aside>
        )}
      </div>

      {embedTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-lg rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
                {t('posts.embed.title')}
              </h3>
              <button
                onClick={() => {
                  setEmbedTarget(null);
                  setEmbedCopied(false);
                }}
                className="text-xl text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                aria-label={t('posts.embed.closeLabel')}
              >
                ×
              </button>
            </div>
            <p className="text-sm text-[var(--color-text-secondary)]">
              {t('posts.embed.instruction')}
            </p>
            <textarea
              value={embedCode}
              readOnly
              rows={4}
              className="mt-3 w-full rounded border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-sm text-[var(--color-text-primary)]"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={copyEmbedCode}
                className="rounded bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)]"
              >
                {embedCopied ? t('common.copied') : t('posts.actions.copyEmbed')}
              </button>
              <button
                onClick={() => {
                  setEmbedTarget(null);
                  setEmbedCopied(false);
                }}
                className="rounded border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-elevated)]"
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      )}
      {showModMailModal && hubName && (
        <ModMailModal hubName={hubName} onClose={() => setShowModMailModal(false)} />
      )}

      <PostEditModal
        isOpen={Boolean(editPostTarget)}
        title={editPostTarget?.title ?? ''}
        body={editPostTarget?.body ?? editPostTarget?.content ?? ''}
        maxLength={10000}
        isSaving={updatePostMutation.isPending}
        onClose={() => setEditPostTarget(null)}
        onSave={({ title, body }) => {
          if (!editPostTarget) return;
          updatePostMutation.mutate({ post: editPostTarget, title, body });
        }}
      />

      {/* Delete Comment Reason Modal */}
      {deleteCommentTarget && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-lg">
            <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
              {t('modals.delete.titleComm')}
            </h3>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              {t('modals.delete.moderatorMessage')}
            </p>
            <div className="mt-4">
              <label className="mb-1 block text-xs font-medium text-[var(--color-text-secondary)]">
                {t('moderation.deleteReason')} <span className="text-red-500">*</span>
              </label>
              <textarea
                value={deleteCommentReason}
                onChange={(e) => setDeleteCommentReason(e.target.value)}
                placeholder={t('moderation.deleteReasonPlaceholder')}
                className="w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                rows={4}
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => {
                  setDeleteCommentTarget(null);
                  setDeleteCommentReason('');
                }}
                className="rounded border border-[var(--color-border)] px-3 py-1 text-sm hover:bg-[var(--color-surface-elevated)]"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleConfirmDeleteComment}
                disabled={!deleteCommentReason.trim()}
                className="rounded bg-red-600 px-3 py-1 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
              >
                {t('comments.actions.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
      {deletePostTarget && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-lg">
            <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
              {t('modals.delete.title')}
            </h3>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              {t('modals.delete.moderatorMessage')}
            </p>
            <div className="mt-4">
              <label className="mb-1 block text-xs font-medium text-[var(--color-text-secondary)]">
                {t('moderation.deleteReason')} <span className="text-red-500">*</span>
              </label>
              <textarea
                value={deletePostReason}
                onChange={(e) => setDeletePostReason(e.target.value)}
                placeholder={t('moderation.deleteReasonPlaceholder')}
                className="w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                rows={4}
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => {
                  setDeletePostTarget(null);
                  setDeletePostReason('');
                }}
                className="rounded border border-[var(--color-border)] px-3 py-1 text-sm hover:bg-[var(--color-surface-elevated)]"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleConfirmDeletePost}
                disabled={!deletePostReason.trim() || deletePostMutation.isPending}
                className="rounded bg-red-600 px-3 py-1 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
              >
                {deletePostMutation.isPending
                  ? t('posts.status.deleting')
                  : t('posts.actions.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
