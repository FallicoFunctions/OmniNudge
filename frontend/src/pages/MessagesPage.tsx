import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { messagesService } from '../services/messagesService';
import { mediaService } from '../services/mediaService';
import { useAuth } from '../contexts/AuthContext';
import { useMessagingContext } from '../contexts/MessagingContext';
import type { Conversation, Message, SendMessageRequest } from '../types/messages';
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
} from '../utils/encryption';
import { getOwnKeys, getUserPublicKey } from '../services/keyManagementService';
import { encryptionService } from '../services/encryptionService';
import { EmptyMessage, LoadingMessage } from '../components/common/StatusMessage';
import { MediaSlideshow } from '../components/slideshow/MediaSlideshow';
import { MediaUploadZone } from '../components/slideshow/MediaUploadZone';
import { RedditPostSlideshow } from '../components/slideshow/RedditPostSlideshow';
import { redditService } from '../services/redditService';
import { hubsService } from '../services/hubsService';
import { useHubSubredditAutocomplete } from '../hooks/useHubSubredditAutocomplete';

const MAX_UPLOAD_SIZE = 25 * 1024 * 1024; // 25MB

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
}

/**
 * Wrapper component that handles decryption for full-screen media viewing
 * This builds a custom viewer with decryption support rather than using FullScreenMediaViewer
 */
function DecryptedMediaViewerWrapper({
  messages,
  initialIndex,
  onClose,
  currentUserId,
}: DecryptedMediaViewerWrapperProps) {
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
        aria-label="Close viewer"
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
          {currentIndex + 1} / {messages.length}
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
          aria-label="Previous media"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-12 w-12"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      )}

      {/* Media display */}
      <div
        className="w-full h-full flex items-center justify-center p-4"
        onClick={(e) => e.stopPropagation()}
      >
        {!mediaSrc ? (
          <div className="text-white text-lg">Decrypting media...</div>
        ) : mediaType === 'image' ? (
          <img
            src={mediaSrc}
            alt="Full screen media"
            className="max-w-full max-h-full object-contain"
            style={{ maxWidth: '90vw', maxHeight: '90vh' }}
          />
        ) : mediaType === 'video' ? (
          <video
            src={mediaSrc}
            controls
            autoPlay
            className="max-w-full max-h-full"
            style={{ maxWidth: '90vw', maxHeight: '90vh' }}
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
          aria-label="Next media"
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
  const normalized = message.encrypted_content.replace(/^📎\s*/, '').trim().toLowerCase();
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
function useDecryptedContent(message: Message, isOwnMessage: boolean, currentUserId?: number): string {
  const [decryptedContent, setDecryptedContent] = useState<string>('');

  useEffect(() => {
    const cipherText = isOwnMessage
      ? message.sender_encrypted_content ?? message.encrypted_content
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
        (isOwnMessage && message.sender_encrypted_content) || (!isOwnMessage && message.encryption_version === 'v1')
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
}: {
  message: Message;
  isOwnMessage: boolean;
  currentUserId?: number;
  className?: string;
}) {
  const decryptedContent = useDecryptedContent(message, isOwnMessage, currentUserId);

  if (!decryptedContent) return null;

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
        ? message.sender_media_encryption_key ?? message.media_encryption_key
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
        console.log('[Media Decryption] Fetch response status:', response.status, response.statusText);

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

const MessageMediaPreview = ({ message, isOwnMessage, onMediaClick }: MessageMediaPreviewProps) => {
  const mediaSrc = useDecryptedMedia(message, isOwnMessage);
  const filename = message.media_url?.split('/').pop() ?? 'attachment';

  const resolvedType = inferMessageTypeFromMessage(message);

  if (!mediaSrc) {
    return (
      <div className="mb-2 text-xs text-[var(--color-text-secondary)]">
        {message.media_encryption_key ? 'Decrypting media…' : 'Preparing media…'}
      </div>
    );
  }

  if (resolvedType === 'image') {
    return (
      <div className="mb-2">
        <img
          src={mediaSrc}
          alt="Shared media"
          className="max-w-full rounded cursor-pointer object-contain"
          style={{ maxHeight: '50vh' }}
          onClick={() => onMediaClick ? onMediaClick() : window.open(mediaSrc, '_blank')}
        />
      </div>
    );
  }

  if (resolvedType === 'video') {
    return (
      <div className="mb-2">
        <video
          src={mediaSrc}
          controls
          className="max-w-full rounded cursor-pointer"
          style={{ maxHeight: '50vh' }}
          onClick={() => onMediaClick?.()}
        />
      </div>
    );
  }

  if (resolvedType === 'audio') {
    return (
      <div className="mb-2">
        <audio controls className="w-full">
          <source src={mediaSrc} type={message.media_type ?? 'audio/mpeg'} />
          Your browser does not support the audio element.
        </audio>
      </div>
    );
  }

  return (
    <div className="mb-2">
      <a
        href={mediaSrc}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-sm underline hover:text-[var(--color-primary-light)]"
        download={filename}
      >
        {filename}
      </a>
    </div>
  );
};

interface DownloadButtonProps {
  message: Message;
  isOwnMessage: boolean;
  onClose: () => void;
}

const DownloadButton = ({ message, isOwnMessage, onClose }: DownloadButtonProps) => {
  const mediaSrc = useDecryptedMedia(message, isOwnMessage);
  const filename = message.media_url?.split('/').pop() ?? 'download';

  const handleDownload = () => {
    onClose();
    if (!mediaSrc) {
      alert('Media is still decrypting. Please wait and try again.');
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
      Download
    </button>
  );
};

export default function MessagesPage() {
  const { user } = useAuth();
  const { setActiveConversationId } = useMessagingContext();
  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);
  const [messageText, setMessageText] = useState('');
  const [newChatUsername, setNewChatUsername] = useState('');
  const [isCreatingChat, setIsCreatingChat] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [messageMenuOpen, setMessageMenuOpen] = useState<number | null>(null);
  const [deleteDialogMessage, setDeleteDialogMessage] = useState<Message | null>(null);
  const [deleteScopeInFlight, setDeleteScopeInFlight] = useState<'self' | 'both' | null>(null);
  const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active');
  const [conversationMenuOpen, setConversationMenuOpen] = useState<number | null>(null);
  const [slideshowOpen, setSlideshowOpen] = useState(false);
  const [showMultiUpload, setShowMultiUpload] = useState(false);
  const [deleteConversationDialog, setDeleteConversationDialog] = useState<Conversation | null>(null);
  const [viewerState, setViewerState] = useState<{ messages: Message[]; initialIndex: number } | null>(null);
  const [redditSlideshowModalOpen, setRedditSlideshowModalOpen] = useState(false);
  const [redditSlideshowInput, setRedditSlideshowInput] = useState('');
  const [redditSlideshowAutocompleteOpen, setRedditSlideshowAutocompleteOpen] = useState(false);
  const [redditSlideshowPosts, setRedditSlideshowPosts] = useState<any[]>([]);
  const [redditSlideshowOpen, setRedditSlideshowOpen] = useState(false);
  const [isLoadingRedditPosts, setIsLoadingRedditPosts] = useState(false);
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const toUsernameParam = searchParams.get('to');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    data: conversationsData,
    isLoading: loadingConversations,
    hasNextPage: hasMoreConversations,
    fetchNextPage: fetchMoreConversations,
    isFetchingNextPage: isFetchingMoreConversations,
  } = useInfiniteQuery({
    queryKey: ['conversations', 'all'],
    queryFn: ({ pageParam }) =>
      messagesService.getConversationsPage(true, 20, pageParam ? String(pageParam) : undefined),
    initialPageParam: '',
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
  });
  const allConversations = useMemo(
    () => conversationsData?.pages.flatMap((page) => page.conversations) ?? [],
    [conversationsData]
  );

  // Filter conversations based on active tab
  const conversations = useMemo(() => {
    if (!allConversations.length) return undefined;
    if (activeTab === 'archived') {
      return allConversations.filter((c) => c.archived_at !== null);
    }
    return allConversations.filter((c) => c.archived_at === null);
  }, [allConversations, activeTab]);

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

    if (!selectedConversationId || !currentExists) {
      setSelectedConversationId(conversations[0].id);
    }
  }, [conversations, isCreatingChat, selectedConversationId]);

  const selectedConversation = conversations?.find((c) => c.id === selectedConversationId);
  const selectedConversationExists = Boolean(selectedConversation);

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

  // Create media messages list for full-screen viewer (images and videos only)
  const conversationMediaMessages = useMemo(() => {
    return messages.filter((msg) => {
      const type = inferMessageTypeFromMessage(msg);
      return type === 'image' || type === 'video';
    });
  }, [messages]);

  const handleOpenMediaViewer = useCallback((message: Message) => {
    const mediaType = inferMessageTypeFromMessage(message);
    if (mediaType !== 'image' && mediaType !== 'video') return;

    const mediaIndex = conversationMediaMessages.findIndex(msg => msg.id === message.id);
    if (mediaIndex === -1) return;

    setViewerState({
      messages: conversationMediaMessages,
      initialIndex: mediaIndex,
    });
  }, [conversationMediaMessages]);

  // Fetch mod-mail conversation details if this is a mod_mail conversation
  const { data: modMailConversation } = useQuery<ModMailConversation>({
    queryKey: ['modMailConversation', selectedConversationId],
    queryFn: async () => {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`http://localhost:8080/api/v1/mod-mail/${selectedConversationId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        throw new Error('Failed to fetch mod-mail conversation');
      }
      return response.json();
    },
    enabled: !!selectedConversationId && selectedConversation?.conversation_type === 'mod_mail',
  });

  const uploadMediaMutation = useMutation({
    mutationFn: (file: File) => mediaService.uploadMedia(file),
  });

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
      queryClient.setQueryData<Message[] | undefined>(
        ['messages', variables.conversationId],
        (prev) => (prev ? prev.filter((msg) => msg.id !== variables.messageId) : prev)
      );
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['conversations', 'all'] });
      setDeleteDialogMessage(null);
      setMessageMenuOpen(null);
    },
    onError: (error) => {
      alert(error instanceof Error ? error.message : 'Failed to delete message');
    },
    onSettled: () => {
      setDeleteScopeInFlight(null);
    },
  });

  const archiveConversationMutation = useMutation({
    mutationFn: (conversationId: number) => messagesService.archiveConversation(conversationId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ['conversations', 'all'] }),
        queryClient.refetchQueries({ queryKey: ['conversations'] }), // Also refetch MainLayout's query
      ]);
      setConversationMenuOpen(null);
    },
    onError: (error) => {
      alert(error instanceof Error ? error.message : 'Failed to archive conversation');
    },
  });

  const unarchiveConversationMutation = useMutation({
    mutationFn: (conversationId: number) => messagesService.unarchiveConversation(conversationId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ['conversations', 'all'] }),
        queryClient.refetchQueries({ queryKey: ['conversations'] }), // Also refetch MainLayout's query
      ]);
      setConversationMenuOpen(null);
    },
    onError: (error) => {
      alert(error instanceof Error ? error.message : 'Failed to unarchive conversation');
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
      alert(error instanceof Error ? error.message : 'Failed to delete conversation');
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > MAX_UPLOAD_SIZE) {
        alert('File too large. Maximum size is 25MB.');
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

    setIsLoadingRedditPosts(true);
    setRedditSlideshowModalOpen(false);

    try {
      // Check if it's a hub (starts with h/) or subreddit (starts with r/ or just the name)
      const isHub = trimmed.startsWith('h/');
      const name = trimmed.replace(/^[hr]\//, '');

      let posts: any[];

      if (isHub) {
        // Fetch hub posts
        const response = await hubsService.getHubPosts(name, 'hot', 50, '');
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
      alert('Failed to load posts. Please try again.');
    } finally {
      setIsLoadingRedditPosts(false);
    }
  };

  const handleSelectRedditSlideshowSuggestion = (type: 'hub' | 'subreddit', name: string) => {
    setRedditSlideshowInput(type === 'hub' ? `h/${name}` : `r/${name}`);
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
        alert('Conversation not found');
        return;
      }

      const recipientId = conversation.user1_id === user?.id ? conversation.user2_id : conversation.user1_id;
      if (!recipientId) {
        alert('Recipient not found');
        return;
      }

      // Get recipient's public key
      const recipientPublicKey = await getUserPublicKey(recipientId);
      if (!recipientPublicKey) {
        throw new Error('Recipient public key not found');
      }

      // Get own keys
      const ownKeys = await getOwnKeys();
      if (!ownKeys?.publicKey || !ownKeys?.privateKey) {
        throw new Error('Your encryption keys are not set up');
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
          const recipientEncryptedKey = await encryptKeyWithPublicKey(encryptedFile.rawKey, recipientPublicKey);

          // Encrypt AES key for sender
          const senderEncryptedKey = await encryptKeyWithPublicKey(encryptedFile.rawKey, ownKeys.publicKey);

          // Create auto-generated caption
          const captionText = `[${messageType === 'image' ? 'Image' : 'Video'}]`;
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
            encryption_version: 'v1',
          });
        } catch (error) {
          console.error('Failed to upload file:', file.name, error);
          alert(`Failed to upload ${file.name}`);
        }
      }

      // Refresh messages
      await queryClient.invalidateQueries({ queryKey: ['messages', selectedConversationId] });
      await queryClient.invalidateQueries({ queryKey: ['conversations'] });
    } catch (error) {
      console.error('Multi-file upload error:', error);
      alert(error instanceof Error ? error.message : 'Failed to upload files');
    } finally {
      setUploadingMedia(false);
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
            console.log('[Media Encryption] Recipient public key (Base64):', recipientPublicKeyBase64 ? `${recipientPublicKeyBase64.substring(0, 50)}...` : 'null');

            if (recipientPublicKeyBase64) {
              // Import recipient's public key
              console.log('[Media Encryption] Importing recipient public key...');
              const recipientPublicKey = await getUserPublicKey(recipientId, recipientPublicKeyBase64);
              console.log('[Media Encryption] Recipient public key imported:', recipientPublicKey ? 'SUCCESS' : 'FAILED');

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
                  console.warn('[Media Encryption] Failed to encrypt AES key for recipient, uploading plain file');
                  mediaEncryptionKey = undefined;
                  mediaEncryptionIv = undefined;
                  senderMediaEncryptionKey = undefined;
                }
              } else {
                console.warn('[Media Encryption] Failed to import recipient public key, uploading unencrypted');
              }
            } else {
              console.warn('[Media Encryption] Recipient has no public key, uploading unencrypted');
            }
          } catch (error) {
            console.error('[Media Encryption] File encryption failed, uploading unencrypted:', error);
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
        });
        return;
      }

      if (selectedConversationId) {
        console.log('[Media Encryption] Sending message to existing conversation with encryption metadata:', {
          hasEncryptionKey: !!mediaEncryptionKey,
          hasSenderKey: !!senderMediaEncryptionKey,
          hasEncryptionIv: !!mediaEncryptionIv,
          keyPreview: mediaEncryptionKey?.substring(0, 30),
          ivPreview: mediaEncryptionIv?.substring(0, 20),
        });
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
        });
      }
    } catch (error) {
      setUploadingMedia(false);
      console.error('Failed to send message:', error);
      alert('Failed to upload media. Please try again.');
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

  // For mod_mail conversations, backend returns messages in ASC order (oldest first)
  // For DM conversations, backend returns messages in DESC order (newest first)
  // We want to display oldest-to-newest (newest at bottom), so only reverse for DMs
  const orderedMessages = useMemo(() => {
    if (!messages) return [];
    const isModMail = selectedConversation?.conversation_type === 'mod_mail';
    return isModMail ? [...messages] : [...messages].reverse();
  }, [messages, selectedConversation?.conversation_type]);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const scrollToLatestMessage = useCallback(() => {
    const container = messagesContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, []);
  const canDeleteForBoth = Boolean(deleteDialogMessage && deleteDialogMessage.sender_id === user?.id);

  const markConversationAsRead = useCallback(
    async (conversationId: number) => {
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
    [queryClient]
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
  }, [selectedConversationId]);

  useEffect(() => {
    if (messageMenuOpen === null) return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) {
        setMessageMenuOpen(null);
        return;
      }
      const container = target.closest('[data-message-menu-container]');
      if (!container || container.getAttribute('data-message-menu-container') !== String(messageMenuOpen)) {
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
      if (!container || container.getAttribute('data-conversation-menu-container') !== String(conversationMenuOpen)) {
        setConversationMenuOpen(null);
      }
    };

    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [conversationMenuOpen]);

  return (
    <>
      <div className="flex h-[calc(100vh-4rem)]">
      {/* Conversations List */}
      <div className="w-80 flex-shrink-0 overflow-hidden border-r border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="border-b border-[var(--color-border)] p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">Messages</h2>
            <button
              onClick={() => {
                setIsCreatingChat(true);
                setSelectedConversationId(null);
                setNewChatUsername('');
                setMessageText('');
                setSelectedFile(null);
              }}
              className="rounded-md bg-[var(--color-primary)] px-3 py-1 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)]"
            >
              New Chat
            </button>
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
              Active
            </button>
            <button
              onClick={() => setActiveTab('archived')}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                activeTab === 'archived'
                  ? 'text-[var(--color-primary)] border-b-2 border-[var(--color-primary)]'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              Archived
            </button>
          </div>
        </div>

        <div className="overflow-y-auto" style={{ height: 'calc(100% - 116px)' }}>
          {loadingConversations && (
            <div className="p-4 text-center">
              <LoadingMessage className="text-sm">Loading...</LoadingMessage>
            </div>
          )}

          {conversations?.map((conversation) => (
            <div
              key={conversation.id}
              className={`relative w-full border-b border-[var(--color-border)] transition-colors ${
                selectedConversationId === conversation.id
                  ? 'bg-[var(--color-surface-elevated)]'
                  : 'hover:bg-[var(--color-surface-elevated)]'
              }`}
              data-conversation-menu-container={conversation.id}
            >
              <button
                onClick={() => {
                  setSelectedConversationId(conversation.id);
                  setIsCreatingChat(false);
                  setNewChatUsername('');
                  setSelectedFile(null);
                }}
                className="w-full p-4 text-left"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-[var(--color-text-primary)] flex-1 pr-2">
                    {conversation.conversation_type === 'mod_mail'
                      ? `${conversation.hub_name ? `h/${conversation.hub_name}` : 'Hub'} - Mod Mail - ${conversation.subject || 'Untitled'}`
                      : conversation.other_user?.username || 'Unknown'}
                  </span>
                  <div className="flex items-center gap-2">
                    {conversation.unread_count > 0 && conversation.id !== selectedConversationId && (
                      <span className="rounded-full bg-[var(--color-primary)] px-2 py-0.5 text-xs text-white">
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
                      className="mt-1 truncate text-sm text-[var(--color-text-secondary)]"
                    />
                  )}
              </button>
              {/* Context Menu */}
              {conversationMenuOpen === conversation.id && (
                <div className="absolute right-2 top-12 z-20 w-44 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-2 shadow-lg">
                  {activeTab === 'active' ? (
                    <button
                      type="button"
                      className="w-full rounded-md px-3 py-2 text-left text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)]"
                      onClick={() => {
                        archiveConversationMutation.mutate(conversation.id);
                      }}
                    >
                      Archive
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="w-full rounded-md px-3 py-2 text-left text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)]"
                      onClick={() => {
                        unarchiveConversationMutation.mutate(conversation.id);
                      }}
                    >
                      Unarchive
                    </button>
                  )}
                  <button
                    type="button"
                    className="w-full rounded-md px-3 py-2 text-left text-sm font-medium text-[var(--color-error)] hover:bg-[var(--color-surface-elevated)]"
                    onClick={() => {
                      setConversationMenuOpen(null);
                      setDeleteConversationDialog(conversation);
                    }}
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          ))}

          {conversations?.length === 0 && (
            <div className="p-4 text-center">
              <EmptyMessage className="text-sm">No conversations yet. Start a new chat!</EmptyMessage>
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
                {isFetchingMoreConversations ? 'Loading…' : 'Load more conversations'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex flex-1 flex-col overflow-hidden bg-[var(--color-surface)]">
        {selectedConversationId || isCreatingChat ? (
          <>
            {/* Chat Header */}
            <div className="border-b border-[var(--color-border)] p-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-[var(--color-text-primary)]">
                  {isCreatingChat
                    ? 'New Chat'
                    : selectedConversation?.conversation_type === 'mod_mail'
                    ? `${selectedConversation?.hub_name ? `h/${selectedConversation.hub_name}` : 'Hub'} - Mod Mail - ${selectedConversation?.subject || 'Untitled'}`
                    : selectedConversation?.other_user?.username || 'Unknown'}
                </h3>

                {/* Slideshow buttons */}
                <div className="flex items-center gap-2">
                  {/* Reddit/Hub slideshow button */}
                  {!isCreatingChat && (
                    <button
                      onClick={() => {
                        setRedditSlideshowModalOpen(true);
                        setRedditSlideshowInput('');
                      }}
                      className="px-3 py-1.5 bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)] border border-[var(--color-border)] rounded-md text-sm font-medium hover:bg-[var(--color-surface-hover)] transition-colors flex items-center gap-2"
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
                          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                        />
                      </svg>
                      Browse Reddit/Hub
                    </button>
                  )}

                  {/* Chat media slideshow button - only show if conversation has 2+ media items */}
                  {!isCreatingChat && conversationMediaMessages.length >= 2 && (
                    <button
                      onClick={() => setSlideshowOpen(true)}
                      className="px-3 py-1.5 bg-[var(--color-primary)] text-white rounded-md text-sm font-medium hover:bg-[var(--color-primary-dark)] transition-colors flex items-center gap-2"
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
                      View Slideshow ({conversationMediaMessages.length})
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Messages */}
            <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4">
              {isCreatingChat ? (
                <div className="text-center text-sm text-[var(--color-text-secondary)]">
                  Enter a username and message to start a conversation
                </div>
              ) : loadingMessages ? (
                <div className="text-center">
                  <LoadingMessage className="text-sm">Loading messages...</LoadingMessage>
                </div>
              ) : (
                <div className="space-y-3">
                  {hasMoreMessages && (
                    <div className="flex justify-center">
                      <button
                        type="button"
                        onClick={() => fetchMoreMessages()}
                        disabled={isFetchingMoreMessages}
                        className="rounded-md border border-[var(--color-border)] px-3 py-1 text-xs font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-elevated)] disabled:opacity-60"
                      >
                        {isFetchingMoreMessages ? 'Loading…' : 'Load more messages'}
                      </button>
                    </div>
                  )}
                  {orderedMessages.map((message) => {
                    const isOwnMessage = message.sender_id === user?.id;

                    // For mod_mail, get sender info from participants
                    const isModMail = selectedConversation?.conversation_type === 'mod_mail';
                    const participant = isModMail
                      ? modMailConversation?.participants?.find((p) => p.user_id === message.sender_id)
                      : null;
                    const senderUsername = participant?.username || (isOwnMessage ? 'You' : 'User');
                    const isModerator = participant?.is_moderator || false;

                    return (
                      <div
                        key={message.id}
                        className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}
                        data-message-menu-container={message.id}
                      >
                        <div className={`flex items-start gap-2 ${isOwnMessage ? 'flex-row-reverse' : ''}`}>
                          <div
                            className={`max-w-md rounded-lg px-4 py-2 ${
                              isOwnMessage
                                ? 'bg-[var(--color-primary)] text-white'
                                : 'bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)]'
                            }`}
                          >
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
                                className="text-sm mb-1"
                              />
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
                                    <span className={`px-1.5 py-0.5 text-[10px] font-semibold rounded ${
                                      isOwnMessage
                                        ? 'bg-white/20 text-white'
                                        : 'bg-green-600 text-white'
                                    }`}>
                                      MOD
                                    </span>
                                  )}
                                </>
                              )}
                              <span>{new Date(message.sent_at).toLocaleString()}</span>
                            </div>
                          </div>
                          <div className="relative">
                            <button
                              type="button"
                              aria-label="Message options"
                              className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-2 py-1 text-xs font-semibold text-[var(--color-text-secondary)] transition hover:bg-[var(--color-surface)] hover:text-[var(--color-text-primary)]"
                              onClick={(event) => {
                                event.stopPropagation();
                                setMessageMenuOpen((prev) => (prev === message.id ? null : message.id));
                              }}
                            >
                              ...
                            </button>
                            {messageMenuOpen === message.id && (
                              <div
                                className={`absolute ${isOwnMessage ? 'left-0' : 'right-0'} z-20 mt-2 w-44 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-2 shadow-lg`}
                              >
                                {message.media_url && (
                                  <DownloadButton message={message} isOwnMessage={isOwnMessage} onClose={() => setMessageMenuOpen(null)} />
                                )}
                                <button
                                  type="button"
                                  className="w-full rounded-md px-3 py-2 text-left text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)]"
                                  onClick={() => {
                                    setMessageMenuOpen(null);
                                    setDeleteDialogMessage(message);
                                  }}
                                >
                                  Delete
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {orderedMessages.length === 0 && (
                    <div className="text-center text-sm text-[var(--color-text-secondary)]">
                      No messages yet. Send the first message!
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
                  placeholder="Enter username..."
                  className="mb-2 block w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                />
              )}

              {/* Multi-upload zone */}
              {showMultiUpload && !isCreatingChat && (
                <div className="mb-4">
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className="font-medium text-[var(--color-text-primary)]">Upload Multiple Files</h4>
                    <button
                      onClick={() => setShowMultiUpload(false)}
                      className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                    >
                      Cancel
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
                  className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-surface)]"
                  title="Attach single file"
                >
                  📎
                </button>
                {!isCreatingChat && (
                  <button
                    type="button"
                    onClick={() => setShowMultiUpload(!showMultiUpload)}
                    className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-surface)]"
                    title="Upload multiple files"
                  >
                    📷+
                  </button>
                )}
                <input
                  type="text"
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  placeholder="Type a message..."
                  className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                />
                <button
                  type="submit"
                  disabled={
                    sendMessageMutation.isPending || uploadingMedia || (isCreatingChat && !newChatUsername.trim())
                  }
                  className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)] disabled:opacity-50"
                >
                  {uploadingMedia ? 'Uploading...' : 'Send'}
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-[var(--color-text-secondary)]">
            Select a conversation or start a new chat
          </div>
        )}
      </div>
      </div>
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
            <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">Delete message?</h3>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              {canDeleteForBoth
                ? 'Do you want to remove this message for yourself only or for both participants?'
                : 'This will remove the message for you only.'}
            </p>
            <div className="mt-6 flex flex-col gap-3">
              <button
                type="button"
                className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)] disabled:opacity-50"
                onClick={() => handleDeleteMessageChoice('self')}
                disabled={deleteMessageMutation.isPending}
              >
                {deleteMessageMutation.isPending && deleteScopeInFlight === 'self'
                  ? 'Deleting...'
                  : 'Delete for me'}
              </button>
              {canDeleteForBoth && (
                <button
                  type="button"
                  className="rounded-md bg-[var(--color-error)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                  onClick={() => handleDeleteMessageChoice('both')}
                  disabled={deleteMessageMutation.isPending}
                >
                  {deleteMessageMutation.isPending && deleteScopeInFlight === 'both'
                    ? 'Deleting for both...'
                    : 'Delete for both users'}
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
                Cancel
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
            <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">Delete conversation?</h3>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              Choose how you want to delete this conversation.
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
                  ? 'Deleting...'
                  : 'Delete for me (Other user will still see your messages)'}
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
                {deleteConversationMutation.isPending ? 'Deleting for both...' : 'Delete for both'}
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
                Cancel
              </button>
            </div>
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
        />
      )}

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
              <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">Browse Reddit/Hub Slideshow</h3>
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
                  Enter subreddit or hub name
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
                  placeholder="e.g., r/pics or h/gaming"
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
                        Loading suggestions...
                      </div>
                    ) : redditSlideshowSuggestions.length > 0 ? (
                      redditSlideshowSuggestions.map((suggestion) => (
                        <button
                          key={`${suggestion.type}-${suggestion.data.name}`}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            handleSelectRedditSlideshowSuggestion(suggestion.type, suggestion.data.name);
                          }}
                          className="w-full px-3 py-2 text-left text-sm hover:bg-[var(--color-surface-hover)] flex items-center gap-2"
                        >
                          <span className={`font-medium ${suggestion.type === 'hub' ? 'text-blue-600' : 'text-orange-600'}`}>
                            {suggestion.type === 'hub' ? 'h/' : 'r/'}
                          </span>
                          <span className="text-[var(--color-text-primary)]">{suggestion.data.name}</span>
                        </button>
                      ))
                    ) : (
                      <div className="p-3 text-center text-sm text-[var(--color-text-secondary)]">
                        No suggestions found
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
                  Cancel
                </button>
                <button
                  onClick={handleLoadRedditSlideshow}
                  disabled={!redditSlideshowTrimmedInput || isLoadingRedditPosts}
                  className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isLoadingRedditPosts ? 'Loading...' : 'Load Slideshow'}
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
    </>
  );
}

// Helper component to decrypt and display media in slideshow
function DecryptedSlideshowItem({ message, isOwnMessage }: { message: Message; isOwnMessage: boolean }) {
  const mediaSrc = useDecryptedMedia(message, isOwnMessage);
  const mediaType = inferMessageTypeFromMessage(message);

  if (!mediaSrc) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-white text-lg">Decrypting...</div>
      </div>
    );
  }

  if (mediaType === 'image') {
    return (
      <img
        src={mediaSrc}
        alt="Slideshow media"
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
        autoPlay
        className="max-w-full max-h-full object-contain"
        style={{ maxWidth: '90vw', maxHeight: '90vh' }}
      />
    );
  }

  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-white text-lg">Unsupported media type</div>
    </div>
  );
}
