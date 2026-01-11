import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { messagesService } from '../services/messagesService';
import { modMailService } from '../services/modMailService';
import { encryptionService } from '../services/encryptionService';
import type { Message } from '../types/messages';
import type { ModMailConversation } from '../types/modmail';
import { decryptMessage, encryptForMultipleRecipients, decryptMultiRecipientContent } from '../utils/encryption';
import { getOwnKeys, getUserPublicKey } from '../services/keyManagementService';
import { LoadingMessage, ErrorMessage } from '../components/common/StatusMessage';

function useDecryptedMessageContent(
  message: Message,
  isOwnMessage: boolean,
  currentUserId?: number
): string {
  const [decryptedContent, setDecryptedContent] = useState<string>('');

  useEffect(() => {
    const cipherText = isOwnMessage
      ? message.sender_encrypted_content ?? message.encrypted_content
      : message.encrypted_content;

    if (!cipherText) {
      setDecryptedContent('');
      return;
    }

    const attemptDecryption = async () => {
      const isMultiRecipient =
        message.is_multi_recipient && message.shared_encryption_iv && message.recipient_keys;

      if (isMultiRecipient && currentUserId) {
        try {
          const keys = await getOwnKeys();
          const encryptedKey = message.recipient_keys?.[currentUserId];
          if (keys?.privateKey && encryptedKey) {
            const decrypted = await decryptMultiRecipientContent(
              cipherText,
              encryptedKey,
              message.shared_encryption_iv as string,
              keys.privateKey
            );
            setDecryptedContent(decrypted);
            return;
          }
        } catch (error) {
          console.warn('Failed to decrypt multi-recipient message, falling back:', error);
        }
      }

      const shouldDecrypt = Boolean(
        (isOwnMessage && message.sender_encrypted_content) ||
          (!isOwnMessage && message.encryption_version === 'v1')
      );

      if (!shouldDecrypt) {
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
      } catch (error) {
        console.warn('Failed to decrypt message, displaying as ciphertext:', error);
        setDecryptedContent(cipherText);
      }
    };

    attemptDecryption();
  }, [
    currentUserId,
    isOwnMessage,
    message.encrypted_content,
    message.id,
    message.recipient_keys,
    message.sender_encrypted_content,
    message.shared_encryption_iv,
    message.is_multi_recipient,
    message.encryption_version,
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
  const decryptedContent = useDecryptedMessageContent(message, isOwnMessage, currentUserId);

  if (!decryptedContent) return null;

  return <p className={className}>{decryptedContent}</p>;
}

export default function ModMailConversationPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [messageText, setMessageText] = useState('');
  const [encryptionWarning, setEncryptionWarning] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const convId = parseInt(conversationId || '');

  // Fetch mod mail conversation details from the dedicated endpoint
  const { data: conversation } = useQuery<ModMailConversation>({
    queryKey: ['modMailConversation', convId],
    queryFn: async () => {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`http://localhost:8080/api/v1/mod-mail/${convId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch conversation');
      }

      return response.json();
    },
    enabled: !!convId,
  });

  // Fetch messages
  const {
    data: messagesData,
    isLoading: isLoadingMessages,
    hasNextPage: hasMoreMessages,
    fetchNextPage: fetchMoreMessages,
    isFetchingNextPage: isFetchingMoreMessages,
  } = useInfiniteQuery({
    queryKey: ['messages', convId],
    queryFn: ({ pageParam }) =>
      messagesService.getMessagesPage(convId, 50, pageParam ? String(pageParam) : undefined),
    initialPageParam: '',
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    enabled: !!convId,
    refetchInterval: 5000, // Poll every 5 seconds
  });

  // Sort messages by sent_at to ensure chronological order (oldest to newest)
  const messages = messagesData
    ? [...messagesData.pages.flatMap((page) => page.messages)].sort(
        (a, b) => new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime()
      )
    : undefined;

  type EncryptionPayload =
    | {
        is_multi_recipient: true;
        encryption_version: string;
        encrypted_content: string;
        sender_encrypted_content?: string;
        shared_encryption_iv: string;
        recipient_keys: Record<number, string>;
      }
    | {
        is_multi_recipient: false;
        encryption_version: string;
      };

  const prepareEncryptionPayload = useCallback(
    async (content: string): Promise<EncryptionPayload> => {
      const participantIds = Array.from(
        new Set(
          [
            user?.id,
            ...(conversation?.participants?.map((p) => p.user_id) ?? []),
          ].filter((id): id is number => typeof id === 'number')
        )
      );

      if (!participantIds.length) {
        const error = 'CRITICAL: No participants found. Cannot send unencrypted mod mail.';
        setEncryptionWarning(error);
        throw new Error(error);
      }

      const publicKeys = await encryptionService.getPublicKeys(participantIds);
      const cryptoKeys: { userId: number; publicKey: CryptoKey }[] = [];
      const missing: number[] = [];

      for (const pid of participantIds) {
        const keyBase64 = publicKeys[pid];
        if (!keyBase64) {
          missing.push(pid);
          continue;
        }
        const publicKey = await getUserPublicKey(pid, keyBase64);
        if (publicKey) {
          cryptoKeys.push({ userId: pid, publicKey });
        } else {
          missing.push(pid);
        }
      }

      const ownKeys = await getOwnKeys();
      if (!cryptoKeys.length || missing.length || !ownKeys?.publicKey) {
        let errorMsg = 'CRITICAL: Cannot send unencrypted mod mail. ';
        if (missing.length) {
          errorMsg += `Missing public keys for user IDs: ${missing.join(', ')}. `;
        }
        if (!ownKeys?.publicKey) {
          errorMsg += 'You have not set up encryption keys. ';
        }
        errorMsg += 'All participants must have encryption enabled.';
        setEncryptionWarning(errorMsg);
        throw new Error(errorMsg);
      }

      const encrypted = await encryptForMultipleRecipients(content, cryptoKeys, ownKeys.publicKey);
      setEncryptionWarning(null);

      return {
        is_multi_recipient: true,
        encryption_version: 'v2',
        encrypted_content: encrypted.encryptedContent,
        sender_encrypted_content:
          encrypted.senderEncryptedContent ?? encrypted.encryptedContent,
        shared_encryption_iv: encrypted.sharedIv,
        recipient_keys: encrypted.recipientKeys,
      };
    },
    [conversation?.participants, user?.id]
  );

  const sendMutation = useMutation({
    mutationFn: async (content: string) => {
      const encryptionPayload = await prepareEncryptionPayload(content);

      return messagesService.sendMessage({
        conversation_id: convId,
        message_type: 'text',
        content: encryptionPayload.is_multi_recipient ? undefined : content,
        encrypted_content:
          encryptionPayload.is_multi_recipient ? encryptionPayload.encrypted_content : undefined,
        sender_encrypted_content: encryptionPayload.is_multi_recipient
          ? encryptionPayload.sender_encrypted_content
          : undefined,
        encryption_version: encryptionPayload.encryption_version,
        is_multi_recipient: encryptionPayload.is_multi_recipient,
        shared_encryption_iv:
          encryptionPayload.is_multi_recipient ? encryptionPayload.shared_encryption_iv : undefined,
        recipient_keys:
          encryptionPayload.is_multi_recipient ? encryptionPayload.recipient_keys : undefined,
      });
    },
    onError: (err: unknown) => {
      if (err instanceof Error) {
        setEncryptionWarning(err.message);
      } else {
        setEncryptionWarning('Failed to send message. Please try again.');
      }
    },
    onSuccess: () => {
      setMessageText('');
      queryClient.invalidateQueries({ queryKey: ['messages', convId] });
      queryClient.invalidateQueries({ queryKey: ['modMailConversation', convId] });
      queryClient.invalidateQueries({ queryKey: ['modMail'] });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: (status: 'open' | 'archived' | 'resolved') =>
      modMailService.updateStatus(convId, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['modMailConversation', convId] });
      queryClient.invalidateQueries({ queryKey: ['modMail'] });
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (isLoadingMessages) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="text-center py-12">
          <LoadingMessage>Loading conversation...</LoadingMessage>
        </div>
      </div>
    );
  }

  if (!messages) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="text-center py-12">
          <ErrorMessage>Unable to load messages.</ErrorMessage>
        </div>
      </div>
    );
  }

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim()) return;
    sendMutation.mutate(messageText);
  };

  // Extract hub name from conversation (assuming it's in metadata or participants)
  const hubName = conversation?.hub_name || '';
  const status = conversation?.status || 'open';
  const subject = conversation?.subject || 'Mod Mail Conversation';

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate(-1)}
          className="text-[var(--color-primary)] hover:underline mb-4"
        >
          ← Back to Mod Tools
        </button>
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">
              {subject}
            </h1>
            {hubName && (
              <p className="text-[var(--color-text-secondary)] mt-1">h/{hubName}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`px-3 py-1 text-sm rounded ${
                status === 'open'
                  ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                  : status === 'resolved'
                  ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                  : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
              }`}
            >
              {status}
            </span>
            {status === 'open' && (
              <>
                <button
                  onClick={() => updateStatusMutation.mutate('resolved')}
                  disabled={updateStatusMutation.isPending}
                  className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  Resolve
                </button>
                <button
                  onClick={() => updateStatusMutation.mutate('archived')}
                  disabled={updateStatusMutation.isPending}
                  className="px-3 py-1 text-sm bg-gray-600 text-white rounded hover:bg-gray-700 disabled:opacity-50"
                >
                  Archive
                </button>
              </>
            )}
            {status !== 'open' && (
              <button
                onClick={() => updateStatusMutation.mutate('open')}
                disabled={updateStatusMutation.isPending}
                className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
              >
                Reopen
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4 mb-4 max-h-[600px] overflow-y-auto">
        {hasMoreMessages && (
          <div className="mb-4 flex justify-center">
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
        {messages && messages.length === 0 && (
          <div className="text-center py-12 text-[var(--color-text-secondary)]">
            No messages yet
          </div>
        )}
        <div className="space-y-4">
          {messages?.map((msg: Message) => {
            const isCurrentUser = msg.sender_id === user?.id;
            const participant = conversation?.participants?.find((p) => p.user_id === msg.sender_id);
            const isModerator = participant?.is_moderator || false;
            const senderUsername = participant?.username || `User #${msg.sender_id}`;

            return (
              <div
                key={msg.id}
                className={`flex ${isCurrentUser ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[70%] rounded-lg px-4 py-3 ${
                    isCurrentUser
                      ? 'bg-[var(--color-primary)] text-white'
                      : 'bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)]'
                  }`}
                >
                  <DecryptedMessageContent
                    message={msg}
                    isOwnMessage={isCurrentUser}
                    currentUserId={user?.id}
                    className="text-sm whitespace-pre-wrap break-words mb-1"
                  />
                  <div className={`text-xs flex items-center gap-1 ${isCurrentUser ? 'text-white/70' : 'text-[var(--color-text-secondary)]'}`}>
                    <span>{senderUsername}</span>
                    {isModerator && (
                      <span className={`px-1.5 py-0.5 text-[10px] font-semibold rounded ${
                        isCurrentUser
                          ? 'bg-white/20 text-white'
                          : 'bg-green-600 text-white'
                      }`}>
                        MOD
                      </span>
                    )}
                    <span>{new Date(msg.sent_at).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Reply Form */}
      <form onSubmit={handleSend} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-4">
        <textarea
          value={messageText}
          onChange={(e) => setMessageText(e.target.value)}
          placeholder="Type your reply... (visible to all moderators and the user)"
          rows={4}
          className="w-full px-3 py-2 border border-[var(--color-border)] rounded bg-[var(--color-background)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] resize-none"
          disabled={sendMutation.isPending}
        />
        {encryptionWarning && (
          <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mt-2">
            {encryptionWarning}
          </div>
        )}
        <div className="flex justify-between items-center mt-3">
          <p className="text-xs text-[var(--color-text-secondary)]">
            All moderators of h/{hubName} can see and reply to this conversation
          </p>
          <button
            type="submit"
            disabled={!messageText.trim() || sendMutation.isPending}
            className="px-4 py-2 rounded bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-strong)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sendMutation.isPending ? 'Sending...' : 'Send Reply'}
          </button>
        </div>
      </form>
    </div>
  );
}
