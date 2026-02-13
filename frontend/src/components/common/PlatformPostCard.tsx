import { Link, useLocation } from 'react-router-dom';
import { useMemo, useState, useRef, useEffect, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { useFormat } from '../../hooks/useFormat';
import type { PointerEvent } from 'react';
import { resolveMediaUrl } from '../../utils/mediaUrl';
import { VoteButtons } from '../VoteButtons';
import type { PlatformPost } from '../../types/posts';
import { canModerateContent, requiresModerator } from '../../utils/permissions';
import { PostBodyMarkdown } from '../posts/PostBodyMarkdown';
import { PinnedBadge } from './PinnedBadge';
import { getPostUrl } from '../../utils/postUrl';
import { useSettings } from '../../contexts/SettingsContext';
import { sanitizeHttpUrl } from '../../utils/crosspostHelpers';

type ExternalMedia = { kind: 'iframe'; src: string } | { kind: 'video'; src: string };

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

function withAutoplayParams(src: string, muted: boolean): string {
  try {
    const url = new URL(src);
    if (!url.searchParams.has('autoplay')) {
      url.searchParams.set('autoplay', '1');
    }
    if (muted) {
      if (!url.searchParams.has('mute') && !url.searchParams.has('muted')) {
        url.searchParams.set('mute', '1');
        url.searchParams.set('muted', '1');
      }
    } else {
      url.searchParams.set('mute', '0');
      url.searchParams.set('muted', '0');
    }
    if (!url.searchParams.has('playsinline')) {
      url.searchParams.set('playsinline', '1');
    }
    return url.toString();
  } catch {
    const joiner = src.includes('?') ? '&' : '?';
    const muteValue = muted ? '1' : '0';
    return `${src}${joiner}autoplay=1&mute=${muteValue}&muted=${muteValue}&playsinline=1`;
  }
}


interface PlatformPostCardProps {
  post: PlatformPost;
  useRelativeTime: boolean;
  currentUserId?: number;
  currentUserRole?: string;
  isModerator?: boolean;
  hubNameMap?: Map<number, string>;
  hubDisplayTitle?: string | null;
  currentHubName?: string;
  isSaved?: boolean;
  isSavePending?: boolean;
  isHiding?: boolean;
  isDeleting?: boolean;
  isPinning?: boolean;
  showPinnedGrabber?: boolean;
  showOmniBadge?: boolean; // For local crossposts on subreddit pages
  voteButtonSize?: 'small' | 'medium';
  showTextPreview?: boolean;
  onShare?: () => void;
  onToggleSave?: (shouldSave: boolean) => void;
  onHide?: () => void;
  hideLabel?: string;
  onCrosspost?: () => void;
  onTogglePin?: () => void;
  onPinnedPointerDown?: (postId: number, event: PointerEvent<HTMLButtonElement>) => void;
  onPinnedPointerUp?: (postId: number, event: PointerEvent<HTMLButtonElement>) => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

export function PlatformPostCard({
  post,
  useRelativeTime,
  currentUserId,
  currentUserRole,
  isModerator = false,
  hubNameMap,
  hubDisplayTitle,
  currentHubName,
  isSaved = false,
  isSavePending = false,
  isHiding = false,
  isDeleting = false,
  isPinning = false,
  showPinnedGrabber = false,
  showOmniBadge = false,
  voteButtonSize = 'medium',
  showTextPreview = true,
  onShare,
  onToggleSave,
  onHide,
  hideLabel,
  onCrosspost,
  onTogglePin,
  onPinnedPointerDown,
  onPinnedPointerUp,
  onEdit,
  onDelete,
}: PlatformPostCardProps) {
  const { t } = useTranslation();
  const { formatNumber, formatDate, formatRelativeTime } = useFormat();
  const [expandedTextMap, setExpandedTextMap] = useState<Record<number, boolean>>({});
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const { blockNsfwThumbnails } = useSettings();
  const resolvedHideLabel = hideLabel || t('posts.hide');

  const submittedLabel = useMemo(() => {
    const raw = post.crossposted_at ?? post.created_at;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return t('common.time.recently');

    if (useRelativeTime) {
      return formatRelativeTime(d);
    }

    return formatDate(d, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  }, [formatDate, formatRelativeTime, post.created_at, post.crossposted_at, t, useRelativeTime]);

  const toggleTextPreview = (postId: number) => {
    setExpandedTextMap((prev) => ({
      ...prev,
      [postId]: !prev[postId],
    }));
  };

  const location = useLocation();
  const originState = useMemo(
    () => ({ originPath: `${location.pathname}${location.search}` }),
    [location.pathname, location.search]
  );

  const resolvedHubName =
    currentHubName ||
    post.hub?.name ||
    post.hub_name ||
    (post.hub_id ? hubNameMap?.get(post.hub_id) : undefined);
  const resolvedHubTitle = hubDisplayTitle?.trim() || undefined;

  const displayAuthor =
    post.author_username ||
    post.author?.username ||
    (post.author_id === currentUserId ? t('posts.you') : undefined) ||
    t('posts.unknownAuthor');

  const pointsLabel = t('posts.point', {
    count: post.score,
    formattedCount: formatNumber(post.score),
  });
  const commentCount = post.comment_count ?? post.num_comments ?? 0;
  const commentsLabel = t('posts.comment', {
    count: commentCount,
    formattedCount: formatNumber(commentCount),
  });

  const canEdit = currentUserId === post.author_id;
  const canDelete = canModerateContent(currentUserId, post.author_id, currentUserRole, isModerator);
  const canPin = requiresModerator(currentUserRole, isModerator);
  const postUrl = getPostUrl(post);

  const hasBody = Boolean(post.body && post.body.trim());
  const externalMedia = useMemo(() => getExternalVideoMedia(post.media_url), [post.media_url]);
  const hasInlinePreview = Boolean(
    post.thumbnail_url ||
    hasBody ||
    externalMedia ||
    (post.media_url && post.media_type?.startsWith('video'))
  );
  const isInlinePreviewOpen = !!(hasInlinePreview && expandedTextMap[post.id]);

  useEffect(() => {
    if (!isInlinePreviewOpen) return;
    const videoEl = previewVideoRef.current;
    if (!videoEl) return;
    videoEl.muted = false;
    videoEl.volume = 1.0;
    videoEl.play().catch(() => { });
  }, [isInlinePreviewOpen, externalMedia, post.media_url]);

  const getPreviewSizing = (src: string): { className: string; style?: CSSProperties } => {
    if (src.includes('tiktok.com')) {
      return {
        className: 'mx-auto block',
        style: {
          height: 'min(70vh, 640px)',
          aspectRatio: '9 / 16',
          width: 'auto',
          maxWidth: '100%',
        },
      };
    }
    return { className: 'aspect-video w-full' };
  };

  // FEED-4: Fixed thumbnail size for consistency (96x96px)
  const thumbnailClass = 'h-24 w-24'; // 96px x 96px fixed size
  const shouldBlurThumbnail = Boolean(post.nsfw && blockNsfwThumbnails);
  const thumbnailOverlayClass = 'text-[32px]';

  return (
    <article className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="flex items-start gap-3 p-3">
        {/* Vote buttons */}
        <VoteButtons
          postId={post.id}
          initialScore={post.score}
          initialUserVote={post.user_vote ?? null}
          layout="vertical"
          size={voteButtonSize}
        />
        {post.thumbnail_url && (
          <div className={`relative ${thumbnailClass} flex-shrink-0`}>
            <img
              src={resolveMediaUrl(post.thumbnail_url)}
              alt={t('posts.media.previewImageAlt', { title: post.title })}
              loading="lazy"
              decoding="async"
              className={`h-full w-full rounded-lg object-cover ${shouldBlurThumbnail ? 'blur-sm' : ''}`}
            />
            {shouldBlurThumbnail && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span
                  className={`${thumbnailOverlayClass} inline-flex items-center font-extrabold leading-none text-white`}
                  style={{ textShadow: '0 0 2px #000' }}
                >
                  <span>18</span>
                  <span className="relative" style={{ fontSize: '0.95em', top: '-0.02em' }}>
                    +
                  </span>
                </span>
              </div>
            )}
          </div>
        )}
        <div className="flex-1 space-y-1 text-left">
          <div className="flex flex-wrap items-center gap-2">
            <Link to={postUrl} state={originState} className="flex-1">
              <h3 className="text-lg font-semibold leading-snug text-[var(--color-text-primary)] hover:text-[var(--color-primary)]">
                {post.title}
              </h3>
            </Link>
            {showOmniBadge && (
              <span className="inline-flex items-center rounded bg-blue-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                {t('posts.badges.omni')}
              </span>
            )}
            {post.nsfw && (
              <span className="inline-flex items-center rounded bg-red-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                {t('posts.badges.nsfw')}
              </span>
            )}
            {post.is_pinned && <PinnedBadge />}
          </div>

          <div className="text-[11px] leading-tight text-[var(--color-text-secondary)]">
            {resolvedHubName ? (
              <Link
                to={`/h/${resolvedHubName}`}
                className="font-semibold text-[var(--color-text-primary)] hover:text-[var(--color-primary)]"
              >
                {resolvedHubTitle ?? `h/${resolvedHubName}`}
              </Link>
            ) : (
              <span className="font-semibold text-[var(--color-text-primary)]">
                h/{t('posts.unknownHub')}
              </span>
            )}
            <span> · </span>
            <span>{displayAuthor}</span>
            <span> · </span>
            <span>{pointsLabel}</span>
            <span> · </span>
            <span>{t('posts.submittedAt', { time: submittedLabel })}</span>
          </div>

          <div className="mt-1 flex items-start gap-3 text-[11px] text-[var(--color-text-secondary)]">
            {showTextPreview && hasInlinePreview && (
              <button
                type="button"
                onClick={() => toggleTextPreview(post.id)}
                aria-pressed={!!expandedTextMap[post.id]}
                aria-label={isInlinePreviewOpen ? t('posts.aria.hidePreview') : t('posts.aria.showPreview')}
                className="flex h-7 w-7 items-center justify-center rounded border border-[var(--color-border)] bg-[var(--color-surface-elevated)] text-[var(--color-text-secondary)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
              >
                <span className="sr-only">
                  {isInlinePreviewOpen ? t('posts.aria.hidePreview') : t('posts.aria.showPreview')}
                </span>
                {isInlinePreviewOpen ? (
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <line x1="6" y1="6" x2="18" y2="18" />
                    <line x1="6" y1="18" x2="18" y2="6" />
                  </svg>
                ) : (
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M8 5.5v13l10.5-6.5L8 5.5Z" />
                  </svg>
                )}
              </button>
            )}
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-3 text-sm">
                {/* Primary Action: Comments - Most prominent */}
                <Link
                  to={postUrl}
                  state={originState}
                  className="flex items-center gap-1.5 font-medium text-[var(--color-text-primary)] hover:text-[var(--color-primary)]"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  {commentsLabel}
                </Link>

                {/* Secondary Actions: Share, Save */}
                {onShare && (
                  <button
                    type="button"
                    onClick={onShare}
                    className="flex items-center gap-1 text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                    </svg>
                    {t('posts.share')}
                  </button>
                )}
                {onToggleSave && (
                  <button
                    type="button"
                    onClick={() => onToggleSave(!isSaved)}
                    disabled={isSavePending}
                    className="flex items-center gap-1 text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] disabled:opacity-60"
                  >
                    <svg className="w-3.5 h-3.5" fill={isSaved ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                    </svg>
                    {isSavePending ? t('posts.status.saving') : isSaved ? t('posts.actions.unsave') : t('posts.save')}
                  </button>
                )}

                {/* Tertiary Actions: Hide, Crosspost - Smaller, de-emphasized */}
                {(onHide || onCrosspost || (onTogglePin && canPin)) && (
                  <span className="text-[var(--color-border)]">|</span>
                )}
                {onHide && (
                  <button
                    type="button"
                    onClick={onHide}
                    disabled={isHiding}
                    title={resolvedHideLabel}
                    className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-primary)] disabled:opacity-60"
                  >
                    {isHiding ? t('posts.status.hiding') : resolvedHideLabel}
                  </button>
                )}
                {onCrosspost && (
                  <button
                    type="button"
                    onClick={onCrosspost}
                    title={t('posts.actions.crosspostTooltip')}
                    className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-primary)]"
                  >
                    {t('posts.actions.crosspost')}
                  </button>
                )}
                {onTogglePin && canPin && (
                  <button
                    type="button"
                    onClick={onTogglePin}
                    disabled={isPinning}
                    title={
                      post.is_pinned
                        ? t('posts.actions.unpinFromTop')
                        : t('posts.actions.pinToTop')
                    }
                    className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-primary)] disabled:opacity-60"
                  >
                    {isPinning ? t('posts.status.updating') : post.is_pinned ? t('posts.actions.unpin') : t('posts.actions.pin')}
                  </button>
                )}

                {/* Mod/Owner Actions: Edit, Delete - Separated */}
                {((canEdit && onEdit) || (canDelete && onDelete)) && (
                  <span className="text-[var(--color-border)]">|</span>
                )}
                {canEdit && onEdit && (
                  <button
                    type="button"
                    onClick={onEdit}
                    className="text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                  >
                    {t('common.edit')}
                  </button>
                )}
                {canDelete && onDelete && (
                  <button
                    type="button"
                    onClick={onDelete}
                    disabled={isDeleting}
                    className="text-xs text-red-600 hover:text-red-500 font-medium disabled:opacity-60"
                  >
                    {isDeleting ? t('posts.status.deleting') : t('common.delete')}
                  </button>
                )}
              </div>
              {showTextPreview && expandedTextMap[post.id] && (
                <div className="mt-3 overflow-hidden rounded border border-[var(--color-border)] bg-[var(--color-surface-elevated)]">
                  {externalMedia ? (
                    externalMedia.kind === 'iframe' ? (
                      <iframe
                        key={`${post.id}-${isInlinePreviewOpen ? 'open' : 'closed'}`}
                        src={
                          isInlinePreviewOpen
                            ? withAutoplayParams(externalMedia.src, false)
                            : externalMedia.src
                        }
                        title={post.title}
                        className={getPreviewSizing(externalMedia.src).className}
                        style={getPreviewSizing(externalMedia.src).style}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowFullScreen
                      />
                    ) : (
                      <video
                        ref={previewVideoRef}
                        src={externalMedia.src}
                        className={getPreviewSizing(externalMedia.src).className}
                        style={getPreviewSizing(externalMedia.src).style}
                        controls
                        playsInline
                        preload="metadata"
                      />
                    )
                  ) : post.media_url && post.media_type?.startsWith('video') ? (
                    <video
                      ref={previewVideoRef}
                      src={resolveMediaUrl(post.media_url)}
                      className="max-h-[70vh] w-full bg-black"
                      controls
                      playsInline
                      preload="metadata"
                    />
                  ) : post.media_url && post.media_type?.startsWith('image') ? (
                    <img
                      src={resolveMediaUrl(post.media_url)}
                      alt={post.title}
                      loading="lazy"
                      decoding="async"
                      className="max-h-[70vh] w-full object-contain"
                    />
                  ) : post.thumbnail_url ? (
                    <img
                      src={resolveMediaUrl(post.thumbnail_url)}
                      alt={post.title}
                      loading="lazy"
                      decoding="async"
                      className="max-h-[70vh] w-full object-contain"
                    />
                  ) : hasBody ? (
                    <div className="p-4">
                      <PostBodyMarkdown content={post.body!} />
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </div>
        {showPinnedGrabber && (
          <div className="flex flex-shrink-0 items-start pt-1">
            <button
              type="button"
              onPointerDown={(event) => onPinnedPointerDown?.(post.id, event)}
              onPointerUp={(event) => onPinnedPointerUp?.(post.id, event)}
              className="cursor-grab rounded border border-transparent p-1 text-[var(--color-text-secondary)] hover:border-[var(--color-border)] hover:text-[var(--color-primary)] active:cursor-grabbing"
              aria-label={t('posts.aria.reorderPinnedPost')}
              title={t('posts.aria.dragToReorderPinnedPosts')}
            >
              <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden="true">
                <circle cx="6" cy="5" r="1.5" />
                <circle cx="14" cy="5" r="1.5" />
                <circle cx="6" cy="10" r="1.5" />
                <circle cx="14" cy="10" r="1.5" />
                <circle cx="6" cy="15" r="1.5" />
                <circle cx="14" cy="15" r="1.5" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
