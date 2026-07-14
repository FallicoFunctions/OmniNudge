import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from './AuthContext';
import { API_BASE_URL, api } from '../lib/api';
import type { InfiniteData } from '@tanstack/react-query';
import type {
  Message,
  Conversation,
  WsMessagePinEvent,
  WsThreadUpdateEvent,
} from '../types/messages';
import type {
  GetReactionsResponse,
  WsReactionAddedPayload,
  WsReactionRemovedPayload,
} from '../types/reactions';
import type { BotConversationDetail, BotMessage } from '../types/omnichat';
import { friendsQueryKeys } from '../services/friendsService';

interface WebSocketMessage {
  type: string;
  payload: unknown;
}

type InitialStatePayload = { online_users?: number[] };
type MessageStatusPayload = {
  message_id: number;
  conversation_id: number;
  delivered_at?: string;
  read_at?: string;
};
type ConversationReadPayload = { conversation_id: number };
type UserPresencePayload = { user_id: number };
type TypingPayload = { conversation_id: number; user_id: number; is_typing: boolean };
type FeatureFlagUpdatedPayload = { key: string; enabled: boolean; percentage?: number };

interface WebSocketContextType {
  // Connection state
  isConnected: boolean;
  connectionState: 'idle' | 'connecting' | 'connected' | 'reconnecting';

  // Send methods
  sendTypingIndicator: (conversationId: number, recipientId: number, isTyping: boolean) => void;

  // Online status tracking
  onlineUsers: Set<number>;
  isUserOnline: (userId: number) => boolean;

  // Typing status tracking (conversationId -> Set of userIds)
  typingUsers: Map<number, Set<number>>;
  getTypingUsers: (conversationId: number) => Set<number>;
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionState, setConnectionState] = useState<
    'idle' | 'connecting' | 'connected' | 'reconnecting'
  >('idle');
  const [onlineUsers, setOnlineUsers] = useState<Set<number>>(new Set());
  const [typingUsers, setTypingUsers] = useState<Map<number, Set<number>>>(new Map());
  const typingTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const reconnectTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const reconnectAttemptsRef = useRef(0);
  const isCleanupRef = useRef(false);
  const recentMessageIdsRef = useRef<Set<number>>(new Set());
  const activeConnectionIdRef = useRef(0);

  // Send WebSocket message
  const sendMessage = useCallback((type: string, payload: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, payload }));
      console.log('[WebSocket] Sent:', type, payload);
    } else {
      console.warn('[WebSocket] Cannot send, not connected:', type);
    }
  }, []);

  // Public API: Send typing indicator
  const sendTypingIndicator = useCallback(
    (conversationId: number, recipientId: number, isTyping: boolean) => {
      sendMessage('typing', {
        conversation_id: conversationId,
        recipient_id: recipientId,
        is_typing: isTyping,
      });
    },
    [sendMessage]
  );

  // Check if user is online
  const isUserOnline = useCallback(
    (userId: number) => {
      return onlineUsers.has(userId);
    },
    [onlineUsers]
  );

  // Get typing users in conversation
  const getTypingUsers = useCallback(
    (conversationId: number) => {
      return typingUsers.get(conversationId) || new Set<number>();
    },
    [typingUsers]
  );

  // Handle incoming WebSocket messages
  const handleMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const data: WebSocketMessage = JSON.parse(event.data);
        console.log('[WebSocket] Received:', data.type);

        switch (data.type) {
          case 'initial_state': {
            const { online_users } = data.payload as InitialStatePayload;
            console.log('[WebSocket] Initial state - online users:', online_users);
            setOnlineUsers(new Set(online_users || []));
            break;
          }

          case 'new_message': {
            const message = data.payload as Message;
            console.log('[WebSocket] New message:', message.id);

            // Deduplicate: Check if we've already processed this message recently
            if (recentMessageIdsRef.current.has(message.id)) {
              console.log('[WebSocket] Duplicate message ignored:', message.id);
              break;
            }

            // Track this message ID (keep last 100 IDs to prevent Set from growing indefinitely)
            recentMessageIdsRef.current.add(message.id);
            if (recentMessageIdsRef.current.size > 100) {
              // Remove oldest entry (first in Set)
              const firstId = recentMessageIdsRef.current.values().next().value;
              if (firstId !== undefined) {
                recentMessageIdsRef.current.delete(firstId);
              }
            }

            // Update messages cache — must use InfiniteData shape since MessagesPage uses useInfiniteQuery
            queryClient.setQueryData<
              InfiniteData<{ messages: Message[]; next_cursor?: string }> | undefined
            >(['messages', message.conversation_id], (prev) => {
              if (!prev) return prev;
              const alreadyExists = prev.pages.some((page) =>
                page.messages.some((msg) => msg.id === message.id)
              );
              if (alreadyExists) return prev;
              return {
                ...prev,
                pages: prev.pages.map((page, i) =>
                  i === 0 ? { ...page, messages: [message, ...page.messages] } : page
                ),
              };
            });

            // Invalidate all conversation queries so every consumer (MainLayout badge,
            // MessagesPage sidebar) refetches with accurate unread counts.
            queryClient.invalidateQueries({ queryKey: ['conversations'] });

            // Dispatch custom event for notification sound — suppress for system messages.
            if (message.message_type !== 'system') {
              window.dispatchEvent(
                new CustomEvent('new-message', {
                  detail: {
                    conversationId: message.conversation_id,
                    senderId: message.sender_id,
                  },
                })
              );
            }
            break;
          }

          case 'message_delivered': {
            const { message_id, conversation_id, delivered_at } =
              data.payload as MessageStatusPayload;
            console.log('[WebSocket] Message delivered:', message_id);

            queryClient.setQueryData<
              InfiniteData<{ messages: Message[]; next_cursor?: string }> | undefined
            >(['messages', conversation_id], (prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                pages: prev.pages.map((page) => ({
                  ...page,
                  messages: page.messages.map((msg) =>
                    msg.id === message_id
                      ? { ...msg, delivered_at: delivered_at || new Date().toISOString() }
                      : msg
                  ),
                })),
              };
            });
            break;
          }

          case 'message_read': {
            const { message_id, conversation_id, read_at } = data.payload as MessageStatusPayload;
            console.log('[WebSocket] Message read:', message_id);

            queryClient.setQueryData<
              InfiniteData<{ messages: Message[]; next_cursor?: string }> | undefined
            >(['messages', conversation_id], (prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                pages: prev.pages.map((page) => ({
                  ...page,
                  messages: page.messages.map((msg) =>
                    msg.id === message_id
                      ? { ...msg, read_at: read_at || new Date().toISOString() }
                      : msg
                  ),
                })),
              };
            });
            break;
          }

          case 'conversation_read': {
            const { conversation_id } = data.payload as ConversationReadPayload;
            console.log('[WebSocket] Conversation read:', conversation_id);

            const now = new Date().toISOString();
            queryClient.setQueryData<
              InfiniteData<{ messages: Message[]; next_cursor?: string }> | undefined
            >(['messages', conversation_id], (prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                pages: prev.pages.map((page) => ({
                  ...page,
                  messages: page.messages.map((msg) => ({
                    ...msg,
                    read_at: msg.read_at || now,
                  })),
                })),
              };
            });

            // Update conversation unread count
            const updateConversations = (key: (string | number)[]) => {
              queryClient.setQueryData<Conversation[] | undefined>(key, (prev) => {
                if (!prev) return prev;
                return prev.map((conv) =>
                  conv.id === conversation_id ? { ...conv, unread_count: 0 } : conv
                );
              });
            };

            updateConversations(['conversations']);
            updateConversations(['conversations', 'all']);
            break;
          }

          case 'conversation_unarchived': {
            const { conversation_id } = data.payload as { conversation_id: number };
            console.log('[WebSocket] Conversation unarchived:', conversation_id);
            queryClient.invalidateQueries({ queryKey: ['conversations'] });
            queryClient.invalidateQueries({ queryKey: ['conversations', 'all'] });
            window.dispatchEvent(
              new CustomEvent('conversation-unarchived', {
                detail: data.payload,
              })
            );
            break;
          }

          case 'message_edited': {
            const {
              message_id,
              conversation_id,
              edited_at,
              encrypted_content,
              sender_encrypted_content,
              encryption_version,
            } = data.payload as {
              message_id: number;
              conversation_id: number;
              edited_at: string;
              encrypted_content?: string;
              sender_encrypted_content?: string | null;
              encryption_version?: string;
            };

            console.log('[WebSocket] Message edited:', message_id);

            queryClient.setQueryData<
              InfiniteData<{ messages: Message[]; next_cursor?: string }> | undefined
            >(['messages', conversation_id], (prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                pages: prev.pages.map((page) => ({
                  ...page,
                  messages: page.messages.map((msg) =>
                    msg.id === message_id
                      ? {
                          ...msg,
                          edited: true,
                          edited_at: edited_at || new Date().toISOString(),
                          encrypted_content: encrypted_content ?? msg.encrypted_content,
                          sender_encrypted_content:
                            sender_encrypted_content ?? msg.sender_encrypted_content,
                          encryption_version: encryption_version ?? msg.encryption_version,
                        }
                      : msg
                  ),
                })),
              };
            });

            window.dispatchEvent(
              new CustomEvent('message-edited', {
                detail: data.payload,
              })
            );
            break;
          }

          case 'thread_reply_added': {
            const payload = data.payload as WsThreadUpdateEvent;
            const { conversation_id, thread_root, reply_count } = payload;
            console.log('[WebSocket] Thread reply added:', payload.reply_id);

            queryClient.setQueryData<
              InfiniteData<{ messages: Message[]; next_cursor?: string }> | undefined
            >(['messages', conversation_id], (prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                pages: prev.pages.map((page) => ({
                  ...page,
                  messages: page.messages.map((msg) =>
                    msg.id === thread_root ? { ...msg, reply_count } : msg
                  ),
                })),
              };
            });

            window.dispatchEvent(
              new CustomEvent('thread-reply-added', {
                detail: payload,
              })
            );
            break;
          }

          case 'user_online': {
            const { user_id } = data.payload as UserPresencePayload;
            console.log('[WebSocket] User online:', user_id);
            setOnlineUsers((prev) => new Set(prev).add(user_id));
            break;
          }

          case 'user_offline': {
            const { user_id } = data.payload as UserPresencePayload;
            console.log('[WebSocket] User offline:', user_id);
            setOnlineUsers((prev) => {
              const next = new Set(prev);
              next.delete(user_id);
              return next;
            });
            break;
          }

          case 'typing': {
            const { conversation_id, user_id, is_typing } = data.payload as TypingPayload;
            console.log('[WebSocket] Typing:', conversation_id, user_id, is_typing);

            // Create unique key for timeout tracking
            const timeoutKey = `${conversation_id}-${user_id}`;

            // Clear existing timeout for this user in this conversation
            const existingTimeout = typingTimeoutsRef.current.get(timeoutKey);
            if (existingTimeout) {
              clearTimeout(existingTimeout);
              typingTimeoutsRef.current.delete(timeoutKey);
            }

            if (is_typing) {
              // Add user to typing set
              setTypingUsers((prev) => {
                const next = new Map(prev);
                const usersInConv = next.get(conversation_id) || new Set<number>();
                usersInConv.add(user_id);
                next.set(conversation_id, usersInConv);
                return next;
              });

              // Auto-clear after 3 seconds (matches frontend timeout)
              const timeout = setTimeout(() => {
                setTypingUsers((prev) => {
                  const next = new Map(prev);
                  const usersInConv = next.get(conversation_id);
                  if (usersInConv) {
                    usersInConv.delete(user_id);
                    if (usersInConv.size === 0) {
                      next.delete(conversation_id);
                    } else {
                      next.set(conversation_id, usersInConv);
                    }
                  }
                  return next;
                });
                // Clean up Map entry to prevent memory leak
                typingTimeoutsRef.current.delete(timeoutKey);
              }, 3000);

              typingTimeoutsRef.current.set(timeoutKey, timeout);
            } else {
              // Remove user from typing set
              setTypingUsers((prev) => {
                const next = new Map(prev);
                const usersInConv = next.get(conversation_id);
                if (usersInConv) {
                  usersInConv.delete(user_id);
                  if (usersInConv.size === 0) {
                    next.delete(conversation_id);
                  } else {
                    next.set(conversation_id, usersInConv);
                  }
                }
                return next;
              });
            }
            break;
          }

          case 'feature_flag_updated': {
            const { key, enabled, percentage } = data.payload as FeatureFlagUpdatedPayload;
            console.log('[WebSocket] Feature flag updated:', key, enabled, percentage);
            window.dispatchEvent(
              new CustomEvent('feature-flag-updated', {
                detail: { key, enabled, percentage },
              })
            );
            break;
          }

          case 'reaction_added': {
            const { message_id, conversation_id, reaction } =
              data.payload as WsReactionAddedPayload;
            console.log('[WebSocket] Reaction added:', message_id, reaction.emoji);
            queryClient.setQueryData<GetReactionsResponse>(
              ['message-reactions', message_id],
              (old) => {
                const isMe = reaction.user_id === user?.id;

                if (!old) {
                  // Query not yet populated — seed the cache so the event isn't lost.
                  // The component's own fetch will overwrite this entry once it resolves.
                  return {
                    reactions: [
                      {
                        emoji: reaction.emoji,
                        count: 1,
                        user_ids: [reaction.user_id],
                        usernames: reaction.username ? [reaction.username] : [],
                        user_reacted: isMe,
                        my_reaction_id: isMe ? reaction.id : undefined,
                      },
                    ],
                    total_unique_emoji: 1,
                    users_truncated: false,
                  };
                }
                const idx = old.reactions.findIndex((r) => r.emoji === reaction.emoji);
                if (idx === -1) {
                  return {
                    ...old,
                    reactions: [
                      ...old.reactions,
                      {
                        emoji: reaction.emoji,
                        count: 1,
                        user_ids: [reaction.user_id],
                        usernames: reaction.username ? [reaction.username] : [],
                        user_reacted: isMe,
                        my_reaction_id: isMe ? reaction.id : undefined,
                      },
                    ],
                    total_unique_emoji: old.total_unique_emoji + 1,
                  };
                }
                const updated = [...old.reactions];
                updated[idx] = {
                  ...updated[idx],
                  count: updated[idx].count + 1,
                  user_ids: [...updated[idx].user_ids, reaction.user_id],
                  usernames: reaction.username
                    ? [...updated[idx].usernames, reaction.username]
                    : updated[idx].usernames,
                  user_reacted: isMe ? true : updated[idx].user_reacted,
                  my_reaction_id: isMe ? reaction.id : updated[idx].my_reaction_id,
                };
                return { ...old, reactions: updated };
              }
            );
            // Flip has_reactions on the message so <MessageReactions> mounts for
            // conversations where this message previously had zero reactions.
            queryClient.setQueryData<InfiniteData<{ messages: Message[]; next_cursor?: string }>>(
              ['messages', conversation_id],
              (old) => {
                if (!old) return old;
                return {
                  ...old,
                  pages: old.pages.map((page) => ({
                    ...page,
                    messages: page.messages.map((msg) =>
                      msg.id === message_id ? { ...msg, has_reactions: true } : msg
                    ),
                  })),
                };
              }
            );
            window.dispatchEvent(
              new CustomEvent<WsReactionAddedPayload>('reaction-added', {
                detail: data.payload as WsReactionAddedPayload,
              })
            );
            break;
          }

          case 'reaction_removed': {
            const { message_id, user_id, emoji } = data.payload as WsReactionRemovedPayload;
            console.log('[WebSocket] Reaction removed:', message_id, emoji);
            queryClient.setQueryData<GetReactionsResponse>(
              ['message-reactions', message_id],
              (old) => {
                if (!old) return old;
                const isMe = user_id === user?.id;
                const reactions = old.reactions
                  .map((r) => {
                    if (r.emoji !== emoji) return r;
                    const newCount = r.count - 1;
                    if (newCount === 0) return null;
                    const userIdx = r.user_ids.indexOf(user_id);
                    return {
                      ...r,
                      count: newCount,
                      user_ids: r.user_ids.filter((id) => id !== user_id),
                      usernames:
                        userIdx >= 0 ? r.usernames.filter((_, i) => i !== userIdx) : r.usernames,
                      user_reacted: isMe ? false : r.user_reacted,
                      my_reaction_id: isMe ? undefined : r.my_reaction_id,
                    };
                  })
                  .filter(Boolean) as GetReactionsResponse['reactions'];
                return { ...old, reactions, total_unique_emoji: reactions.length };
              }
            );
            window.dispatchEvent(
              new CustomEvent<WsReactionRemovedPayload>('reaction-removed', {
                detail: data.payload as WsReactionRemovedPayload,
              })
            );
            break;
          }

          case 'message_auto_deleted': {
            const { message_id, conversation_id } = data.payload as {
              message_id: number;
              conversation_id: number;
            };
            queryClient.setQueryData<
              InfiniteData<{ messages: Message[]; next_cursor?: string }> | undefined
            >(['messages', conversation_id], (prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                pages: prev.pages.map((page) => ({
                  ...page,
                  messages: page.messages.filter((msg) => msg.id !== message_id),
                })),
              };
            });
            break;
          }

          case 'message_tombstoned': {
            // The message had replies and was scrubbed in-place (not removed).
            // Update the cached message to show the "[deleted]" placeholder so the
            // reply thread stays coherent for the recipient.
            const { message_id, conversation_id, message_type, content } = data.payload as {
              message_id: number;
              conversation_id: number;
              message_type: string;
              content: string;
            };
            queryClient.setQueryData<
              InfiniteData<{ messages: Message[]; next_cursor?: string }> | undefined
            >(['messages', conversation_id], (prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                pages: prev.pages.map((page) => ({
                  ...page,
                  messages: page.messages.map((msg) =>
                    msg.id === message_id
                      ? {
                          ...msg,
                          message_type: message_type as Message['message_type'],
                          encrypted_content: content,
                          sender_encrypted_content: null,
                        }
                      : msg
                  ),
                })),
              };
            });
            break;
          }

          case 'message_pinned': {
            const payload = data.payload as WsMessagePinEvent;
            window.dispatchEvent(
              new CustomEvent<WsMessagePinEvent>('message-pinned', {
                detail: payload,
              })
            );
            break;
          }

          case 'message_unpinned': {
            const payload = data.payload as WsMessagePinEvent;
            window.dispatchEvent(
              new CustomEvent<WsMessagePinEvent>('message-unpinned', {
                detail: payload,
              })
            );
            break;
          }

          case 'call_incoming':
          case 'call_answered':
          case 'call_rejected':
          case 'call_ended':
          case 'call_signal':
          case 'screen_share_started':
          case 'screen_share_stopped': {
            window.dispatchEvent(
              new CustomEvent('ws-call-event', {
                detail: { type: data.type, payload: data.payload },
              })
            );
            break;
          }

          case 'omnichat_token': {
            // Streamed token from an in-progress OmniChat generation — the chat
            // page owns its own streaming buffer, so just forward it as an event
            // rather than writing every token into the query cache.
            window.dispatchEvent(
              new CustomEvent('omnichat-token', {
                detail: data.payload as { conversation_id: number; token: string },
              })
            );
            break;
          }

          case 'omnichat_message_complete': {
            // Final assistant message for an OmniChat conversation — append it to
            // the cached message list (if loaded) and let the chat page clear its
            // streaming buffer via the forwarded event.
            const message = data.payload as BotMessage;
            queryClient.setQueryData<BotConversationDetail | undefined>(
              ['omnichat', 'conversation', message.conversation_id],
              (prev) => {
                if (!prev) return prev;
                if (prev.messages.some((m) => m.id === message.id)) return prev;
                return { ...prev, messages: [...prev.messages, message] };
              }
            );
            queryClient.invalidateQueries({ queryKey: ['omnichat', 'conversations'] });
            window.dispatchEvent(
              new CustomEvent('omnichat-message-complete', { detail: message })
            );
            break;
          }

          case 'friend_request': {
            // Someone sent us a friend request — invalidate so the badge and
            // incoming list update immediately without waiting for the 30s poll.
            queryClient.invalidateQueries({ queryKey: friendsQueryKeys.requests });
            break;
          }

          case 'friend_request_accepted': {
            // A pending request was accepted — update requests, friends list, and
            // all per-user status caches so profile pages reflect the new state
            // immediately without waiting for the 60-second stale window to expire.
            queryClient.invalidateQueries({ queryKey: friendsQueryKeys.requests });
            queryClient.invalidateQueries({ queryKey: friendsQueryKeys.friends });
            queryClient.invalidateQueries({ queryKey: ['friends', 'status'] });
            break;
          }

          default:
            console.log('[WebSocket] Unknown message type:', data.type);
        }
      } catch (err) {
        console.error('[WebSocket] Failed to process message:', err);
      }
    },
    [queryClient, user?.id]
  );

  // WebSocket connection management
  useEffect(() => {
    if (!user?.id) {
      setIsConnected(false);
      setConnectionState('idle');
      return;
    }

    isCleanupRef.current = false;
    const typingTimeouts = typingTimeoutsRef.current;

    const connect = async () => {
      console.log('[WebSocket] Connecting...');
      setConnectionState(reconnectAttemptsRef.current > 0 ? 'reconnecting' : 'connecting');
      const connectionId = activeConnectionIdRef.current + 1;
      activeConnectionIdRef.current = connectionId;
      let wsToken: string;
      try {
        const response = await api.post<{ ws_token: string }>('/auth/ws-token');
        wsToken = response.ws_token;
      } catch (error) {
        console.warn('[WebSocket] Failed to fetch WebSocket token; skipping connect', error);
        setIsConnected(false);
        setConnectionState('reconnecting');
        if (!isCleanupRef.current) {
          reconnectAttemptsRef.current += 1;
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current - 1), 30000);
          reconnectTimerRef.current = setTimeout(connect, delay);
        }
        return;
      }
      if (isCleanupRef.current) return;

      const url = new URL(API_BASE_URL);
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      url.pathname = `${url.pathname.replace(/\/$/, '')}/ws`;
      url.searchParams.set('token', wsToken);

      const socket = new WebSocket(url.toString());
      wsRef.current = socket;
      let hasOpened = false;
      const isStaleSocket = () => wsRef.current !== socket || activeConnectionIdRef.current !== connectionId;

      socket.onopen = () => {
        if (isStaleSocket()) {
          socket.close();
          return;
        }
        hasOpened = true;
        setIsConnected(true);
        setConnectionState('connected');
        // Reset reconnection attempts on successful connection
        reconnectAttemptsRef.current = 0;
        console.log('[WebSocket] Connected successfully');

        // Refetch conversations after reconnection to get latest state
        queryClient.invalidateQueries({ queryKey: ['conversations'] });
      };

      socket.onmessage = (event) => {
        if (isStaleSocket()) {
          return;
        }
        handleMessage(event);
      };

      socket.onclose = () => {
        if (isStaleSocket()) {
          return;
        }
        setIsConnected(false);
        setConnectionState('reconnecting');
        console.log('[WebSocket] Disconnected');

        if (isCleanupRef.current) return;
        // Exponential backoff: 1s, 2s, 4s, 8s, 16s, max 30s.
        // Reconnect even if the socket never opened, so refreshed tokens can recover long-lived sessions.
        reconnectAttemptsRef.current += 1;
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current - 1), 30000);
        console.log(
          `[WebSocket] Reconnecting in ${delay / 1000} seconds... (attempt ${reconnectAttemptsRef.current}, opened=${hasOpened})`
        );
        reconnectTimerRef.current = setTimeout(connect, delay);
      };

      socket.onerror = (error) => {
        if (isStaleSocket()) {
          return;
        }
        if (!isCleanupRef.current) {
          console.error('[WebSocket] Error:', error);
        }
      };
    };

    connect();

    return () => {
      console.log('[WebSocket] Cleaning up...');
      isCleanupRef.current = true;
      setIsConnected(false);
      setConnectionState('idle');
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      const socket = wsRef.current;
      wsRef.current = null;
      activeConnectionIdRef.current += 1;
      if (socket) {
        socket.close();
      }
      // Clear all typing timeouts
      typingTimeouts.forEach(clearTimeout);
      typingTimeouts.clear();
    };
  }, [user?.id, handleMessage, queryClient]);

  const value: WebSocketContextType = {
    isConnected,
    connectionState,
    sendTypingIndicator,
    onlineUsers,
    isUserOnline,
    typingUsers,
    getTypingUsers,
  };

  return <WebSocketContext.Provider value={value}>{children}</WebSocketContext.Provider>;
}

export function useWebSocket() {
  const context = useContext(WebSocketContext);
  if (context === undefined) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
}
