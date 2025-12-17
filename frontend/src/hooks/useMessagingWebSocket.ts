import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE_URL } from '../lib/api';
import type { Message, Conversation } from '../types/messages';

interface UseMessagingWebSocketOptions {
  activeConversationId?: number | null;
  onMessageReceived?: (message: Message) => void;
}

/**
 * Custom hook to manage WebSocket connection for real-time messaging
 * This hook should be called at the app/layout level to ensure messages
 * are received even when not on the MessagesPage
 *
 * @param options.activeConversationId - The currently active/open conversation ID (if viewing messages page)
 * @param options.onMessageReceived - Optional callback when a message is received
 */
export function useMessagingWebSocket(options: UseMessagingWebSocketOptions = {}) {
  const { activeConversationId, onMessageReceived } = options;
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);

  // Use ref to avoid stale closure in WebSocket handler
  const activeConversationIdRef = useRef<number | null>(activeConversationId ?? null);

  // DEBUG: Log when activeConversationId changes
  console.log('[WebSocket Hook] activeConversationId changed:', activeConversationId);

  // Update ref whenever activeConversationId changes
  useEffect(() => {
    activeConversationIdRef.current = activeConversationId ?? null;
    console.log('[WebSocket Hook] Updated ref to:', activeConversationIdRef.current);
  }, [activeConversationId]);

  useEffect(() => {
    if (!user) return;

    const token = localStorage.getItem('auth_token');
    if (!token) return;

    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      const url = new URL(API_BASE_URL);
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      url.pathname = `${url.pathname.replace(/\/$/, '')}/ws`;
      url.searchParams.set('token', token);

      const socket = new WebSocket(url.toString());
      wsRef.current = socket;

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as { type: string; payload: Message };
          if (data.type === 'new_message' && data.payload) {
            const payload = data.payload;

            console.log('[WebSocket] New message received:', {
              messageId: payload.id,
              conversationId: payload.conversation_id,
              senderId: payload.sender_id,
              recipientId: payload.recipient_id,
            });

            // Update messages cache if we have it loaded
            queryClient.setQueryData<Message[] | undefined>(
              ['messages', payload.conversation_id],
              (prev) => {
                if (!prev) return [payload];
                if (prev.some((msg) => msg.id === payload.id)) return prev;
                return [payload, ...prev];
              }
            );

            // Update conversations list - this is the key part for the notification count
            queryClient.setQueryData<Conversation[] | undefined>(['conversations'], (prev) => {
              if (!prev) return prev;

              return prev.map((conv) => {
                if (conv.id !== payload.conversation_id) {
                  return conv;
                }

                // Increment unread count only if user is the recipient
                const isRecipient = payload.recipient_id === user?.id;
                // Don't increment if this is the active conversation (user is currently viewing it)
                // Use ref to get current value and avoid stale closure
                const currentActiveConvId = activeConversationIdRef.current;
                const isActiveConversation = currentActiveConvId === payload.conversation_id;

                console.log('[WebSocket] Processing conversation update:', {
                  conversationId: conv.id,
                  currentUnreadCount: conv.unread_count,
                  activeConversationId: currentActiveConvId,
                  isActiveConversation,
                  isRecipient,
                  userId: user?.id,
                });

                // If viewing active conversation, always set unread to 0
                // Otherwise, increment only if user is recipient
                const nextUnread = isActiveConversation
                  ? 0
                  : (isRecipient ? conv.unread_count + 1 : conv.unread_count);

                console.log('[WebSocket] Setting nextUnread to:', nextUnread);

                return {
                  ...conv,
                  latest_message: payload,
                  unread_count: nextUnread,
                };
              });
            });

            // Call the callback if provided
            if (onMessageReceived) {
              onMessageReceived(payload);
            }

            // If we received a message for a conversation that doesn't exist in our list,
            // refetch conversations
            const conversations = queryClient.getQueryData<Conversation[]>(['conversations']);
            if (conversations && !conversations.find((c) => c.id === payload.conversation_id)) {
              queryClient.invalidateQueries({ queryKey: ['conversations'] });
            }
          }
        } catch (err) {
          console.error('Failed to process WebSocket message', err);
        }
      };

      socket.onclose = () => {
        console.log('WebSocket closed, reconnecting in 5s...');
        reconnectTimer = setTimeout(connect, 5000);
      };

      socket.onerror = (error) => {
        console.error('WebSocket error:', error);
        socket.close();
      };

      socket.onopen = () => {
        console.log('WebSocket connected');
      };
    };

    connect();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
    };
  }, [user?.id, queryClient, onMessageReceived]); // Don't include activeConversationId - we use ref to avoid recreation

  return wsRef;
}
