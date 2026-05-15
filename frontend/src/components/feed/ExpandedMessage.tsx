import { useState, useEffect, useMemo, useRef } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { messagesService } from '../../services/messagesService';
import { mediaService } from '../../services/mediaService';
import { useAuth } from '../../contexts/AuthContext';
import { useFormat } from '../../hooks/useFormat';
import type { Conversation, Message, SendMessageRequest } from '../../types/messages';
import { API_BASE_URL, getStoredAuthToken } from '../../lib/api';
import {
  decryptMessage,
  encryptFile,
  decryptFile,
  encryptKeyWithPublicKey,
  arrayBufferToBase64,
  decryptMultiRecipientContent,
  encryptMessage,
} from '../../utils/encryption';
import { getOwnKeys, getUserPublicKey } from '../../services/keyManagementService';
import { resolveMediaUrl } from '../../utils/mediaUrl';
import { ReportModal } from '../moderation/ReportModal';

const MAX_UPLOAD_SIZE = 25 * 1024 * 1024; // 25MB

interface ExpandedMessageProps {
  conversation: Conversation;
  onCollapse: () => void;
}

function inferMessageTypeFromFile(file: File): Message['message_type'] {
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('audio/')) return 'audio';
  return 'file';
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

    if (!cipherText) {
      setDecryptedContent('');
      return;
    }

    const attemptDecryption = async () => {
      // Multi-recipient messages
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
          console.warn('Failed to decrypt multi-recipient message:', error);
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
          setDecryptedContent(cipherText);
          return;
        }
        const decrypted = await decryptMessage(cipherText, keys.privateKey);
        setDecryptedContent(decrypted);
      } catch {
        setDecryptedContent(cipherText);
      }
    };

    attemptDecryption();
  }, [message, isOwnMessage, currentUserId]);

  return decryptedContent;
}

function useDecryptedMedia(message: Message, isOwnMessage: boolean): string | null {
  const { t } = useTranslation();
  const [mediaSrc, setMediaSrc] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    let cleanup: (() => void) | undefined;

    const decryptMedia = async () => {
      const API_ORIGIN = new URL(API_BASE_URL).origin;
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

        const token = getStoredAuthToken();
        const response = await fetch(originalUrl, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const encryptedData = await response.arrayBuffer();

        // Infer original MIME type from filename extension
        const filename =
          message.media_url?.split('/').pop() ?? t('messages.media.attachmentFallback');
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

        const blobUrl = URL.createObjectURL(decryptedBlob);
        cleanup = () => URL.revokeObjectURL(blobUrl);
        if (isMounted) {
          setMediaSrc(blobUrl);
        }
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
    isOwnMessage,
  ]);

  return mediaSrc;
}

interface MessageBubbleProps {
  message: Message;
  isOwnMessage: boolean;
  currentUserId?: number;
  reporting: boolean;
  onReport: (message: Message) => void;
}

function MessageBubble({
  message,
  isOwnMessage,
  currentUserId,
  reporting,
  onReport,
}: MessageBubbleProps) {
  const { t } = useTranslation();
  const { formatRelativeTime } = useFormat();
  const decryptedText = useDecryptedContent(message, isOwnMessage, currentUserId);
  const mediaSrc = useDecryptedMedia(message, isOwnMessage);
  const messageType = inferMessageTypeFromMessage(message);

  const hasMedia = Boolean(message.media_url);
  const showText = decryptedText && (!hasMedia || decryptedText.toLowerCase() !== 'media');

  return (
    <div className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'} mb-2`}>
      <div
        className={`max-w-[70%] rounded-lg px-3 py-2 ${
          isOwnMessage
            ? 'bg-cyan-600 text-white'
            : 'bg-[var(--color-surface)] text-[var(--color-text)]'
        }`}
      >
        {hasMedia && !mediaSrc && (
          <div className="mb-2 text-xs opacity-70">
            {message.media_encryption_key
              ? t('messages.viewer.decrypting')
              : t('messages.media.loading')}
          </div>
        )}
        {hasMedia && mediaSrc && (
          <div className="mb-2">
            {messageType === 'image' && (
              <img
                src={mediaSrc}
                alt={t('messages.media.fallbackText')}
                className="max-w-full rounded cursor-pointer"
                style={{ maxHeight: '300px' }}
                onClick={() => window.open(mediaSrc, '_blank')}
              />
            )}
            {messageType === 'video' && (
              <video
                src={mediaSrc}
                controls
                className="max-w-full rounded"
                style={{ maxHeight: '300px' }}
              />
            )}
            {messageType === 'audio' && <audio src={mediaSrc} controls className="w-full" />}
            {messageType === 'file' && (
              <a
                href={mediaSrc}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm underline"
                download={message.media_url?.split('/').pop()}
              >
                📎 {message.media_url?.split('/').pop() || t('messages.media.attachmentFallback')}
              </a>
            )}
          </div>
        )}
        {showText && <div className="text-sm whitespace-pre-wrap break-words">{decryptedText}</div>}
        <div
          className={`text-xs mt-1 ${isOwnMessage ? 'text-cyan-200' : 'text-[var(--color-text-muted)]'}`}
        >
          {formatRelativeTime(message.sent_at)}
        </div>
        {!isOwnMessage && (
          <button
            type="button"
            onClick={() => onReport(message)}
            disabled={reporting}
            className="mt-1 text-xs underline opacity-80 hover:opacity-100 disabled:opacity-50"
          >
            {reporting ? t('messages.status.reporting') : t('messages.actions.report')}
          </button>
        )}
      </div>
    </div>
  );
}

export function ExpandedMessage({ conversation, onCollapse }: ExpandedMessageProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [messageText, setMessageText] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [reportModalMessageID, setReportModalMessageID] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    data: messagesData,
    isLoading: loadingMessages,
    hasNextPage: hasMoreMessages,
    fetchNextPage: fetchMoreMessages,
    isFetchingNextPage: isFetchingMoreMessages,
  } = useInfiniteQuery({
    queryKey: ['messages', conversation.id],
    queryFn: ({ pageParam }) =>
      messagesService.getMessagesPage(
        conversation.id,
        50,
        pageParam ? String(pageParam) : undefined
      ),
    initialPageParam: '',
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
  });

  const messages = useMemo(
    () => messagesData?.pages.flatMap((page) => page.messages).reverse() ?? [],
    [messagesData]
  );

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const sendMessageMutation = useMutation({
    mutationFn: async (request: SendMessageRequest) => {
      return messagesService.sendMessage(request);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', conversation.id] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      setMessageText('');
      setSelectedFile(null);
    },
  });

  const handleReportMessage = (message: Message) => {
    setReportModalMessageID(message.id);
  };

  const handleSendMessage = async () => {
    if ((!messageText.trim() && !selectedFile) || sendMessageMutation.isPending) return;

    const otherUserId = conversation.other_user?.id;
    if (!otherUserId) {
      alert(t('messages.errors.recipientNotFound'));
      return;
    }

    try {
      const keys = await getOwnKeys();
      if (!keys) {
        alert(t('messages.errors.encryptionKeysMissing'));
        return;
      }

      const recipientPublicKey = await getUserPublicKey(otherUserId);
      if (!recipientPublicKey) {
        alert(t('messages.errors.recipientKeyNotFound'));
        return;
      }

      let mediaFileId: number | undefined;
      let mediaUrl: string | undefined;
      let mediaType: string | undefined;
      let mediaSize: number | undefined;
      let messageType: Message['message_type'] = 'text';
      let mediaEncryptionKey: string | undefined;
      let mediaEncryptionIv: string | undefined;
      let senderMediaEncryptionKey: string | undefined;

      if (selectedFile) {
        if (selectedFile.size > MAX_UPLOAD_SIZE) {
          alert(
            t('messages.media.fileTooLargeWithLimit', { limitMb: MAX_UPLOAD_SIZE / (1024 * 1024) })
          );
          return;
        }

        setUploadingMedia(true);
        try {
          const encryptedFile = await encryptFile(selectedFile);
          const uploadResponse = await mediaService.uploadMedia(
            new File([encryptedFile.encryptedData], selectedFile.name, { type: selectedFile.type })
          );
          mediaFileId = uploadResponse.id;
          mediaUrl = uploadResponse.storage_url;
          mediaType = selectedFile.type;
          mediaSize = selectedFile.size;
          messageType = inferMessageTypeFromFile(selectedFile);
          mediaEncryptionKey = await encryptKeyWithPublicKey(
            encryptedFile.rawKey,
            recipientPublicKey
          );
          senderMediaEncryptionKey = await encryptKeyWithPublicKey(
            encryptedFile.rawKey,
            keys.publicKey
          );
          mediaEncryptionIv = arrayBufferToBase64(encryptedFile.iv.slice().buffer);
        } catch (error) {
          console.error('Failed to upload media:', error);
          alert(t('messages.media.uploadFailed'));
          setUploadingMedia(false);
          return;
        }
        setUploadingMedia(false);
      }

      const textToSend =
        messageText.trim() || (selectedFile ? t('messages.media.fallbackText') : '');
      const encryptedForRecipient = await encryptMessage(textToSend, recipientPublicKey);
      const encryptedForSelf = await encryptMessage(textToSend, keys.publicKey);

      await sendMessageMutation.mutateAsync({
        conversation_id: conversation.id,
        encrypted_content: encryptedForRecipient,
        sender_encrypted_content: encryptedForSelf,
        encryption_version: 'v2',
        media_file_id: mediaFileId,
        media_url: mediaUrl,
        media_type: mediaType,
        media_size: mediaSize,
        message_type: messageType,
        media_encryption_key: mediaEncryptionKey,
        media_encryption_iv: mediaEncryptionIv,
        sender_media_encryption_key: senderMediaEncryptionKey,
      });
    } catch (error) {
      console.error('Failed to send message:', error);
      alert(t('messages.errors.sendFailed'));
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > MAX_UPLOAD_SIZE) {
        alert(
          t('messages.media.fileTooLargeWithLimit', { limitMb: MAX_UPLOAD_SIZE / (1024 * 1024) })
        );
        return;
      }
      setSelectedFile(file);
    }
  };

  const otherUser = conversation.other_user;

  return (
    <div className="expanded-message bg-[var(--color-surface)] h-full flex flex-col">
      {/* Header with back button */}
      <div className="sticky top-0 z-10 bg-black/70 backdrop-blur-sm p-2 border-b border-cyan-500 flex items-center gap-2">
        <button
          onClick={onCollapse}
          className="text-cyan-500 hover:text-cyan-400 text-xs flex items-center gap-1 transition-colors"
        >
          <svg
            className="h-3 w-3"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          {t('common.back')}
        </button>
        <div className="flex items-center gap-2 flex-1">
          <div className="w-8 h-8 rounded-full bg-[var(--color-background)] overflow-hidden flex-shrink-0">
            {otherUser?.avatar_url ? (
              <img
                src={resolveMediaUrl(otherUser.avatar_url)}
                alt={otherUser.username || t('common.user')}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[var(--color-text-muted)]">
                {(otherUser?.username?.[0] || '?').toUpperCase()}
              </div>
            )}
          </div>
          <span className="text-sm font-medium text-[var(--color-text)]">
            {otherUser?.username || t('common.unknownUser')}
          </span>
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-3">
        {loadingMessages ? (
          <div className="text-center text-sm text-[var(--color-text-muted)] py-4">
            {t('messages.status.loadingMessages')}
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center text-sm text-[var(--color-text-muted)] py-4">
            {t('messages.empty.startConversation')}
          </div>
        ) : (
          <>
            {hasMoreMessages && (
              <div className="text-center mb-4">
                <button
                  onClick={() => fetchMoreMessages()}
                  disabled={isFetchingMoreMessages}
                  className="text-xs text-cyan-500 hover:text-cyan-400 disabled:opacity-50"
                >
                  {isFetchingMoreMessages ? t('common.loading') : t('messages.actions.loadOlder')}
                </button>
              </div>
            )}
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                isOwnMessage={message.sender_id === user?.id}
                currentUserId={user?.id}
                reporting={false}
                onReport={handleReportMessage}
              />
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-[var(--color-border)] p-2 bg-[var(--color-surface)]">
        {selectedFile && (
          <div className="mb-2 flex items-center gap-2 text-xs text-[var(--color-text)]">
            <span>📎 {selectedFile.name}</span>
            <button
              onClick={() => setSelectedFile(null)}
              className="text-red-500 hover:text-red-400"
            >
              {t('common.accessibility.removeFile')}
            </button>
          </div>
        )}
        <div className="flex gap-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            className="hidden"
            accept="image/*,video/*,audio/*"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingMedia || sendMessageMutation.isPending}
            className="p-2 text-[var(--color-text-muted)] hover:text-cyan-500 transition-colors disabled:opacity-50"
            title={t('messages.compose.attachSingle')}
          >
            📎
          </button>
          <input
            type="text"
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={t('messages.typeMessage')}
            disabled={uploadingMedia || sendMessageMutation.isPending}
            className="flex-1 bg-[var(--color-background)] text-[var(--color-text)] text-sm px-3 py-2 rounded border border-[var(--color-border)] focus:outline-none focus:border-cyan-500 disabled:opacity-50"
          />
          <button
            onClick={handleSendMessage}
            disabled={
              (!messageText.trim() && !selectedFile) ||
              uploadingMedia ||
              sendMessageMutation.isPending
            }
            className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white text-sm font-medium rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploadingMedia
              ? t('messages.uploading')
              : sendMessageMutation.isPending
                ? t('messages.deliveryStatus.sending')
                : t('messages.send')}
          </button>
        </div>
      </div>

      {reportModalMessageID !== null && (
        <ReportModal
          isOpen={true}
          onClose={() => setReportModalMessageID(null)}
          targetType="message"
          targetId={reportModalMessageID}
          defaultReason="harassment"
        />
      )}
    </div>
  );
}
