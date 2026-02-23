import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  useQueries,
} from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { messagesService } from '../services/messagesService';
import { mediaService } from '../services/mediaService';
import { useAuth } from '../contexts/AuthContext';
import { useMessagingContext } from '../contexts/MessagingContext';
import { useWebSocket } from '../contexts/WebSocketContext';
import { useSettings } from '../contexts/SettingsContext';
import { MessageStatusIndicator } from '../components/messages/MessageStatusIndicator';
import { OnlineStatusIndicator } from '../components/messages/OnlineStatusIndicator';
import { TypingIndicator } from '../components/messages/TypingIndicator';
import { HighlightedText } from '../components/messages/HighlightedText';
import { MessageReactions } from '../components/messages/MessageReactions';
import { QuickReactButton } from '../components/messages/QuickReactButton';
import { PinnedMessagesBar } from '../components/messages/PinnedMessagesBar';
import { ThreadPreview } from '../components/messages/ThreadPreview';
import { ThreadView } from '../components/messages/ThreadView';
import { ReplyIndicator } from '../components/messages/ReplyIndicator';
import { FolderList } from '../components/messages/FolderList';
import { FolderModal } from '../components/messages/FolderModal';
import { FolderBadge, hexToRgba } from '../components/messages/FolderBadge';
import { ConversationFolderMenu } from '../components/messages/ConversationFolderMenu';
import { MessageEditMode } from '../components/messages/MessageEditMode';
import { MessageEditHistory } from '../components/messages/MessageEditHistory';
import { GroupInvitesList } from '../components/messages/GroupInviteCard';
import { GroupDetailsSidebar } from '../components/messages/GroupDetailsSidebar';
import { CreateGroupModal } from '../components/messages/CreateGroupModal';
import { GroupAvatar } from '../components/messages/GroupAvatar';
import { VoiceRecorderButton } from '../components/messages/VoiceRecorderButton';
import { VoiceMessageBubble } from '../components/messages/VoiceMessageBubble';
import { voiceMessagesService } from '../services/voiceMessagesService';
import FilePreview from '../components/messages/FilePreview';
import { usePinnedMessages } from '../hooks/usePinnedMessages';
import { useArchive } from '../hooks/useArchive';
import { useFolders } from '../hooks/useFolders';
import { useMessageEdit, isEditable } from '../hooks/useMessageEdit';
import { useDebounce } from '../hooks/useDebounce';
import { useMediaQuery } from '../hooks/useMediaQuery';
import type {
  Conversation,
  ConversationFolder,
  Message,
  PinnedMessagesResponse,
  SendMessageRequest,
} from '../types/messages';
import type { ModMailConversation } from '../types/modmail';
import { API_BASE_URL } from '../lib/api';
import {
  decryptMessage,
  encryptFile,
  decryptFile,
  encryptKeyWithPublicKey,
  arrayBufferToBase64,
  decryptMultiRecipientContent,
  encryptMessage,
  encryptForMultipleRecipients,
} from '../utils/encryption';
import { getOwnKeys, getUserPublicKey } from '../services/keyManagementService';
import { encryptionService } from '../services/encryptionService';
import { useFormat } from '../hooks/useFormat';
import { LoadingMessage } from '../components/common/StatusMessage';
import { EmptyConversations, EmptyInbox, EmptySearchResults } from '../components/empty';
import { MediaSlideshow } from '../components/slideshow/MediaSlideshow';
import { MediaUploadZone } from '../components/slideshow/MediaUploadZone';
import { RedditPostSlideshow } from '../components/slideshow/RedditPostSlideshow';
import { redditService } from '../services/redditService';
import { hubsService } from '../services/hubsService';
import { useHubSubredditAutocomplete } from '../hooks/useHubSubredditAutocomplete';
import type { LocalSubredditPost } from '../services/hubsService';
import type { RedditApiPost } from '../types/reddit';
import { buildUserReport, reportService, type ReportReason } from '../services/reportService';
import { searchMessages, type MessageSearchFilters, type MessageSearchResult } from '../utils/messageSearch';
import { formatRedditSlideshowInput, parseRedditSlideshowInput } from '../utils/redditSlideshowInput';

const MAX_UPLOAD_SIZE = 25 * 1024 * 1024; // 25MB
const SEARCH_PAGE_SIZE = 50;

type MessageSearchDateRange = 'all' | '24h' | '7d' | '30d';

function inferMessageTypeFromFile(file: File): Message['message_type'] {
  if (file.type.startsWith('video/')) {
    return 'video';
  }
  if (file.type.startsWith('image/')) {
    return 'image';
  }
  if (file.type.startsWith('audio/')) {
    return 'audio';
  }
  return 'file';
}

interface DecryptedMediaViewerWrapperProps {
  messages: Message[];
  initialIndex: number;
  onClose: () => void;
  currentUserId?: number;
  speakerDeviceId?: string;
}

const applyAudioOutputDevice = async (
  element: HTMLMediaElement,
  speakerDeviceId?: string
): Promise<void> => {
  if (!speakerDeviceId) return;
  const maybeSink = element as HTMLMediaElement & { setSinkId?: (id: string) => Promise<void> };
  if (typeof maybeSink.setSinkId !== 'function') return;
  try {
    await maybeSink.setSinkId(speakerDeviceId);
  } catch (error) {
    console.warn('[MessagesPage] Failed to set audio output device:', error);
  }
};

/**
 * Wrapper component that handles decryption for full-screen media viewing
 * This builds a custom viewer with decryption support rather than using FullScreenMediaViewer
 */
function DecryptedMediaViewerWrapper({
  messages,
  initialIndex,
  onClose,
  currentUserId,
  speakerDeviceId,
}: DecryptedMediaViewerWrapperProps) {
  const { t } = useTranslation();
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  // Decrypt the current message's media
  const currentMessage = messages[currentIndex];
  const isOwnMessage = currentMessage.sender_id === currentUserId;
  const mediaSrc = useDecryptedMedia(currentMessage, isOwnMessage);
  const mediaType = inferMessageTypeFromMessage(currentMessage);

  const handlePrevious = useCallback(() => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : messages.length - 1));
  }, [messages.length]);

  const handleNext = useCallback(() => {
    setCurrentIndex((prev) => (prev < messages.length - 1 ? prev + 1 : 0));
  }, [messages.length]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft') {
        handlePrevious();
      } else if (e.key === 'ArrowRight') {
        handleNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePrevious, handleNext, onClose]);

  // Prevent body scroll when viewer is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 bg-black bg-opacity-95 flex items-center justify-center"
      onClick={onClose}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-white hover:text-[var(--color-primary)] transition-colors z-10 p-2"
        aria-label={t('messages.viewer.closeLabel')}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-8 w-8"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>

      {/* Media counter */}
      {messages.length > 1 && (
        <div className="absolute top-4 left-4 text-white text-lg font-medium z-10 bg-black bg-opacity-50 px-3 py-1 rounded">
          {t('messages.viewer.counter', { current: currentIndex + 1, total: messages.length })}
        </div>
      )}

      {/* Previous button */}
      {messages.length > 1 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            handlePrevious();
          }}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-white hover:text-[var(--color-primary)] transition-colors z-10 p-2"
          aria-label={t('messages.viewer.previousLabel')}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-12 w-12"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>
      )}

      {/* Media display */}
      <div
        className="w-full h-full flex items-center justify-center p-4"
        onClick={(e) => e.stopPropagation()}
      >
        {!mediaSrc ? (
          <div className="text-white text-lg">{t('messages.viewer.decrypting')}</div>
        ) : mediaType === 'image' ? (
          <img
            src={mediaSrc}
            alt={t('messages.media.fallbackText')}
            className="max-w-full max-h-full object-contain"
            style={{ maxWidth: '90vw', maxHeight: '90vh' }}
          />
        ) : mediaType === 'video' ? (
          <video
            src={mediaSrc}
            controls
            playsInline
            loop
            muted={false}
            className="max-w-full max-h-full"
            style={{ maxWidth: '90vw', maxHeight: '90vh' }}
            onCanPlay={(e) => {
              const video = e.currentTarget;
              void applyAudioOutputDevice(video, speakerDeviceId);
              video.muted = false;
              video.volume = 1.0;
              console.log('Video can play, attempting to play with sound...');
              video.play().catch((error) => {
                console.log('Autoplay with sound blocked:', error);
              });
            }}
          />
        ) : null}
      </div>

      {/* Next button */}
      {messages.length > 1 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleNext();
          }}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-white hover:text-[var(--color-primary)] transition-colors z-10 p-2"
          aria-label={t('messages.viewer.nextLabel')}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-12 w-12"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}
    </div>
  );
}

interface MessageMediaPreviewProps {
  message: Message;
  isOwnMessage: boolean;
  onMediaClick?: () => void;
}

const API_ORIGIN = new URL(API_BASE_URL).origin;

function isAutoGeneratedMediaCaption(message: Message) {
  if (!message.media_url || !message.encrypted_content) return false;
  const normalized = message.encrypted_content
    .replace(/^📎\s*/, '')
    .trim()
    .toLowerCase();
  return normalized === 'media';
}

function inferMessageTypeFromMessage(message: Message): Message['message_type'] {
  if (message.message_type && message.message_type !== 'text') {
    return message.message_type;
  }

  const mime = message.media_type ?? '';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/')) return 'audio';
  return 'file';
}

/**
 * Hook to decrypt a message's encrypted content (if necessary)
 * Returns decrypted plaintext or the original content when encryption isn't applied
 */
function useDecryptedContent(
  message: Message,
  isOwnMessage: boolean,
  currentUserId?: number
): string {
  const [decryptedContent, setDecryptedContent] = useState<string>('');

  useEffect(() => {
    const cipherText = isOwnMessage
      ? (message.sender_encrypted_content ?? message.encrypted_content)
      : message.encrypted_content;

    if (!cipherText) return setDecryptedContent('');

    const attemptDecryption = async () => {
      // Multi-recipient (mod mail) messages
      if (message.is_multi_recipient && message.shared_encryption_iv && message.recipient_keys) {
        try {
          const keys = await getOwnKeys();
          const encryptedKey = currentUserId ? message.recipient_keys?.[currentUserId] : null;
          if (keys?.privateKey && encryptedKey) {
            const decrypted = await decryptMultiRecipientContent(
              cipherText,
              encryptedKey,
              message.shared_encryption_iv,
              keys.privateKey
            );
            setDecryptedContent(decrypted);
            return;
          }
        } catch (error) {
          console.warn('Failed to decrypt multi-recipient message, falling back:', error);
        }
      }

      const shouldAttemptDecrypt = Boolean(
        (isOwnMessage && message.sender_encrypted_content) ||
        (!isOwnMessage &&
          (message.encryption_version === 'v1' ||
            message.encryption_version === 'v2' ||
            cipherText.startsWith('v2:')))
      );

      if (!shouldAttemptDecrypt) {
        setDecryptedContent(cipherText);
        return;
      }

      try {
        const keys = await getOwnKeys();
        if (!keys) {
          // No keys available, return ciphertext
          setDecryptedContent(cipherText);
          return;
        }

        const decrypted = await decryptMessage(cipherText, keys.privateKey);
        setDecryptedContent(decrypted);
      } catch (error) {
        // Decryption failed, content might be plaintext
        console.warn('Failed to decrypt message, displaying as plaintext:', error);
        setDecryptedContent(cipherText);
      }
    };

    attemptDecryption();
  }, [
    currentUserId,
    isOwnMessage,
    message.encrypted_content,
    message.encryption_version,
    message.id,
    message.is_multi_recipient,
    message.recipient_keys,
    message.sender_encrypted_content,
    message.shared_encryption_iv,
  ]);

  return decryptedContent;
}

/**
 * Component to display decrypted message content
 */
function DecryptedMessageContent({
  message,
  isOwnMessage,
  currentUserId,
  className,
  highlightText,
}: {
  message: Message;
  isOwnMessage: boolean;
  currentUserId?: number;
  className?: string;
  highlightText?: string;
}) {
  const decryptedContent = useDecryptedContent(message, isOwnMessage, currentUserId);

  if (!decryptedContent) return null;

  // If highlighting is enabled, use HighlightedText component
  if (highlightText && highlightText.trim()) {
    return (
      <p className={className}>
        <HighlightedText text={decryptedContent} highlight={highlightText} />
      </p>
    );
  }

  return <p className={className}>{decryptedContent}</p>;
}

/**
 * Hook to decrypt media files
 * Returns a blob URL to the decrypted media, or the original URL if not encrypted
 */
function useDecryptedMedia(message: Message, isOwnMessage: boolean): string | null {
  const [mediaSrc, setMediaSrc] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    let cleanup: (() => void) | undefined;

    const decryptMedia = async () => {
      const originalUrl = message.media_url
        ? message.media_url.startsWith('http')
          ? message.media_url
          : `${API_ORIGIN}${message.media_url.startsWith('/') ? '' : '/'}${message.media_url}`
        : null;

      if (!originalUrl) {
        if (isMounted) setMediaSrc(null);
        return;
      }

      const encryptedKey = isOwnMessage
        ? (message.sender_media_encryption_key ?? message.media_encryption_key)
        : message.media_encryption_key;

      // If no encryption metadata, fall back to the stored URL
      if (!encryptedKey || !message.media_encryption_iv) {
        if (isMounted) setMediaSrc(originalUrl);
        return;
      }

      try {
        const keys = await getOwnKeys();
        if (!keys) {
          console.warn('No encryption keys available, displaying encrypted file as-is');
          if (isMounted) setMediaSrc(originalUrl);
          return;
        }

        console.log('[Media Decryption] Starting decryption for:', originalUrl);
        console.log('[Media Decryption] Attempting fetch...');

        const token = localStorage.getItem('auth_token');
        const response = await fetch(originalUrl, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        console.log(
          '[Media Decryption] Fetch response status:',
          response.status,
          response.statusText
        );

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const encryptedData = await response.arrayBuffer();

        console.log('[Media Decryption] Fetched encrypted data, size:', encryptedData.byteLength);

        // Infer original MIME type from filename extension
        const filename = message.media_url?.split('/').pop() ?? 'attachment';
        const ext = filename.split('.').pop()?.toLowerCase();
        let originalMimeType = 'application/octet-stream';

        if (ext === 'jpg' || ext === 'jpeg') originalMimeType = 'image/jpeg';
        else if (ext === 'png') originalMimeType = 'image/png';
        else if (ext === 'gif') originalMimeType = 'image/gif';
        else if (ext === 'webp') originalMimeType = 'image/webp';
        else if (ext === 'mp4') originalMimeType = 'video/mp4';
        else if (ext === 'webm') originalMimeType = 'video/webm';
        else if (ext === 'mp3') originalMimeType = 'audio/mpeg';
        else if (ext === 'wav') originalMimeType = 'audio/wav';
        else if (ext === 'ogg') originalMimeType = 'audio/ogg';

        console.log('[Media Decryption] Inferred MIME type from extension:', originalMimeType);

        const decryptedBlob = await decryptFile(
          {
            encryptedData,
            encryptedKey,
            iv: message.media_encryption_iv,
            originalName: filename,
            mimeType: originalMimeType,
          },
          keys.privateKey
        );

        console.log('[Media Decryption] Decryption successful, blob size:', decryptedBlob.size);

        const blobUrl = URL.createObjectURL(decryptedBlob);
        cleanup = () => URL.revokeObjectURL(blobUrl);
        if (isMounted) {
          setMediaSrc(blobUrl);
        }
        console.log('[Media Decryption] Blob URL created:', blobUrl.substring(0, 50));
      } catch (error) {
        console.error('[Media Decryption] Failed to decrypt media file:', error);
        if (isMounted) {
          setMediaSrc(originalUrl);
        }
      }
    };

    decryptMedia();

    return () => {
      isMounted = false;
      if (cleanup) {
        cleanup();
      }
    };
  }, [
    message.media_url,
    message.media_encryption_key,
    message.sender_media_encryption_key,
    message.media_encryption_iv,
    message.media_type,
    isOwnMessage,
  ]);

  return mediaSrc;
}

/**
 * Fix 7: Decrypt a message's text content on demand (one-shot, for edit form).
 * Mirrors the logic in useDecryptedContent but returns a Promise instead of state.
 */
async function decryptMessageForEdit(message: Message, isOwnMessage: boolean): Promise<string> {
  const cipherText = isOwnMessage
    ? (message.sender_encrypted_content ?? message.encrypted_content)
    : message.encrypted_content;

  if (!cipherText) return '';

  const shouldAttemptDecrypt = Boolean(
    (isOwnMessage && message.sender_encrypted_content) ||
    (!isOwnMessage &&
      (message.encryption_version === 'v1' ||
        message.encryption_version === 'v2' ||
        cipherText.startsWith('v2:')))
  );

  if (!shouldAttemptDecrypt) return cipherText;

  try {
    const keys = await getOwnKeys();
    if (!keys?.privateKey) return cipherText;
    return await decryptMessage(cipherText, keys.privateKey);
  } catch {
    return cipherText;
  }
}

const MessageMediaPreview = ({ message, isOwnMessage, onMediaClick }: MessageMediaPreviewProps) => {
  const { t } = useTranslation();
  const { speakerDeviceId } = useSettings();
  const mediaSrc = useDecryptedMedia(message, isOwnMessage);
  const mediaType = inferMessageTypeFromMessage(message);
  const canOpenInViewer = mediaType === 'image' || mediaType === 'video';

  if (!mediaSrc) {
    return (
      <div className="mb-2 text-xs text-[var(--color-text-secondary)]">
        {message.media_encryption_key ? t('messages.viewer.decrypting') : t('common.loading')}
      </div>
    );
  }

  return (
    <FilePreview
      src={mediaSrc}
      mimeType={message.media_type}
      fileName={message.media_url?.split('/').pop() ?? t('messages.media.attachmentFallback')}
      fileSize={message.media_size}
      className="mb-2"
      onOpen={canOpenInViewer ? onMediaClick : undefined}
      onAudioLoadedMetadata={(e) => {
        void applyAudioOutputDevice(e.currentTarget, speakerDeviceId);
      }}
      onVideoLoadedMetadata={(e) => {
        void applyAudioOutputDevice(e.currentTarget, speakerDeviceId);
      }}
    />
  );
};

interface DownloadButtonProps {
  message: Message;
  isOwnMessage: boolean;
  onClose: () => void;
}

const DownloadButton = ({ message, isOwnMessage, onClose }: DownloadButtonProps) => {
  const { t } = useTranslation();
  const mediaSrc = useDecryptedMedia(message, isOwnMessage);
  const filename = message.media_url?.split('/').pop() ?? 'download';

  const handleDownload = () => {
    onClose();
    if (!mediaSrc) {
      alert(t('messages.media.stillDecrypting'));
      return;
    }

    // Download the decrypted media
    const link = document.createElement('a');
    link.href = mediaSrc;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <button
      type="button"
      className="w-full rounded-md px-3 py-2 text-left text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)]"
      onClick={handleDownload}
      disabled={!mediaSrc}
    >
      {t('common.download')}
    </button>
  );
};

export default function MessagesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { formatRelativeTime, formatDate } = useFormat();
  const { user } = useAuth();
  const { setActiveConversationId } = useMessagingContext();
  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);
  const [messageText, setMessageText] = useState('');
  const [newChatUsername, setNewChatUsername] = useState('');
  const [isCreatingChat, setIsCreatingChat] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [messageMenuOpen, setMessageMenuOpen] = useState<number | null>(null);
  const [replyTargetMessage, setReplyTargetMessage] = useState<Message | null>(null);
  const [deleteDialogMessage, setDeleteDialogMessage] = useState<Message | null>(null);
  const [deleteScopeInFlight, setDeleteScopeInFlight] = useState<'self' | 'both' | null>(null);
  const [forwardDialogMessage, setForwardDialogMessage] = useState<Message | null>(null);
  const [forwardTargetConversationIDs, setForwardTargetConversationIDs] = useState<Set<number>>(
    new Set()
  );
  const [forwardIncludeMedia, setForwardIncludeMedia] = useState(true);
  const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active');
  const [conversationMenuOpen, setConversationMenuOpen] = useState<number | null>(null);
  const [slideshowOpen, setSlideshowOpen] = useState(false);
  const [showGroupSidebar, setShowGroupSidebar] = useState(false);
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [showMultiUpload, setShowMultiUpload] = useState(false);
  const [deleteConversationDialog, setDeleteConversationDialog] = useState<Conversation | null>(
    null
  );
  const [viewerState, setViewerState] = useState<{
    messages: Message[];
    initialIndex: number;
  } | null>(null);
  const [redditSlideshowModalOpen, setRedditSlideshowModalOpen] = useState(false);
  const [redditSlideshowInput, setRedditSlideshowInput] = useState('');
  const [redditSlideshowAutocompleteOpen, setRedditSlideshowAutocompleteOpen] = useState(false);
  const [redditSlideshowPosts, setRedditSlideshowPosts] = useState<
    Array<RedditApiPost | LocalSubredditPost>
  >([]);
  const [redditSlideshowOpen, setRedditSlideshowOpen] = useState(false);
  const [isLoadingRedditPosts, setIsLoadingRedditPosts] = useState(false);
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const toUsernameParam = searchParams.get('to');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { sendTypingIndicator } = useWebSocket();
  const { typingIndicators, readReceipts, speakerDeviceId } = useSettings();
  const [searchQuery, setSearchQuery] = useState('');
  const [messageSearchQuery, setMessageSearchQuery] = useState('');
  const [messageSearchSenderFilter, setMessageSearchSenderFilter] = useState<'all' | 'mine' | 'others'>('all');
  const [messageSearchDateRange, setMessageSearchDateRange] = useState<MessageSearchDateRange>('all');
  const [messageSearchHasFiles, setMessageSearchHasFiles] = useState(false);
  const [messageSearchHasLinks, setMessageSearchHasLinks] = useState(false);
  const [messageSearchPage, setMessageSearchPage] = useState(0);
  const [expandedPinnedMessages, setExpandedPinnedMessages] = useState(false);
  const [selectedConversationIDs, setSelectedConversationIDs] = useState<Set<number>>(new Set());
  const touchStartRef = useRef<{ conversationID: number; x: number; y: number } | null>(null);
  const swipeHandledRef = useRef<number | null>(null);
  const debouncedMessageSearch = useDebounce(messageSearchQuery, 300);
  const [decryptedContentMap, setDecryptedContentMap] = useState<Map<number, string>>(new Map());
  // Fix 14: current decrypted content of the message whose history is open
  const [historyCurrentContent, setHistoryCurrentContent] = useState<string | undefined>(undefined);
  const [isDecryptingForSearch, setIsDecryptingForSearch] = useState(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const currentConversationRef = useRef<number | null>(null);
  const currentRecipientRef = useRef<number>(0);
  const isMobile = useMediaQuery('(max-width: 767px)');
  const isInChat = Boolean(selectedConversationId || isCreatingChat);
  const [showMessageSearch, setShowMessageSearch] = useState(false);
  const [threadRootMessageId, setThreadRootMessageId] = useState<number | null>(null);
  const [smartFolder, setSmartFolder] = useState<'unread' | null>(null);
  const {
    folders,
    selectedFolderId,
    setSelectedFolderId,
    filterConversationsBySelectedFolder,
    isLoadingFolders,
    createFolder,
    updateFolder,
    deleteFolder,
    isDeletingFolder,
    deletingFolderId,
    addConversationToFolder,
    removeConversationFromFolder,
  } = useFolders();
  const [folderModalOpen, setFolderModalOpen] = useState<'new' | { folder: ConversationFolder } | null>(null);
  const [deleteFolderTarget, setDeleteFolderTarget] = useState<ConversationFolder | null>(null);
  const [deleteFolderError, setDeleteFolderError] = useState('');
  const [showMobileFolderSheet, setShowMobileFolderSheet] = useState(false);
  const deleteFolderDialogTitleId = useId();

  // Close delete-folder dialog on Escape (if not mid-delete)
  useEffect(() => {
    if (!deleteFolderTarget) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isDeletingFolder) {
        setDeleteFolderTarget(null);
        setDeleteFolderError('');
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [deleteFolderTarget, isDeletingFolder]);

  // H5: Close mobile folder sheet on Escape
  useEffect(() => {
    if (!showMobileFolderSheet) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowMobileFolderSheet(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [showMobileFolderSheet]);

  const resetMessageSearch = useCallback(() => {
    setMessageSearchQuery('');
    setMessageSearchSenderFilter('all');
    setMessageSearchDateRange('all');
    setMessageSearchHasFiles(false);
    setMessageSearchHasLinks(false);
    setMessageSearchPage(0);
  }, []);

  const {
    data: conversationsData,
    isLoading: loadingConversations,
    hasNextPage: hasMoreConversations,
    fetchNextPage: fetchMoreConversations,
    isFetchingNextPage: isFetchingMoreConversations,
  } = useInfiniteQuery({
    queryKey: ['conversations', activeTab === 'archived' ? 'archived' : 'all'],
    queryFn: ({ pageParam }) => {
      const cursor = pageParam ? String(pageParam) : undefined;
      if (activeTab === 'archived') {
        return messagesService.getArchivedConversationsPage(20, cursor);
      }
      return messagesService.getConversationsPage(false, 20, cursor);
    },
    initialPageParam: '',
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
  });
  const allConversations = useMemo(
    () => conversationsData?.pages.flatMap((page) => page.conversations) ?? [],
    [conversationsData]
  );
  const modMailHubNames = useMemo(
    () =>
      Array.from(
        new Set(
          allConversations
            .filter(
              (conversation) =>
                conversation.conversation_type === 'mod_mail' && conversation.hub_name
            )
            .map((conversation) => conversation.hub_name as string)
        )
      ),
    [allConversations]
  );
  const hubQueries = useQueries({
    queries: modMailHubNames.map((hubName) => ({
      queryKey: ['hub-details', hubName],
      queryFn: () => hubsService.getHub(hubName),
      enabled: !!hubName,
    })),
  });
  const hubTitleByName = useMemo(() => {
    const map = new Map<string, string>();
    hubQueries.forEach((query, index) => {
      const hubName = modMailHubNames[index];
      if (!hubName) return;
      const title = query.data?.title?.trim();
      map.set(hubName, title || hubName);
    });
    return map;
  }, [hubQueries, modMailHubNames]);
  const getHubDisplayTitle = (hubName?: string | null) => {
    if (!hubName) return t('messages.hubFallback');
    return hubTitleByName.get(hubName) ?? hubName;
  };

  // Filter conversations based on active tab
  const unfilteredConversations = useMemo(() => {
    if (!allConversations.length) return undefined;
    const isArchived = (conversation: Conversation) =>
      conversation.is_archived ?? conversation.archived_at !== null;
    if (activeTab === 'archived') {
      return allConversations.filter((c) => isArchived(c));
    }
    const activeConversations = allConversations.filter((c) => !isArchived(c));
    const folderFiltered = filterConversationsBySelectedFolder(activeConversations);
    if (smartFolder === 'unread') {
      return folderFiltered.filter((c) => c.unread_count > 0);
    }
    return folderFiltered;
  }, [allConversations, activeTab, filterConversationsBySelectedFolder, smartFolder]);

  // Apply search filter
  const conversations = useMemo(() => {
    if (!unfilteredConversations) return undefined;
    if (!searchQuery.trim()) return unfilteredConversations;

    const query = searchQuery.toLowerCase();
    return unfilteredConversations.filter((conv) => {
      // Search by username (DM)
      if (conv.other_user?.username?.toLowerCase().includes(query)) {
        return true;
      }
      // Search by hub name (mod mail)
      if (conv.hub_name?.toLowerCase().includes(query)) {
        return true;
      }
      // Search by subject (mod mail)
      if (conv.subject?.toLowerCase().includes(query)) {
        return true;
      }
      return false;
    });
  }, [unfilteredConversations, searchQuery]);

  // Prune stale message queries for conversations that no longer exist
  useEffect(() => {
    if (!allConversations.length) return;
    const validIds = new Set(allConversations.map((c) => c.id));
    queryClient.removeQueries({
      queryKey: ['messages'],
      predicate: (query) => {
        const key = query.queryKey;
        const convId = key && key.length > 1 ? (key[1] as number | undefined) : undefined;
        return typeof convId === 'number' && !validIds.has(convId);
      },
    });
  }, [allConversations, queryClient]);

  // Auto-select the first available conversation if none is selected or the current selection no longer exists.
  useEffect(() => {
    if (isCreatingChat) return;
    if (!conversations || conversations.length === 0) {
      // Clear selection if there are no conversations
      if (selectedConversationId !== null) {
        setSelectedConversationId(null);
      }
      return;
    }
    const currentExists = selectedConversationId
      ? conversations.some((c) => c.id === selectedConversationId)
      : false;

    if (!isMobile && (!selectedConversationId || !currentExists)) {
      setSelectedConversationId(conversations[0].id);
    }
  }, [conversations, isCreatingChat, selectedConversationId, isMobile]);

  useEffect(() => {
    setThreadRootMessageId(null);
    setReplyTargetMessage(null);
  }, [selectedConversationId]);

  const selectedConversation = conversations?.find((c) => c.id === selectedConversationId);
  const selectedConversationExists = Boolean(selectedConversation);

  // Fix 18: placed after selectedConversation so we can pass recipientId directly
  const {
    editingMessageId,
    editingContent,
    startEdit,
    cancelEdit,
    saveEdit,
    isSaving: isEditSaving,
    historyMessageId,
    openHistory,
    closeHistory,
  } = useMessageEdit({
    conversationId: selectedConversationId ?? 0,
    currentUserId: user?.id,
    recipientId: selectedConversation?.other_user?.id,
  });

  const {
    data: messagesData,
    isLoading: loadingMessages,
    hasNextPage: hasMoreMessages,
    fetchNextPage: fetchMoreMessages,
    isFetchingNextPage: isFetchingMoreMessages,
  } = useInfiniteQuery({
    queryKey: ['messages', selectedConversationId],
    queryFn: ({ pageParam }) =>
      messagesService.getMessagesPage(
        selectedConversationId!,
        50,
        pageParam ? String(pageParam) : undefined
      ),
    initialPageParam: '',
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    enabled: !!selectedConversationId && selectedConversationExists,
    refetchOnWindowFocus: false,
    retry: false, // Avoid retry loops on 404 when a conversation was deleted
  });
  const messages = useMemo(
    () => messagesData?.pages.flatMap((page) => page.messages) ?? [],
    [messagesData]
  );
  const {
    pinnedMessages,
    pinnedMessageIds,
    canUnpinMessage,
    pinMessage,
    unpinMessage,
    pinningMessageId,
    unpinningMessageId,
  } = usePinnedMessages({
    conversationId: selectedConversationId,
    currentUserId: user?.id,
    currentUserRole: user?.role,
    enabled: selectedConversationExists && !isCreatingChat,
  });

  // Create media messages list for full-screen viewer (images and videos only)
  const conversationMediaMessages = useMemo(() => {
    return messages.filter((msg) => {
      const type = inferMessageTypeFromMessage(msg);
      return type === 'image' || type === 'video';
    });
  }, [messages]);

  const handleOpenMediaViewer = useCallback(
    (message: Message) => {
      const mediaType = inferMessageTypeFromMessage(message);
      if (mediaType !== 'image' && mediaType !== 'video') return;

      const mediaIndex = conversationMediaMessages.findIndex((msg) => msg.id === message.id);
      if (mediaIndex === -1) return;

      setViewerState({
        messages: conversationMediaMessages,
        initialIndex: mediaIndex,
      });
    },
    [conversationMediaMessages]
  );

  const renderThreadMessageContent = useCallback(
    (message: Message, isOwnMessage: boolean) => (
      <>
        {message.media_url && (
          <MessageMediaPreview
            message={message}
            isOwnMessage={isOwnMessage}
            onMediaClick={() => handleOpenMediaViewer(message)}
          />
        )}
        {message.encrypted_content && !isAutoGeneratedMediaCaption(message) && (
          <DecryptedMessageContent
            message={message}
            isOwnMessage={isOwnMessage}
            currentUserId={user?.id}
            className="text-sm"
            highlightText={debouncedMessageSearch}
          />
        )}
      </>
    ),
    [debouncedMessageSearch, handleOpenMediaViewer, user?.id]
  );

  // Fetch mod-mail conversation details if this is a mod_mail conversation
  const { data: modMailConversation } = useQuery<ModMailConversation>({
    queryKey: ['modMailConversation', selectedConversationId],
    queryFn: async () => {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${API_BASE_URL}/mod-mail/${selectedConversationId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        throw new Error(t('messages.errors.loadModMailFailed'));
      }
      return response.json();
    },
    enabled: !!selectedConversationId && selectedConversation?.conversation_type === 'mod_mail',
  });

  const uploadMediaMutation = useMutation({
    mutationFn: (file: File) => mediaService.uploadMedia(file),
  });
  const {
    archiveConversation,
    archiveConversationsBatch,
    unarchiveConversation,
    isArchiving,
    isBatchArchiving,
    isUnarchiving,
  } = useArchive();

  const sendMessageMutation = useMutation({
    mutationFn: (data: SendMessageRequest) => messagesService.sendMessage(data),
    onSuccess: (message, variables) => {
      queryClient.invalidateQueries({ queryKey: ['messages', message.conversation_id] });
      queryClient.setQueryData<Conversation[] | undefined>(['conversations'], (prev) => {
        if (!prev) return prev;
        return prev.map((conv) =>
          conv.id === message.conversation_id
            ? {
                ...conv,
                unread_count: 0,
                latest_message: message,
              }
            : conv
        );
      });
      queryClient.invalidateQueries({ queryKey: ['conversations', 'all'] });
      setMessageText('');
      setSelectedFile(null);
      setReplyTargetMessage(null);
      if (!variables.conversation_id && variables.recipient_username) {
        setSelectedConversationId(message.conversation_id);
        setIsCreatingChat(false);
        setNewChatUsername('');
      }
    },
  });

  const deleteMessageMutation = useMutation({
    mutationFn: ({
      messageId,
      deleteFor,
    }: {
      messageId: number;
      deleteFor: 'self' | 'both';
      conversationId: number;
    }) => messagesService.deleteMessage(messageId, { deleteFor }),
    onMutate: (variables) => {
      setDeleteScopeInFlight(variables.deleteFor);
      return variables;
    },
    onSuccess: (_, variables) => {
      queryClient.setQueryData<
        InfiniteData<{ messages: Message[]; next_cursor?: string }> | undefined
      >(['messages', variables.conversationId], (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          pages: prev.pages.map((page) => ({
            ...page,
            messages: page.messages.filter((msg) => msg.id !== variables.messageId),
          })),
        };
      });
      queryClient.setQueryData<PinnedMessagesResponse | undefined>(
        ['pinnedMessages', variables.conversationId],
        (prev) =>
          prev
            ? {
                ...prev,
                pinned_messages: prev.pinned_messages.filter(
                  (msg) => msg.id !== variables.messageId
                ),
              }
            : prev
      );
      queryClient.invalidateQueries({ queryKey: ['pinnedMessages', variables.conversationId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['conversations', 'all'] });
      setDeleteDialogMessage(null);
      setMessageMenuOpen(null);
    },
    onError: (error) => {
      alert(error instanceof Error ? error.message : t('messages.errors.deleteMessageFailed'));
    },
    onSettled: () => {
      setDeleteScopeInFlight(null);
    },
  });

  const reportMessageMutation = useMutation({
    mutationFn: ({
      messageId,
      reason,
      description,
    }: {
      messageId: number;
      reason: ReportReason;
      description?: string;
    }) =>
      reportService.createReport({
        targetType: 'message',
        targetId: messageId,
        reason,
        description,
      }),
    onSuccess: () => {
      alert(t('reporting.success'));
      setMessageMenuOpen(null);
    },
    onError: (error) => {
      alert(
        t('messages.errors.reportFailed', {
          message: error instanceof Error ? error.message : t('common.error'),
        })
      );
    },
  });

  const muteConversationMutation = useMutation({
    mutationFn: (conversationId: number) => messagesService.muteConversation(conversationId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ['conversations', 'all'] }),
        queryClient.refetchQueries({ queryKey: ['conversations'] }),
      ]);
      setConversationMenuOpen(null);
    },
    onError: (error) => {
      alert(error instanceof Error ? error.message : t('messages.errors.muteFailed'));
    },
  });

  const unmuteConversationMutation = useMutation({
    mutationFn: (conversationId: number) => messagesService.unmuteConversation(conversationId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ['conversations', 'all'] }),
        queryClient.refetchQueries({ queryKey: ['conversations'] }),
      ]);
      setConversationMenuOpen(null);
    },
    onError: (error) => {
      alert(error instanceof Error ? error.message : t('messages.errors.unmuteFailed'));
    },
  });

  const deleteConversationMutation = useMutation({
    mutationFn: ({
      conversationId,
      deleteFor,
    }: {
      conversationId: number;
      deleteFor: 'me' | 'both';
    }) => messagesService.deleteConversation(conversationId, { deleteFor }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['conversations', 'all'] });
      setDeleteConversationDialog(null);
      setConversationMenuOpen(null);
      // If deleted conversation was selected, clear selection
      if (selectedConversationId === variables.conversationId) {
        setSelectedConversationId(null);
      }
    },
    onError: (error) => {
      alert(error instanceof Error ? error.message : t('messages.errors.deleteConversationFailed'));
    },
  });

  const forwardMessageMutation = useMutation({
    mutationFn: async ({
      message,
      targetConversationIDs,
      includeMedia,
    }: {
      message: Message;
      targetConversationIDs: number[];
      includeMedia: boolean;
    }) => {
      const isEncrypted =
        message.encryption_version !== 'plaintext' && message.encryption_version !== 'none';
      const sourceConversationType = selectedConversation?.conversation_type ?? 'dm';

      const getConversationById = (conversationId: number): Conversation => {
        const conversation = allConversations.find((entry) => entry.id === conversationId);
        if (!conversation) {
          throw new Error(
            t('messages.errors.forwardConversationMissing', 'Forward target conversation not found.')
          );
        }
        return conversation;
      };

      const fetchModMailParticipantIDs = async (conversationId: number): Promise<number[]> => {
        const token = localStorage.getItem('auth_token');
        const response = await fetch(`${API_BASE_URL}/mod-mail/${conversationId}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (!response.ok) {
          throw new Error(
            t(
              'messages.errors.forwardLoadParticipantsFailed',
              'Unable to load conversation participants for forwarding.'
            )
          );
        }
        const conversation = (await response.json()) as ModMailConversation;
        const participantIDs = (conversation.participants ?? []).map((participant) => participant.user_id);
        if (!participantIDs.length) {
          throw new Error(
            t(
              'messages.errors.forwardNoParticipants',
              'No participants found for selected conversation.'
            )
          );
        }
        return participantIDs;
      };

      const loadConversationParticipantIDs = async (conversationId: number): Promise<number[]> => {
        const conversation = getConversationById(conversationId);
        if (conversation.conversation_type === 'mod_mail') {
          return fetchModMailParticipantIDs(conversationId);
        }

        if (!user?.id || !conversation.other_user?.id) {
          throw new Error(
            t(
              'messages.errors.forwardParticipantResolutionFailed',
              'Unable to resolve conversation participants for forwarding.'
            )
          );
        }
        return [user.id, conversation.other_user.id];
      };

      const normalizeParticipantSet = (participantIDs: number[]) =>
        Array.from(new Set(participantIDs.filter((id) => Number.isFinite(id) && id > 0))).sort(
          (a, b) => a - b
        );

      const sourceParticipants = normalizeParticipantSet(
        await loadConversationParticipantIDs(message.conversation_id)
      );

      for (const targetConversationID of targetConversationIDs) {
        const targetParticipants = normalizeParticipantSet(
          await loadConversationParticipantIDs(targetConversationID)
        );
        if (
          targetParticipants.length !== sourceParticipants.length ||
          targetParticipants.some((participantID, index) => participantID !== sourceParticipants[index])
        ) {
          throw new Error(
            t(
              'messages.errors.forwardParticipantsMustMatch',
              'Encrypted forwarding requires conversations with identical participants.'
            )
          );
        }
      }

      let encryptedContent = undefined as string | undefined;
      let senderEncryptedContent = undefined as string | undefined;
      let encryptionVersion = undefined as string | undefined;
      let isMultiRecipient = undefined as boolean | undefined;
      let sharedEncryptionIV = undefined as string | undefined;
      let recipientKeys = undefined as Record<number, string> | undefined;

      if (isEncrypted) {
        if ((message.media_url || message.media_file_id) && includeMedia) {
          throw new Error(
            t(
              'messages.errors.forwardEncryptedMediaUnsupported',
              'Encrypted media forwarding is not supported yet. Disable media to continue.'
            )
          );
        }

        const ownKeys = await getOwnKeys();
        if (!ownKeys?.privateKey || !ownKeys?.publicKey || !user?.id) {
          throw new Error(
            t(
              'messages.errors.encryptionKeysMissing',
              'Your encryption keys are missing. Refresh and try again.'
            )
          );
        }

        let plaintext = '';
        if (message.is_multi_recipient && message.shared_encryption_iv && message.recipient_keys) {
          const encryptedKey = message.recipient_keys[user.id];
          if (!encryptedKey) {
            throw new Error(
              t(
                'messages.errors.forwardMissingRecipientKey',
                'Cannot decrypt this message for forwarding.'
              )
            );
          }
          plaintext = await decryptMultiRecipientContent(
            message.encrypted_content,
            encryptedKey,
            message.shared_encryption_iv,
            ownKeys.privateKey
          );
        } else {
          const isOwnMessage = message.sender_id === user.id;
          const cipherText = isOwnMessage
            ? (message.sender_encrypted_content ?? message.encrypted_content)
            : message.encrypted_content;
          if (!cipherText) {
            throw new Error(
              t('messages.errors.forwardMissingCiphertext', 'Message ciphertext is missing.')
            );
          }
          plaintext = await decryptMessage(cipherText, ownKeys.privateKey);
        }

        if (sourceConversationType === 'mod_mail') {
          const publicKeys = await encryptionService.getPublicKeys(sourceParticipants);
          const recipients = await Promise.all(
            sourceParticipants.map(async (participantID) => {
              const base64PublicKey = publicKeys[participantID];
              if (!base64PublicKey) {
                throw new Error(
                  t(
                    'messages.errors.forwardRecipientKeyFetchFailed',
                    'Missing participant key for encrypted forward.'
                  )
                );
              }
              const publicKey = await getUserPublicKey(participantID, base64PublicKey);
              if (!publicKey) {
                throw new Error(
                  t(
                    'messages.errors.forwardRecipientKeyImportFailed',
                    'Failed to import participant key for encrypted forward.'
                  )
                );
              }
              return { userId: participantID, publicKey };
            })
          );

          const encrypted = await encryptForMultipleRecipients(
            plaintext,
            recipients,
            ownKeys.publicKey
          );
          encryptedContent = encrypted.encryptedContent;
          senderEncryptedContent = encrypted.senderEncryptedContent;
          encryptionVersion = 'v2';
          isMultiRecipient = true;
          sharedEncryptionIV = encrypted.sharedIv;
          recipientKeys = encrypted.recipientKeys;
        } else {
          const recipientID = sourceParticipants.find((participantID) => participantID !== user.id);
          if (!recipientID) {
            throw new Error(
              t('messages.errors.forwardRecipientResolutionFailed', 'Unable to resolve recipient.')
            );
          }
          const publicKeys = await encryptionService.getPublicKeys([recipientID]);
          const base64PublicKey = publicKeys[recipientID];
          if (!base64PublicKey) {
            throw new Error(
              t(
                'messages.errors.forwardRecipientKeyFetchFailed',
                'Missing recipient key for encrypted forward.'
              )
            );
          }
          const recipientPublicKey = await getUserPublicKey(recipientID, base64PublicKey);
          if (!recipientPublicKey) {
            throw new Error(
              t(
                'messages.errors.forwardRecipientKeyImportFailed',
                'Failed to import recipient key for encrypted forward.'
              )
            );
          }

          encryptedContent = await encryptMessage(plaintext, recipientPublicKey);
          senderEncryptedContent = await encryptMessage(plaintext, ownKeys.publicKey);
          encryptionVersion = 'v2';
          isMultiRecipient = false;
          sharedEncryptionIV = undefined;
          recipientKeys = undefined;
        }
      }

      return messagesService.forwardMessage({
        message_id: message.id,
        conversation_ids: targetConversationIDs,
        include_media: includeMedia,
        encrypted_content: encryptedContent,
        sender_encrypted_content: senderEncryptedContent,
        encryption_version: encryptionVersion,
        media_encryption_key: includeMedia ? (message.media_encryption_key ?? undefined) : undefined,
        media_encryption_iv: includeMedia ? (message.media_encryption_iv ?? undefined) : undefined,
        sender_media_encryption_key: includeMedia
          ? (message.sender_media_encryption_key ?? undefined)
          : undefined,
        is_multi_recipient: isMultiRecipient,
        shared_encryption_iv: sharedEncryptionIV,
        recipient_keys: recipientKeys,
      });
    },
    onSuccess: (_payload, variables) => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['conversations', 'all'] });
      variables.targetConversationIDs.forEach((conversationID) => {
        queryClient.invalidateQueries({ queryKey: ['messages', conversationID] });
      });
      setForwardDialogMessage(null);
      setForwardTargetConversationIDs(new Set());
      setForwardIncludeMedia(true);
      setMessageMenuOpen(null);
    },
    onError: (error) => {
      alert(error instanceof Error ? error.message : t('messages.errors.forwardFailed'));
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > MAX_UPLOAD_SIZE) {
        alert(t('messages.media.fileTooLarge'));
        return;
      }
      setSelectedFile(file);
    }
  };

  // Reddit/Hub slideshow autocomplete
  const {
    trimmedInput: redditSlideshowTrimmedInput,
    suggestions: redditSlideshowSuggestions,
    shouldShowSuggestions: redditSlideshowShouldShowSuggestions,
    isLoading: redditSlideshowAutocompleteLoading,
  } = useHubSubredditAutocomplete(redditSlideshowInput, redditSlideshowAutocompleteOpen);

  const handleLoadRedditSlideshow = async () => {
    const trimmed = redditSlideshowInput.trim();
    if (!trimmed) return;
    const hubPrefix = t('common.prefix.hub', 'h/');
    const subredditPrefix = t('common.prefix.subreddit', 'r/');
    const { isHub, name } = parseRedditSlideshowInput(trimmed, hubPrefix, subredditPrefix);
    if (!name) {
      alert(t('messages.errors.loadPostsFailed'));
      return;
    }

    setIsLoadingRedditPosts(true);
    setRedditSlideshowModalOpen(false);

    try {
      let posts: Array<RedditApiPost | LocalSubredditPost> = [];

      if (isHub) {
        // Fetch hub posts
        const response = await hubsService.getHubPosts(name, 'hot', 50, 0);
        posts = response.posts || [];
      } else {
        // Fetch subreddit posts
        const response = await redditService.getSubredditPosts(name, 'hot', 50);
        posts = response.posts || [];
      }

      setRedditSlideshowPosts(posts);
      setRedditSlideshowOpen(true);
    } catch (error) {
      console.error('Failed to load slideshow posts:', error);
      alert(t('messages.errors.loadPostsFailed'));
    } finally {
      setIsLoadingRedditPosts(false);
    }
  };

  const handleSelectRedditSlideshowSuggestion = (type: 'hub' | 'subreddit', name: string) => {
    setRedditSlideshowInput(
      formatRedditSlideshowInput(
        type,
        name,
        t('common.prefix.hub', 'h/'),
        t('common.prefix.subreddit', 'r/')
      )
    );
    setRedditSlideshowAutocompleteOpen(false);
  };

  const handleMultiFileUpload = async (files: File[]) => {
    if (!selectedConversationId) return;

    setUploadingMedia(true);
    setShowMultiUpload(false);

    try {
      // Get recipient's ID for encryption
      const conversation = conversations?.find((c) => c.id === selectedConversationId);
      if (!conversation) {
        alert(t('messages.errors.conversationNotFound'));
        return;
      }

      const recipientId =
        conversation.user1_id === user?.id ? conversation.user2_id : conversation.user1_id;
      if (!recipientId) {
        alert(t('messages.errors.recipientNotFound'));
        return;
      }

      // Get recipient's public key
      const recipientPublicKey = await getUserPublicKey(recipientId);
      if (!recipientPublicKey) {
        throw new Error(t('messages.errors.recipientKeyNotFound'));
      }

      // Get own keys
      const ownKeys = await getOwnKeys();
      if (!ownKeys?.publicKey || !ownKeys?.privateKey) {
        throw new Error(t('messages.errors.encryptionKeysMissing'));
      }

      // Upload files sequentially and send as individual messages
      for (const file of files) {
        try {
          const messageType = inferMessageTypeFromFile(file);

          // Encrypt the file
          const encryptedFile = await encryptFile(file);

          // Upload encrypted file
          const uploadResponse = await mediaService.uploadMedia(
            new File([encryptedFile.encryptedData], file.name, { type: file.type })
          );

          // Encrypt AES key for recipient
          const recipientEncryptedKey = await encryptKeyWithPublicKey(
            encryptedFile.rawKey,
            recipientPublicKey
          );

          // Encrypt AES key for sender
          const senderEncryptedKey = await encryptKeyWithPublicKey(
            encryptedFile.rawKey,
            ownKeys.publicKey
          );

          // Create auto-generated caption
          const captionText = `[${messageType === 'image' ? t('common.media.image') : t('common.media.video')}]`;
          const encryptedCaption = await encryptMessage(captionText, recipientPublicKey);
          const senderEncryptedCaption = await encryptMessage(captionText, ownKeys.publicKey);

          // Send message
          await messagesService.sendMessage({
            conversation_id: selectedConversationId,
            encrypted_content: encryptedCaption,
            sender_encrypted_content: senderEncryptedCaption,
            media_file_id: uploadResponse.id,
            media_url: uploadResponse.storage_url,
            media_type: file.type,
            media_size: file.size,
            message_type: messageType,
            media_encryption_key: recipientEncryptedKey,
            media_encryption_iv: arrayBufferToBase64(encryptedFile.iv.slice().buffer),
            sender_media_encryption_key: senderEncryptedKey,
            encryption_version: 'v2',
          });
        } catch (error) {
          console.error('Failed to upload file:', file.name, error);
          alert(t('messages.media.uploadFailedFile', { filename: file.name }));
        }
      }

      // Refresh messages
      await queryClient.invalidateQueries({ queryKey: ['messages', selectedConversationId] });
      await queryClient.invalidateQueries({ queryKey: ['conversations'] });
    } catch (error) {
      console.error('Multi-file upload error:', error);
      alert(error instanceof Error ? error.message : t('messages.media.uploadFailed'));
    } finally {
      setUploadingMedia(false);
    }
  };

  const handleVoiceMessage = async (blob: Blob, durationSeconds: number) => {
    if (!selectedConversationId || !user) return;
    try {
      // Send an empty placeholder message with type 'audio' then upload the blob.
      const req = {
        conversation_id: selectedConversationId,
        encrypted_content: '',
        sender_encrypted_content: '',
        message_type: 'audio' as const,
        encryption_version: 'none',
      };
      const msg = await messagesService.sendMessage(req);
      await voiceMessagesService.upload(msg.id, blob, durationSeconds);
    } catch (err) {
      console.error('Failed to send voice message:', err);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedMessage = messageText.trim();
    if (!trimmedMessage && !selectedFile) return;

    try {
      let mediaFileId: number | undefined;
      let mediaUrl: string | undefined;
      let mediaMimeType: string | undefined;
      let mediaSize: number | undefined;
      let messageType: Message['message_type'] = 'text';
      let mediaEncryptionKey: string | undefined;
      let mediaEncryptionIv: string | undefined;
      let senderMediaEncryptionKey: string | undefined;

      // Upload media first if selected
      if (selectedFile) {
        setUploadingMedia(true);
        console.log('[Media Encryption] Starting media upload flow for file:', selectedFile.name);

        // Get recipient's ID to fetch their public key
        let recipientId: number | undefined;
        if (isCreatingChat) {
          // For new chats, we need to fetch the user by username
          const recipient = newChatUsername.trim();
          console.log('[Media Encryption] New chat mode, fetching user:', recipient);
          if (recipient) {
            try {
              const user = await fetch(`${API_BASE_URL}/users/${recipient}`, {
                headers: {
                  Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
                },
              }).then((res) => res.json());
              recipientId = user.id;
              console.log('[Media Encryption] Fetched recipient ID:', recipientId);
            } catch (error) {
              console.warn('[Media Encryption] Failed to fetch recipient user:', error);
            }
          }
        } else if (selectedConversationId) {
          // For existing conversations, get recipient from conversation
          recipientId = selectedConversation?.other_user?.id;
          console.log('[Media Encryption] Existing conversation, recipient ID:', recipientId);
        }

        // Encrypt the file if we have a recipient ID
        let fileToUpload = selectedFile;
        const ownKeys = await getOwnKeys();
        if (recipientId) {
          console.log('[Media Encryption] Have recipient ID, attempting to encrypt file...');
          try {
            // Fetch recipient's public key
            console.log('[Media Encryption] Fetching public keys for recipient:', recipientId);
            const publicKeys = await encryptionService.getPublicKeys([recipientId]);
            console.log('[Media Encryption] Public keys response:', publicKeys);
            const recipientPublicKeyBase64 = publicKeys[recipientId];
            console.log(
              '[Media Encryption] Recipient public key (Base64):',
              recipientPublicKeyBase64 ? `${recipientPublicKeyBase64.substring(0, 50)}...` : 'null'
            );

            if (recipientPublicKeyBase64) {
              // Import recipient's public key
              console.log('[Media Encryption] Importing recipient public key...');
              const recipientPublicKey = await getUserPublicKey(
                recipientId,
                recipientPublicKeyBase64
              );
              console.log(
                '[Media Encryption] Recipient public key imported:',
                recipientPublicKey ? 'SUCCESS' : 'FAILED'
              );

              if (recipientPublicKey) {
                // Encrypt the file
                console.log('[Media Encryption] Encrypting file...');
                const encryptedFile = await encryptFile(selectedFile);
                const ivCopy = encryptedFile.iv.slice();
                const ivBase64 = arrayBufferToBase64(ivCopy.buffer);
                const encryptedKeyForRecipient = await encryptKeyWithPublicKey(
                  encryptedFile.rawKey,
                  recipientPublicKey
                );

                let encryptedKeyForSender: string | undefined;
                if (ownKeys?.publicKey) {
                  encryptedKeyForSender = await encryptKeyWithPublicKey(
                    encryptedFile.rawKey,
                    ownKeys.publicKey
                  );
                }

                if (encryptedKeyForRecipient) {
                  mediaEncryptionKey = encryptedKeyForRecipient;
                  mediaEncryptionIv = ivBase64;
                  senderMediaEncryptionKey = encryptedKeyForSender;

                  console.log(
                    '[Media Encryption] File encrypted successfully. Key:',
                    mediaEncryptionKey.substring(0, 50) + '...',
                    'IV:',
                    mediaEncryptionIv?.substring(0, 30) + '...'
                  );

                  const encryptedBlob = new Blob([encryptedFile.encryptedData], {
                    type: 'application/octet-stream',
                  });
                  fileToUpload = new File([encryptedBlob], selectedFile.name, {
                    type: 'application/octet-stream',
                  });
                  console.log('[Media Encryption] Created encrypted file blob, ready to upload');
                } else {
                  console.warn(
                    '[Media Encryption] Failed to encrypt AES key for recipient, uploading plain file'
                  );
                  mediaEncryptionKey = undefined;
                  mediaEncryptionIv = undefined;
                  senderMediaEncryptionKey = undefined;
                }
              } else {
                console.warn(
                  '[Media Encryption] Failed to import recipient public key, uploading unencrypted'
                );
              }
            } else {
              console.warn('[Media Encryption] Recipient has no public key, uploading unencrypted');
            }
          } catch (error) {
            console.error(
              '[Media Encryption] File encryption failed, uploading unencrypted:',
              error
            );
          }
        } else {
          console.warn('[Media Encryption] No recipient ID found, uploading unencrypted');
        }

        // Upload the file (encrypted or original)
        const uploadedMedia = await uploadMediaMutation.mutateAsync(fileToUpload);
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
        mediaMimeType = selectedFile.type || uploadedMedia.file_type;
        mediaSize = uploadedMedia.file_size;
        messageType = inferMessageTypeFromFile(selectedFile);
        setUploadingMedia(false);
      }

      if (isCreatingChat) {
        const recipient = newChatUsername.trim();
        if (!recipient) return;
        console.log('[Media Encryption] Sending message to new chat with encryption metadata:', {
          hasEncryptionKey: !!mediaEncryptionKey,
          hasSenderKey: !!senderMediaEncryptionKey,
          hasEncryptionIv: !!mediaEncryptionIv,
          keyPreview: mediaEncryptionKey?.substring(0, 30),
          ivPreview: mediaEncryptionIv?.substring(0, 20),
        });
        sendMessageMutation.mutate({
          recipient_username: recipient,
          content: trimmedMessage || undefined,
          media_file_id: mediaFileId,
          media_url: mediaUrl,
          media_type: mediaMimeType,
          media_size: mediaSize,
          message_type: messageType,
          media_encryption_key: mediaEncryptionKey,
          media_encryption_iv: mediaEncryptionIv,
          sender_media_encryption_key: senderMediaEncryptionKey,
          reply_to: replyTargetMessage?.id ?? undefined,
        });
        return;
      }

      if (selectedConversationId) {
        console.log(
          '[Media Encryption] Sending message to existing conversation with encryption metadata:',
          {
            hasEncryptionKey: !!mediaEncryptionKey,
            hasSenderKey: !!senderMediaEncryptionKey,
            hasEncryptionIv: !!mediaEncryptionIv,
            keyPreview: mediaEncryptionKey?.substring(0, 30),
            ivPreview: mediaEncryptionIv?.substring(0, 20),
          }
        );
        sendMessageMutation.mutate({
          conversation_id: selectedConversationId,
          content: trimmedMessage || undefined,
          media_file_id: mediaFileId,
          media_url: mediaUrl,
          media_type: mediaMimeType,
          media_size: mediaSize,
          message_type: messageType,
          media_encryption_key: mediaEncryptionKey,
          media_encryption_iv: mediaEncryptionIv,
          sender_media_encryption_key: senderMediaEncryptionKey,
          reply_to: replyTargetMessage?.id ?? undefined,
        });
      }
    } catch (error) {
      setUploadingMedia(false);
      console.error('Failed to send message:', error);
      alert(t('messages.media.uploadFailed'));
    }
  };

  const handleDeleteMessageChoice = (deleteFor: 'self' | 'both') => {
    if (!deleteDialogMessage) return;
    deleteMessageMutation.mutate({
      messageId: deleteDialogMessage.id,
      conversationId: deleteDialogMessage.conversation_id,
      deleteFor,
    });
  };

  const handleReportMessage = (message: Message) => {
    const reasonInput = window.prompt(t('reporting.reasonPrompt'));
    if (reasonInput === null) return;
    const detailsInput = window.prompt(t('reporting.detailsPrompt'));
    const { reason, description } = buildUserReport(reasonInput, detailsInput);

    reportMessageMutation.mutate({
      messageId: message.id,
      reason,
      description,
    });
  };

  const handleOpenForwardDialog = (message: Message) => {
    setMessageMenuOpen(null);
    setForwardDialogMessage(message);
    setForwardTargetConversationIDs(new Set());
    setForwardIncludeMedia(Boolean(message.media_url || message.media_file_id));
  };

  const handleToggleForwardTargetConversation = (conversationID: number) => {
    setForwardTargetConversationIDs((prev) => {
      const next = new Set(prev);
      if (next.has(conversationID)) {
        next.delete(conversationID);
        return next;
      }
      if (next.size >= 10) return next;
      next.add(conversationID);
      return next;
    });
  };

  const handleConfirmForward = () => {
    if (!forwardDialogMessage) return;
    const targetConversationIDs = Array.from(forwardTargetConversationIDs);
    if (targetConversationIDs.length === 0) {
      alert(
        t(
          'messages.errors.forwardSelectConversation',
          'Select at least one conversation to forward to.'
        )
      );
      return;
    }
    forwardMessageMutation.mutate({
      message: forwardDialogMessage,
      targetConversationIDs,
      includeMedia: forwardIncludeMedia,
    });
  };

  // For mod_mail conversations, backend returns messages in ASC order (oldest first)
  // For DM conversations, backend returns messages in DESC order (newest first)
  // We want to display oldest-to-newest (newest at bottom), so only reverse for DMs
  const orderedMessages = useMemo(() => {
    if (!messages) return [];
    const isModMail = selectedConversation?.conversation_type === 'mod_mail';
    return isModMail ? [...messages] : [...messages].reverse();
  }, [messages, selectedConversation?.conversation_type]);
  const orderedMessagesById = useMemo(
    () => new Map(orderedMessages.map((msg) => [msg.id, msg])),
    [orderedMessages]
  );

  useEffect(() => {
    setMessageSearchPage(0);
  }, [
    debouncedMessageSearch,
    messageSearchSenderFilter,
    messageSearchDateRange,
    messageSearchHasFiles,
    messageSearchHasLinks,
    selectedConversationId,
  ]);

  // Decrypt all messages for search functionality
  useEffect(() => {
    const requiresDecryptedContent = Boolean(debouncedMessageSearch.trim()) || messageSearchHasLinks;
    if (!requiresDecryptedContent || orderedMessages.length === 0) {
      setDecryptedContentMap(new Map());
      setIsDecryptingForSearch(false);
      return;
    }

    const decryptAllMessages = async () => {
      setIsDecryptingForSearch(true);
      const map = new Map<number, string>();

      await Promise.all(
        orderedMessages.map(async (msg) => {
          if (!msg.encrypted_content) return;

          try {
            const isOwn = msg.sender_id === user?.id;
            const cipherText = isOwn
              ? (msg.sender_encrypted_content ?? msg.encrypted_content)
              : msg.encrypted_content;

            if (!cipherText) return;

            // Handle multi-recipient (mod mail) messages
            if (msg.is_multi_recipient && msg.shared_encryption_iv && msg.recipient_keys) {
              const keys = await getOwnKeys();
              const encryptedKey = user?.id ? msg.recipient_keys?.[user.id] : null;
              if (keys?.privateKey && encryptedKey) {
                const decrypted = await decryptMultiRecipientContent(
                  cipherText,
                  encryptedKey,
                  msg.shared_encryption_iv,
                  keys.privateKey
                );
                map.set(msg.id, decrypted);
                return;
              }
            }

            // Handle standard encrypted messages
            const shouldAttemptDecrypt = Boolean(
              (isOwn && msg.sender_encrypted_content) ||
              (!isOwn &&
                (msg.encryption_version === 'v1' ||
                  msg.encryption_version === 'v2' ||
                  cipherText.startsWith('v2:')))
            );

            if (!shouldAttemptDecrypt) {
              map.set(msg.id, cipherText);
              return;
            }

            const keys = await getOwnKeys();
            if (!keys) {
              map.set(msg.id, cipherText);
              return;
            }

            const decrypted = await decryptMessage(cipherText, keys.privateKey);
            map.set(msg.id, decrypted);
          } catch (error) {
            console.warn('[Search] Failed to decrypt message:', msg.id, error);
            // Skip this message in search if decryption fails
          }
        })
      );

      setDecryptedContentMap(map);
      setIsDecryptingForSearch(false);
    };

    decryptAllMessages();
  }, [orderedMessages, debouncedMessageSearch, messageSearchHasLinks, user?.id]);

  const messageSearchFilters = useMemo<MessageSearchFilters>(() => {
    const now = Date.now();
    let startDate: Date | undefined;
    if (messageSearchDateRange === '24h') {
      startDate = new Date(now - 24 * 60 * 60 * 1000);
    } else if (messageSearchDateRange === '7d') {
      startDate = new Date(now - 7 * 24 * 60 * 60 * 1000);
    } else if (messageSearchDateRange === '30d') {
      startDate = new Date(now - 30 * 24 * 60 * 60 * 1000);
    }

    const senderId =
      messageSearchSenderFilter === 'mine'
        ? user?.id
        : messageSearchSenderFilter === 'others'
          ? selectedConversation?.other_user?.id
          : undefined;

    return {
      conversationId: selectedConversationId ?? undefined,
      senderId,
      startDate,
      hasFiles: messageSearchHasFiles,
      hasLinks: messageSearchHasLinks,
    };
  }, [
    messageSearchDateRange,
    messageSearchSenderFilter,
    messageSearchHasFiles,
    messageSearchHasLinks,
    selectedConversationId,
    selectedConversation?.other_user?.id,
    user?.id,
  ]);

  const hasActiveMessageSearch = Boolean(debouncedMessageSearch.trim()) ||
    messageSearchSenderFilter !== 'all' ||
    messageSearchDateRange !== 'all' ||
    messageSearchHasFiles ||
    messageSearchHasLinks;

  const messageSearchOutput = useMemo(() => {
    if (!hasActiveMessageSearch) {
      return { total: 0, results: [] };
    }

    return searchMessages(orderedMessages, decryptedContentMap, debouncedMessageSearch, messageSearchFilters, {
      limit: SEARCH_PAGE_SIZE,
      offset: messageSearchPage * SEARCH_PAGE_SIZE,
    });
  }, [
    hasActiveMessageSearch,
    orderedMessages,
    decryptedContentMap,
    debouncedMessageSearch,
    messageSearchFilters,
    messageSearchPage,
  ]);

  const filteredMessages = useMemo(
    () =>
      hasActiveMessageSearch
        ? messageSearchOutput.results.map((result) => result.message)
        : orderedMessages,
    [hasActiveMessageSearch, messageSearchOutput, orderedMessages]
  );
  const filteredMessageCount = hasActiveMessageSearch ? messageSearchOutput.total : orderedMessages.length;
  const searchResultMetaByMessageId = useMemo(() => {
    if (!hasActiveMessageSearch) return new Map<number, MessageSearchResult>();
    const map = new Map<number, MessageSearchResult>();
    messageSearchOutput.results.forEach((result) => {
      map.set(result.message.id, result);
    });
    return map;
  }, [hasActiveMessageSearch, messageSearchOutput]);

  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const scrollToLatestMessage = useCallback(() => {
    const container = messagesContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, []);
  const canDeleteForBoth = Boolean(
    deleteDialogMessage && deleteDialogMessage.sender_id === user?.id
  );
  const forwardCandidateConversations = useMemo(() => {
    if (!forwardDialogMessage) return [];
    return allConversations.filter(
      (conversation) => conversation.id !== forwardDialogMessage.conversation_id
    );
  }, [allConversations, forwardDialogMessage]);

  const markConversationAsRead = useCallback(
    async (conversationId: number) => {
      if (!readReceipts) {
        console.log('[Messages] Read receipts disabled, not marking as read');
        return;
      }

      try {
        await messagesService.markAsRead(conversationId);
        queryClient.setQueryData<Conversation[] | undefined>(['conversations'], (prev) => {
          if (!prev) return prev;
          return prev.map((conv) =>
            conv.id === conversationId ? { ...conv, unread_count: 0 } : conv
          );
        });
        queryClient.invalidateQueries({ queryKey: ['conversations'] });
        queryClient.invalidateQueries({ queryKey: ['conversations', 'all'] });
      } catch (error) {
        console.error('Failed to mark conversation as read', error);
      }
    },
    [queryClient, readReceipts]
  );

  // Sync selected conversation with global messaging context
  useEffect(() => {
    setActiveConversationId(selectedConversationId);
    return () => {
      setActiveConversationId(null);
    };
  }, [selectedConversationId, setActiveConversationId]);

  useEffect(() => {
    if (selectedConversationId && !isCreatingChat) {
      markConversationAsRead(selectedConversationId);
    }
  }, [selectedConversationId, isCreatingChat, markConversationAsRead]);

  useEffect(() => {
    if (toUsernameParam) {
      setIsCreatingChat(true);
      setSelectedConversationId(null);
      setNewChatUsername(toUsernameParam);
    }
  }, [toUsernameParam]);

  useEffect(() => {
    if (!selectedConversationId || isCreatingChat || loadingMessages) return;
    // Use setTimeout to ensure DOM has updated with new messages
    const timer = setTimeout(() => {
      scrollToLatestMessage();
    }, 100);
    return () => clearTimeout(timer);
  }, [selectedConversationId, isCreatingChat, loadingMessages, scrollToLatestMessage, messages]);

  useEffect(() => {
    setMessageMenuOpen(null);
    setDeleteDialogMessage(null);
    setForwardDialogMessage(null);
    setForwardTargetConversationIDs(new Set());
    setShowMessageSearch(false);
    setExpandedPinnedMessages(false);
  }, [selectedConversationId]);

  const handleJumpToPinnedMessage = useCallback((messageId: number) => {
    const target = document.getElementById(`message-${messageId}`);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, []);

  // Keyboard shortcut: Escape to clear message search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && messageSearchQuery) {
        e.preventDefault();
        setMessageSearchQuery('');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [messageSearchQuery]);

  useEffect(() => {
    if (messageMenuOpen === null) return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) {
        setMessageMenuOpen(null);
        return;
      }
      const container = target.closest('[data-message-menu-container]');
      if (
        !container ||
        container.getAttribute('data-message-menu-container') !== String(messageMenuOpen)
      ) {
        setMessageMenuOpen(null);
      }
    };

    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [messageMenuOpen]);

  useEffect(() => {
    if (conversationMenuOpen === null) return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) {
        setConversationMenuOpen(null);
        return;
      }
      const container = target.closest('[data-conversation-menu-container]');
      if (
        !container ||
        container.getAttribute('data-conversation-menu-container') !== String(conversationMenuOpen)
      ) {
        setConversationMenuOpen(null);
      }
    };

    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [conversationMenuOpen]);

  const handleConversationTouchStart = useCallback(
    (conversationID: number, event: React.TouchEvent<HTMLDivElement>) => {
      if (!isMobile) return;
      const touch = event.touches[0];
      if (!touch) return;
      touchStartRef.current = { conversationID, x: touch.clientX, y: touch.clientY };
    },
    [isMobile]
  );

  const handleConversationTouchEnd = useCallback(
    (conversationID: number, event: React.TouchEvent<HTMLDivElement>) => {
      if (!isMobile || !touchStartRef.current) return;
      if (touchStartRef.current.conversationID != conversationID) return;
      const touch = event.changedTouches[0];
      const start = touchStartRef.current;
      touchStartRef.current = null;
      if (!touch) return;

      const deltaX = touch.clientX - start.x;
      const deltaY = touch.clientY - start.y;
      if (Math.abs(deltaX) < 72 || Math.abs(deltaY) > 42) return;

      if (activeTab === 'active' && deltaX < 0) {
        swipeHandledRef.current = conversationID;
        archiveConversation(conversationID);
      } else if (activeTab === 'archived' && deltaX > 0) {
        swipeHandledRef.current = conversationID;
        unarchiveConversation(conversationID);
      }
    },
    [activeTab, archiveConversation, isMobile, unarchiveConversation]
  );

  const handleSelectConversation = useCallback((conversationID: number) => {
    if (swipeHandledRef.current === conversationID) {
      swipeHandledRef.current = null;
      return;
    }
    setSelectedConversationId(conversationID);
    setIsCreatingChat(false);
    setNewChatUsername('');
    setSelectedFile(null);
  }, []);

  const toggleConversationSelection = useCallback((conversationID: number) => {
    setSelectedConversationIDs((prev) => {
      const next = new Set(prev);
      if (next.has(conversationID)) {
        next.delete(conversationID);
      } else {
        next.add(conversationID);
      }
      return next;
    });
  }, []);

  const handleArchiveSelected = useCallback(async () => {
    if (selectedConversationIDs.size === 0) return;
    const ids = Array.from(selectedConversationIDs);
    try {
      await archiveConversationsBatch(ids);
      setSelectedConversationIDs(new Set());
    } catch {
      // Errors are surfaced by useArchive toast handling.
    }
  }, [archiveConversationsBatch, selectedConversationIDs]);

  // Cleanup typing timeout on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setSelectedConversationIDs(new Set());
  }, [activeTab]);

  useEffect(() => {
    if (!conversations) return;
    const visibleIDs = new Set(conversations.map((conversation) => conversation.id));
    setSelectedConversationIDs((prev) => {
      const next = new Set(Array.from(prev).filter((id) => visibleIDs.has(id)));
      if (next.size === prev.size) return prev;
      return next;
    });
  }, [conversations]);

  return (
    <>
      <div
        className="relative flex overflow-hidden"
        style={{
          height: isMobile
            ? 'calc(100dvh - 4rem - 56px - env(safe-area-inset-bottom))'
            : 'calc(100vh - 4rem)',
        }}
      >
        {/* Conversations List */}
        <div
          className={
            isMobile
              ? `absolute inset-0 flex overflow-hidden border-r border-[var(--color-border)] bg-[var(--color-surface)] will-change-transform transition-transform duration-[250ms] ease-in-out ${isInChat ? '-translate-x-full' : 'translate-x-0'}`
              : 'flex w-80 flex-shrink-0 overflow-hidden border-r border-[var(--color-border)] bg-[var(--color-surface)]'
          }
        >
          {/* Folder sidebar — desktop only */}
          {!isMobile && (
            <FolderList
              folders={folders}
              selectedFolderId={selectedFolderId}
              smartFolder={smartFolder}
              onSelectFolder={setSelectedFolderId}
              onSelectSmartFolder={setSmartFolder}
              onNewFolder={() => setFolderModalOpen('new')}
              onEditFolder={(folder) => setFolderModalOpen({ folder })}
              onDeleteFolder={(folder) => { setDeleteFolderTarget(folder); setDeleteFolderError(''); }}
              isLoading={isLoadingFolders}
              deletingFolderId={deletingFolderId}
              className="w-44 flex-shrink-0 border-r border-[var(--color-border)]"
            />
          )}

          {/* Conversation list panel */}
          <div className="flex flex-1 flex-col overflow-hidden">
          <div className="border-b border-[var(--color-border)] p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
                {t('messages.title')}
              </h2>
              <div className="flex items-center gap-2">
                {activeTab === 'active' && selectedConversationIDs.size > 0 && (
                  <button
                    type="button"
                    onClick={() => void handleArchiveSelected()}
                    disabled={isBatchArchiving}
                    className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 md:py-1 text-sm font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)] disabled:opacity-60"
                  >
                    {`${t('messages.archive')} (${selectedConversationIDs.size})`}
                  </button>
                )}
                <button
                  onClick={() => {
                    setIsCreatingChat(true);
                    setSelectedConversationId(null);
                    setNewChatUsername('');
                    setMessageText('');
                    setSelectedFile(null);
                  }}
                  className="rounded-md bg-[var(--color-primary)] px-3 py-2 md:py-1 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)] active:bg-[var(--color-primary-dark)]"
                >
                  {t('messages.newConversation')}
                </button>
                <button
                  onClick={() => setShowCreateGroupModal(true)}
                  title={t('groups.newGroup')}
                  className="flex items-center justify-center h-8 w-8 rounded-md border border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)]"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                    <path d="M12 7H9V4a1 1 0 0 0-2 0v3H4a1 1 0 0 0 0 2h3v3a1 1 0 0 0 2 0V9h3a1 1 0 0 0 0-2z" fill="currentColor"/>
                    <circle cx="3" cy="3" r="1.5" fill="currentColor" opacity="0.4"/>
                    <circle cx="13" cy="3" r="1.5" fill="currentColor" opacity="0.4"/>
                  </svg>
                </button>
              </div>
            </div>
            {/* Tabs */}
            <div className="flex gap-1 border-b border-[var(--color-border)]">
              <button
                onClick={() => setActiveTab('active')}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  activeTab === 'active'
                    ? 'text-[var(--color-primary)] border-b-2 border-[var(--color-primary)]'
                    : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                {t('messages.tabs.active')}
              </button>
              <button
                onClick={() => setActiveTab('archived')}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  activeTab === 'archived'
                    ? 'text-[var(--color-primary)] border-b-2 border-[var(--color-primary)]'
                    : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                {t('messages.tabs.archived')}
              </button>
            </div>

            {/* Mobile folder filter bar */}
            {isMobile && (
              <nav aria-label={t('messages.folders.title')} className="flex items-center gap-1.5 overflow-x-auto border-b border-[var(--color-border)] px-3 py-2 [scrollbar-width:none]">
                {/* All */}
                <button
                  type="button"
                  onClick={() => { setSelectedFolderId(null); setSmartFolder(null); }}
                  aria-current={selectedFolderId === null && smartFolder === null ? 'page' : undefined}
                  className={`flex-shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] ${
                    selectedFolderId === null && smartFolder === null
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white'
                      : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                  }`}
                >
                  {t('messages.folders.allConversations')}
                </button>
                {/* Unread */}
                <button
                  type="button"
                  onClick={() => { setSelectedFolderId(null); setSmartFolder('unread'); }}
                  aria-current={smartFolder === 'unread' ? 'page' : undefined}
                  className={`flex-shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] ${
                    smartFolder === 'unread'
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white'
                      : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                  }`}
                >
                  {t('messages.folders.unread')}
                </button>
                {/* User folders */}
                {folders.map((folder) => (
                  <button
                    key={folder.id}
                    type="button"
                    onClick={() => { setSelectedFolderId(folder.id); setSmartFolder(null); }}
                    aria-current={selectedFolderId === folder.id ? 'page' : undefined}
                    className={`flex-shrink-0 inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] ${
                      selectedFolderId === folder.id
                        ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white'
                        : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                    }`}
                    style={selectedFolderId === folder.id ? undefined : { borderColor: hexToRgba(folder.color, 0.4) }}
                  >
                    <span aria-hidden>{folder.icon}</span>
                    <span className="max-w-[5rem] truncate">{folder.name}</span>
                  </button>
                ))}
                {/* Manage folders button */}
                <button
                  type="button"
                  onClick={() => setShowMobileFolderSheet(true)}
                  className="flex-shrink-0 rounded-full border border-[var(--color-border)] px-2.5 py-1 text-xs font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
                  aria-label={t('messages.folders.manageFolder')}
                  title={t('messages.folders.manageFolder')}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                    <circle cx="6" cy="6" r="2" stroke="currentColor" strokeWidth="1.2"/>
                    <path d="M6 1v1.5M6 9.5V11M1 6h1.5M9.5 6H11M2.4 2.4l1.1 1.1M8.5 8.5l1.1 1.1M9.6 2.4L8.5 3.5M3.5 8.5l-1.1 1.1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                  </svg>
                </button>
              </nav>
            )}

            {/* Search input */}
            <div className="p-3 border-b border-[var(--color-border)]">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('messages.search.conversations')}
                className="w-full px-3 py-2 text-sm border border-[var(--color-border)] rounded-lg bg-[var(--color-surface)] text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
              {searchQuery && conversations && (
                <p className="mt-1.5 text-xs text-[var(--color-text-secondary)]">
                  {t('messages.search.conversationResults', { count: conversations.length })}
                </p>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto min-h-0">
            {loadingConversations && (
              <div className="p-4 text-center">
                <LoadingMessage className="text-sm">{t('common.loading')}</LoadingMessage>
              </div>
            )}

            <GroupInvitesList onConversationOpened={setSelectedConversationId} />

            {conversations?.map((conversation) => (
              <div
                key={conversation.id}
                className={`relative w-full border-b border-[var(--color-border)] transition-colors ${
                  selectedConversationId === conversation.id
                    ? 'bg-[var(--color-surface-elevated)]'
                    : 'hover:bg-[var(--color-surface-elevated)] active:bg-[var(--color-surface-elevated)]'
                }`}
                data-conversation-menu-container={conversation.id}
              >
                <div
                  role="button"
                  tabIndex={0}
                  aria-label={t('messages.aria.openConversation')}
                  onClick={() => handleSelectConversation(conversation.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      handleSelectConversation(conversation.id);
                    }
                  }}
                  onTouchStart={(event) => handleConversationTouchStart(conversation.id, event)}
                  onTouchEnd={(event) => handleConversationTouchEnd(conversation.id, event)}
                  className="w-full p-4 text-left"
                >
                  {activeTab === 'active' && (
                    <label className="mb-2 inline-flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
                      <input
                        type="checkbox"
                        checked={selectedConversationIDs.has(conversation.id)}
                        onChange={() => toggleConversationSelection(conversation.id)}
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                        onTouchStart={(event) => event.stopPropagation()}
                        onTouchEnd={(event) => event.stopPropagation()}
                      />
                      {t('messages.archive')}
                    </label>
                  )}
                  {/* MSG-2: Enhanced conversation preview with timestamp and better spacing */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`font-medium text-[var(--color-text-primary)] ${conversation.unread_count > 0 ? 'font-semibold' : ''}`}
                          >
                            {conversation.conversation_type === 'mod_mail'
                              ? `${getHubDisplayTitle(conversation.hub_name)} - ${t('messages.modMail')} - ${conversation.subject || t('messages.untitled')}`
                              : conversation.conversation_type === 'group'
                                ? conversation.group_name || t('groups.groupConversation')
                                : conversation.other_user?.username || t('messages.unknown')}
                          </span>
                          {conversation.other_user?.id && (
                            <OnlineStatusIndicator userId={conversation.other_user.id} />
                          )}
                          {(conversation.is_archived ?? conversation.archived_at !== null) && (
                            <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                              {t('messages.badges.archived')}
                            </span>
                          )}
                        </div>
                        {conversation.latest_message?.sent_at && (
                          <span className="text-xs text-[var(--color-text-muted)] flex-shrink-0">
                            {formatRelativeTime(conversation.latest_message.sent_at)}
                          </span>
                        )}
                        {conversation.muted && (
                          <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                            {t('messages.muted')}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {activeTab === 'archived' && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            unarchiveConversation(conversation.id);
                          }}
                          onTouchStart={(e) => e.stopPropagation()}
                          onTouchEnd={(e) => e.stopPropagation()}
                          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs font-semibold text-[var(--color-text-secondary)] transition hover:bg-[var(--color-surface-elevated)] hover:text-[var(--color-text-primary)]"
                          disabled={isUnarchiving}
                        >
                          {t('messages.unarchive')}
                        </button>
                      )}
                      {conversation.unread_count > 0 &&
                        conversation.id !== selectedConversationId && (
                          <span className="rounded-full bg-[var(--color-primary)] px-2.5 py-1 text-xs font-semibold text-white">
                            {conversation.unread_count}
                          </span>
                        )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setConversationMenuOpen(
                            conversationMenuOpen === conversation.id ? null : conversation.id
                          );
                        }}
                        onTouchStart={(e) => e.stopPropagation()}
                        onTouchEnd={(e) => e.stopPropagation()}
                        className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-0.5 text-xs font-semibold text-[var(--color-text-secondary)] transition hover:bg-[var(--color-surface-elevated)] hover:text-[var(--color-text-primary)]"
                      >
                        ...
                      </button>
                    </div>
                  </div>
                  {conversation.latest_message &&
                    conversation.latest_message.encrypted_content &&
                    !isAutoGeneratedMediaCaption(conversation.latest_message) && (
                      <DecryptedMessageContent
                        message={conversation.latest_message}
                        isOwnMessage={conversation.latest_message.sender_id === user?.id}
                        currentUserId={user?.id}
                        className="mt-1 text-sm text-[var(--color-text-secondary)] line-clamp-2"
                      />
                    )}
                  {/* Show folder badge when viewing a specific folder */}
                  {selectedFolderId !== null && (() => {
                    const activeFolder = folders.find((f) => f.id === selectedFolderId);
                    return activeFolder ? (
                      <FolderBadge folder={activeFolder} />
                    ) : null;
                  })()}
                </div>
                {/* Context Menu */}
                {conversationMenuOpen === conversation.id && (
                  <div className="absolute right-2 top-12 z-20 w-44 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-2 shadow-lg">
                    {activeTab === 'active' ? (
                      <button
                        type="button"
                        className="w-full rounded-md px-3 py-2 text-left text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)]"
                        onClick={() => {
                          archiveConversation(conversation.id);
                          setConversationMenuOpen(null);
                        }}
                        disabled={isArchiving}
                      >
                        {t('messages.archive')}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="w-full rounded-md px-3 py-2 text-left text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)]"
                        onClick={() => {
                          unarchiveConversation(conversation.id);
                          setConversationMenuOpen(null);
                        }}
                        disabled={isUnarchiving}
                      >
                        {t('messages.unarchive')}
                      </button>
                    )}
                    <button
                      type="button"
                      className="w-full rounded-md px-3 py-2 text-left text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)]"
                      onClick={() => {
                        if (conversation.muted) {
                          unmuteConversationMutation.mutate(conversation.id);
                        } else {
                          muteConversationMutation.mutate(conversation.id);
                        }
                      }}
                    >
                      {conversation.muted ? t('messages.unmute') : t('messages.mute')}
                    </button>
                    <button
                      type="button"
                      className="w-full rounded-md px-3 py-2 text-left text-sm font-medium text-[var(--color-error)] hover:bg-[var(--color-surface-elevated)]"
                      onClick={() => {
                        setConversationMenuOpen(null);
                        setDeleteConversationDialog(conversation);
                      }}
                    >
                      {t('common.delete')}
                    </button>
                    {folders.length > 0 && (
                      <ConversationFolderMenu
                        conversationId={conversation.id}
                        folders={folders}
                        onAdd={(folderID) =>
                          addConversationToFolder({ folderID, conversationID: conversation.id })
                        }
                        onRemove={(folderID) =>
                          removeConversationFromFolder({ folderID, conversationID: conversation.id })
                        }
                      />
                    )}
                  </div>
                )}
              </div>
            ))}

            {conversations?.length === 0 && (
              <div className="p-4">
                <EmptyConversations />
              </div>
            )}

            {hasMoreConversations && (
              <div className="p-4">
                <button
                  type="button"
                  onClick={() => fetchMoreConversations()}
                  disabled={isFetchingMoreConversations}
                  className="w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)] disabled:opacity-60"
                >
                  {isFetchingMoreConversations ? t('common.loading') : t('messages.loadMore')}
                </button>
              </div>
            )}
          </div>
          </div>{/* end conversation list panel */}
        </div>

        {/* Chat Area */}
        <div
          className={
            isMobile
              ? `absolute inset-0 flex flex-col overflow-hidden bg-[var(--color-surface)] will-change-transform transition-transform duration-[250ms] ease-in-out ${isInChat ? 'translate-x-0' : 'translate-x-full'}`
              : 'flex flex-1 flex-col overflow-hidden bg-[var(--color-surface)]'
          }
        >
          {selectedConversationId || isCreatingChat ? (
            <>
              {/* Chat Header */}
              <div className="border-b border-[var(--color-border)] p-3 md:p-4">
                <div className="flex items-center justify-between">
                  <div className="flex flex-1 min-w-0 items-center gap-1 md:gap-2">
                    {/* Back button — mobile only */}
                    {isMobile && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedConversationId(null);
                          setIsCreatingChat(false);
                          setShowMessageSearch(false);
                        }}
                        className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full active:bg-[var(--color-surface-elevated)]"
                        aria-label={t('messages.aria.backToConversations')}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-5 w-5 text-[var(--color-text-primary)]"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15 19l-7-7 7-7"
                          />
                        </svg>
                      </button>
                    )}
                    <h3 className="min-w-0 font-semibold text-[var(--color-text-primary)] truncate">
                      {isCreatingChat
                        ? t('messages.newConversation')
                        : selectedConversation?.conversation_type === 'mod_mail'
                          ? `${getHubDisplayTitle(selectedConversation?.hub_name)} - ${t('messages.modMail')} - ${selectedConversation?.subject || t('messages.untitled')}`
                          : selectedConversation?.conversation_type === 'group'
                            ? selectedConversation?.group_name || t('groups.groupConversation')
                            : selectedConversation?.other_user?.username || t('messages.unknown')}
                    </h3>
                    {!isCreatingChat &&
                      selectedConversation?.conversation_type === 'group' &&
                      selectedConversation?.participant_count != null && (
                        <span className="text-xs text-[var(--color-text-muted)]">
                          {t('groups.participantCount', { count: selectedConversation.participant_count })}
                        </span>
                      )}
                    {!isCreatingChat &&
                      selectedConversation?.conversation_type === 'dm' &&
                      selectedConversation?.other_user?.id && (
                        <OnlineStatusIndicator userId={selectedConversation.other_user.id} />
                      )}
                  </div>

                  {/* Slideshow buttons */}
                  <div className="flex items-center gap-2">
                    {/* Group info button */}
                    {!isCreatingChat && selectedConversation?.conversation_type === 'group' && (
                      <button
                        type="button"
                        onClick={() => setShowGroupSidebar((s) => !s)}
                        className="flex items-center justify-center h-8 w-8 rounded-md border border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)]"
                        aria-label={t('groups.groupInfo')}
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                          <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3"/>
                          <path d="M8 7v4M8 5.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
                      </button>
                    )}
                    {/* Reddit/Hub slideshow button */}
                    {!isCreatingChat && (
                      <button
                        onClick={() => {
                          setRedditSlideshowModalOpen(true);
                          setRedditSlideshowInput('');
                        }}
                        className="flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-1.5 text-sm font-medium text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-surface-hover)] active:bg-[var(--color-surface-hover)]"
                        aria-label={t('messages.browseRedditHub')}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-5 w-5 flex-shrink-0"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                          />
                        </svg>
                        <span className="hidden md:inline">{t('messages.browseRedditHub')}</span>
                      </button>
                    )}

                    {/* Chat media slideshow button - only show if conversation has 2+ media items */}
                    {!isCreatingChat && conversationMediaMessages.length >= 2 && (
                      <button
                        onClick={() => setSlideshowOpen(true)}
                        className="flex items-center gap-2 rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[var(--color-primary-dark)] active:bg-[var(--color-primary-dark)]"
                        aria-label={t('messages.media.viewAllTitle')}
                        title={t('messages.media.viewAllTitle')}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-5 w-5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                          />
                        </svg>
                        <span className="hidden md:inline">
                          {t('messages.mediaGallery')} ({conversationMediaMessages.length})
                        </span>
                      </button>
                    )}
                    {/* Search toggle — mobile only */}
                    {isMobile && !isCreatingChat && (
                      <button
                        type="button"
                        onClick={() => setShowMessageSearch((prev) => !prev)}
                        className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md border transition-colors active:opacity-80 ${
                          showMessageSearch
                            ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white'
                            : 'border-[var(--color-border)] bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)]'
                        }`}
                        aria-label={t('messages.search.ariaToggle')}
                        aria-pressed={showMessageSearch}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-4 w-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                          />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Message Search Bar */}
              {!isCreatingChat && (!isMobile || showMessageSearch) && (
                <div className="border-b border-[var(--color-border)] p-3 bg-[var(--color-surface-elevated)]">
                  <div className="relative flex items-center gap-2">
                    {/* Search Icon */}
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4 absolute left-3 text-[var(--color-text-muted)] pointer-events-none"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                      />
                    </svg>

                    {/* Search Input */}
                    <input
                      type="text"
                      value={messageSearchQuery}
                      onChange={(e) => setMessageSearchQuery(e.target.value)}
                      placeholder={t('messages.search.inConversation')}
                      className="w-full pl-9 pr-20 py-2 text-sm border border-[var(--color-border)] rounded-md bg-[var(--color-surface)] text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent"
                    />

                    {/* Clear Button */}
                    {messageSearchQuery && (
                      <button
                        type="button"
                        onClick={resetMessageSearch}
                        className="absolute right-16 p-1 rounded-full hover:bg-[var(--color-surface-hover)] active:bg-[var(--color-surface-hover)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
                        aria-label={t('messages.search.clearLabel')}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-4 w-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    )}

                    {/* Result Count */}
                    {hasActiveMessageSearch && (
                      <div className="absolute right-3 flex items-center gap-1 text-xs text-[var(--color-text-muted)] bg-[var(--color-surface-elevated)] px-2 py-1 rounded">
                        {isDecryptingForSearch ? (
                          <span>{t('messages.searching')}</span>
                        ) : (
                          <span>
                            {filteredMessageCount}{' '}
                            {filteredMessageCount === 1
                              ? t('messages.match')
                              : t('messages.matches')}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 md:flex md:flex-wrap md:items-center">
                    <select
                      value={messageSearchSenderFilter}
                      onChange={(e) =>
                        setMessageSearchSenderFilter(e.target.value as 'all' | 'mine' | 'others')
                      }
                      className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-text-primary)]"
                    >
                      <option value="all">{t('messages.search.filters.senderAll')}</option>
                      <option value="mine">{t('messages.search.filters.senderMine')}</option>
                      <option value="others">{t('messages.search.filters.senderOthers')}</option>
                    </select>
                    <select
                      value={messageSearchDateRange}
                      onChange={(e) =>
                        setMessageSearchDateRange(
                          e.target.value as 'all' | '24h' | '7d' | '30d'
                        )
                      }
                      className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-text-primary)]"
                    >
                      <option value="all">{t('messages.search.filters.dateAll')}</option>
                      <option value="24h">{t('messages.search.filters.date24h')}</option>
                      <option value="7d">{t('messages.search.filters.date7d')}</option>
                      <option value="30d">{t('messages.search.filters.date30d')}</option>
                    </select>
                    <label className="inline-flex items-center gap-1 text-xs text-[var(--color-text-secondary)]">
                      <input
                        type="checkbox"
                        checked={messageSearchHasFiles}
                        onChange={(e) => setMessageSearchHasFiles(e.target.checked)}
                      />
                      {t('messages.search.filters.hasFiles')}
                    </label>
                    <label className="inline-flex items-center gap-1 text-xs text-[var(--color-text-secondary)]">
                      <input
                        type="checkbox"
                        checked={messageSearchHasLinks}
                        onChange={(e) => setMessageSearchHasLinks(e.target.checked)}
                      />
                      {t('messages.search.filters.hasLinks')}
                    </label>
                  </div>
                </div>
              )}

              {!isCreatingChat && selectedConversationId && (
                <PinnedMessagesBar
                  pinnedMessages={pinnedMessages}
                  currentUserId={user?.id}
                  currentUserRole={user?.role}
                  expanded={expandedPinnedMessages}
                  onToggleExpanded={() => setExpandedPinnedMessages((prev) => !prev)}
                  onJumpToMessage={handleJumpToPinnedMessage}
                  onUnpinMessage={(messageId) => unpinMessage(messageId)}
                  unpinningMessageId={unpinningMessageId}
                />
              )}

              {/* Messages */}
              <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4">
                {isCreatingChat ? (
                  <div className="text-center text-sm text-[var(--color-text-secondary)]">
                    {t('messages.startConversation')}
                  </div>
                ) : loadingMessages ? (
                  <div className="text-center">
                    <LoadingMessage className="text-sm">
                      {t('messages.loadingMessages')}
                    </LoadingMessage>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {hasMoreMessages && !hasActiveMessageSearch && (
                      <div className="flex justify-center">
                        <button
                          type="button"
                          onClick={() => fetchMoreMessages()}
                          disabled={isFetchingMoreMessages}
                          className="rounded-md border border-[var(--color-border)] px-3 py-1 text-xs font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-elevated)] active:bg-[var(--color-surface-elevated)] disabled:opacity-60"
                        >
                          {isFetchingMoreMessages
                            ? t('common.loading')
                            : t('messages.loadMoreMessages')}
                        </button>
                      </div>
                    )}
                    {filteredMessages.map((message) => {
                      const isOwnMessage = message.sender_id === user?.id;
                      const messagePinned = pinnedMessageIds.has(message.id);
                      const isPinningMessage = pinningMessageId === message.id;
                      const isUnpinningMessage = unpinningMessageId === message.id;
                      const canUnpinThisMessage = canUnpinMessage(message.id);
                      const pinMutationPending = isPinningMessage || isUnpinningMessage;

                      // For mod_mail, get sender info from participants
                      const isModMail = selectedConversation?.conversation_type === 'mod_mail';
                      const participant = isModMail
                        ? modMailConversation?.participants?.find(
                            (p) => p.user_id === message.sender_id
                          )
                        : null;
                      const senderUsername =
                        participant?.username ||
                        (isOwnMessage ? t('messages.you') : t('messages.user'));
                      const isModerator = participant?.is_moderator || false;
                      const parentMessage = message.reply_to
                        ? orderedMessagesById.get(message.reply_to)
                        : undefined;
                      const parentParticipant = isModMail
                        ? modMailConversation?.participants?.find(
                            (p) => p.user_id === parentMessage?.sender_id
                          )
                        : null;
                      const parentUsername = parentMessage
                        ? parentMessage.sender_id === user?.id
                          ? t('messages.you')
                          : isModMail
                            ? (parentParticipant?.username ?? t('messages.user'))
                            : (selectedConversation?.other_user?.username ?? t('messages.user'))
                        : undefined;
                      const parentDeleted =
                        !!message.reply_to &&
                        (!parentMessage ||
                          (parentMessage.deleted_for_sender && parentMessage.deleted_for_recipient));
                      const parentDecrypted = parentMessage
                        ? decryptedContentMap.get(parentMessage.id)
                        : undefined;
                      const parentPreviewRaw =
                        parentDeleted || !parentMessage
                          ? undefined
                          : parentMessage.message_type !== 'text'
                            ? t('messages.replyIndicator.attachment')
                            : parentDecrypted ||
                              (parentMessage.encryption_version === 'plaintext' ||
                              parentMessage.encryption_version === 'none'
                                ? parentMessage.encrypted_content
                                : t('messages.replyIndicator.originalMessage'));
                      const parentPreview =
                        parentPreviewRaw && parentPreviewRaw.length > 80
                          ? `${parentPreviewRaw.slice(0, 80)}...`
                          : parentPreviewRaw;

                      return (
                        <div
                          key={message.id}
                          id={`message-${message.id}`}
                          className={`group flex flex-col ${isOwnMessage ? 'items-end' : 'items-start'}`}
                          data-message-menu-container={message.id}
                        >
                          <div
                            className={`flex items-start gap-2 ${isOwnMessage ? 'flex-row-reverse' : ''}`}
                          >
                            {/* MSG-1: Dynamic bubble width for natural message sizing */}
                            <div
                              className={`min-w-[120px] max-w-[70%] rounded-lg px-4 py-2 ${
                                isOwnMessage
                                  ? 'bg-[var(--color-primary)] text-white'
                                  : 'bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)]'
                              }`}
                            >
                              {message.reply_to && (
                                <ReplyIndicator
                                  parentUsername={parentUsername}
                                  parentPreview={parentPreview}
                                  deleted={parentDeleted}
                                  onJumpToOriginal={() => {
                                    if (!message.reply_to) return;
                                    const parentElement = document.getElementById(
                                      `message-${message.reply_to}`
                                    );
                                    if (parentElement) {
                                      parentElement.scrollIntoView({
                                        behavior: 'smooth',
                                        block: 'center',
                                      });
                                    }
                                  }}
                                />
                              )}
                              {message.media_url && (
                                <MessageMediaPreview
                                  message={message}
                                  isOwnMessage={isOwnMessage}
                                  onMediaClick={() => handleOpenMediaViewer(message)}
                                />
                              )}
                              {message.encrypted_content &&
                                !isAutoGeneratedMediaCaption(message) && (
                                  editingMessageId === message.id ? (
                                    <MessageEditMode
                                      initialContent={editingContent}
                                      sentAt={message.sent_at}
                                      isSaving={isEditSaving}
                                      onSave={(content) => saveEdit(message.id, content)}
                                      onCancel={cancelEdit}
                                      isOwnMessage={isOwnMessage}
                                    />
                                  ) : message.voice_message ? (
                                    <VoiceMessageBubble
                                      voiceMessage={message.voice_message}
                                      isOwn={isOwnMessage}
                                    />
                                  ) : (
                                    <DecryptedMessageContent
                                      message={message}
                                      isOwnMessage={isOwnMessage}
                                      currentUserId={user?.id}
                                      className="text-sm mb-1"
                                      highlightText={debouncedMessageSearch}
                                    />
                                  )
                                )}
                              {hasActiveMessageSearch && searchResultMetaByMessageId.get(message.id)?.snippet && (
                                <p
                                  className={`text-xs mb-1 ${
                                    isOwnMessage ? 'text-white/80' : 'text-[var(--color-text-muted)]'
                                  }`}
                                >
                                  <HighlightedText
                                    text={searchResultMetaByMessageId.get(message.id)!.snippet}
                                    highlight={debouncedMessageSearch}
                                  />
                                </p>
                              )}
                              <div
                                className={`text-xs flex items-center gap-1 ${
                                  isOwnMessage ? 'text-white/70' : 'text-[var(--color-text-muted)]'
                                }`}
                              >
                                {isModMail && (
                                  <>
                                    <span>{senderUsername}</span>
                                    {isModerator && (
                                      <span
                                        className={`px-1.5 py-0.5 text-[10px] font-semibold rounded ${
                                          isOwnMessage
                                            ? 'bg-white/20 text-white'
                                            : 'bg-green-600 text-white'
                                        }`}
                                      >
                                        {t('messages.badges.mod')}
                                      </span>
                                    )}
                                  </>
                                )}
                                {messagePinned && (
                                  <span
                                    className={`px-1.5 py-0.5 text-[10px] font-semibold rounded ${
                                      isOwnMessage
                                        ? 'bg-white/20 text-white'
                                        : 'bg-[var(--color-primary)] text-white'
                                    }`}
                                  >
                                    {t('messages.pinned.badge')}
                                  </span>
                                )}
                                <span>
                                  {formatDate(message.sent_at, {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric',
                                    hour: 'numeric',
                                    minute: '2-digit',
                                  })}
                                </span>
                                {message.edited && (
                                  <span className="italic opacity-70">
                                    {t('messages.editing.edited')}
                                  </span>
                                )}
                                {isOwnMessage && (
                                  <MessageStatusIndicator
                                    message={message}
                                    isSending={message.id < 0}
                                  />
                                )}
                              </div>
                            </div>
                            <div className="relative">
                              <button
                                type="button"
                                aria-label={t('messages.messageOptions.ariaLabel')}
                                className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-2 py-1 text-xs font-semibold text-[var(--color-text-secondary)] transition hover:bg-[var(--color-surface)] active:bg-[var(--color-surface)] hover:text-[var(--color-text-primary)]"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setMessageMenuOpen((prev) =>
                                    prev === message.id ? null : message.id
                                  );
                                }}
                              >
                                ...
                              </button>
                              {messageMenuOpen === message.id && (
                                <div
                                  className={`absolute ${isOwnMessage ? 'left-0' : 'right-0'} z-20 mt-2 w-44 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-2 shadow-lg`}
                                >
                                  {message.media_url && (
                                    <DownloadButton
                                      message={message}
                                      isOwnMessage={isOwnMessage}
                                      onClose={() => setMessageMenuOpen(null)}
                                    />
                                  )}
                                  {!isOwnMessage && (
                                    <button
                                      type="button"
                                      className="w-full rounded-md px-3 py-2 text-left text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)]"
                                      onClick={() => {
                                        if (!senderUsername) return;
                                        setMessageMenuOpen(null);
                                        navigate(`/users/${encodeURIComponent(senderUsername)}`);
                                      }}
                                    >
                                      {t('messages.actions.viewProfile')}
                                    </button>
                                  )}
                                  {!isOwnMessage && (
                                    <button
                                      type="button"
                                      className="w-full rounded-md px-3 py-2 text-left text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)]"
                                      disabled={reportMessageMutation.isPending}
                                      onClick={() => handleReportMessage(message)}
                                    >
                                      {reportMessageMutation.isPending
                                        ? t('messages.status.reporting')
                                        : t('messages.actions.report')}
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    className="w-full rounded-md px-3 py-2 text-left text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)]"
                                    disabled={
                                      pinMutationPending || (messagePinned && !canUnpinThisMessage)
                                    }
                                    onClick={() => {
                                      if (messagePinned) {
                                        if (!canUnpinThisMessage) return;
                                        unpinMessage(message.id);
                                      } else {
                                        pinMessage(message.id);
                                      }
                                      setMessageMenuOpen(null);
                                    }}
                                  >
                                    {pinMutationPending
                                      ? t('messages.pinned.updating')
                                      : messagePinned
                                        ? canUnpinThisMessage
                                          ? t('messages.pinned.unpin')
                                          : t('messages.pinned.unpinNotAllowed')
                                        : t('messages.pinned.pin')}
                                  </button>
                                  {isEditable(message, user?.id) && (
                                    <button
                                      type="button"
                                      className="w-full rounded-md px-3 py-2 text-left text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)]"
                                      onClick={async () => {
                                        // Fix 7: decrypt on demand so edit form always starts with correct content
                                        const content = await decryptMessageForEdit(message, isOwnMessage);
                                        startEdit(message, content);
                                        setMessageMenuOpen(null);
                                      }}
                                    >
                                      {t('messages.actions.edit')}
                                    </button>
                                  )}
                                  {isOwnMessage && message.edited && (
                                    <button
                                      type="button"
                                      className="w-full rounded-md px-3 py-2 text-left text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)]"
                                      onClick={async () => {
                                        // Fix 14: decrypt current content to show at top of history modal
                                        const content = await decryptMessageForEdit(message, isOwnMessage);
                                        setHistoryCurrentContent(content);
                                        openHistory(message.id);
                                        setMessageMenuOpen(null);
                                      }}
                                    >
                                      {t('messages.actions.viewEditHistory')}
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    className="w-full rounded-md px-3 py-2 text-left text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)]"
                                    onClick={() => {
                                      setReplyTargetMessage(message);
                                      setMessageMenuOpen(null);
                                    }}
                                  >
                                    {t('messages.actions.reply')}
                                  </button>
                                  <button
                                    type="button"
                                    className="w-full rounded-md px-3 py-2 text-left text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)]"
                                    onClick={() => handleOpenForwardDialog(message)}
                                  >
                                    {t('messages.actions.forward')}
                                  </button>
                                  <button
                                    type="button"
                                    className="w-full rounded-md px-3 py-2 text-left text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)]"
                                    onClick={() => {
                                      setMessageMenuOpen(null);
                                      setDeleteDialogMessage(message);
                                    }}
                                  >
                                    {t('common.delete')}
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                          {!message.reply_to && (message.reply_count ?? 0) > 0 && (
                            <ThreadPreview
                              replyCount={message.reply_count ?? 0}
                              onOpenThread={() => setThreadRootMessageId(message.id)}
                            />
                          )}
                          {message.id > 0 && (
                            <div
                              className={`mt-1 flex items-center gap-1 ${isOwnMessage ? 'flex-row-reverse' : 'flex-row'}`}
                            >
                              {!!user && (
                                <QuickReactButton
                                  messageId={message.id}
                                  conversationId={selectedConversationId!}
                                  isOwnMessage={isOwnMessage}
                                  currentUserId={user.id}
                                  currentUsername={user.username}
                                />
                              )}
                              {message.has_reactions && (
                                <MessageReactions
                                  messageId={message.id}
                                  isOwnMessage={isOwnMessage}
                                  currentUserId={user?.id ?? 0}
                                  currentUsername={user?.username}
                                />
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {filteredMessages.length === 0 &&
                      orderedMessages.length > 0 &&
                      hasActiveMessageSearch && (
                        <div className="py-6">
                          <EmptySearchResults query={debouncedMessageSearch} />
                          <button
                            type="button"
                            onClick={resetMessageSearch}
                            className="mx-auto mt-3 block text-sm text-[var(--color-primary)] hover:underline"
                          >
                            {t('messages.search.clearLabel')}
                          </button>
                        </div>
                      )}

                    {hasActiveMessageSearch && filteredMessageCount > SEARCH_PAGE_SIZE && (
                      <div className="mt-3 flex items-center justify-center gap-3">
                        <button
                          type="button"
                          onClick={() => setMessageSearchPage((prev) => Math.max(0, prev - 1))}
                          disabled={messageSearchPage === 0}
                          className="rounded-md border border-[var(--color-border)] px-3 py-1 text-xs font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-elevated)] disabled:opacity-50"
                        >
                          {t('common.back')}
                        </button>
                        <span className="text-xs text-[var(--color-text-secondary)]">
                          {t('searchPage.pagination.page', { page: messageSearchPage + 1 })}
                        </span>
                        <button
                          type="button"
                          onClick={() => setMessageSearchPage((prev) => prev + 1)}
                          disabled={(messageSearchPage + 1) * SEARCH_PAGE_SIZE >= filteredMessageCount}
                          className="rounded-md border border-[var(--color-border)] px-3 py-1 text-xs font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-elevated)] disabled:opacity-50"
                        >
                          {t('common.next')}
                        </button>
                      </div>
                    )}

                    {orderedMessages.length === 0 && (
                      <div className="py-6">
                        <EmptyInbox />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Message Input */}
              <div className="border-t border-[var(--color-border)] p-4">
                {isCreatingChat && (
                  <input
                    type="text"
                    value={newChatUsername}
                    onChange={(e) => setNewChatUsername(e.target.value)}
                    placeholder={t('messages.compose.enterUsername')}
                    className="mb-2 block w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                  />
                )}

                {/* Multi-upload zone */}
                {showMultiUpload && !isCreatingChat && (
                  <div className="mb-4">
                    <div className="mb-2 flex items-center justify-between">
                      <h4 className="font-medium text-[var(--color-text-primary)]">
                        {t('messages.uploadMultiple')}
                      </h4>
                      <button
                        onClick={() => setShowMultiUpload(false)}
                        className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                      >
                        {t('common.cancel')}
                      </button>
                    </div>
                    <MediaUploadZone onFilesSelected={handleMultiFileUpload} />
                  </div>
                )}

                {selectedFile && (
                  <div className="mb-2 flex items-center gap-2 rounded-md bg-[var(--color-surface-elevated)] p-2">
                    <span className="text-sm text-[var(--color-text-secondary)]">
                      {selectedFile.name}
                    </span>
                    <button
                      onClick={() => setSelectedFile(null)}
                      className="ml-auto text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                    >
                      ✕
                    </button>
                  </div>
                )}

                {/* Typing Indicator */}
                {typingIndicators && selectedConversationId && selectedConversation && (
                  <TypingIndicator
                    conversationId={selectedConversationId}
                    participants={
                      selectedConversation.conversation_type === 'dm'
                        ? selectedConversation.other_user
                          ? [
                              {
                                id: selectedConversation.other_user.id,
                                username: selectedConversation.other_user.username,
                              },
                            ]
                          : []
                        : modMailConversation?.participants?.map((p) => ({
                            id: p.user_id,
                            username: p.username,
                          })) || []
                    }
                  />
                )}

                {replyTargetMessage && !isCreatingChat && (
                  <div className="mb-2 flex items-center justify-between gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-2 py-1">
                    <ReplyIndicator
                      parentUsername={
                        replyTargetMessage.sender_id === user?.id
                          ? t('messages.you')
                          : (selectedConversation?.other_user?.username ?? t('messages.user'))
                      }
                      parentPreview={
                        replyTargetMessage.message_type !== 'text'
                          ? t('messages.replyIndicator.attachment')
                          : t('messages.replyIndicator.originalMessage')
                      }
                      onJumpToOriginal={() => {
                        const parentElement = document.getElementById(
                          `message-${replyTargetMessage.id}`
                        );
                        if (parentElement) {
                          parentElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setReplyTargetMessage(null)}
                      className="rounded px-2 py-1 text-xs font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)]"
                    >
                      {t('common.cancel')}
                    </button>
                  </div>
                )}

                <form onSubmit={handleSendMessage} className="flex gap-2">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-surface)] active:bg-[var(--color-surface)]"
                    title={t('messages.compose.attachSingle')}
                  >
                    📎
                  </button>
                  {!isCreatingChat && (
                    <button
                      type="button"
                      onClick={() => setShowMultiUpload(!showMultiUpload)}
                      className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-surface)] active:bg-[var(--color-surface)]"
                      title={t('messages.compose.attachMultiple')}
                    >
                      📷+
                    </button>
                  )}
                  <input
                    type="text"
                    value={messageText}
                    onChange={(e) => {
                      setMessageText(e.target.value);

                      // Send typing indicator if enabled
                      if (typingIndicators && selectedConversationId && selectedConversation) {
                        // Update refs to track current conversation
                        currentConversationRef.current = selectedConversationId;

                        if (selectedConversation.conversation_type === 'dm') {
                          // DM: Send to the other user
                          const recipientId = selectedConversation.other_user?.id || 0;
                          currentRecipientRef.current = recipientId;

                          sendTypingIndicator(selectedConversationId, recipientId, true);
                        } else if (
                          selectedConversation.conversation_type === 'mod_mail' &&
                          modMailConversation?.participants
                        ) {
                          // Mod mail: Send to all participants except self
                          const otherParticipants = modMailConversation.participants.filter(
                            (p) => p.user_id !== user?.id
                          );

                          // Send typing indicator to each participant
                          otherParticipants.forEach((participant) => {
                            sendTypingIndicator(selectedConversationId, participant.user_id, true);
                          });

                          // Store first recipient for cleanup (or 0 if no participants)
                          currentRecipientRef.current = otherParticipants[0]?.user_id || 0;
                        }

                        // Clear existing timeout
                        if (typingTimeoutRef.current) {
                          clearTimeout(typingTimeoutRef.current);
                        }

                        // Stop typing after 3 seconds of inactivity
                        typingTimeoutRef.current = setTimeout(() => {
                          // Use refs to get current values (not stale closure values)
                          const convId = currentConversationRef.current;
                          const recId = currentRecipientRef.current;

                          if (convId !== null && selectedConversation) {
                            if (selectedConversation.conversation_type === 'dm') {
                              sendTypingIndicator(convId, recId, false);
                            } else if (
                              selectedConversation.conversation_type === 'mod_mail' &&
                              modMailConversation?.participants
                            ) {
                              // Send stop typing to all participants
                              const otherParticipants = modMailConversation.participants.filter(
                                (p) => p.user_id !== user?.id
                              );
                              otherParticipants.forEach((participant) => {
                                sendTypingIndicator(convId, participant.user_id, false);
                              });
                            }
                          }
                        }, 3000);
                      }
                    }}
                    placeholder={t('messages.compose.placeholder')}
                    className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                  />
                  <VoiceRecorderButton
                    onVoiceMessage={handleVoiceMessage}
                    disabled={sendMessageMutation.isPending || uploadingMedia}
                  />
                  <button
                    type="submit"
                    disabled={
                      sendMessageMutation.isPending ||
                      uploadingMedia ||
                      (isCreatingChat && !newChatUsername.trim())
                    }
                    className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)] active:bg-[var(--color-primary-dark)] disabled:opacity-50"
                  >
                    {uploadingMedia ? t('messages.uploading') : t('messages.send')}
                  </button>
                </form>
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-[var(--color-text-secondary)]">
              {t('messages.selectConversation')}
            </div>
          )}
        </div>
      </div>
      {historyMessageId !== null && (
        <MessageEditHistory
          messageId={historyMessageId}
          currentContent={historyCurrentContent}
          onClose={() => {
            closeHistory();
            setHistoryCurrentContent(undefined);
          }}
        />
      )}

      {deleteDialogMessage && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => {
            if (!deleteMessageMutation.isPending) {
              setDeleteDialogMessage(null);
            }
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
              {t('messages.deleteMessage')}
            </h3>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              {canDeleteForBoth
                ? t('messages.deleteForBothPrompt')
                : t('messages.deleteForSelfOnly')}
            </p>
            <div className="mt-6 flex flex-col gap-3">
              <button
                type="button"
                className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)] disabled:opacity-50"
                onClick={() => handleDeleteMessageChoice('self')}
                disabled={deleteMessageMutation.isPending}
              >
                {deleteMessageMutation.isPending && deleteScopeInFlight === 'self'
                  ? t('messages.deleting')
                  : t('messages.deleteForMe')}
              </button>
              {canDeleteForBoth && (
                <button
                  type="button"
                  className="rounded-md bg-[var(--color-error)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                  onClick={() => handleDeleteMessageChoice('both')}
                  disabled={deleteMessageMutation.isPending}
                >
                  {deleteMessageMutation.isPending && deleteScopeInFlight === 'both'
                    ? t('messages.deletingForBoth')
                    : t('messages.deleteForBoth')}
                </button>
              )}
              <button
                type="button"
                className="rounded-md px-4 py-2 text-sm font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] disabled:opacity-50"
                onClick={() => {
                  if (!deleteMessageMutation.isPending) {
                    setDeleteDialogMessage(null);
                  }
                }}
                disabled={deleteMessageMutation.isPending}
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
      {forwardDialogMessage && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => {
            if (!forwardMessageMutation.isPending) {
              setForwardDialogMessage(null);
              setForwardTargetConversationIDs(new Set());
            }
          }}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
              {t('messages.forward.title', { defaultValue: 'Forward Message' })}
            </h3>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              {t('messages.forward.subtitle', {
                defaultValue: 'Choose up to 10 conversations.',
              })}
            </p>
            {Boolean(forwardDialogMessage.media_url || forwardDialogMessage.media_file_id) && (
              <label className="mt-4 flex items-center gap-2 text-sm text-[var(--color-text-primary)]">
                <input
                  type="checkbox"
                  checked={forwardIncludeMedia}
                  onChange={(event) => setForwardIncludeMedia(event.target.checked)}
                  disabled={forwardMessageMutation.isPending}
                />
                {t('messages.forward.includeMedia', { defaultValue: 'Include media' })}
              </label>
            )}
            <div className="mt-4 max-h-72 space-y-2 overflow-y-auto rounded-md border border-[var(--color-border)] p-2">
              {forwardCandidateConversations.length === 0 ? (
                <p className="text-sm text-[var(--color-text-secondary)]">
                  {t('messages.forward.noEligibleConversations', {
                    defaultValue: 'No eligible conversations found.',
                  })}
                </p>
              ) : (
                forwardCandidateConversations.map((conversation) => {
                  const selected = forwardTargetConversationIDs.has(conversation.id);
                  const isModMail = conversation.conversation_type === 'mod_mail';
                  const label = isModMail
                    ? `${t('common.prefix.hub', 'h/')}${conversation.hub_name ?? t('messages.hubFallback')}`
                    : (conversation.other_user?.username ?? t('messages.user'));
                  return (
                    <label
                      key={conversation.id}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 hover:bg-[var(--color-surface-elevated)]"
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => handleToggleForwardTargetConversation(conversation.id)}
                        disabled={
                          forwardMessageMutation.isPending ||
                          (!selected && forwardTargetConversationIDs.size >= 10)
                        }
                      />
                      <span className="text-sm text-[var(--color-text-primary)]">{label}</span>
                    </label>
                  );
                })
              )}
            </div>
            <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
              {t('messages.forward.selectionCount', {
                defaultValue: '{{count}} selected',
                count: forwardTargetConversationIDs.size,
              })}
            </p>
            <div className="mt-6 flex flex-col gap-3">
              <button
                type="button"
                className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)] disabled:opacity-50"
                onClick={handleConfirmForward}
                disabled={
                  forwardMessageMutation.isPending || forwardTargetConversationIDs.size === 0
                }
              >
                {forwardMessageMutation.isPending
                  ? t('messages.forward.forwarding', { defaultValue: 'Forwarding...' })
                  : t('messages.actions.forward')}
              </button>
              <button
                type="button"
                className="rounded-md px-4 py-2 text-sm font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                onClick={() => {
                  if (!forwardMessageMutation.isPending) {
                    setForwardDialogMessage(null);
                    setForwardTargetConversationIDs(new Set());
                  }
                }}
                disabled={forwardMessageMutation.isPending}
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Delete Conversation Modal */}
      {deleteConversationDialog && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => {
            if (!deleteConversationMutation.isPending) {
              setDeleteConversationDialog(null);
            }
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
              {t('messages.deleteConversation')}
            </h3>
            {deleteConversationDialog.conversation_type === 'mod_mail' ? (
              <>
                <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
                  {t('messages.deleteModMailPrompt')}
                </p>
                <div className="mt-6 flex flex-col gap-3">
                  <button
                    type="button"
                    className="rounded-md bg-[var(--color-error)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                    onClick={() => {
                      deleteConversationMutation.mutate({
                        conversationId: deleteConversationDialog.id,
                        deleteFor: 'me',
                      });
                    }}
                    disabled={deleteConversationMutation.isPending}
                  >
                    {deleteConversationMutation.isPending
                      ? t('messages.deleting')
                      : t('common.delete')}
                  </button>
                  <button
                    type="button"
                    className="rounded-md px-4 py-2 text-sm font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] disabled:opacity-50"
                    onClick={() => {
                      if (!deleteConversationMutation.isPending) {
                        setDeleteConversationDialog(null);
                      }
                    }}
                    disabled={deleteConversationMutation.isPending}
                  >
                    {t('common.cancel')}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
                  {t('messages.deleteConversationPrompt')}
                </p>
                <div className="mt-6 flex flex-col gap-3">
                  <button
                    type="button"
                    className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)] disabled:opacity-50"
                    onClick={() => {
                      deleteConversationMutation.mutate({
                        conversationId: deleteConversationDialog.id,
                        deleteFor: 'me',
                      });
                    }}
                    disabled={deleteConversationMutation.isPending}
                  >
                    {deleteConversationMutation.isPending
                      ? t('messages.deleting')
                      : t('messages.deleteConversationForMe')}
                  </button>
                  <button
                    type="button"
                    className="rounded-md bg-[var(--color-error)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                    onClick={() => {
                      deleteConversationMutation.mutate({
                        conversationId: deleteConversationDialog.id,
                        deleteFor: 'both',
                      });
                    }}
                    disabled={deleteConversationMutation.isPending}
                  >
                    {deleteConversationMutation.isPending
                      ? t('messages.deletingForBoth')
                      : t('messages.deleteForBoth')}
                  </button>
                  <button
                    type="button"
                    className="rounded-md px-4 py-2 text-sm font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] disabled:opacity-50"
                    onClick={() => {
                      if (!deleteConversationMutation.isPending) {
                        setDeleteConversationDialog(null);
                      }
                    }}
                    disabled={deleteConversationMutation.isPending}
                  >
                    {t('common.cancel')}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Full-screen media viewer */}
      {viewerState && (
        <DecryptedMediaViewerWrapper
          messages={viewerState.messages}
          initialIndex={viewerState.initialIndex}
          onClose={() => setViewerState(null)}
          currentUserId={user?.id}
          speakerDeviceId={speakerDeviceId}
        />
      )}

      <ThreadView
        open={threadRootMessageId !== null}
        rootMessageId={threadRootMessageId}
        currentUserId={user?.id}
        onClose={() => setThreadRootMessageId(null)}
        renderMessageContent={renderThreadMessageContent}
        onSubmitReply={async ({ replyTo, content }) => {
          if (!selectedConversationId) return;
          await sendMessageMutation.mutateAsync({
            conversation_id: selectedConversationId,
            content,
            reply_to: replyTo,
          });
        }}
        replySubmitting={sendMessageMutation.isPending}
        formatTimestamp={(isoDate) =>
          formatDate(isoDate, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          })
        }
      />

      {/* Media slideshow */}
      {slideshowOpen && conversationMediaMessages.length > 0 && (
        <MediaSlideshow
          items={conversationMediaMessages.map((message) => {
            const isOwnMessage = message.sender_id === user?.id;
            return {
              id: message.id,
              element: (
                <DecryptedSlideshowItem
                  message={message}
                  isOwnMessage={isOwnMessage}
                  speakerDeviceId={speakerDeviceId}
                />
              ),
            };
          })}
          initialIndex={0}
          onClose={() => setSlideshowOpen(false)}
        />
      )}

      {/* Reddit/Hub slideshow modal */}
      {redditSlideshowModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 px-4">
          <div className="w-full max-w-md rounded-lg bg-[var(--color-surface)] p-6 shadow-lg">
            <div className="flex items-start justify-between mb-4">
              <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
                {t('messages.browseRedditHubScroll')}
              </h3>
              <button
                onClick={() => setRedditSlideshowModalOpen(false)}
                className="text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div className="relative">
                <label className="mb-2 block text-sm font-medium text-[var(--color-text-secondary)]">
                  {t('messages.enterSubredditHub')}
                </label>
                <input
                  type="text"
                  value={redditSlideshowInput}
                  onChange={(e) => {
                    setRedditSlideshowInput(e.target.value);
                    if (!redditSlideshowAutocompleteOpen) {
                      setRedditSlideshowAutocompleteOpen(true);
                    }
                  }}
                  onFocus={() => setRedditSlideshowAutocompleteOpen(true)}
                  onBlur={() => setTimeout(() => setRedditSlideshowAutocompleteOpen(false), 200)}
                  placeholder={t('messages.compose.hubSubredditPlaceholder')}
                  className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleLoadRedditSlideshow();
                    }
                  }}
                />

                {/* Autocomplete dropdown */}
                {redditSlideshowAutocompleteOpen && redditSlideshowShouldShowSuggestions && (
                  <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-auto rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg">
                    {redditSlideshowAutocompleteLoading ? (
                      <div className="p-3 text-center text-sm text-[var(--color-text-secondary)]">
                        {t('messages.loadingSuggestions')}
                      </div>
                    ) : redditSlideshowSuggestions.length > 0 ? (
                      redditSlideshowSuggestions.map((suggestion) => (
                        <button
                          key={`${suggestion.type}-${suggestion.data.name}`}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            handleSelectRedditSlideshowSuggestion(
                              suggestion.type,
                              suggestion.data.name
                            );
                          }}
                          className="w-full px-3 py-2 text-left text-sm hover:bg-[var(--color-surface-hover)] flex items-center gap-2"
                        >
                          <span
                            className={`font-medium ${suggestion.type === 'hub' ? 'text-blue-600' : 'text-orange-600'}`}
                          >
                            {suggestion.type === 'hub'
                              ? t('common.prefix.hub', 'h/')
                              : t('common.prefix.subreddit', 'r/')}
                          </span>
                          <span className="text-[var(--color-text-primary)]">
                            {suggestion.data.name}
                          </span>
                        </button>
                      ))
                    ) : (
                      <div className="p-3 text-center text-sm text-[var(--color-text-secondary)]">
                        {t('messages.noSuggestions')}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setRedditSlideshowModalOpen(false)}
                  className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-elevated)]"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleLoadRedditSlideshow}
                  disabled={!redditSlideshowTrimmedInput || isLoadingRedditPosts}
                  className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isLoadingRedditPosts ? t('common.loading') : t('messages.loadScroll')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reddit/Hub slideshow */}
      {redditSlideshowOpen && redditSlideshowPosts.length > 0 && (
        <RedditPostSlideshow
          posts={redditSlideshowPosts}
          onClose={() => {
            setRedditSlideshowOpen(false);
            setRedditSlideshowPosts([]);
          }}
          includeTextPosts={true}
        />
      )}

      {/* Mobile folder management sheet (S1) */}
      {showMobileFolderSheet && (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end"
          role="dialog"
          aria-modal="true"
          aria-label={t('messages.folders.manageFolder')}
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowMobileFolderSheet(false)}
          />
          {/* Sheet */}
          <div className="relative max-h-[80vh] overflow-hidden rounded-t-2xl bg-[var(--color-surface)] pb-safe">
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="h-1 w-10 rounded-full bg-[var(--color-border)]" />
            </div>
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
              <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
                {t('messages.folders.manageFolder')}
              </h2>
              <button
                type="button"
                onClick={() => setShowMobileFolderSheet(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
                aria-label={t('messages.folders.cancel')}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                  <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
            {/* Folder list in full management mode */}
            <div className="overflow-y-auto">
              <FolderList
                folders={folders}
                selectedFolderId={selectedFolderId}
                smartFolder={smartFolder}
                onSelectFolder={(id) => { setSelectedFolderId(id); setShowMobileFolderSheet(false); }}
                onSelectSmartFolder={(s) => { setSmartFolder(s); setShowMobileFolderSheet(false); }}
                onNewFolder={() => { setShowMobileFolderSheet(false); setFolderModalOpen('new'); }}
                onEditFolder={(folder) => { setShowMobileFolderSheet(false); setFolderModalOpen({ folder }); }}
                onDeleteFolder={(folder) => { setShowMobileFolderSheet(false); setDeleteFolderTarget(folder); setDeleteFolderError(''); }}
                isLoading={isLoadingFolders}
                deletingFolderId={deletingFolderId}
                alwaysShowActions
                className="w-full"
              />
            </div>
          </div>
        </div>
      )}

      {/* Folder create/edit modal */}
      {folderModalOpen !== null && (
        <FolderModal
          folder={folderModalOpen !== 'new' ? folderModalOpen.folder : undefined}
          onSave={async (data) => {
            if (folderModalOpen === 'new') {
              await createFolder(data);
            } else {
              await updateFolder({ id: folderModalOpen.folder.id, patch: data });
            }
          }}
          onClose={() => setFolderModalOpen(null)}
        />
      )}

      {/* Delete folder confirmation */}
      {deleteFolderTarget !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby={deleteFolderDialogTitleId}
          onClick={(e) => {
            if (e.target === e.currentTarget && !isDeletingFolder) {
              setDeleteFolderTarget(null);
              setDeleteFolderError('');
            }
          }}
        >
          <div className="w-full max-w-sm rounded-xl bg-[var(--color-surface)] p-6 shadow-xl">
            <h2
              id={deleteFolderDialogTitleId}
              className="mb-2 text-base font-semibold text-[var(--color-text-primary)]"
            >
              {t('messages.folders.deleteFolder')}
            </h2>
            <p className="mb-4 text-sm text-[var(--color-text-secondary)]">
              {t('messages.folders.deleteConfirm', { name: deleteFolderTarget.name })}
            </p>
            {deleteFolderError && (
              <p className="mb-3 rounded-lg bg-[var(--color-error)]/10 px-3 py-2 text-xs font-medium text-[var(--color-error)]">
                {deleteFolderError}
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setDeleteFolderTarget(null); setDeleteFolderError(''); }}
                disabled={isDeletingFolder}
                className="flex-1 rounded-lg border border-[var(--color-border)] py-2 text-sm font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] disabled:opacity-50"
              >
                {t('messages.folders.cancel')}
              </button>
              <button
                type="button"
                disabled={isDeletingFolder}
                onClick={async () => {
                  setDeleteFolderError('');
                  try {
                    await deleteFolder(deleteFolderTarget.id);
                    setDeleteFolderTarget(null);
                  } catch {
                    setDeleteFolderError(t('messages.folders.deleteError'));
                  }
                }}
                className="flex-1 rounded-lg bg-[var(--color-error)] py-2 text-sm font-semibold text-white hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-error)] disabled:opacity-50"
              >
                {isDeletingFolder ? (
                  <span className="inline-flex items-center justify-center gap-1.5">
                    <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 16 16" fill="none" aria-hidden>
                      <circle cx="8" cy="8" r="6" stroke="white" strokeWidth="2" strokeDasharray="28" strokeDashoffset="10" />
                    </svg>
                    {t('messages.folders.deleteFolder')}
                  </span>
                ) : (
                  t('messages.folders.deleteFolder')
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Group Modal */}
      {showCreateGroupModal && (
        <CreateGroupModal
          onClose={() => setShowCreateGroupModal(false)}
          onCreated={(conversation) => {
            setShowCreateGroupModal(false);
            setSelectedConversationId(conversation.id);
          }}
          searchUsers={async (query) => {
            const res = await fetch(
              `${API_BASE_URL}/api/v1/users/search?q=${encodeURIComponent(query)}&limit=10`,
              { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
            );
            if (!res.ok) return [];
            const data = await res.json() as { users?: { id: number; username: string; avatar_url?: string }[] };
            return data.users ?? [];
          }}
        />
      )}

      {/* Group Details Sidebar (slide-in panel) */}
      {showGroupSidebar && selectedConversation?.conversation_type === 'group' && user?.id && (
        <div className="fixed inset-0 z-40 flex justify-end">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setShowGroupSidebar(false)}
          />
          <div className="relative z-50 h-full w-80 max-w-full">
            <GroupDetailsSidebar
              conversation={selectedConversation}
              currentUserId={user.id}
              onClose={() => setShowGroupSidebar(false)}
            />
          </div>
        </div>
      )}
    </>
  );
}

// Helper component to decrypt and display media in slideshow
function DecryptedSlideshowItem({
  message,
  isOwnMessage,
  speakerDeviceId,
}: {
  message: Message;
  isOwnMessage: boolean;
  speakerDeviceId?: string;
}) {
  const { t } = useTranslation();
  const mediaSrc = useDecryptedMedia(message, isOwnMessage);
  const mediaType = inferMessageTypeFromMessage(message);

  if (!mediaSrc) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-white text-lg">{t('messages.viewer.decrypting')}</div>
      </div>
    );
  }

  if (mediaType === 'image') {
    return (
      <img
        src={mediaSrc}
        alt={t('messages.media.fallbackText')}
        className="max-w-full max-h-full object-contain"
        style={{ maxWidth: '90vw', maxHeight: '90vh' }}
      />
    );
  }

  if (mediaType === 'video') {
    return (
      <video
        src={mediaSrc}
        controls
        playsInline
        loop
        muted={false}
        className="max-w-full max-h-full object-contain"
        style={{ maxWidth: '90vw', maxHeight: '90vh' }}
        onCanPlay={(e) => {
          const video = e.currentTarget;
          void applyAudioOutputDevice(video, speakerDeviceId);
          video.muted = false;
          video.volume = 1.0;
          console.log('Video can play, attempting to play with sound...');
          video.play().catch((error) => {
            console.log('Autoplay with sound blocked:', error);
          });
        }}
      />
    );
  }

  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-white text-lg">{t('messages.unsupportedMedia')}</div>
    </div>
  );
}
