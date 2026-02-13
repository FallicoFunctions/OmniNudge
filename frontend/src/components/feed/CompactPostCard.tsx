import { Link } from 'react-router-dom';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { getPostUrl } from '../../utils/postUrl';
import { resolveMediaUrl } from '../../utils/mediaUrl';
import { HlsVideo, type HlsVideoHandle } from '../common/HlsVideo';
import { ImageCarousel } from './ImageCarousel';
import { ExpandedPost } from './ExpandedPost';
import { ExpandedMessage } from './ExpandedMessage';
import { useAuth } from '../../contexts/AuthContext';
import { decryptMessage, decryptMultiRecipientContent } from '../../utils/encryption';
import { getOwnKeys } from '../../services/keyManagementService';
import { hubsService } from '../../services/hubsService';
import type { PlatformPost } from '../../types/posts';
import type { CombinedFeedItem } from '../../services/feedService';
import type { Conversation, Message } from '../../types/messages';
import type { LocalSubredditPost } from '../../services/hubsService';
import type { RedditApiPost } from '../../types/reddit';
import { useFormat } from '../../hooks/useFormat';

interface CompactPostCardProps {
  post: PlatformPost | RedditApiPost | LocalSubredditPost | CombinedFeedItem | Conversation;
  feedType: 'home' | 'subreddit' | 'hub' | 'messages';
  postIndex: number;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  shouldPreloadVideo?: boolean;
  defaultVideoAspectRatio?: number;
  scrollRoot?: React.RefObject<HTMLDivElement | null>;
  onVideoVisibilityChange?: (postIndex: number, isVisible: boolean) => void;
}

type PostSource = 'home' | 'subreddit' | 'hub' | 'messages' | 'reddit';

type PostWithMedia = {
  id?: number | string;
  title?: string;
  author_username?: string | null;
  author?: { username?: string | null } | string | null;
  score?: number;
  comment_count?: number;
  num_comments?: number;
  nsfw?: boolean;
  over_18?: boolean;
  over18?: boolean;
  media_url?: string | null;
  url?: string | null;
  thumbnail_url?: string | null;
  thumbnail?: string | null;
  preview?: { images?: Array<{ source?: { url?: string; width?: number; height?: number } }> };
  is_video?: boolean;
  is_gallery?: boolean;
  gallery_images?: PlatformPost['gallery_images'];
  secure_media?: {
    reddit_video?: { hls_url?: string; width?: number; height?: number };
    oembed?: { thumbnail_width?: number; thumbnail_height?: number };
  };
  media?: {
    reddit_video?: { hls_url?: string; width?: number; height?: number };
    oembed?: { thumbnail_width?: number; thumbnail_height?: number };
  };
  created_at?: string;
  created_utc?: number;
  crossposted_at?: string;
  subreddit?: string;
  hub_name?: string | null;
  hub?: { name?: string | null } | null;
};

function DecryptedMessagePreview({
  message,
  isOwnMessage,
  userId,
}: {
  message?: Message | null;
  isOwnMessage: boolean;
  userId?: number;
}) {
  const [preview, setPreview] = useState('');

  useEffect(() => {
    if (!message) {
      setPreview('');
      return;
    }
    const cipherText = isOwnMessage
      ? message.sender_encrypted_content ?? message.encrypted_content
      : message.encrypted_content;

    if (!cipherText) {
      setPreview('');
      return;
    }

    setPreview(cipherText);

    const attemptDecryption = async () => {
      if (message.is_multi_recipient && message.shared_encryption_iv && message.recipient_keys) {
        try {
          const keys = await getOwnKeys();
          const encryptedKey = userId ? message.recipient_keys?.[userId] : null;
          if (keys?.privateKey && encryptedKey) {
            const decrypted = await decryptMultiRecipientContent(
              cipherText,
              encryptedKey,
              message.shared_encryption_iv,
              keys.privateKey
            );
            setPreview(decrypted);
            return;
          }
        } catch (error) {
          console.warn('Failed to decrypt multi-recipient preview:', error);
        }
      }

      const shouldAttemptDecrypt = Boolean(
        (isOwnMessage && message.sender_encrypted_content) ||
          (!isOwnMessage && message.encryption_version === 'v1')
      );

      if (!shouldAttemptDecrypt) {
        setPreview(cipherText);
        return;
      }

      try {
        const keys = await getOwnKeys();
        if (!keys) {
          setPreview(cipherText);
          return;
        }
        const decrypted = await decryptMessage(cipherText, keys.privateKey);
        setPreview(decrypted);
      } catch (error) {
        console.warn('Failed to decrypt preview, showing ciphertext:', error);
        setPreview(cipherText);
      }
    };

    attemptDecryption();
  }, [
    message,
    isOwnMessage,
    message?.encrypted_content,
    message?.sender_encrypted_content,
    message?.encryption_version,
    message?.is_multi_recipient,
    message?.shared_encryption_iv,
    message?.recipient_keys,
    userId,
  ]);

  if (!preview) {
    return null;
  }

  return <>{preview}</>;
}

export function CompactPostCard({
  post,
  feedType,
  postIndex,
  isExpanded = false,
  onToggleExpand,
  shouldPreloadVideo = false,
  defaultVideoAspectRatio = 16 / 9,
  scrollRoot,
  onVideoVisibilityChange,
}: CompactPostCardProps) {
  const { t } = useTranslation();
  const { formatNumber, formatRelativeTime } = useFormat();
  const { user } = useAuth();
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [isGalleryHovered, setIsGalleryHovered] = useState(false);
  const titleAreaRef = useRef<HTMLDivElement>(null);
  const [isTitleAreaHovered, setIsTitleAreaHovered] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HlsVideoHandle>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const hasStartedLoadRef = useRef(false);
  const isMessageFeed = feedType === 'messages';
  const conversation = isMessageFeed ? (post as Conversation) : null;
  const otherUser = conversation?.other_user;
  const lastMessage = conversation?.latest_message;
  const isOwnMessage = lastMessage?.sender_id === user?.id;
  const isModMail = conversation?.conversation_type === 'mod_mail';
  const hubName = conversation?.hub_name ?? '';

  const { data: hubDetails } = useQuery({
    queryKey: ['hub-details', hubName],
    queryFn: () => hubsService.getHub(hubName),
    enabled: Boolean(isMessageFeed && isModMail && hubName),
  });
  const hubDisplayTitle = hubDetails?.title?.trim() || hubName;
  const modMailTitle = t('posts.compact.modMailTitle', {
    hub: hubDisplayTitle || t('posts.compact.hubFallback'),
    subject: conversation?.subject || t('posts.compact.untitled'),
  });

  const handleVideoMouseEnter = () => {
    videoRef.current?.video?.play().catch(() => {});
  };

  const handleVideoMouseLeave = () => {
    videoRef.current?.video?.pause();
  };
  // Non-message post derived values
  const isRedditPost = !isMessageFeed && ('subreddit' in post || 'permalink' in post);
  const isHubPost = !isMessageFeed && 'hub_name' in post && !('subreddit' in post);
  const isCombinedItem = !isMessageFeed && 'source' in post && 'post' in post;

  let actualPost: PostWithMedia | null = null;
  let source: PostSource = feedType;

  if (!isMessageFeed) {
    if (isCombinedItem) {
      const combinedItem = post as CombinedFeedItem;
      actualPost = combinedItem.post as PostWithMedia;
      source = combinedItem.source === 'reddit' ? 'reddit' : 'hub';
    } else {
      actualPost = post as PostWithMedia;
    }
  }

  // Determine post type and extract data
  const title = actualPost?.title || t('posts.compact.untitled');
  const author =
    actualPost?.author_username ||
    (typeof actualPost?.author === 'string' ? actualPost.author : actualPost?.author?.username) ||
    t('posts.unknownAuthor');
  const score = actualPost?.score ?? 0;
  const commentCount = actualPost?.comment_count ?? actualPost?.num_comments ?? 0;
  const pointsLabel = t('posts.point', {
    count: score,
    formattedCount: formatNumber(score),
  });
  const commentsLabel = t('posts.comment', {
    count: commentCount,
    formattedCount: formatNumber(commentCount),
  });
  const nsfw = actualPost?.nsfw || actualPost?.over_18 || actualPost?.over18 || false;

  // Media handling - prioritize actual media over thumbnails
  const mediaUrl = actualPost?.media_url || actualPost?.url;
  let thumbnail = actualPost?.thumbnail_url || actualPost?.thumbnail;

  // For Reddit posts, check for high-resolution preview image
  if (actualPost && (isRedditPost || source === 'reddit')) {
    const previewUrl = actualPost.preview?.images?.[0]?.source?.url;
    if (previewUrl) {
      // Decode HTML entities in preview URL
      const sanitizedPreview = previewUrl.replace(/&amp;/g, '&');
      // Use preview as thumbnail - it's higher quality than the thumbnail field
      thumbnail = sanitizedPreview;
    }
  }

  // Clean up invalid thumbnails
  if (thumbnail === 'self' || thumbnail === 'default' || thumbnail === 'nsfw' || thumbnail === 'spoiler') {
    thumbnail = null;
  }

  // Check for gallery posts
  const galleryImages = actualPost?.gallery_images;
  const isGallery = Boolean(actualPost?.is_gallery || (galleryImages && galleryImages.length > 0));

  // Gallery navigation functions
  const handleGalleryNavigate = useCallback((direction: 'prev' | 'next') => {
    if (!galleryImages || galleryImages.length <= 1) return;

    if (direction === 'prev') {
      setGalleryIndex((prev) => (prev === 0 ? galleryImages.length - 1 : prev - 1));
    } else {
      setGalleryIndex((prev) => (prev === galleryImages.length - 1 ? 0 : prev + 1));
    }
  }, [galleryImages]);

  // Keyboard navigation for gallery when hovering over image or title area
  useEffect(() => {
    if (!isGallery || !galleryImages || galleryImages.length <= 1) return;
    if (!isGalleryHovered && !isTitleAreaHovered) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        e.stopPropagation();
        handleGalleryNavigate('prev');
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        e.stopPropagation();
        handleGalleryNavigate('next');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isGallery, isGalleryHovered, isTitleAreaHovered, galleryImages, galleryIndex, handleGalleryNavigate]);

  // For Reddit videos, get HLS URL (has audio+video in one stream)
  const redditVideo = actualPost?.secure_media?.reddit_video || actualPost?.media?.reddit_video;
  const redditHlsUrl = redditVideo?.hls_url;
  const isRedditVideo = Boolean(redditHlsUrl);

  // Determine media type and URL
  const isVideo = actualPost?.is_video ||
    isRedditVideo ||
    mediaUrl?.includes('.mp4') ||
    mediaUrl?.includes('.webm') ||
    mediaUrl?.includes('v.redd.it') ||
    mediaUrl?.includes('redgifs.com') ||
    mediaUrl?.includes('gfycat.com');

  const isImage = !isVideo && !isGallery && (
    mediaUrl?.match(/\.(jpg|jpeg|png|gif|webp)$/i) ||
    mediaUrl?.includes('i.redd.it') ||
    mediaUrl?.includes('preview.redd.it') ||
    thumbnail?.includes('i.redd.it') ||
    thumbnail?.includes('preview.redd.it')
  );

  // Determine what media to display
  let displayMedia: string | null = null;
  if (isVideo) {
    // For Reddit videos, use HLS URL (contains audio+video)
    if (isRedditVideo && redditHlsUrl) {
      displayMedia = redditHlsUrl;
    } else if (mediaUrl) {
      displayMedia = mediaUrl;
    }
  } else if (isImage) {
    // For images, prefer the full media URL over thumbnail
    if (mediaUrl && (mediaUrl.includes('i.redd.it') || mediaUrl.includes('preview.redd.it') || mediaUrl.match(/\.(jpg|jpeg|png|gif|webp)$/i))) {
      displayMedia = mediaUrl;
    } else if (thumbnail) {
      displayMedia = thumbnail;
    }
  } else if (!isGallery && thumbnail) {
    // Fall back to thumbnail for any non-gallery post
    displayMedia = thumbnail;
  }

  const previewDimensions = actualPost?.preview?.images?.[0]?.source;
  const oembedDimensions = actualPost?.secure_media?.oembed || actualPost?.media?.oembed;
  const explicitVideoWidth =
    redditVideo?.width ||
    previewDimensions?.width ||
    oembedDimensions?.thumbnail_width;
  const explicitVideoHeight =
    redditVideo?.height ||
    previewDimensions?.height ||
    oembedDimensions?.thumbnail_height;
  const videoAspectRatio =
    explicitVideoWidth && explicitVideoHeight
      ? explicitVideoWidth / explicitVideoHeight
      : defaultVideoAspectRatio;

  // URL generation
  let postUrl = '#';
  if (actualPost) {
    if (isHubPost || source === 'hub') {
      postUrl = getPostUrl(actualPost as PlatformPost);
    } else if (isRedditPost || source === 'reddit') {
      postUrl = `/r/${actualPost.subreddit}/comments/${actualPost.id}`;
    }
  }

  // Time formatting
  let timeAgo = '';
  if (actualPost?.created_at) {
    timeAgo = formatRelativeTime(new Date(actualPost.created_at));
  } else if (actualPost?.created_utc) {
    timeAgo = formatRelativeTime(new Date(actualPost.created_utc * 1000));
  } else if (actualPost?.crossposted_at) {
    timeAgo = formatRelativeTime(new Date(actualPost.crossposted_at));
  }

  // Source badge
  let sourceBadge = '';
  if (actualPost) {
    if (isHubPost || source === 'hub') {
      sourceBadge = `h/${actualPost.hub_name || actualPost.hub?.name || t('posts.compact.unknownSource')}`;
    } else if (isRedditPost || source === 'reddit') {
      sourceBadge = `r/${actualPost.subreddit || t('posts.compact.unknownSource')}`;
    }
  }

  const handleTitleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (onToggleExpand) {
      onToggleExpand();
    }
  };

  const handleCollapse = () => {
    if (onToggleExpand) {
      onToggleExpand();
      // Scroll card into view
      setTimeout(() => {
        cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 100);
    }
  };

  useEffect(() => {
    if (!isVideo || !shouldPreloadVideo || hasStartedLoadRef.current) return;
    hasStartedLoadRef.current = true;
    videoRef.current?.startLoad(-1);
    videoRef.current?.video?.load();
  }, [isVideo, shouldPreloadVideo]);

  useEffect(() => {
    if (!isVideo || !onVideoVisibilityChange) return;
    const target = videoContainerRef.current;
    if (!target) return;

    if (!('IntersectionObserver' in window)) {
      onVideoVisibilityChange(postIndex, true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          onVideoVisibilityChange(postIndex, entry.isIntersecting);
        });
      },
      {
        root: scrollRoot?.current ?? null,
        rootMargin: '200px 0px',
        threshold: 0.1,
      }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [isVideo, onVideoVisibilityChange, postIndex, scrollRoot]);

  if (isMessageFeed && conversation) {
    return (
      <article className="compact-post-card">
        {isExpanded ? (
          <ExpandedMessage conversation={conversation} onCollapse={onToggleExpand!} />
        ) : (
          <div
            onClick={onToggleExpand}
            className="block hover:bg-[var(--color-hover)] transition-colors cursor-pointer"
          >
            <div className="flex items-start gap-2 p-2">
              {/* Avatar */}
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-[var(--color-background)] overflow-hidden">
                {otherUser?.avatar_url ? (
                  <img
                    src={resolveMediaUrl(otherUser.avatar_url)}
                    alt={otherUser.username || t('posts.compact.user')}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[var(--color-text-muted)]">
                    {(otherUser?.username?.[0] || '?').toUpperCase()}
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-medium leading-tight text-[var(--color-primary)]">
                  {isModMail ? modMailTitle : otherUser?.username || t('posts.compact.unknownUser')}
                </h3>
                {lastMessage && lastMessage.encrypted_content && (
                  <p className="text-xs text-[var(--color-text-muted)] mt-1 line-clamp-1">
                    <DecryptedMessagePreview
                      message={lastMessage}
                      isOwnMessage={!!isOwnMessage}
                      userId={user?.id}
                    />
                  </p>
                )}
                <div className="text-xs text-[var(--color-text-muted)] mt-1">
                  {conversation.last_message_at && formatRelativeTime(new Date(conversation.last_message_at))}
                </div>
              </div>
            </div>
          </div>
        )}
        <div className="border-b border-[var(--color-border)]" />
      </article>
    );
  }

  return (
    <article ref={cardRef} className="compact-post-card">
      {/* Expanded view */}
      {isExpanded && actualPost && actualPost.id !== undefined && (
        <ExpandedPost post={actualPost as { id: string | number }} onCollapse={handleCollapse} />
      )}

      {/* Compact view - hide when expanded */}
      {!isExpanded && (
        <>
      {/* Media (full width if available) */}
      {isGallery && galleryImages && galleryImages.length > 0 ? (
        <ImageCarousel
          images={galleryImages}
          title={title}
          className="w-full"
          currentIndex={galleryIndex}
          onNavigate={handleGalleryNavigate}
          onHoverChange={setIsGalleryHovered}
        />
      ) : displayMedia ? (
        <div className="w-full">
          {isVideo ? (
            <div onMouseEnter={handleVideoMouseEnter} onMouseLeave={handleVideoMouseLeave}>
              <div
                ref={videoContainerRef}
                className="relative w-full overflow-hidden bg-black/10"
                style={{ aspectRatio: videoAspectRatio, maxHeight: 'calc(100vh - 200px)' }}
              >
                <HlsVideo
                  ref={videoRef}
                  src={(displayMedia ?? '').startsWith('http')
                    ? (displayMedia ?? '')
                    : resolveMediaUrl(displayMedia ?? '') ?? ''}
                  className="absolute inset-0 w-full h-full object-contain"
                  style={{ display: 'block' }}
                  controls
                  loop
                  playsInline
                  preload={shouldPreloadVideo ? 'auto' : 'metadata'}
                  autoStartLoad={false}
                  maxBufferLength={5}
                />
              </div>
            </div>
          ) : (
            <img
              src={displayMedia.startsWith('http') ? displayMedia : resolveMediaUrl(displayMedia)}
              alt={title}
              className="w-full h-auto"
              style={{ display: 'block', maxHeight: 'calc(100vh - 200px)', objectFit: 'contain' }}
              loading="lazy"
            />
          )}
        </div>
      ) : null}

      {/* Content below media */}
      <div className="p-2 bg-[var(--color-surface)] flex gap-2">
        {/* Left side - Text content */}
        <div
          ref={titleAreaRef}
          className="flex-1 min-w-0"
          onMouseEnter={() => setIsTitleAreaHovered(true)}
          onMouseLeave={() => setIsTitleAreaHovered(false)}
        >
          {/* Title */}
          <Link to={postUrl} onClick={handleTitleClick} className="hover:underline">
            <h3 className="text-sm font-medium leading-tight line-clamp-2" style={{ color: 'var(--ac-text, #e8e8f0)' }}>
              {nsfw && <span className="text-red-500 text-xs mr-1">{t('posts.badges.nsfw')}</span>}
              {title}
            </h3>
          </Link>

          {/* Source badge */}
          {sourceBadge && (
            <div className="mt-1 overflow-hidden">
              <span className="text-xs block" style={{ color: 'var(--ac-text-muted, #8a8a9a)' }}>{sourceBadge}</span>
            </div>
          )}

          {/* Metadata */}
          <div className="flex items-center gap-1.5 mt-1 text-xs flex-wrap" style={{ color: 'var(--ac-text-muted, #8a8a9a)' }}>
            <span className="truncate" style={{ maxWidth: '80px' }}>{author}</span>
            <span>•</span>
            <span>{pointsLabel}</span>
            <span>•</span>
            <span>{commentsLabel}</span>
            {timeAgo && (
              <>
                <span>•</span>
                <span className="whitespace-nowrap">{timeAgo}</span>
              </>
            )}
          </div>
        </div>

        {/* Right side - Vote buttons (only for hub/omni posts) */}
        {(isHubPost || source === 'hub') && (
          <div className="flex flex-col items-center justify-center gap-1">
            <button
              onClick={(e) => {
                e.preventDefault();
                // Upvote functionality placeholder
              }}
              className="text-[var(--color-text-muted)] hover:text-cyan-500 transition-colors"
              aria-label={t('posts.actions.upvote')}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
            </button>
            <span className="text-xs font-semibold" style={{ color: 'var(--ac-text, #e8e8f0)' }}>
              {formatNumber(score)}
            </span>
            <button
              onClick={(e) => {
                e.preventDefault();
                // Downvote functionality placeholder
              }}
              className="text-[var(--color-text-muted)] hover:text-red-500 transition-colors"
              aria-label={t('posts.actions.downvote')}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M12 5v14M19 12l-7 7-7-7" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Bottom border only (no rounded corners) */}
      <div className="border-b border-[var(--color-border)]" />
      </>
      )}
    </article>
  );
}
