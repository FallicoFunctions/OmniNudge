import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { messagesService } from '../services/messagesService';
import type { Message } from '../types/messages';

const EDIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

/** Returns true if the message is still within the 15-minute edit window. */
export function isEditable(message: Message, currentUserId: number | undefined): boolean {
  if (!currentUserId || message.sender_id !== currentUserId) return false;
  if (message.deleted_for_sender || message.deleted_for_recipient) return false;
  // Fix 1: only text messages are editable — backend rejects all other types
  if (message.message_type !== 'text') return false;
  const sentAt = new Date(message.sent_at).getTime();
  return Date.now() - sentAt < EDIT_WINDOW_MS;
}

interface UseMessageEditOptions {
  conversationId: number;
  currentUserId: number | undefined;
  /** Recipient's user ID — passed through to editMessage to skip a getConversation round-trip (Fix 18). */
  recipientId?: number;
}

export interface UseMessageEditReturn {
  editingMessageId: number | null;
  /** Decrypted plaintext initial content for the edit form. */
  editingContent: string;
  startEdit: (message: Message, initialContent: string) => void;
  cancelEdit: () => void;
  saveEdit: (messageId: number, content: string) => Promise<Message>;
  isSaving: boolean;
  historyMessageId: number | null;
  openHistory: (messageId: number) => void;
  closeHistory: () => void;
}

export function useMessageEdit({
  conversationId,
  currentUserId,
  recipientId,
}: UseMessageEditOptions): UseMessageEditReturn {
  const queryClient = useQueryClient();
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [editingContent, setEditingContent] = useState<string>('');
  const [historyMessageId, setHistoryMessageId] = useState<number | null>(null);
  // Track the optimistic plaintext so we can render it while isSaving=true
  const optimisticContentRef = useRef<string>('');

  // Fix 4: reset edit state whenever the user switches conversations
  useEffect(() => {
    setEditingMessageId(null);
    setEditingContent('');
  }, [conversationId]);

  const editMutation = useMutation({
    mutationFn: ({ messageId, content }: { messageId: number; content: string }) =>
      messagesService.editMessage(messageId, {
        conversation_id: conversationId,
        content,
        recipient_id: recipientId,
      }),
    // Fix 12: optimistic update — write plaintext into cache immediately so bubble
    // updates the instant Save is pressed, before the encrypt+network round-trip.
    onMutate: async ({ messageId, content }) => {
      optimisticContentRef.current = content;
      await queryClient.cancelQueries({ queryKey: ['messages', conversationId] });
      const previous = queryClient.getQueryData<InfiniteData<{ messages: Message[]; next_cursor?: string }>>(
        ['messages', conversationId]
      );
      queryClient.setQueryData<InfiniteData<{ messages: Message[]; next_cursor?: string }> | undefined>(
        ['messages', conversationId],
        (prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            pages: prev.pages.map((page) => ({
              ...page,
              messages: page.messages.map((msg) =>
                msg.id === messageId
                  ? {
                      ...msg,
                      // Store plaintext optimistically so DecryptedMessageContent can render it
                      encrypted_content: content,
                      sender_encrypted_content: content,
                      encryption_version: 'plaintext',
                      edited: true,
                      edited_at: new Date().toISOString(),
                    }
                  : msg
              ),
            })),
          };
        }
      );
      // Close the edit form immediately so the optimistic bubble is visible
      setEditingMessageId(null);
      setEditingContent('');
      return { previous };
    },
    onSuccess: (updatedMessage) => {
      // Replace optimistic entry with server-confirmed (properly encrypted) data
      queryClient.setQueryData<InfiniteData<{ messages: Message[]; next_cursor?: string }> | undefined>(
        ['messages', conversationId],
        (prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            pages: prev.pages.map((page) => ({
              ...page,
              messages: page.messages.map((msg) =>
                msg.id === updatedMessage.id ? { ...msg, ...updatedMessage } : msg
              ),
            })),
          };
        }
      );
    },
    onError: (_, __, context) => {
      // Roll back optimistic update
      if (context?.previous !== undefined) {
        queryClient.setQueryData(['messages', conversationId], context.previous);
      }
    },
  });

  // Fix 7: startEdit now takes the already-decrypted content from the caller
  const startEdit = useCallback(
    (message: Message, initialContent: string) => {
      if (!isEditable(message, currentUserId)) return;
      setEditingContent(initialContent);
      setEditingMessageId(message.id);
    },
    [currentUserId]
  );

  const cancelEdit = useCallback(() => {
    setEditingMessageId(null);
    setEditingContent('');
  }, []);

  // Fix 17: mutateAsync is a stable reference from TanStack Query — no need for
  // an intermediate useCallback with an unstable editMutation dependency.
  const saveEdit = useCallback(
    (messageId: number, content: string) =>
      editMutation.mutateAsync({ messageId, content }),
    [editMutation]
  );

  const openHistory = useCallback((messageId: number) => {
    setHistoryMessageId(messageId);
  }, []);

  const closeHistory = useCallback(() => {
    setHistoryMessageId(null);
  }, []);

  // Fix 16: use a single setTimeout to cancel edit precisely at expiry rather
  // than polling every 5 seconds.
  useEffect(() => {
    if (editingMessageId === null) return;
    const data = queryClient.getQueryData<InfiniteData<{ messages: Message[]; next_cursor?: string }>>(
      ['messages', conversationId]
    );
    if (!data) return;
    let sentAt: number | null = null;
    for (const page of data.pages) {
      const msg = page.messages.find((m) => m.id === editingMessageId);
      if (msg) {
        sentAt = new Date(msg.sent_at).getTime();
        break;
      }
    }
    if (sentAt === null) return;
    const msRemaining = EDIT_WINDOW_MS - (Date.now() - sentAt);
    if (msRemaining <= 0) {
      setEditingMessageId(null);
      setEditingContent('');
      return;
    }
    const timer = window.setTimeout(() => {
      setEditingMessageId(null);
      setEditingContent('');
    }, msRemaining);
    return () => window.clearTimeout(timer);
  }, [editingMessageId, conversationId, queryClient]);

  return {
    editingMessageId,
    editingContent,
    startEdit,
    cancelEdit,
    saveEdit,
    isSaving: editMutation.isPending,
    historyMessageId,
    openHistory,
    closeHistory,
  };
}
