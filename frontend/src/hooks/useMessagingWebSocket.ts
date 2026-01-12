import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
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
  const { notifyArchivedMessages } = useSettings();
  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const userId = user?.id ?? null;

  // Use ref to avoid stale closure in WebSocket handler
  const activeConversationIdRef = useRef<number | null>(activeConversationId ?? null);
  const isCleanupRef = useRef<boolean>(false);

  // Update ref whenever activeConversationId changes
  useEffect(() => {
    activeConversationIdRef.current = activeConversationId ?? null;
  }, [activeConversationId]);

  useEffect(() => {
    if (!userId) return;

    const token = localStorage.getItem('auth_token');
    if (!token) return;

    console.log('[WebSocket] Effect triggered, userId:', userId, 'timestamp:', new Date().toISOString());

    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    isCleanupRef.current = false;

    const connect = () => {
      console.log('[WebSocket] Attempting to connect...', new Date().toISOString());
      const url = new URL(API_BASE_URL);
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      url.pathname = `${url.pathname.replace(/\/$/, '')}/ws`;
      url.searchParams.set('token', token);

      const socket = new WebSocket(url.toString());
      wsRef.current = socket;
      let hasOpened = false;

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as { type: string; payload: Message };
          if (data.type === 'new_message' && data.payload) {
            const payload = data.payload;

            // Update messages cache if we have it loaded
            queryClient.setQueryData<Message[] | undefined>(
              ['messages', payload.conversation_id],
              (prev) => {
                if (!prev) return [payload];
                if (prev.some((msg) => msg.id === payload.id)) return prev;
                return [payload, ...prev];
              }
            );

            const updateConversationList = (key: (string | number)[]) => {
              let found = false;
              queryClient.setQueryData<Conversation[] | undefined>(key, (prev) => {
                if (!prev) {
                  return prev;
                }

                const next = prev.map((conv) => {
                  if (conv.id !== payload.conversation_id) {
                    return conv;
                  }
                  found = true;

                  // Increment unread count only if user is the recipient
                  const isRecipient = payload.recipient_id === userId;
                  const isArchived = Boolean(conv.archived_at);
                  // Don't increment if this is the active conversation (user is currently viewing it)
                  // Use ref to get current value and avoid stale closure
                  const currentActiveConvId = activeConversationIdRef.current;
                  const isActiveConversation = currentActiveConvId === payload.conversation_id;

                  if (isArchived && !notifyArchivedMessages) {
                    // Keep unread count unchanged for archived conversations
                    return {
                      ...conv,
                      latest_message: payload,
                      unread_count: conv.unread_count,
                    };
                  }

                  // If viewing active conversation, always set unread to 0
                  // Otherwise, increment only if user is recipient
                  const nextUnread = isActiveConversation
                    ? 0
                    : (isRecipient ? conv.unread_count + 1 : conv.unread_count);

                  return {
                    ...conv,
                    latest_message: payload,
                    unread_count: nextUnread,
                  };
                });

                return next;
              });

              // If not found in cache, refetch this query key
              if (!found) {
                queryClient.invalidateQueries({ queryKey: key });
              }
            };

            // Update both active-only list (MainLayout) and full list (MessagesPage)
            updateConversationList(['conversations']);
            updateConversationList(['conversations', 'all']);

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
        if (isCleanupRef.current) return;
        // Only reconnect if the socket had successfully opened before
        if (hasOpened) {
          console.log('WebSocket closed, reconnecting in 5s...');
          reconnectTimer = setTimeout(connect, 5000);
        } else {
          console.log('WebSocket closed before opening, not reconnecting');
        }
      };

      socket.onerror = (error) => {
        // Don't log errors if we're cleaning up or if socket is already closing/closed
        if (isCleanupRef.current || socket.readyState === WebSocket.CLOSING || socket.readyState === WebSocket.CLOSED) {
          return;
        }
        console.error('WebSocket error:', error);
        socket.close();
      };

      socket.onopen = () => {
        hasOpened = true;
        console.log('[WebSocket] Connected successfully at', new Date().toISOString());
      };
    };

    connect();

    return () => {
      isCleanupRef.current = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
        wsRef.current.close();
      }
      wsRef.current = null;
    };
  }, [userId, notifyArchivedMessages, onMessageReceived, queryClient]); // Don't include activeConversationId - we use ref to avoid recreation

  return wsRef;
}
