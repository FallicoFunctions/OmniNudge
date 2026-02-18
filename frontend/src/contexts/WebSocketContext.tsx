import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from './AuthContext';
import { API_BASE_URL } from '../lib/api';
import type { InfiniteData } from '@tanstack/react-query';
import type { Message, Conversation, WsMessagePinEvent } from '../types/messages';
import type { GetReactionsResponse, WsReactionAddedPayload, WsReactionRemovedPayload } from '../types/reactions';

interface WebSocketMessage {
  type: string;
  payload: any;
}

interface WebSocketContextType {
  // Connection state
  isConnected: boolean;

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
  const [onlineUsers, setOnlineUsers] = useState<Set<number>>(new Set());
  const [typingUsers, setTypingUsers] = useState<Map<number, Set<number>>>(new Map());
  const typingTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const reconnectTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const reconnectAttemptsRef = useRef(0);
  const isCleanupRef = useRef(false);
  const recentMessageIdsRef = useRef<Set<number>>(new Set());

  // Send WebSocket message
  const sendMessage = useCallback((type: string, payload: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, payload }));
      console.log('[WebSocket] Sent:', type, payload);
    } else {
      console.warn('[WebSocket] Cannot send, not connected:', type);
    }
  }, []);

  // Public API: Send typing indicator
  const sendTypingIndicator = useCallback((
    conversationId: number,
    recipientId: number,
    isTyping: boolean
  ) => {
    sendMessage('typing', {
      conversation_id: conversationId,
      recipient_id: recipientId,
      is_typing: isTyping,
    });
  }, [sendMessage]);

  // Check if user is online
  const isUserOnline = useCallback((userId: number) => {
    return onlineUsers.has(userId);
  }, [onlineUsers]);

  // Get typing users in conversation
  const getTypingUsers = useCallback((conversationId: number) => {
    return typingUsers.get(conversationId) || new Set<number>();
  }, [typingUsers]);

  // Handle incoming WebSocket messages
  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const data: WebSocketMessage = JSON.parse(event.data);
      console.log('[WebSocket] Received:', data.type);

      switch (data.type) {
        case 'initial_state': {
          const { online_users } = data.payload;
          console.log('[WebSocket] Initial state - online users:', online_users);
          setOnlineUsers(new Set(online_users || []));
          break;
        }

        case 'new_message': {
          const message: Message = data.payload;
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

          // Update messages cache
          queryClient.setQueryData<Message[] | undefined>(
            ['messages', message.conversation_id],
            (prev) => {
              if (!prev) return [message];
              if (prev.some((msg) => msg.id === message.id)) return prev;
              return [message, ...prev];
            }
          );

          // Update conversation list
          const updateConversations = (key: (string | number)[]) => {
            queryClient.setQueryData<Conversation[] | undefined>(key, (prev) => {
              if (!prev) return prev;
              return prev.map((conv) => {
                if (conv.id !== message.conversation_id) return conv;
                const isRecipient = message.recipient_id === user?.id;
                return {
                  ...conv,
                  latest_message: message,
                  last_message_at: message.sent_at,
                  unread_count: isRecipient ? conv.unread_count + 1 : conv.unread_count,
                };
              });
            });
          };

          updateConversations(['conversations']);
          updateConversations(['conversations', 'all']);

          // Dispatch custom event for notification sound
          window.dispatchEvent(new CustomEvent('new-message', {
            detail: {
              conversationId: message.conversation_id,
              senderId: message.sender_id
            }
          }));
          break;
        }

        case 'message_delivered': {
          const { message_id, conversation_id, delivered_at } = data.payload;
          console.log('[WebSocket] Message delivered:', message_id);

          // Update message to show delivered status
          queryClient.setQueryData<Message[] | undefined>(
            ['messages', conversation_id],
            (prev) => {
              if (!prev) return prev;
              return prev.map((msg) =>
                msg.id === message_id
                  ? { ...msg, delivered_at: delivered_at || new Date().toISOString() }
                  : msg
              );
            }
          );
          break;
        }

        case 'message_read': {
          const { message_id, conversation_id, read_at } = data.payload;
          console.log('[WebSocket] Message read:', message_id);

          // Update message to show read status
          queryClient.setQueryData<Message[] | undefined>(
            ['messages', conversation_id],
            (prev) => {
              if (!prev) return prev;
              return prev.map((msg) =>
                msg.id === message_id
                  ? { ...msg, read_at: read_at || new Date().toISOString() }
                  : msg
              );
            }
          );
          break;
        }

        case 'conversation_read': {
          const { conversation_id } = data.payload;
          console.log('[WebSocket] Conversation read:', conversation_id);

          // Mark all messages in conversation as read
          const now = new Date().toISOString();
          queryClient.setQueryData<Message[] | undefined>(
            ['messages', conversation_id],
            (prev) => {
              if (!prev) return prev;
              return prev.map((msg) => ({
                ...msg,
                read_at: msg.read_at || now,
              }));
            }
          );

          // Update conversation unread count
          const updateConversations = (key: (string | number)[]) => {
            queryClient.setQueryData<Conversation[] | undefined>(key, (prev) => {
              if (!prev) return prev;
              return prev.map((conv) =>
                conv.id === conversation_id
                  ? { ...conv, unread_count: 0 }
                  : conv
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
          window.dispatchEvent(new CustomEvent('conversation-unarchived', {
            detail: data.payload,
          }));
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

          queryClient.setQueryData<InfiniteData<{ messages: Message[]; next_cursor?: string }> | undefined>(
            ['messages', conversation_id],
            (prev) => {
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
            }
          );

          window.dispatchEvent(
            new CustomEvent('message-edited', {
              detail: data.payload,
            })
          );
          break;
        }

        case 'user_online': {
          const { user_id } = data.payload;
          console.log('[WebSocket] User online:', user_id);
          setOnlineUsers((prev) => new Set(prev).add(user_id));
          break;
        }

        case 'user_offline': {
          const { user_id } = data.payload;
          console.log('[WebSocket] User offline:', user_id);
          setOnlineUsers((prev) => {
            const next = new Set(prev);
            next.delete(user_id);
            return next;
          });
          break;
        }

        case 'typing': {
          const { conversation_id, user_id, is_typing } = data.payload;
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
          const { key, enabled, percentage } = data.payload;
          console.log('[WebSocket] Feature flag updated:', key, enabled, percentage);
          window.dispatchEvent(new CustomEvent('feature-flag-updated', {
            detail: { key, enabled, percentage }
          }));
          break;
        }

        case 'moderation_report_created':
        case 'moderation_report_updated': {
          console.log('[WebSocket] Moderation report event:', data.type, data.payload);
          queryClient.invalidateQueries({ queryKey: ['modReports'] });
          queryClient.invalidateQueries({ queryKey: ['adminStats'] });
          break;
        }

        case 'reaction_added': {
          const { message_id, conversation_id, reaction } = data.payload as WsReactionAddedPayload;
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
            },
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
                    msg.id === message_id ? { ...msg, has_reactions: true } : msg,
                  ),
                })),
              };
            },
          );
          window.dispatchEvent(new CustomEvent<WsReactionAddedPayload>('reaction-added', {
            detail: data.payload as WsReactionAddedPayload,
          }));
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
                      userIdx >= 0
                        ? r.usernames.filter((_, i) => i !== userIdx)
                        : r.usernames,
                    user_reacted: isMe ? false : r.user_reacted,
                    my_reaction_id: isMe ? undefined : r.my_reaction_id,
                  };
                })
                .filter(Boolean) as GetReactionsResponse['reactions'];
              return { ...old, reactions, total_unique_emoji: reactions.length };
            },
          );
          window.dispatchEvent(new CustomEvent<WsReactionRemovedPayload>('reaction-removed', {
            detail: data.payload as WsReactionRemovedPayload,
          }));
          break;
        }

        case 'message_pinned': {
          const payload = data.payload as WsMessagePinEvent;
          window.dispatchEvent(new CustomEvent<WsMessagePinEvent>('message-pinned', {
            detail: payload,
          }));
          break;
        }

        case 'message_unpinned': {
          const payload = data.payload as WsMessagePinEvent;
          window.dispatchEvent(new CustomEvent<WsMessagePinEvent>('message-unpinned', {
            detail: payload,
          }));
          break;
        }

        default:
          console.log('[WebSocket] Unknown message type:', data.type);
      }
    } catch (err) {
      console.error('[WebSocket] Failed to process message:', err);
    }
  }, [queryClient, user?.id]);

  // WebSocket connection management
  useEffect(() => {
    if (!user?.id) return;

    isCleanupRef.current = false;

    const connect = () => {
      const token = localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token');
      if (!token) {
        console.warn('[WebSocket] No auth token available for connection attempt');
        return;
      }
      console.log('[WebSocket] Connecting...');
      const url = new URL(API_BASE_URL);
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      url.pathname = `${url.pathname.replace(/\/$/, '')}/ws`;
      url.searchParams.set('token', token);

      const socket = new WebSocket(url.toString());
      wsRef.current = socket;
      let hasOpened = false;

      socket.onopen = () => {
        hasOpened = true;
        setIsConnected(true);
        // Reset reconnection attempts on successful connection
        reconnectAttemptsRef.current = 0;
        console.log('[WebSocket] Connected successfully');

        // Refetch conversations after reconnection to get latest state
        queryClient.invalidateQueries({ queryKey: ['conversations'] });
      };

      socket.onmessage = handleMessage;

      socket.onclose = () => {
        setIsConnected(false);
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
        if (!isCleanupRef.current) {
          console.error('[WebSocket] Error:', error);
        }
      };
    };

    connect();

    return () => {
      console.log('[WebSocket] Cleaning up...');
      isCleanupRef.current = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
      // Clear all typing timeouts
      typingTimeoutsRef.current.forEach(clearTimeout);
      typingTimeoutsRef.current.clear();
    };
  }, [user?.id, handleMessage, queryClient]);

  const value: WebSocketContextType = {
    isConnected,
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
