import { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useColumnFeed } from '../../hooks/useColumnFeed';
import { CompactPostCard } from './CompactPostCard';
import type { ColumnConfig } from '../../contexts/MultiColumnFeedContext';
import { messagesService } from '../../services/messagesService';
import { usersService } from '../../services/usersService';
import { mediaService } from '../../services/mediaService';
import type { Message } from '../../types/messages';
import type { CombinedFeedItem } from '../../services/feedService';
import type { RedditApiPost } from '../../types/reddit';
import type { LocalSubredditPost } from '../../services/hubsService';
import type { Conversation } from '../../types/messages';

interface ColumnFeedProps {
  columnId: string;
  config: ColumnConfig;
  isActive: boolean;
  showBorder: boolean;
}

type ColumnFeedItem = CombinedFeedItem | RedditApiPost | LocalSubredditPost | Conversation;

type MediaCandidate = {
  secure_media?: {
    reddit_video?: { width?: number; height?: number; hls_url?: string };
    oembed?: { thumbnail_width?: number; thumbnail_height?: number };
  };
  media?: {
    reddit_video?: { width?: number; height?: number; hls_url?: string };
    oembed?: { thumbnail_width?: number; thumbnail_height?: number };
  };
  preview?: { images?: Array<{ source?: { width?: number; height?: number } }> };
  media_url?: string | null;
  url?: string | null;
  is_video?: boolean;
};

const unwrapPost = (post: ColumnFeedItem) => {
  if (post && typeof post === 'object' && 'post' in post) {
    return (post as CombinedFeedItem).post;
  }
  return post;
};

const getPostId = (
  post: ColumnFeedItem,
  index: number,
  feedType: ColumnFeedProps['config']['feedType']
) => {
  if (post && typeof post === 'object') {
    if ('post' in post) {
      const inner = (post as CombinedFeedItem).post as { id?: string | number };
      if (inner?.id !== undefined) {
        return inner.id;
      }
    }
    if ('id' in post && (post as { id?: string | number }).id !== undefined) {
      return (post as { id: string | number }).id;
    }
  }
  return `${feedType}-${index}`;
};

function extractVideoDimensions(post: ColumnFeedItem) {
  const actualPost = unwrapPost(post) as MediaCandidate;
  const redditVideo = actualPost.secure_media?.reddit_video || actualPost.media?.reddit_video;
  if (redditVideo?.width && redditVideo?.height) {
    return { width: redditVideo.width, height: redditVideo.height };
  }

  const previewSource = actualPost?.preview?.images?.[0]?.source;
  if (previewSource?.width && previewSource?.height) {
    return { width: previewSource.width, height: previewSource.height };
  }

  const oembed = actualPost?.secure_media?.oembed || actualPost?.media?.oembed;
  if (oembed?.thumbnail_width && oembed?.thumbnail_height) {
    return { width: oembed.thumbnail_width, height: oembed.thumbnail_height };
  }

  return null;
}

function isVideoPost(post: ColumnFeedItem) {
  const actualPost = unwrapPost(post) as MediaCandidate;
  const redditVideo = actualPost.secure_media?.reddit_video || actualPost.media?.reddit_video;
  const redditHlsUrl = redditVideo?.hls_url;
  const mediaUrl = actualPost.media_url || actualPost.url;
  return Boolean(
    actualPost.is_video ||
    redditHlsUrl ||
    mediaUrl?.includes('.mp4') ||
    mediaUrl?.includes('.webm') ||
    mediaUrl?.includes('v.redd.it') ||
    mediaUrl?.includes('redgifs.com') ||
    mediaUrl?.includes('gfycat.com')
  );
}

function inferMessageTypeFromFile(file: File): Message['message_type'] {
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('audio/')) return 'audio';
  return 'file';
}

export function ColumnFeed({ columnId, config, isActive, showBorder }: ColumnFeedProps) {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [expandedPostIds, setExpandedPostIds] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();
  const usernameInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showNewMessageInput, setShowNewMessageInput] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newUsernameError, setNewUsernameError] = useState<string | null>(null);
  const [pendingRecipient, setPendingRecipient] = useState<string | null>(null);
  const [messageText, setMessageText] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [pendingOpenConversationId, setPendingOpenConversationId] = useState<number | null>(null);
  const [composerError, setComposerError] = useState<string | null>(null);

  const { data, isLoading, isError, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useColumnFeed(columnId, config);

  // Flatten all pages into single array
  const allPosts = useMemo<ColumnFeedItem[]>(() => {
    const pages = data?.pages ?? [];
    return pages.flatMap((page) => {
      if (Array.isArray(page)) return page as ColumnFeedItem[];
      if (!page || typeof page !== 'object') return [];

      if ('posts' in page && Array.isArray((page as { posts?: unknown }).posts)) {
        return (page as { posts: ColumnFeedItem[] }).posts;
      }
      if ('data' in page) {
        const children = (page as { data?: { children?: Array<{ data?: ColumnFeedItem }> } }).data
          ?.children;
        if (Array.isArray(children)) {
          return children.map((child) => child.data).filter(Boolean) as ColumnFeedItem[];
        }
      }
      if (
        'conversations' in page &&
        Array.isArray((page as { conversations?: unknown }).conversations)
      ) {
        return (page as { conversations: ColumnFeedItem[] }).conversations;
      }
      return [];
    });
  }, [data?.pages]);

  const videoPostIndices = useMemo(() => {
    const indices: number[] = [];
    allPosts.forEach((post, index) => {
      if (isVideoPost(post)) {
        indices.push(index);
      }
    });
    return indices;
  }, [allPosts]);

  const videoIndexByPostIndex = useMemo(() => {
    const map = new Map<number, number>();
    videoPostIndices.forEach((postIndex, videoIndex) => {
      map.set(postIndex, videoIndex);
    });
    return map;
  }, [videoPostIndices]);

  const defaultVideoAspectRatio = useMemo(() => {
    const sampleLimit = 20;
    let portrait = 0;
    let landscape = 0;

    for (let i = 0; i < allPosts.length; i += 1) {
      const post = allPosts[i];
      if (!isVideoPost(post)) continue;
      const dims = extractVideoDimensions(post);
      if (!dims) continue;
      if (dims.height >= dims.width) {
        portrait += 1;
      } else {
        landscape += 1;
      }
      if (portrait + landscape >= sampleLimit) break;
    }

    const total = portrait + landscape;
    if (total === 0) return 16 / 9;
    return portrait / total >= 0.6 ? 9 / 16 : 16 / 9;
  }, [allPosts]);

  const visibleVideoIndicesRef = useRef<Set<number>>(new Set());
  const [anchorVideoIndex, setAnchorVideoIndex] = useState(0);

  const handleVideoVisibilityChange = useCallback(
    (postIndex: number, isVisible: boolean) => {
      const videoIndex = videoIndexByPostIndex.get(postIndex);
      if (videoIndex === undefined) return;
      const visibleSet = visibleVideoIndicesRef.current;
      if (isVisible) {
        visibleSet.add(videoIndex);
      } else {
        visibleSet.delete(videoIndex);
      }
      if (visibleSet.size === 0) return;
      const minVisible = Math.min(...Array.from(visibleSet.values()));
      setAnchorVideoIndex(minVisible);
    },
    [videoIndexByPostIndex]
  );

  useEffect(() => {
    if (!showNewMessageInput) return;
    usernameInputRef.current?.focus();
  }, [showNewMessageInput]);

  useEffect(() => {
    if (!pendingOpenConversationId) return;
    const hasConversation = allPosts.some((post, index) => {
      return String(getPostId(post, index, config.feedType)) === String(pendingOpenConversationId);
    });
    if (!hasConversation) return;
    setExpandedPostIds((prev) => {
      const next = new Set(prev);
      next.add(String(pendingOpenConversationId));
      return next;
    });
    setPendingOpenConversationId(null);
  }, [allPosts, pendingOpenConversationId, config.feedType]);

  // Infinite scroll: Load more when scrolled near bottom
  useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl || !isActive) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = scrollEl;
      const scrolledPercentage = (scrollTop + clientHeight) / scrollHeight;

      if (scrolledPercentage > 0.8 && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    };

    scrollEl.addEventListener('scroll', handleScroll);
    return () => scrollEl.removeEventListener('scroll', handleScroll);
  }, [isActive, hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Prevent wheel events from bubbling to other columns
  useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;

    const handleWheel = (e: WheelEvent) => {
      if (isActive) {
        e.stopPropagation();
      }
    };

    scrollEl.addEventListener('wheel', handleWheel, { passive: true });
    return () => scrollEl.removeEventListener('wheel', handleWheel);
  }, [isActive]);

  if (isLoading) {
    return (
      <div
        className={`column-feed flex items-center justify-center ${
          showBorder ? 'border-r border-[var(--color-border)]' : ''
        }`}
        style={{ height: '100%' }}
      >
        <div className="text-sm text-[var(--color-text-muted)]">{t('common.loading')}</div>
      </div>
    );
  }

  if (isError) {
    return (
      <div
        className={`column-feed flex items-center justify-center p-4 ${
          showBorder ? 'border-r border-[var(--color-border)]' : ''
        }`}
        style={{ height: '100%' }}
      >
        <div className="text-sm text-red-500">
          {t('common.error')}:{' '}
          {error instanceof Error ? error.message : t('columnFeed.errors.loadFailed')}
        </div>
      </div>
    );
  }

  if (allPosts.length === 0) {
    return (
      <div
        className={`column-feed flex items-center justify-center p-4 ${
          showBorder ? 'border-r border-[var(--color-border)]' : ''
        }`}
        style={{ height: '100%' }}
      >
        <div className="text-sm text-[var(--color-text-muted)]">
          {t('columnFeed.noPostsToDisplay')}
        </div>
      </div>
    );
  }

  const handleToggleExpand = (postId: string) => {
    setExpandedPostIds((prev) => {
      const next = new Set(prev);
      if (next.has(postId)) {
        next.delete(postId);
      } else {
        next.add(postId);
      }
      return next;
    });
  };

  const handleUsernameSubmit = async () => {
    const trimmed = newUsername.trim();
    if (!trimmed) {
      setNewUsernameError(t('columnFeed.newMessage.usernameRequired'));
      return;
    }
    if (trimmed.includes('@') || trimmed.includes('/') || /\s/.test(trimmed)) {
      setNewUsernameError(t('columnFeed.newMessage.usernameInvalid'));
      return;
    }
    try {
      await usersService.getProfile(trimmed);
      setPendingRecipient(trimmed);
      setShowNewMessageInput(false);
      setNewUsernameError(null);
    } catch {
      setNewUsernameError(t('columnFeed.newMessage.usernameInvalid'));
    }
  };

  const handleSendNewMessage = async () => {
    if (!pendingRecipient) return;
    if (!messageText.trim() && !selectedFile) return;
    if (sendingMessage || uploadingMedia) return;
    setSendingMessage(true);
    setComposerError(null);

    let mediaFileId: number | undefined;
    let mediaUrl: string | undefined;
    let mediaType: string | undefined;
    let mediaSize: number | undefined;
    let messageType: Message['message_type'] | undefined;

    try {
      if (selectedFile) {
        setUploadingMedia(true);
        const uploadedMedia = await mediaService.uploadMedia(selectedFile);
        mediaFileId = uploadedMedia.id;
        if (uploadedMedia.storage_url) {
          if (uploadedMedia.storage_url.startsWith('http')) {
            const urlObj = new URL(uploadedMedia.storage_url);
            mediaUrl = urlObj.pathname;
          } else {
            mediaUrl = uploadedMedia.storage_url.startsWith('/')
              ? uploadedMedia.storage_url
              : `/${uploadedMedia.storage_url}`;
          }
        } else if (uploadedMedia.storage_path) {
          const normalizedPath = uploadedMedia.storage_path.replace(/^\/?uploads\/?/, '');
          mediaUrl = `/uploads/${normalizedPath}`;
        }
        mediaType = selectedFile.type || uploadedMedia.file_type;
        mediaSize = uploadedMedia.file_size;
        messageType = inferMessageTypeFromFile(selectedFile);
        setUploadingMedia(false);
      }

      const message = await messagesService.sendMessage({
        recipient_username: pendingRecipient,
        content: messageText.trim() || undefined,
        media_file_id: mediaFileId,
        media_url: mediaUrl,
        media_type: mediaType,
        media_size: mediaSize,
        message_type: messageType,
      });

      setMessageText('');
      setSelectedFile(null);
      setPendingRecipient(null);
      setShowNewMessageInput(false);
      setPendingOpenConversationId(message.conversation_id);
      queryClient.invalidateQueries({ queryKey: ['column-feed', columnId] });
    } catch {
      setComposerError('Failed to send message. Please try again.');
    } finally {
      setUploadingMedia(false);
      setSendingMessage(false);
    }
  };

  return (
    <div
      ref={scrollRef}
      className={`column-feed overflow-y-auto ${
        showBorder ? 'border-r border-[var(--color-border)]' : ''
      } ${isActive ? 'ring-2 ring-inset ring-cyan-500/50' : ''}`}
      style={{
        height: '100%',
        scrollbarWidth: 'thin',
        scrollbarColor: 'var(--color-border) transparent',
      }}
    >
      {config.feedType === 'messages' && (
        <div className="border-b border-[var(--color-border)]">
          <button
            type="button"
            onClick={() => {
              setShowNewMessageInput((prev) => !prev);
              setNewUsername('');
              setNewUsernameError(null);
              setComposerError(null);
              setPendingRecipient(null);
            }}
            className="w-full px-3 py-2 text-xs font-semibold text-left text-[var(--color-primary)] hover:bg-[var(--color-hover)] transition-colors"
          >
            Send Message
          </button>
          {showNewMessageInput && !pendingRecipient && (
            <div className="px-3 pb-2">
              {newUsernameError && (
                <div className="text-red-400 text-[10px] mb-1">{newUsernameError}</div>
              )}
              <div className="flex items-center gap-2">
                <input
                  ref={usernameInputRef}
                  type="text"
                  value={newUsername}
                  onChange={(e) => {
                    setNewUsername(e.target.value);
                    if (newUsernameError) setNewUsernameError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleUsernameSubmit();
                    }
                    if (e.key === 'Escape') {
                      setShowNewMessageInput(false);
                      setNewUsernameError(null);
                    }
                  }}
                  placeholder={t('messages.compose.enterUsername')}
                  className="flex-1 bg-[var(--color-background)] text-xs text-[var(--color-text)] placeholder-[var(--color-text-muted)] border border-[var(--color-border)] rounded px-2 py-1 focus:outline-none focus:border-cyan-500"
                />
                <button
                  type="button"
                  onClick={() => {
                    setShowNewMessageInput(false);
                    setNewUsernameError(null);
                    setComposerError(null);
                  }}
                  className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-xs"
                  aria-label={t('common.close')}
                >
                  ✕
                </button>
              </div>
            </div>
          )}
          {pendingRecipient && (
            <div className="px-3 pb-2">
              {composerError && (
                <div className="text-red-400 text-[10px] mb-1">{composerError}</div>
              )}
              {selectedFile && (
                <div className="mb-2 flex items-center gap-2 text-xs text-[var(--color-text)]">
                  <span>📎 {selectedFile.name}</span>
                  <button
                    type="button"
                    onClick={() => setSelectedFile(null)}
                    className="text-red-500 hover:text-red-400"
                  >
                    {t('common.accessibility.removeFile')}
                  </button>
                </div>
              )}
              <div className="flex gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    setSelectedFile(file);
                  }}
                  className="hidden"
                  accept="image/*,video/*,audio/*"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingMedia || sendingMessage}
                  className="p-2 text-[var(--color-text-muted)] hover:text-cyan-500 transition-colors disabled:opacity-50"
                  title={t('messages.compose.attachSingle')}
                >
                  📎
                </button>
                <input
                  type="text"
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSendNewMessage();
                    }
                  }}
                  placeholder={t('messages.typeMessage')}
                  disabled={uploadingMedia || sendingMessage}
                  className="flex-1 bg-[var(--color-background)] text-[var(--color-text)] text-sm px-3 py-2 rounded border border-[var(--color-border)] focus:outline-none focus:border-cyan-500 disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={handleSendNewMessage}
                  disabled={
                    (!messageText.trim() && !selectedFile) || uploadingMedia || sendingMessage
                  }
                  className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white text-sm font-medium rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {uploadingMedia
                    ? t('messages.uploading')
                    : sendingMessage
                      ? t('messages.deliveryStatus.sending')
                      : t('messages.send')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {allPosts.map((post, index) => {
        const postId = String(getPostId(post, index, config.feedType));
        const videoIndex = videoIndexByPostIndex.get(index);
        const shouldPreloadVideo =
          typeof videoIndex === 'number' &&
          videoIndex >= anchorVideoIndex &&
          videoIndex < anchorVideoIndex + 10;
        return (
          <CompactPostCard
            key={postId}
            post={post}
            feedType={config.feedType}
            postIndex={index}
            isExpanded={expandedPostIds.has(postId)}
            onToggleExpand={() => handleToggleExpand(postId)}
            shouldPreloadVideo={shouldPreloadVideo}
            defaultVideoAspectRatio={defaultVideoAspectRatio}
            scrollRoot={scrollRef}
            onVideoVisibilityChange={handleVideoVisibilityChange}
          />
        );
      })}

      {isFetchingNextPage && (
        <div className="p-2 text-center text-xs text-[var(--color-text-muted)]">
          {t('standardScroll.loadingMorePosts')}
        </div>
      )}

      {!hasNextPage && allPosts.length > 10 && (
        <div className="p-2 text-center text-xs text-[var(--color-text-muted)]">
          {t('standardScroll.endOfFeed')}
        </div>
      )}
    </div>
  );
}
