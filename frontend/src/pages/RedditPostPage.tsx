import { useEffect, useMemo, useState, useRef } from 'react';
import { Link, useParams, useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trans, useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { savedService } from '../services/savedService';
import { hubsService } from '../services/hubsService';
import { subscriptionService } from '../services/subscriptionService';
import type { LocalRedditComment } from '../types/reddit';
import {
  createRedditCrosspostPayload,
  getDisplayDomain,
  isRedditDomain,
  sanitizeHttpUrl,
} from '../utils/crosspostHelpers';
import { MarkdownInput } from '../components/common/MarkdownInput';
import { MarkdownRenderer } from '../components/common/MarkdownRenderer';
import { PostBodyMarkdown } from '../components/posts/PostBodyMarkdown';
import { FormattingHelpTable } from '../components/common/FormattingHelpTable';
import { FlairBadge } from '../components/reddit/FlairBadge';
import { useRedditBlocklist } from '../contexts/RedditBlockContext';
import { decodeHtmlEntities } from '../utils/text';
import { Panel } from '../components/common/Panel';
import { FeedSearchBars } from '../components/common/FeedSearchBars';
import SubredditAboutPanel from '../components/reddit/SubredditAboutPanel';
import { CommunityHeader } from '../components/common/CommunityHeader';
import { MobileOnly } from '../components/common/MobileOnly';
import { SubredditSuggestionItem } from '../components/subreddit/SubredditSuggestionItem';
import { useSubredditAbout } from '../hooks/useSubredditAbout';
import { useSavedItems } from '../hooks/useSavedItems';
import { useHiddenItems } from '../hooks/useHiddenItems';
import { useSubredditAutocomplete } from '../hooks/useSubredditAutocomplete';
import { useSubredditActiveUsers } from '../hooks/useSubredditActiveUsers';
import { CrosspostModal } from '../components/common/CrosspostModal';
import { PostHeader } from '../components/posts/PostHeader';
import {
  getRedditPostKey,
  getSavedRedditAPICommentIdSet,
  getSavedRedditCommentIdSetById,
  invalidateHiddenItemsQueries,
  markRedditPostSaved,
  markRedditPostUnsaved,
} from '../utils/savedItems';
import { EmptyMessage, LoadingMessage } from '../components/common/StatusMessage';
import { loadHls } from '../utils/hlsLoader';
import { RedditPostMedia } from '../components/reddit/RedditPostMedia';
import { useFormat } from '../hooks/useFormat';
import { buildRedditCommentEmbedHtml } from '../utils/redditEmbed';

interface RedditComment {
  kind: string;
  data: {
    id: string;
    author: string;
    permalink?: string;
    body?: string;
    body_html?: string;
    created_utc: number;
    score: number;
    parent_id?: string;
    replies?: RedditListing<RedditComment> | string;
    depth?: number;
  };
}

interface RedditPostData {
  id: string;
  title: string;
  author: string;
  subreddit: string;
  created_utc: number;
  score: number;
  num_comments: number;
  url?: string;
  selftext?: string;
  selftext_html?: string;
  thumbnail?: string;
  permalink?: string;
  link_flair_text?: string;
  link_flair_background_color?: string;
  link_flair_text_color?: string;
  over18?: boolean;
  preview?: {
    images?: Array<{
      source?: { url?: string };
      resolutions?: Array<{ url?: string }>;
    }>;
  };
  is_self: boolean;
  post_hint?: string;
  is_video?: boolean;
  gallery_data?: {
    items?: Array<{
      media_id: string;
      id: number;
    }>;
  };
  media_metadata?: Record<
    string,
    {
      status: string;
      e: string;
      m?: string;
      s?: {
        y: number;
        x: number;
        u?: string;
      };
      p?: Array<{
        y: number;
        x: number;
        u?: string;
      }>;
    }
  >;
  media?: {
    reddit_video?: {
      fallback_url?: string;
      dash_url?: string;
      hls_url?: string;
      has_audio?: boolean;
      height?: number;
      width?: number;
    };
    oembed?: {
      thumbnail_url?: string;
      thumbnail_width?: number;
      thumbnail_height?: number;
    };
  };
  secure_media?: {
    reddit_video?: {
      fallback_url?: string;
      dash_url?: string;
      hls_url?: string;
      has_audio?: boolean;
      height?: number;
      width?: number;
    };
    oembed?: {
      thumbnail_url?: string;
      thumbnail_width?: number;
      thumbnail_height?: number;
    };
  };
}

interface RedditListing<T> {
  kind: string;
  data: {
    children: T[];
  };
}

type RedditPostListing = RedditListing<{ kind: string; data: RedditPostData }>;
type RedditCommentsListing = RedditListing<RedditComment>;

function getGalleryImages(post: RedditPostData): string[] {
  if (!post.gallery_data?.items || !post.media_metadata) {
    return [];
  }

  const images: string[] = [];
  for (const item of post.gallery_data.items) {
    const metadata = post.media_metadata[item.media_id];
    if (metadata?.s?.u) {
      const url = sanitizeHttpUrl(metadata.s.u);
      if (url) images.push(url);
    }
  }
  return images;
}

type VideoSource = { url: string; hasAudio: boolean; kind: 'mp4' | 'hls' | 'dash' };

function getVideoUrl(post: RedditPostData): VideoSource | undefined {
  // Try secure_media first, then media
  const videoData = post.secure_media?.reddit_video || post.media?.reddit_video;
  if (!videoData) return undefined;

  if (videoData.hls_url) {
    return { url: videoData.hls_url, hasAudio: true, kind: 'hls' };
  }
  if (videoData.dash_url) {
    return { url: videoData.dash_url, hasAudio: true, kind: 'dash' };
  }
  if (videoData.fallback_url) {
    // MP4 fallback for browsers that need it
    return {
      url: videoData.fallback_url,
      hasAudio: Boolean(videoData.has_audio ?? true),
      kind: 'mp4',
    };
  }

  return undefined;
}

function getYouTubeEmbed(url?: string | null): string | null {
  if (!url) return null;
  const match =
    url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/) ||
    url.match(/youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/);
  if (!match?.[1]) return null;
  const startMatch = url.match(/[?&]t=(\d+)/);
  const start = startMatch ? parseInt(startMatch[1], 10) : null;
  return `https://www.youtube-nocookie.com/embed/${match[1]}${start ? `?start=${start}` : ''}`;
}

function getVimeoEmbed(url?: string | null): string | null {
  if (!url) return null;
  const match = url.match(/vimeo\.com\/(?:video\/)?([0-9]+)/i);
  return match?.[1] ? `https://player.vimeo.com/video/${match[1]}` : null;
}

function getTiktokEmbed(url?: string | null): string | null {
  if (!url) return null;
  const match = url.match(/tiktok\.com\/(?:@[^/]+\/video\/|v\/)([0-9]+)/i);
  return match?.[1] ? `https://www.tiktok.com/embed/v2/${match[1]}` : null;
}

function getTwitchEmbed(url?: string | null): string | null {
  if (!url || typeof window === 'undefined') return null;
  const clipMatch = url.match(/twitch\.tv\/(?:[^/]+)\/clip\/([a-zA-Z0-9]+)/i);
  if (clipMatch?.[1]) {
    return `https://player.twitch.tv/?clip=${clipMatch[1]}&parent=${window.location.hostname}`;
  }
  const vodMatch = url.match(/twitch\.tv\/videos\/([0-9]+)/i);
  if (vodMatch?.[1]) {
    return `https://player.twitch.tv/?video=${vodMatch[1]}&parent=${window.location.hostname}`;
  }
  return null;
}

function getDailymotionEmbed(url?: string | null): string | null {
  if (!url) return null;
  const match = url.match(/dailymotion\.com\/video\/([a-zA-Z0-9]+)/i);
  return match?.[1] ? `https://www.dailymotion.com/embed/video/${match[1]}` : null;
}

function getStreamableEmbed(url?: string | null): string | null {
  if (!url) return null;
  const match = url.match(/streamable\.com\/(?:e\/)?([a-z0-9]+)/i);
  return match?.[1] ? `https://streamable.com/e/${match[1]}` : null;
}

function getRedgifsEmbed(url?: string | null): string | null {
  if (!url) return null;
  const match = url.match(/redgifs\.com\/(?:watch|ifr)\/([a-zA-Z0-9_-]+)/i);
  if (match?.[1]) return `https://www.redgifs.com/ifr/${match[1]}`;
  const gfyMatch = url.match(/gfycat\.com\/([a-zA-Z0-9_-]+)/i);
  return gfyMatch?.[1] ? `https://www.redgifs.com/ifr/${gfyMatch[1]}` : null;
}

function getGiphyEmbed(url?: string | null): string | null {
  if (!url) return null;
  const idMatch = url.match(/giphy\.com\/gifs\/[^/]*-?([a-zA-Z0-9]+)$/i);
  return idMatch?.[1] ? `https://giphy.com/embed/${idMatch[1]}` : null;
}

function getTenorEmbed(url?: string | null): string | null {
  if (!url) return null;
  const match = url.match(/tenor\.com\/view\/[^/-]+-([a-z0-9]+)$/i);
  return match?.[1] ? `https://tenor.com/embed/${match[1]}` : null;
}

function getImgurMp4(url?: string | null): string | null {
  if (!url) return null;
  const match = url.match(/i\.imgur\.com\/([a-zA-Z0-9]+)\.(?:gifv|gif)/i);
  if (match?.[1]) {
    return `https://i.imgur.com/${match[1]}.mp4`;
  }
  return null;
}

type ExternalMedia = { kind: 'iframe'; src: string } | { kind: 'video'; src: string };

function getExternalVideoMedia(url?: string | null): ExternalMedia | null {
  const sanitized = sanitizeHttpUrl(url);
  if (!sanitized) return null;

  const youtube = getYouTubeEmbed(sanitized);
  if (youtube) return { kind: 'iframe', src: youtube };

  const vimeo = getVimeoEmbed(sanitized);
  if (vimeo) return { kind: 'iframe', src: vimeo };

  const tiktok = getTiktokEmbed(sanitized);
  if (tiktok) return { kind: 'iframe', src: tiktok };

  const twitch = getTwitchEmbed(sanitized);
  if (twitch) return { kind: 'iframe', src: twitch };

  const dailymotion = getDailymotionEmbed(sanitized);
  if (dailymotion) return { kind: 'iframe', src: dailymotion };

  const streamable = getStreamableEmbed(sanitized);
  if (streamable) return { kind: 'iframe', src: streamable };

  const redgifs = getRedgifsEmbed(sanitized);
  if (redgifs) return { kind: 'iframe', src: redgifs };

  const giphy = getGiphyEmbed(sanitized);
  if (giphy) return { kind: 'iframe', src: giphy };

  const tenor = getTenorEmbed(sanitized);
  if (tenor) return { kind: 'iframe', src: tenor };

  const imgurMp4 = getImgurMp4(sanitized);
  if (imgurMp4) return { kind: 'video', src: imgurMp4 };

  return null;
}

// Component to render a single Reddit comment with replies
type EmbedPayload = {
  author: string;
  body: string;
  permalink: string;
  createdAt: string;
  score?: number;
};

function RedditCommentView({
  comment,
  depth = 0,
  localComments = [],
  subreddit,
  postId,
  replyingTo,
  onReply,
  onCancelReply,
  currentUsername,
  onPermalink,
  onEmbed,
  onToggleSave,
  savedCommentIds,
  onEdit,
  onDelete,
  onToggleInbox,
  useRelativeTime,
  isRedditUserBlocked,
  postTitle,
  postAuthor,
  savedRedditAPICommentIds = new Set(),
}: {
  comment: RedditComment;
  depth?: number;
  localComments?: LocalRedditComment[];
  subreddit: string;
  postId: string;
  replyingTo: number | null;
  onReply: (commentId: number) => void;
  onCancelReply: () => void;
  currentUsername?: string | null;
  onPermalink: (comment: LocalRedditComment) => void;
  onEmbed: (data: EmbedPayload) => void;
  onToggleSave: (comment: LocalRedditComment, shouldSave: boolean) => Promise<void>;
  savedCommentIds: Set<number>;
  onEdit: (commentId: number, content: string) => Promise<void>;
  onDelete: (commentId: number) => Promise<void>;
  onToggleInbox: (commentId: number, nextValue: boolean) => Promise<void>;
  useRelativeTime: boolean;
  isRedditUserBlocked: (username?: string | null) => boolean;
  postTitle?: string;
  postAuthor?: string;
  savedRedditAPICommentIds?: Set<string>;
}) {
  const { t } = useTranslation();
  const { formatDate, formatRelativeTime: formatRelativeTimeIntl, formatNumber } = useFormat();
  const queryClient = useQueryClient();
  const [collapsed, setCollapsed] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [isReplying, setIsReplying] = useState(false);
  const formattedTimestamp = useMemo(() => {
    const ts = comment.data.created_utc;
    if (!ts || !isFinite(ts)) return '';
    const date = new Date(ts * 1000);
    if (useRelativeTime) {
      return formatRelativeTimeIntl(date);
    }
    return formatDate(date, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }, [comment.data.created_utc, formatDate, formatRelativeTimeIntl, useRelativeTime]);
  const authorBlocked = isRedditUserBlocked(comment.data.author);

  const createReplyMutation = useMutation({
    mutationFn: async (content: string) => {
      return api.post(`/reddit/posts/${subreddit}/${postId}/comments`, {
        content,
        parent_comment_id: null,
        parent_reddit_comment_id: comment.data.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['reddit', 'posts', subreddit, postId, 'localComments'],
      });
      setReplyText('');
      setIsReplying(false);
    },
  });

  if (comment.kind === 'more') return null;
  if (!comment.data || !comment.data.body) return null;

  const repliesListing =
    comment.data.replies && typeof comment.data.replies !== 'string'
      ? comment.data.replies
      : undefined;
  const replies = repliesListing?.data.children ?? [];

  // Find local comments that reply to this Reddit comment, sorted by oldest first (chronological order)
  const localReplies = localComments
    .filter((c) => c.parent_reddit_comment_id === comment.data.id)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const hasReplies = replies.length > 0 || localReplies.length > 0;

  const handleReplyClick = () => {
    setIsReplying(true);
  };

  const handleCancelReply = () => {
    setIsReplying(false);
    setReplyText('');
  };

  const handleCopyPermalink = () => {
    const pathFromApi = comment.data.permalink as string | undefined;
    const localPath =
      pathFromApi && pathFromApi.startsWith('/')
        ? pathFromApi
        : `/r/${subreddit}/comments/${postId}/_/${comment.data.id}`;
    const absoluteUrl = `${window.location.origin}${localPath}`;
    navigator.clipboard.writeText(absoluteUrl);
    alert(t('alerts.commentLinkCopied'));
  };

  const handleEmbed = () => {
    const pathFromApi = comment.data.permalink as string | undefined;
    const permalink =
      pathFromApi && pathFromApi.startsWith('/')
        ? `${window.location.origin}${pathFromApi}`
        : `${window.location.origin}/r/${subreddit}/comments/${postId}/_/${comment.data.id}`;
    onEmbed({
      author: comment.data.author,
      body: comment.data.body ?? '',
      permalink,
      createdAt: new Date(comment.data.created_utc * 1000).toISOString(),
      score: comment.data.score,
    });
  };

  const isSaved = savedRedditAPICommentIds.has(comment.data.id);

  const handleSave = async () => {
    try {
      if (isSaved) {
        await savedService.unsaveRedditAPIComment(comment.data.id);
      } else {
        await savedService.saveRedditAPIComment({
          subreddit,
          reddit_post_id: postId,
          reddit_comment_id: comment.data.id,
          post_title: postTitle,
          post_author: postAuthor,
          comment_author: comment.data.author,
          comment_body: comment.data.body ?? '',
          score: comment.data.score,
          created_utc: comment.data.created_utc,
          parent_id: comment.data.parent_id,
        });
      }
      // Invalidate the query to refetch saved comments
      queryClient.invalidateQueries({ queryKey: ['saved-items', 'reddit_api_comments'] });
    } catch (err) {
      console.error('Failed to save comment:', err);
    }
  };

  return (
    <div className={`${depth > 0 ? 'ml-4 border-l-2 border-[var(--color-border)] pl-4' : ''}`}>
      <div className="mb-2">
        <div className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] transition-transform duration-200"
            style={{ transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
            title={collapsed ? t('comments.actions.expand') : t('comments.actions.collapse')}
            aria-label={
              collapsed
                ? t('common.accessibility.expandCommentThread')
                : t('common.accessibility.collapseCommentThread')
            }
          >
            ▼
          </button>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="font-semibold hover:underline"
          >
            {comment.data.author}
          </button>
          <span>•</span>
          <span>
            {t('posts.point', {
              count: comment.data.score,
              formattedCount: formatNumber(comment.data.score),
            })}
          </span>
          <span>•</span>
          <span>{formattedTimestamp}</span>
          {collapsed && hasReplies && (
            <span className="ml-2 text-[var(--color-text-muted)]">
              {t('comments.replyCount', { count: replies.length + localReplies.length })}
            </span>
          )}
        </div>

        {!collapsed && (
          <>
            {authorBlocked ? (
              <div className="mt-1 text-sm italic text-[var(--color-text-muted)]">
                {t('redditUserPage.blocked')}
              </div>
            ) : (
              <MarkdownRenderer
                content={comment.data.body ?? ''}
                className="mt-1 text-[var(--color-text-primary)]"
              />
            )}

            {/* Action buttons - left aligned */}
            <div className="mt-2 flex gap-3 text-xs text-[var(--color-text-secondary)]">
              <button onClick={handleCopyPermalink} className="hover:text-[var(--color-primary)]">
                {t('comments.actions.permalink')}
              </button>
              <button onClick={handleEmbed} className="hover:text-[var(--color-primary)]">
                {t('posts.actions.embed')}
              </button>
              <button onClick={handleSave} className="hover:text-[var(--color-primary)]">
                {isSaved ? t('comments.actions.unsave') : t('comments.actions.save')}
              </button>
              <button onClick={handleReplyClick} className="hover:text-[var(--color-primary)]">
                {t('comments.actions.reply')}
              </button>
            </div>

            {/* Inline reply form */}
            {isReplying && (
              <div className="mt-3 rounded border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-3">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (replyText.trim()) {
                      createReplyMutation.mutate(replyText.trim());
                    }
                  }}
                >
                  <MarkdownInput
                    label={t('comments.writeReply')}
                    value={replyText}
                    onChange={setReplyText}
                    placeholder={t('comments.writeComment')}
                    rows={4}
                  />
                  <div className="mt-2 flex gap-2">
                    <button
                      type="submit"
                      disabled={!replyText.trim() || createReplyMutation.isPending}
                      className="rounded bg-[var(--color-primary)] px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      {createReplyMutation.isPending
                        ? t('comments.status.posting')
                        : t('common.submit')}
                    </button>
                    <button
                      type="button"
                      onClick={handleCancelReply}
                      disabled={createReplyMutation.isPending}
                      className="rounded border border-[var(--color-border)] px-3 py-1 text-xs font-semibold text-[var(--color-text-secondary)] disabled:opacity-50"
                    >
                      {t('common.cancel')}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Replies section */}
            {hasReplies && (
              <div className="mt-3 space-y-3">
                {/* Show Reddit API replies */}
                {replies.map((reply, index) => (
                  <RedditCommentView
                    key={reply.data?.id || index}
                    comment={reply}
                    depth={depth + 1}
                    localComments={localComments}
                    subreddit={subreddit}
                    postId={postId}
                    replyingTo={replyingTo}
                    onReply={onReply}
                    onCancelReply={onCancelReply}
                    currentUsername={currentUsername}
                    onPermalink={onPermalink}
                    onEmbed={onEmbed}
                    onToggleSave={onToggleSave}
                    savedCommentIds={savedCommentIds}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onToggleInbox={onToggleInbox}
                    isRedditUserBlocked={isRedditUserBlocked}
                    useRelativeTime={useRelativeTime}
                    postTitle={postTitle}
                    postAuthor={postAuthor}
                    savedRedditAPICommentIds={savedRedditAPICommentIds}
                  />
                ))}

                {/* Show local comment replies */}
                {localReplies.length > 0 &&
                  localReplies.map((localComment) => (
                    <LocalCommentView
                      key={localComment.id}
                      comment={localComment}
                      subreddit={subreddit}
                      postId={postId}
                      replyingTo={replyingTo}
                      onReply={onReply}
                      onCancelReply={onCancelReply}
                      allComments={localComments}
                      currentUsername={currentUsername}
                      onPermalink={onPermalink}
                      onEmbed={onEmbed}
                      onToggleSave={onToggleSave}
                      savedCommentIds={savedCommentIds}
                      onEdit={onEdit}
                      onDelete={onDelete}
                      onToggleInbox={onToggleInbox}
                      useRelativeTime={useRelativeTime}
                    />
                  ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

interface LocalCommentViewProps {
  comment: LocalRedditComment;
  subreddit: string;
  postId: string;
  replyingTo: number | null;
  onReply: (commentId: number) => void;
  onCancelReply: () => void;
  allComments: LocalRedditComment[];
  currentUsername?: string | null;
  onPermalink: (comment: LocalRedditComment) => void;
  onEmbed: (data: EmbedPayload) => void;
  onToggleSave: (comment: LocalRedditComment, shouldSave: boolean) => Promise<void>;
  savedCommentIds: Set<number>;
  onEdit: (commentId: number, content: string) => Promise<void>;
  onDelete: (commentId: number) => Promise<void>;
  onToggleInbox: (commentId: number, nextValue: boolean) => Promise<void>;
  useRelativeTime: boolean;
}

function LocalCommentView({
  comment,
  subreddit,
  postId,
  replyingTo,
  onReply,
  onCancelReply,
  allComments,
  currentUsername,
  onPermalink,
  onEmbed,
  onToggleSave,
  savedCommentIds,
  onEdit,
  onDelete,
  onToggleInbox,
  useRelativeTime,
}: LocalCommentViewProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [replyText, setReplyText] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [editText, setEditText] = useState(comment.content);
  const [isSavingToggle, setIsSavingToggle] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUpdatingInbox, setIsUpdatingInbox] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const { formatDate, formatRelativeTime: formatRelativeTimeIntl, formatNumber } = useFormat();

  useEffect(() => {
    setEditText(comment.content);
  }, [comment.content]);

  const replies = allComments
    .filter((c) => c.parent_comment_id === comment.id)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const isReplying = replyingTo === comment.id;
  const isOwner = currentUsername && comment.username === currentUsername;
  const isSaved = savedCommentIds.has(comment.id);
  const inboxDisabled = comment.inbox_replies_disabled ?? false;
  const formattedTimestamp = useMemo(() => {
    const date = comment.created_at ? new Date(comment.created_at) : null;
    if (!date || !isFinite(date.getTime())) return '';
    if (useRelativeTime) {
      return formatRelativeTimeIntl(date);
    }
    return formatDate(date, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }, [comment.created_at, formatDate, formatRelativeTimeIntl, useRelativeTime]);

  const voteMutation = useMutation({
    mutationFn: async (vote: 1 | -1) => {
      return api.post(`/reddit/posts/${subreddit}/${postId}/comments/${comment.id}/vote`, {
        vote,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['reddit', 'posts', subreddit, postId, 'localComments'],
      });
    },
  });

  const createReplyMutation = useMutation({
    mutationFn: async (content: string) => {
      return api.post(`/reddit/posts/${subreddit}/${postId}/comments`, {
        content,
        parent_comment_id: comment.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['reddit', 'posts', subreddit, postId, 'localComments'],
      });
      setReplyText('');
      onCancelReply();
    },
  });

  const handleSubmitReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUsername) {
      window.dispatchEvent(new CustomEvent('open-auth-modal', { detail: 'login' }));
      return;
    }
    if (!replyText.trim()) return;
    createReplyMutation.mutate(replyText);
  };

  const handleToggleSave = async () => {
    if (!subreddit || !postId) return;
    setActionError(null);
    setIsSavingToggle(true);
    try {
      await onToggleSave(comment, !isSaved);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('comments.errors.saveFailed'));
    } finally {
      setIsSavingToggle(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editText.trim()) return;
    setActionError(null);
    try {
      await onEdit(comment.id, editText.trim());
      setIsEditing(false);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('comments.errors.editFailed'));
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(t('comments.confirm.delete'))) return;
    setIsDeleting(true);
    setActionError(null);
    try {
      await onDelete(comment.id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('comments.errors.deleteFailed'));
    } finally {
      setIsDeleting(false);
    }
  };

  const handleInboxToggle = async () => {
    setIsUpdatingInbox(true);
    setActionError(null);
    try {
      await onToggleInbox(comment.id, !inboxDisabled);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('comments.errors.inboxFailed'));
    } finally {
      setIsUpdatingInbox(false);
    }
  };

  return (
    <div className="flex gap-2">
      <div className="flex flex-col items-center text-sm text-[var(--color-text-secondary)] pt-1 leading-none">
        <button
          onClick={() => voteMutation.mutate(1)}
          disabled={voteMutation.isPending}
          className={`${comment.user_vote === 1 ? 'text-orange-500' : 'text-[var(--color-text-secondary)] hover:text-orange-500'} disabled:opacity-50`}
          title={t('posts.actions.upvote')}
        >
          ▲
        </button>
        <span className="h-1" />
        <button
          onClick={() => voteMutation.mutate(-1)}
          disabled={voteMutation.isPending}
          className={`${comment.user_vote === -1 ? 'text-blue-500' : 'text-[var(--color-text-secondary)] hover:text-blue-500'} disabled:opacity-50`}
          title={t('posts.actions.downvote')}
        >
          ▼
        </button>
      </div>

      <div className="flex-1">
        <div className="mb-2">
          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--color-text-secondary)]">
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] transition-transform duration-200"
              style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
              title={isCollapsed ? t('comments.actions.expand') : t('comments.actions.collapse')}
              aria-label={
                isCollapsed
                  ? t('common.accessibility.expandCommentThread')
                  : t('common.accessibility.collapseCommentThread')
              }
            >
              ▼
            </button>
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="font-semibold hover:underline"
            >
              {comment.username}
            </button>
            <span className="rounded bg-blue-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
              {t('posts.badges.omni')}
            </span>
            <span>•</span>
            <span
              className={`font-semibold ${comment.user_vote === 1 ? 'text-orange-500' : comment.user_vote === -1 ? 'text-blue-500' : 'text-[var(--color-text-primary)]'}`}
            >
              {t('posts.point', {
                count: comment.score,
                formattedCount: formatNumber(comment.score),
              })}
            </span>
            <span>•</span>
            <span>{formattedTimestamp}</span>
            {isCollapsed && replies.length > 0 && (
              <span className="ml-2 text-[var(--color-text-muted)]">
                {t('comments.replyCount', { count: replies.length })}
              </span>
            )}
          </div>

          {!isCollapsed &&
            (isEditing ? (
              <form onSubmit={handleEditSubmit} className="mt-2 space-y-2">
                <MarkdownInput
                  label={t('comments.labels.editComment')}
                  value={editText}
                  onChange={setEditText}
                  rows={4}
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={!editText.trim()}
                    className="rounded bg-[var(--color-primary)] px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    {t('common.save')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditing(false);
                      setEditText(comment.content);
                    }}
                    className="rounded border border-[var(--color-border)] px-3 py-1 text-xs font-semibold text-[var(--color-text-secondary)]"
                  >
                    {t('common.cancel')}
                  </button>
                </div>
              </form>
            ) : (
              <MarkdownRenderer
                content={comment.content}
                className="mt-2 text-[var(--color-text-primary)]"
              />
            ))}

          {!isCollapsed && actionError && (
            <div className="mt-2 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">
              {actionError}
            </div>
          )}

          {!isCollapsed && (
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-[var(--color-text-secondary)]">
              <button
                onClick={() => onPermalink(comment)}
                className="hover:text-[var(--color-primary)]"
              >
                {t('comments.actions.permalink')}
              </button>
              <button
                onClick={() =>
                  onEmbed({
                    author: comment.username,
                    body: comment.content,
                    permalink: `${window.location.origin}/r/${subreddit}/comments/${postId}/${comment.id}`,
                    createdAt: comment.created_at,
                    score: comment.score,
                  })
                }
                className="hover:text-[var(--color-primary)]"
              >
                {t('posts.actions.embed')}
              </button>
              <button
                onClick={handleToggleSave}
                disabled={isSavingToggle}
                className="hover:text-[var(--color-primary)] disabled:opacity-50"
              >
                {isSaved ? t('comments.actions.unsave') : t('comments.actions.save')}
              </button>
              {isOwner ? (
                <>
                  <button
                    onClick={() => setIsEditing(true)}
                    className="hover:text-[var(--color-primary)]"
                  >
                    {t('comments.actions.edit')}
                  </button>
                  <button
                    onClick={handleInboxToggle}
                    disabled={isUpdatingInbox}
                    className="hover:text-[var(--color-primary)] disabled:opacity-50"
                  >
                    {inboxDisabled
                      ? t('comments.actions.enableInbox')
                      : t('comments.actions.disableInbox')}
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="text-red-500 hover:text-red-600 disabled:opacity-50"
                  >
                    {t('comments.actions.delete')}
                  </button>
                </>
              )}
              <button
                onClick={() => onReply(comment.id)}
                className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
              >
                {t('comments.actions.reply')}
              </button>
            </div>
          )}

          {!isCollapsed && isReplying && (
            <form onSubmit={handleSubmitReply} className="mt-3">
              <MarkdownInput
                label={t('comments.writeReply')}
                value={replyText}
                onChange={setReplyText}
                placeholder={t('comments.writeComment')}
                rows={3}
              />
              <div className="mt-2 flex gap-2">
                <button
                  type="submit"
                  disabled={createReplyMutation.isPending || !replyText.trim()}
                  className="rounded-md bg-[var(--color-primary)] px-3 py-1 text-xs font-semibold text-white hover:bg-[var(--color-primary-dark)] disabled:opacity-50"
                >
                  {createReplyMutation.isPending
                    ? t('comments.status.posting')
                    : t('comments.postReply')}
                </button>
                <button
                  type="button"
                  onClick={onCancelReply}
                  className="rounded-md border border-[var(--color-border)] px-3 py-1 text-xs font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-elevated)]"
                >
                  {t('common.cancel')}
                </button>
              </div>
            </form>
          )}
        </div>

        {!isCollapsed && replies.length > 0 && (
          <div className="ml-6 mt-3 space-y-3 border-l-2 border-[var(--color-border)] pl-4">
            {replies.map((reply) => (
              <LocalCommentView
                key={reply.id}
                comment={reply}
                subreddit={subreddit}
                postId={postId}
                replyingTo={replyingTo}
                onReply={onReply}
                onCancelReply={onCancelReply}
                allComments={allComments}
                currentUsername={currentUsername}
                onPermalink={onPermalink}
                onEmbed={onEmbed}
                onToggleSave={onToggleSave}
                savedCommentIds={savedCommentIds}
                onEdit={onEdit}
                onDelete={onDelete}
                onToggleInbox={onToggleInbox}
                useRelativeTime={useRelativeTime}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

type CombinedComment =
  | {
      type: 'local';
      local: LocalRedditComment;
      createdAt: Date;
      ups: number;
      downs: number;
      body: string;
    }
  | {
      type: 'reddit';
      reddit: RedditComment;
      createdAt: Date;
      ups: number;
      downs: number;
      body: string;
    };

const wilsonScore = (ups: number, downs: number) => {
  const n = ups + downs;
  if (n === 0) return 0;
  const z = 1.96;
  const p = ups / n;
  const numerator = p + (z * z) / (2 * n) - z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n);
  const denominator = 1 + (z * z) / n;
  return numerator / denominator;
};

const controversialScore = (ups: number, downs: number) => {
  const n = ups + downs;
  if (n === 0) return 0;
  const p = ups / n;
  const balance = 1 - Math.abs(p - 0.5) * 2;
  const volume = Math.log10(n + 1);
  return balance * volume;
};

const qaScore = (comment: CombinedComment) => {
  const base = wilsonScore(comment.ups, comment.downs);
  const lengthBonus = Math.min(comment.body.length / 1000, 0.3);
  return base + lengthBonus;
};

const EMPTY_REDDIT_COMMENTS: RedditComment[] = [];

export default function RedditPostPage() {
  const { t } = useTranslation();
  const { subreddit, postId, commentId } = useParams<{
    subreddit: string;
    postId: string;
    commentId?: string;
  }>();
  const isPlatformPost = postId ? /^\d+$/.test(postId) : false;
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { useRelativeTime, stayOnPostAfterHide, searchIncludeNsfwByDefault, blockAllNsfw } =
    useSettings();
  const { formatDate, formatRelativeTime: formatRelativeTimeIntl, formatNumber } = useFormat();
  const { isRedditUserBlocked, blockRedditUser, unblockRedditUser } = useRedditBlocklist();
  const queryClient = useQueryClient();

  const focusedCommentId = commentId ? Number(commentId) : null;
  const [commentText, setCommentText] = useState('');
  const [showFormattingHelp, setShowFormattingHelp] = useState(false);
  const [replyingTo, setReplyingTo] = useState<number | null>(null);
  const [embedTarget, setEmbedTarget] = useState<EmbedPayload | null>(null);
  const [sort, setSort] = useState<string>('best');
  const [imageExpanded, setImageExpanded] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [subredditInputValue, setSubredditInputValue] = useState('');
  const [isAutocompleteOpen, setIsAutocompleteOpen] = useState(false);
  const [postSearchInput, setPostSearchInput] = useState('');
  const [isSearchDropdownOpen, setIsSearchDropdownOpen] = useState(false);
  const [limitSearchToContext, setLimitSearchToContext] = useState(true);
  const [includeNsfwSearch, setIncludeNsfwSearch] = useState(false);
  const formatPostTimestamp = (createdUtcSeconds: number) => {
    const d = new Date(createdUtcSeconds * 1000);
    if (Number.isNaN(d.getTime())) return t('common.time.recently');

    if (useRelativeTime) {
      return formatRelativeTimeIntl(d);
    }

    return formatDate(d, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  // Post action states
  const [showHideConfirm, setShowHideConfirm] = useState(false);
  const [showCrosspostModal, setShowCrosspostModal] = useState(false);
  const initialHiddenState = Boolean(
    (location.state as { isHidden?: boolean } | null)?.isHidden ?? false
  );
  const [isPostHidden, setIsPostHidden] = useState(initialHiddenState);

  useEffect(() => {
    setIncludeNsfwSearch(!blockAllNsfw && searchIncludeNsfwByDefault);
    setLimitSearchToContext(true);
  }, [blockAllNsfw, searchIncludeNsfwByDefault, subreddit]);

  // Crosspost form state
  const [crosspostTitle, setCrosspostTitle] = useState('');
  const [selectedHub, setSelectedHub] = useState('');
  const [selectedCrosspostSubreddit, setSelectedCrosspostSubreddit] = useState('');
  const [sendRepliesToInbox, setSendRepliesToInbox] = useState(true);

  const resetCrosspostState = () => {
    setShowCrosspostModal(false);
    setCrosspostTitle('');
    setSelectedHub('');
    setSelectedCrosspostSubreddit('');
    setSendRepliesToInbox(true);
  };

  const openCrosspostModal = () => {
    if (!post) return;
    setCrosspostTitle(post.title);
    setSelectedHub('');
    setSelectedCrosspostSubreddit('');
    setSendRepliesToInbox(true);
    setShowCrosspostModal(true);
  };

  const handleSharePost = async () => {
    if (!post) return;
    try {
      await navigator.clipboard.writeText(window.location.href);
      alert(t('alerts.linkCopied'));
    } catch {
      alert(t('alerts.linkCopyFailed'));
    }
  };

  // Fetch user's hubs for crossposting
  const { data: hubsData } = useQuery({
    queryKey: ['user-hubs'],
    queryFn: () => hubsService.getUserHubs(),
    enabled: !!user,
  });
  const hubOptions = useMemo(
    () => hubsData?.hubs?.map((hub) => ({ id: hub.id, name: hub.name })) ?? [],
    [hubsData]
  );

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
    if (!query) return;
    if (limitSearchToContext) {
      navigate(`/r/${subreddit}`, { state: { scopedSearchQuery: query } });
      return;
    }
    navigate(
      `/search?q=${encodeURIComponent(query)}&sort=relevance${includeNsfwSearch && !blockAllNsfw ? '&include_nsfw=true' : ''}`
    );
  };

  const { data: subscriptionStatus } = useQuery({
    queryKey: ['subreddit-subscription', subreddit],
    queryFn: () => subscriptionService.checkSubredditSubscription(subreddit!),
    enabled: !!user && !!subreddit && subreddit !== 'popular' && subreddit !== 'frontpage',
    staleTime: 1000 * 60 * 5,
  });

  // Fetch saved Reddit posts to check if current post is saved
  const { data: savedPostsData } = useSavedItems('reddit_posts', !!user, 1000 * 60 * 5);

  const { data: hiddenPostsData } = useHiddenItems('reddit_posts', !!user, 1000 * 60 * 5);

  const {
    data: subredditAbout,
    isLoading: loadingSubredditAbout,
    isError: subredditAboutError,
    iconUrl: subredditIcon,
  } = useSubredditAbout(subreddit, Boolean(subreddit));
  const { data: activeUsersData } = useSubredditActiveUsers(subreddit, user);

  const subredditIconFallback = useMemo(() => {
    if (!subredditAbout) return null;
    const candidates = [
      subredditAbout.community_icon,
      subredditAbout.icon_img,
      subredditAbout.banner_img,
      subredditAbout.banner_background_image,
    ];
    for (const candidate of candidates) {
      if (!candidate) continue;
      const stripped = candidate.split('?')[0];
      const sanitized = sanitizeHttpUrl(stripped);
      if (sanitized) return sanitized;
    }
    return null;
  }, [subredditAbout]);

  // Derive saved status from query data
  const isPostSavedFromBackend = useMemo(() => {
    if (!savedPostsData?.saved_reddit_posts || !subreddit || !postId) {
      return false;
    }
    const targetKey = getRedditPostKey(subreddit, postId);
    return savedPostsData.saved_reddit_posts.some(
      (p) => getRedditPostKey(p.subreddit, p.reddit_post_id) === targetKey
    );
  }, [savedPostsData, subreddit, postId]);

  const isPostHiddenFromBackend = useMemo(() => {
    if (!hiddenPostsData?.hidden_reddit_posts || !subreddit || !postId) {
      return false;
    }
    const targetKey = getRedditPostKey(subreddit, postId);
    return hiddenPostsData.hidden_reddit_posts.some(
      (p) => getRedditPostKey(p.subreddit, p.reddit_post_id) === targetKey
    );
  }, [hiddenPostsData, subreddit, postId]);
  const isPostHiddenOverall = isPostHidden || isPostHiddenFromBackend;

  // Fetch Reddit post and comments from Reddit API
  const { data: redditData, isLoading: loadingReddit } = useQuery({
    queryKey: ['reddit', 'post', subreddit, postId],
    queryFn: async () => {
      const response = await api.get<[RedditPostListing, RedditCommentsListing]>(
        `/reddit/r/${subreddit}/comments/${postId}`
      );
      // Reddit API returns [postListing, commentsListing]
      const postListing = response[0];
      const commentsListing = response[1];

      const post: RedditPostData = postListing.data.children[0]?.data;
      const comments: RedditComment[] = commentsListing.data.children || [];

      return { post, comments };
    },
    enabled: !!subreddit && !!postId && !isPlatformPost,
  });

  const post = redditData?.post;
  const decodedTitle = post ? decodeHtmlEntities(post.title) : '';
  const isPostAuthorBlocked = post ? isRedditUserBlocked(post.author) : false;
  const redditComments = redditData?.comments ?? EMPTY_REDDIT_COMMENTS;
  const galleryImages = post ? getGalleryImages(post) : [];
  const hasGallery = galleryImages.length > 0;
  const videoData = post ? getVideoUrl(post) : undefined;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hasVideo = Boolean(videoData);
  useEffect(() => {
    let hlsInstance: { destroy: () => void } | null = null;
    const videoEl = videoRef.current;
    if (!videoEl || !videoData) return;
    if (videoData.kind !== 'hls') return;

    const canNativePlay = videoEl.canPlayType('application/vnd.apple.mpegurl');
    if (canNativePlay) {
      videoEl.src = videoData.url;
      return;
    }

    let isMounted = true;
    (async () => {
      try {
        const Hls = await loadHls();
        if (Hls?.isSupported && Hls.isSupported()) {
          const instance = new Hls();
          instance.loadSource(videoData.url);
          instance.attachMedia(videoEl);
          if (isMounted) {
            hlsInstance = instance;
          } else {
            instance.destroy();
          }
        } else {
          console.warn('HLS not supported and no fallback available.');
        }
      } catch (err) {
        console.error('Failed to load HLS player for playback', err);
      }
    })();

    return () => {
      isMounted = false;
      if (hlsInstance) {
        hlsInstance.destroy();
      }
    };
  }, [videoData]);
  const previewSource = post?.preview?.images?.[0]?.source?.url
    ? sanitizeHttpUrl(post.preview.images[0].source.url)
    : undefined;
  const sanitizedThumbnail = post?.thumbnail ? sanitizeHttpUrl(post.thumbnail) : undefined;
  const posterUrl = previewSource ?? sanitizedThumbnail;
  const oembedThumbnail = post
    ? (sanitizeHttpUrl(post.media?.oembed?.thumbnail_url) ??
      sanitizeHttpUrl(post.secure_media?.oembed?.thumbnail_url))
    : undefined;
  const sanitizedExternalLink = post?.url ? sanitizeHttpUrl(post.url) : undefined;
  const externalMedia = getExternalVideoMedia(sanitizedExternalLink);
  const embedUrl = externalMedia?.kind === 'iframe' ? externalMedia.src : null;
  const externalVideoUrl = externalMedia?.kind === 'video' ? externalMedia.src : null;
  const sanitizedPostImage = post?.post_hint === 'image' ? sanitizedExternalLink : undefined;
  const externalDomain = getDisplayDomain(sanitizedExternalLink);
  const isExternalLink = Boolean(
    sanitizedExternalLink && externalDomain && !isRedditDomain(externalDomain)
  );
  let inlineImage: string | null = null;
  if (post) {
    if (hasGallery) {
      inlineImage = galleryImages[galleryIndex] ?? null;
    } else if (sanitizedPostImage) {
      inlineImage = sanitizedPostImage;
    } else if (!post.is_video && !externalMedia) {
      inlineImage = previewSource ?? sanitizedThumbnail ?? oembedThumbnail ?? null;
    }
  }
  const hasInlineImage = Boolean(inlineImage);

  // Fetch local comments for this Reddit post (stored on our platform)
  const commentsQueryKey = ['reddit', 'posts', subreddit, postId, 'localComments', sort] as const;
  const { data: localCommentsData, isLoading: loadingLocal } = useQuery({
    queryKey: commentsQueryKey,
    queryFn: async () => {
      const response = await api.get<{ comments: LocalRedditComment[] }>(
        `/reddit/posts/${subreddit}/${postId}/comments?sort=${sort}`
      );
      return response.comments || [];
    },
    enabled: !!subreddit && !!postId,
  });

  const savedCommentsKey = ['saved-items', 'reddit-comments'] as const;
  const { data: savedCommentsData } = useQuery({
    queryKey: savedCommentsKey,
    queryFn: () => savedService.getSavedItems('reddit_comments'),
    enabled: !!subreddit && !!postId && !!user,
  });

  const savedCommentIds = useMemo(
    () => getSavedRedditCommentIdSetById(savedCommentsData),
    [savedCommentsData]
  );

  // Fetch saved Reddit API comments
  const { data: savedRedditAPICommentsData } = useQuery({
    queryKey: ['saved-items', 'reddit_api_comments'],
    queryFn: () => savedService.getSavedItems('reddit_api_comments'),
    enabled: !!subreddit && !!postId && !!user,
  });

  const savedRedditAPICommentIds = useMemo(
    () => getSavedRedditAPICommentIdSet(savedRedditAPICommentsData),
    [savedRedditAPICommentsData]
  );

  const buildEmbedHtml = (data: EmbedPayload) => {
    return buildRedditCommentEmbedHtml(data, t);
  };

  const editCommentMutation = useMutation({
    mutationFn: async ({
      commentId: redditCommentId,
      content,
    }: {
      commentId: number;
      content: string;
    }) => {
      if (!subreddit || !postId) {
        throw new Error('Missing post context');
      }
      await api.put(`/reddit/posts/${subreddit}/${postId}/comments/${redditCommentId}`, {
        content,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['reddit', 'posts', subreddit, postId, 'localComments'],
      });
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: async (redditCommentId: number) => {
      if (!subreddit || !postId) {
        throw new Error('Missing post context');
      }
      await api.delete(`/reddit/posts/${subreddit}/${postId}/comments/${redditCommentId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['reddit', 'posts', subreddit, postId, 'localComments'],
      });
      queryClient.invalidateQueries({ queryKey: savedCommentsKey });
    },
  });

  const inboxPreferenceMutation = useMutation({
    mutationFn: async ({
      commentId: redditCommentId,
      nextValue,
    }: {
      commentId: number;
      nextValue: boolean;
    }) => {
      if (!subreddit || !postId) {
        throw new Error('Missing post context');
      }
      await api.post(
        `/reddit/posts/${subreddit}/${postId}/comments/${redditCommentId}/preferences`,
        {
          disable_inbox_replies: nextValue,
        }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['reddit', 'posts', subreddit, postId, 'localComments'],
      });
    },
  });

  const saveCommentMutation = useMutation({
    mutationFn: async ({
      comment,
      shouldSave,
    }: {
      comment: LocalRedditComment;
      shouldSave: boolean;
    }) => {
      if (!subreddit || !postId) {
        throw new Error('Missing post context');
      }
      if (shouldSave) {
        await savedService.saveRedditComment(subreddit, postId, comment.id);
      } else {
        await savedService.unsaveRedditComment(subreddit, postId, comment.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: savedCommentsKey });
    },
  });

  const originPathFromState = (location.state as { originPath?: string } | undefined)?.originPath;

  const redirectAfterHide = () => {
    if (stayOnPostAfterHide) {
      return;
    }
    if (originPathFromState) {
      navigate(originPathFromState, { replace: true });
      return;
    }
    navigate(-1);
  };

  const savePostMutation = useMutation({
    mutationFn: async (shouldSave: boolean) => {
      if (!subreddit || !postId) {
        throw new Error(t('posts.errors.invalidPost'));
      }
      if (shouldSave) {
        if (!post) {
          throw new Error(t('posts.errors.invalidPost'));
        }
        const thumbnail =
          post.thumbnail && post.thumbnail.startsWith('http') ? post.thumbnail : undefined;
        await savedService.saveRedditPost(subreddit, postId, {
          title: post.title,
          author: post.author,
          score: post.score,
          num_comments: post.num_comments,
          thumbnail: thumbnail ?? null,
          created_utc: post.created_utc ?? null,
        });
      } else {
        await savedService.unsaveRedditPost(subreddit, postId);
      }
    },
    onSuccess: (_data, shouldSave) => {
      if (subreddit && postId) {
        if (shouldSave && post) {
          const thumbnail =
            post.thumbnail && post.thumbnail.startsWith('http') ? post.thumbnail : null;
          markRedditPostSaved(queryClient, subreddit, postId, {
            title: post.title,
            author: post.author,
            score: post.score,
            num_comments: post.num_comments,
            thumbnail,
            created_utc: post.created_utc ?? null,
          });
        } else {
          markRedditPostUnsaved(queryClient, subreddit, postId);
        }
      }
    },
    onError: (error) => {
      console.error('Failed to save/unsave post:', error);
      const message = error instanceof Error ? error.message : t('common.error');
      alert(t(isPostSavedFromBackend ? 'alerts.unsaveFailed' : 'alerts.saveFailed', { message }));
    },
  });

  const hidePostMutation = useMutation({
    mutationFn: async () => {
      if (!subreddit || !postId) {
        throw new Error('Missing post context');
      }
      await savedService.hideRedditPost(subreddit, postId);
    },
    onSuccess: () => {
      invalidateHiddenItemsQueries(queryClient);
      queryClient.invalidateQueries({ queryKey: ['reddit'], exact: false });
      setIsPostHidden(true);
      setShowHideConfirm(false);
      redirectAfterHide();
    },
  });

  const unhidePostMutation = useMutation({
    mutationFn: async () => {
      if (!subreddit || !postId) {
        throw new Error('Missing post context');
      }
      await savedService.unhideRedditPost(subreddit, postId);
    },
    onSuccess: () => {
      invalidateHiddenItemsQueries(queryClient);
      setIsPostHidden(false);
    },
  });

  const crosspostMutation = useMutation({
    mutationFn: async () => {
      if (!subreddit || !postId || !post) {
        throw new Error(t('alerts.crosspostNoSource'));
      }
      if (!selectedHub && !selectedCrosspostSubreddit) {
        throw new Error(t('alerts.crosspostMissingDestination'));
      }

      const title = crosspostTitle || post.title;
      const payload = createRedditCrosspostPayload(post, title, sendRepliesToInbox);
      const tasks = [];

      if (selectedHub) {
        tasks.push(
          hubsService.crosspostToHub(
            selectedHub,
            { ...payload },
            'reddit',
            postId,
            subreddit,
            post.title
          )
        );
      }

      if (selectedCrosspostSubreddit) {
        tasks.push(
          hubsService.crosspostToSubreddit(
            selectedCrosspostSubreddit,
            { ...payload },
            'reddit',
            postId,
            subreddit,
            post.title
          )
        );
      }

      await Promise.all(tasks);
    },
    onSuccess: () => {
      resetCrosspostState();
      alert(t('alerts.crosspostSuccess'));
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : t('common.error');
      alert(t('alerts.crosspostFailed', { message }));
    },
  });
  const isCrosspostSubmitDisabled =
    (!selectedHub && !selectedCrosspostSubreddit) || !crosspostTitle.trim();

  const handlePermalink = (commentTarget: LocalRedditComment) => {
    if (!subreddit || !postId) return;
    navigate(`/r/${subreddit}/comments/${postId}/${commentTarget.id}`);
  };

  const handleEmbed = (data: EmbedPayload) => {
    setEmbedTarget(data);
  };

  const handleToggleSave = (commentTarget: LocalRedditComment, shouldSave: boolean) =>
    saveCommentMutation.mutateAsync({ comment: commentTarget, shouldSave });

  const handleEditComment = (commentIdValue: number, content: string) =>
    editCommentMutation.mutateAsync({ commentId: commentIdValue, content });

  const handleDeleteComment = (commentIdValue: number) =>
    deleteCommentMutation.mutateAsync(commentIdValue);

  const handleToggleInbox = (commentIdValue: number, nextValue: boolean) =>
    inboxPreferenceMutation.mutateAsync({ commentId: commentIdValue, nextValue });

  const topLevelComments = useMemo(() => {
    if (!localCommentsData) return [];
    if (focusedCommentId) {
      const target = localCommentsData.find((c) => c.id === focusedCommentId);
      return target ? [target] : [];
    }
    // Only include comments that are not replies to anything (neither local comments nor Reddit comments)
    return localCommentsData.filter(
      (c) => c.parent_comment_id === null && !c.parent_reddit_comment_id
    );
  }, [localCommentsData, focusedCommentId]);

  const commentNotFound = Boolean(
    focusedCommentId && localCommentsData && topLevelComments.length === 0
  );
  const combinedTopLevel = useMemo<CombinedComment[]>(() => {
    const locals =
      topLevelComments?.map((c) => ({
        type: 'local' as const,
        local: c,
        createdAt: new Date(c.created_at),
        ups: c.ups ?? c.score ?? 0,
        downs: c.downs ?? 0,
        body: c.content,
      })) ?? [];

    const redditTop = (redditComments || [])
      .filter((c) => c.kind !== 'more')
      .map((c) => ({
        type: 'reddit' as const,
        reddit: c,
        createdAt: new Date((c.data?.created_utc ?? 0) * 1000),
        ups: c.data?.score ?? 0,
        downs: 0,
        body: c.data?.body ?? '',
      }));

    const list = [...locals, ...redditTop];

    const cmp = (a: CombinedComment, b: CombinedComment) => {
      const tieBreak = () => b.createdAt.getTime() - a.createdAt.getTime();
      switch (sort) {
        case 'new':
          return b.createdAt.getTime() - a.createdAt.getTime();
        case 'old':
          return a.createdAt.getTime() - b.createdAt.getTime();
        case 'top': {
          const aScore = a.ups - a.downs;
          const bScore = b.ups - b.downs;
          if (aScore === bScore) return tieBreak();
          return bScore - aScore;
        }
        case 'controversial': {
          const aScore = controversialScore(a.ups, a.downs);
          const bScore = controversialScore(b.ups, b.downs);
          if (aScore === bScore) return tieBreak();
          return bScore - aScore;
        }
        case 'qa': {
          const aScore = qaScore(a);
          const bScore = qaScore(b);
          if (aScore === bScore) return tieBreak();
          return bScore - aScore;
        }
        case 'best':
        default: {
          const aScore = wilsonScore(a.ups, a.downs);
          const bScore = wilsonScore(b.ups, b.downs);
          if (aScore === bScore) return tieBreak();
          return bScore - aScore;
        }
      }
    };

    return list.sort(cmp);
  }, [topLevelComments, redditComments, sort]);

  const createCommentMutation = useMutation({
    mutationFn: async (content: string) => {
      return api.post(`/reddit/posts/${subreddit}/${postId}/comments`, {
        content,
        parent_comment_id: null, // Top-level comment only
        parent_reddit_comment_id: null, // Not used here - Reddit replies are handled inline
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['reddit', 'posts', subreddit, postId, 'localComments'],
      });
      setCommentText('');
    },
  });

  const handleSubmitComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      window.dispatchEvent(new CustomEvent('open-auth-modal', { detail: 'login' }));
      return;
    }
    if (!commentText.trim()) return;
    createCommentMutation.mutate(commentText);
  };

  if (!subreddit || !postId) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="text-[var(--color-text-secondary)]">{t('posts.errors.invalidUrl')}</div>
      </div>
    );
  }

  if (loadingReddit) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <LoadingMessage>{t('posts.loading.post')}</LoadingMessage>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-0 py-8 md:px-4">
      <CommunityHeader
        communityType="subreddit"
        communityName={subreddit}
        iconUrl={subredditIcon ?? subredditIconFallback}
        isSubscribed={subscriptionStatus?.is_subscribed ?? false}
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
                  <span>{t('home.search.limitToSubreddit', { subreddit })}</span>
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
                <span>{t('home.search.limitToSubreddit', { subreddit })}</span>
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
      <div className="mt-4 grid gap-6 px-4 md:px-0 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          {/* Post Content Section */}
          {post && (
            <Panel className="text-left">
              {isPostHiddenOverall && (
                <div className="mb-4 rounded border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-900">
                  {t('redditPostPage.hiddenPost.notice')}
                  <button
                    type="button"
                    onClick={() => unhidePostMutation.mutate()}
                    disabled={unhidePostMutation.isPending}
                    className="ml-3 font-semibold text-[var(--color-primary)] hover:underline disabled:opacity-60"
                  >
                    {unhidePostMutation.isPending
                      ? t('posts.status.unhiding')
                      : t('posts.actions.unhide')}
                  </button>
                </div>
              )}
              {isPostAuthorBlocked ? (
                <div className="text-sm text-[var(--color-text-secondary)]">
                  {t('redditPostPage.blockedAuthor.notice', { username: post.author })}
                  <button
                    type="button"
                    onClick={() => unblockRedditUser(post.author)}
                    className="ml-3 text-[var(--color-primary)] hover:underline"
                  >
                    {t('redditPostPage.blockedAuthor.actions.unblock')}
                  </button>
                </div>
              ) : (
                <>
                  <PostHeader
                    title={
                      isExternalLink ? (
                        <a
                          href={sanitizedExternalLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-[var(--color-primary)]"
                        >
                          {decodedTitle}
                        </a>
                      ) : (
                        decodedTitle
                      )
                    }
                    titleBadges={
                      <>
                        {isExternalLink && (
                          <a
                            href={sanitizedExternalLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded border border-[var(--color-border)] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-secondary)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
                          >
                            {externalDomain ?? t('posts.media.externalLinkLabel')}
                            <svg
                              className="h-3 w-3"
                              viewBox="0 0 20 20"
                              fill="currentColor"
                              aria-hidden="true"
                            >
                              <path
                                fillRule="evenodd"
                                d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0112.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h5a.75.75 0 010 1.5h-5z"
                                clipRule="evenodd"
                              />
                              <path
                                fillRule="evenodd"
                                d="M6.194 12.753a.75.75 0 001.06.053L16.5 4.44v2.81a.75.75 0 001.5 0v-4.5a.75.75 0 00-.75-.75h-4.5a.75.75 0 000 1.5h2.553l-9.056 8.194a.75.75 0 00-.053 1.06z"
                                clipRule="evenodd"
                              />
                            </svg>
                          </a>
                        )}
                        {post.over18 && (
                          <FlairBadge
                            text={t('posts.badges.nsfw')}
                            backgroundColor="#dc2626"
                            textColor="#fff"
                            className="uppercase"
                          />
                        )}
                        <FlairBadge
                          text={post.link_flair_text}
                          backgroundColor={post.link_flair_background_color}
                          textColor={post.link_flair_text_color}
                        />
                      </>
                    }
                    metadataItems={[
                      <Link
                        key="subreddit"
                        to={`/r/${post.subreddit}`}
                        className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                      >
                        {t('common.format.subredditPath', { name: post.subreddit })}
                      </Link>,
                      <span key="author">
                        {t('posts.postedByLabel')}{' '}
                        <Link
                          to={`/user/${post.author}`}
                          className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                        >
                          {t('common.format.userPath', { name: post.author })}
                        </Link>
                      </span>,
                      <span key="submitted">
                        {t('posts.submittedAt', {
                          time: formatPostTimestamp(post.created_utc),
                        })}
                      </span>,
                      ...(!isPostAuthorBlocked
                        ? [
                            <button
                              key="block"
                              type="button"
                              onClick={() => blockRedditUser(post.author)}
                              className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                            >
                              {t('redditPostPage.actions.blockUser')}
                            </button>,
                          ]
                        : []),
                    ]}
                  />

                  <RedditPostMedia
                    inlineImage={inlineImage}
                    decodedTitle={decodedTitle}
                    hasGallery={hasGallery}
                    galleryImages={galleryImages}
                    galleryIndex={galleryIndex}
                    imageExpanded={imageExpanded}
                    onToggleExpanded={() => setImageExpanded((prev) => !prev)}
                    onPrevGallery={() =>
                      setGalleryIndex((prev) => (prev === 0 ? galleryImages.length - 1 : prev - 1))
                    }
                    onNextGallery={() =>
                      setGalleryIndex((prev) => (prev === galleryImages.length - 1 ? 0 : prev + 1))
                    }
                    videoData={videoData}
                    videoRef={videoRef}
                    posterUrl={posterUrl}
                    embedUrl={embedUrl}
                    externalVideoUrl={externalVideoUrl}
                  />

                  {post.selftext && <PostBodyMarkdown content={post.selftext} className="mb-4" />}

                  {(() => {
                    if (
                      isExternalLink ||
                      post.is_self ||
                      !sanitizedExternalLink ||
                      hasInlineImage ||
                      hasVideo
                    ) {
                      return null;
                    }

                    return (
                      <div className="mb-4">
                        <a
                          href={sanitizedExternalLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-[var(--color-primary)] hover:underline"
                        >
                          {sanitizedExternalLink} ↗
                        </a>
                      </div>
                    );
                  })()}

                  {/* Post Stats */}
                  <div className="flex flex-wrap gap-4 text-xs text-[var(--color-text-secondary)]">
                    <span>
                      {t('posts.point', {
                        count: post.score,
                        formattedCount: formatNumber(post.score),
                      })}
                    </span>
                    <span>•</span>
                    <span>
                      {t('posts.comment', {
                        count: post.num_comments,
                        formattedCount: formatNumber(post.num_comments),
                      })}
                    </span>
                    <span>•</span>
                    <button onClick={handleSharePost} className="hover:underline">
                      {t('posts.actions.share')}
                    </button>
                    <span>•</span>
                    <button
                      onClick={() => {
                        savePostMutation.mutate(!isPostSavedFromBackend);
                      }}
                      className="hover:underline"
                      disabled={savePostMutation.isPending}
                    >
                      {savePostMutation.isPending
                        ? t('posts.status.saving')
                        : isPostSavedFromBackend
                          ? t('posts.actions.unsave')
                          : t('posts.actions.save')}
                    </button>
                    <span>•</span>
                    {isPostHiddenOverall ? (
                      <button
                        type="button"
                        onClick={() => unhidePostMutation.mutate()}
                        className="hover:underline"
                        disabled={unhidePostMutation.isPending}
                      >
                        {unhidePostMutation.isPending
                          ? t('posts.status.unhiding')
                          : t('posts.actions.unhide')}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowHideConfirm(true)}
                        className="hover:underline"
                      >
                        {t('posts.actions.hide')}
                      </button>
                    )}
                    <span>•</span>
                    <button onClick={openCrosspostModal} className="hover:underline">
                      {t('posts.actions.crosspost')}
                    </button>
                  </div>
                </>
              )}
            </Panel>
          )}

          {/* Unified Comments Section */}
          <Panel className="text-left">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">
                {t('comments.title')}
              </h2>
              <div className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
                <span>{t('comments.sort.label')}</span>
                <select
                  className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-[var(--color-text-primary)]"
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                >
                  <option value="best">{t('comments.sort.options.best')}</option>
                  <option value="new">{t('comments.sort.options.new')}</option>
                  <option value="old">{t('comments.sort.options.old')}</option>
                  <option value="top">{t('comments.sort.options.top')}</option>
                  <option value="controversial">{t('comments.sort.options.controversial')}</option>
                  <option value="qa">{t('comments.sort.options.qa')}</option>
                </select>
              </div>
            </div>

            <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
              <Trans
                i18nKey="redditPostPage.redditComments.readOnlyNote"
                components={{ strong: <strong /> }}
              />
            </div>

            {/* Comment Form */}
            <form id="comment-form" onSubmit={handleSubmitComment} className="mb-6">
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
                disabled={createCommentMutation.isPending || !commentText.trim()}
                className="mt-2 rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)] disabled:opacity-50"
              >
                {createCommentMutation.isPending
                  ? t('comments.status.posting')
                  : t('comments.addComment')}
              </button>
            </form>

            {/* Loading states */}
            {(loadingLocal || loadingReddit) && (
              <LoadingMessage>{t('comments.loading')}</LoadingMessage>
            )}

            {/* Empty state */}
            {!loadingLocal &&
              !loadingReddit &&
              localCommentsData &&
              localCommentsData.length === 0 &&
              redditComments &&
              redditComments.length === 0 &&
              !focusedCommentId && <EmptyMessage>{t('comments.emptyBeFirstOnPost')}</EmptyMessage>}

            {commentNotFound && (
              <div className="rounded border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-900">
                {t('comments.errors.notFound')}
              </div>
            )}

            {focusedCommentId && !commentNotFound && (
              <div className="mb-4 rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                <div>{t('posts.viewingThread')}</div>
                <button
                  onClick={() => navigate(`/r/${subreddit}/comments/${postId}`)}
                  className="mt-1 font-semibold text-[var(--color-primary)] hover:underline"
                >
                  {t('comments.viewRest')}
                </button>
              </div>
            )}

            {/* Combined Comments List */}
            {combinedTopLevel.map((item, index) => {
              const key =
                item.type === 'local'
                  ? `local-${item.local.id}-${index}`
                  : item.reddit.data?.id || `reddit-${index}`;

              if (item.type === 'local') {
                return (
                  <div key={key} className="pb-4">
                    <LocalCommentView
                      comment={item.local}
                      subreddit={subreddit}
                      postId={postId}
                      replyingTo={replyingTo}
                      onReply={(commentId) => {
                        if (!user) {
                          window.dispatchEvent(
                            new CustomEvent('open-auth-modal', { detail: 'login' })
                          );
                          return;
                        }
                        setReplyingTo(commentId);
                      }}
                      onCancelReply={() => setReplyingTo(null)}
                      allComments={localCommentsData || []}
                      currentUsername={user?.username}
                      onPermalink={handlePermalink}
                      onEmbed={handleEmbed}
                      onToggleSave={handleToggleSave}
                      savedCommentIds={savedCommentIds}
                      onEdit={handleEditComment}
                      onDelete={handleDeleteComment}
                      onToggleInbox={handleToggleInbox}
                      useRelativeTime={useRelativeTime}
                    />
                  </div>
                );
              }
              return (
                <div key={key} className="pb-4">
                  <RedditCommentView
                    comment={item.reddit}
                    localComments={localCommentsData || []}
                    subreddit={subreddit || ''}
                    postId={postId || ''}
                    replyingTo={replyingTo}
                    onReply={(commentId) => {
                      if (!user) {
                        window.dispatchEvent(
                          new CustomEvent('open-auth-modal', { detail: 'login' })
                        );
                        return;
                      }
                      setReplyingTo(commentId);
                    }}
                    onCancelReply={() => setReplyingTo(null)}
                    currentUsername={user?.username}
                    onPermalink={handlePermalink}
                    onEmbed={handleEmbed}
                    onToggleSave={handleToggleSave}
                    savedCommentIds={savedCommentIds}
                    onEdit={handleEditComment}
                    onDelete={handleDeleteComment}
                    onToggleInbox={handleToggleInbox}
                    isRedditUserBlocked={isRedditUserBlocked}
                    useRelativeTime={useRelativeTime}
                    postTitle={post?.title}
                    postAuthor={post?.author}
                    savedRedditAPICommentIds={savedRedditAPICommentIds}
                  />
                </div>
              );
            })}
          </Panel>
        </div>

        {subreddit && (
          <aside className="min-w-0 space-y-4">
            <SubredditAboutPanel
              about={subredditAbout}
              iconUrl={subredditIcon ?? subredditIconFallback}
              isLoading={loadingSubredditAbout}
              isError={subredditAboutError}
              activeOmniUsers={activeUsersData?.active_users ?? null}
            />
          </aside>
        )}
      </div>

      {/* Embed Modal */}
      {embedTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-2xl rounded-lg bg-white p-4 shadow-lg">
            <div className="flex items-start justify-between">
              <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
                {t('posts.embed.title')}
              </h3>
              <button
                onClick={() => setEmbedTarget(null)}
                className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
              >
                {t('common.close')}
              </button>
            </div>
            <div className="mt-3 rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm text-[var(--color-text-primary)]">
              <div className="mb-1 text-xs text-[var(--color-text-secondary)]">
                {t('posts.embed.previewLabel')}
              </div>
              <div className="font-semibold">
                {t('common.format.userPath', { name: embedTarget.author })}
              </div>
              <div className="text-[var(--color-text-primary)]">{embedTarget.body}</div>
              <a
                href={embedTarget.permalink}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-block text-xs text-[var(--color-primary)] hover:underline"
              >
                {t('redditPostPage.embed.viewOnReddit')}
              </a>
            </div>
            <div className="mt-3">
              <div className="mb-1 text-xs text-[var(--color-text-secondary)]">
                {t('posts.embed.instruction')}
              </div>
              <textarea
                readOnly
                className="h-32 w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-xs text-[var(--color-text-primary)]"
                value={buildEmbedHtml(embedTarget)}
              />
              <div className="mt-2 flex justify-end gap-2">
                <button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(buildEmbedHtml(embedTarget));
                      alert(t('alerts.embedCopied'));
                    } catch {
                      alert(t('alerts.embedCopyFailed'));
                    }
                  }}
                  className="rounded bg-[var(--color-primary)] px-3 py-1 text-xs font-semibold text-white hover:bg-[var(--color-primary-dark)]"
                >
                  {t('posts.actions.copyEmbed')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Hide Confirmation Modal */}
      {showHideConfirm && post && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-lg">
            <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
              {t('modals.hide.title')}
            </h3>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              <Trans
                i18nKey="modals.hide.descriptionWithLink"
                components={{
                  a: <a href="/hidden" className="text-[var(--color-primary)] hover:underline" />,
                }}
              />
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setShowHideConfirm(false)}
                className="rounded border border-[var(--color-border)] px-3 py-1 text-sm hover:bg-[var(--color-surface-elevated)]"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={() => hidePostMutation.mutate()}
                disabled={hidePostMutation.isPending}
                className="rounded bg-[var(--color-primary)] px-3 py-1 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)] disabled:opacity-50"
              >
                {hidePostMutation.isPending ? t('modals.hide.hiding') : t('modals.hide.hideButton')}
              </button>
            </div>
          </div>
        </div>
      )}

      <CrosspostModal
        isOpen={showCrosspostModal && Boolean(post)}
        onClose={resetCrosspostState}
        hubOptions={hubOptions}
        allowSubredditInput
        hubValue={selectedHub}
        subredditValue={selectedCrosspostSubreddit}
        titleValue={crosspostTitle}
        sendRepliesToInbox={sendRepliesToInbox}
        onHubChange={setSelectedHub}
        onSubredditChange={setSelectedCrosspostSubreddit}
        onTitleChange={setCrosspostTitle}
        onToggleSendReplies={setSendRepliesToInbox}
        onSubmit={() => crosspostMutation.mutate()}
        isSubmitting={crosspostMutation.isPending}
        isSubmitDisabled={isCrosspostSubmitDisabled}
      />
    </div>
  );
}
