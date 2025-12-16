import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { messagesService } from '../services/messagesService';
import { useAuth } from '../contexts/AuthContext';
import type { Conversation, Message, SendMessageRequest } from '../types/messages';
import { API_BASE_URL } from '../lib/api';

export default function MessagesPage() {
  const { user } = useAuth();
  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);
  const [messageText, setMessageText] = useState('');
  const [newChatUsername, setNewChatUsername] = useState('');
  const [isCreatingChat, setIsCreatingChat] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const toUsernameParam = searchParams.get('to');

  const { data: conversations, isLoading: loadingConversations } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => messagesService.getConversations(),
  });

  const { data: messages, isLoading: loadingMessages } = useQuery({
    queryKey: ['messages', selectedConversationId],
    queryFn: () => messagesService.getMessages(selectedConversationId!),
    enabled: !!selectedConversationId,
    refetchOnWindowFocus: false,
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
      setMessageText('');
      if (!variables.conversation_id && variables.recipient_username) {
        setSelectedConversationId(message.conversation_id);
        setIsCreatingChat(false);
        setNewChatUsername('');
      }
    },
  });

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedMessage = messageText.trim();
    if (!trimmedMessage) return;

    if (isCreatingChat) {
      const recipient = newChatUsername.trim();
      if (!recipient) return;
      sendMessageMutation.mutate({
        recipient_username: recipient,
        content: trimmedMessage,
      });
      return;
    }

    if (selectedConversationId) {
      sendMessageMutation.mutate({
        conversation_id: selectedConversationId,
        content: trimmedMessage,
      });
    }
  };

  const selectedConversation = conversations?.find((c) => c.id === selectedConversationId);
  const orderedMessages = messages ? [...messages].reverse() : [];

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
      } catch (error) {
        console.error('Failed to mark conversation as read', error);
      }
    },
    [queryClient]
  );

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
            queryClient.setQueryData<Message[] | undefined>(
              ['messages', payload.conversation_id],
              (prev) => {
                if (!prev) return [payload];
                if (prev.some((msg) => msg.id === payload.id)) return prev;
                return [payload, ...prev];
              }
            );
            queryClient.setQueryData<Conversation[] | undefined>(['conversations'], (prev) => {
              if (!prev) return prev;
              return prev.map((conv) => {
                if (conv.id !== payload.conversation_id) {
                  return conv;
                }
                const isRecipient = payload.recipient_id === user?.id;
                const isActive = isRecipient && selectedConversationId === payload.conversation_id;
                const nextUnread = isRecipient
                  ? isActive
                    ? 0
                    : conv.unread_count + 1
                  : conv.unread_count;
                return {
                  ...conv,
                  latest_message: payload,
                  unread_count: nextUnread,
                };
              });
            });
            if (
              selectedConversationId === payload.conversation_id &&
              payload.recipient_id === user?.id
            ) {
              markConversationAsRead(payload.conversation_id);
            }
          }
        } catch (err) {
          console.error('Failed to process WebSocket message', err);
        }
      };

      socket.onclose = () => {
        reconnectTimer = setTimeout(connect, 5000);
      };

      socket.onerror = () => {
        socket.close();
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
  }, [user?.id, queryClient, markConversationAsRead, selectedConversationId]);

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

  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-6xl gap-4 px-4 py-8">
      {/* Conversations List */}
      <div className="w-80 flex-shrink-0 overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="border-b border-[var(--color-border)] p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">Messages</h2>
            <button
              onClick={() => {
                setIsCreatingChat(true);
                setSelectedConversationId(null);
                setNewChatUsername('');
                setMessageText('');
              }}
              className="rounded-md bg-[var(--color-primary)] px-3 py-1 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)]"
            >
              New Chat
            </button>
          </div>
        </div>

        <div className="overflow-y-auto" style={{ height: 'calc(100% - 65px)' }}>
          {loadingConversations && (
            <div className="p-4 text-center text-sm text-[var(--color-text-secondary)]">
              Loading...
            </div>
          )}

          {conversations?.map((conversation) => (
            <button
              key={conversation.id}
              onClick={() => {
                setSelectedConversationId(conversation.id);
                setIsCreatingChat(false);
                setNewChatUsername('');
              }}
              className={`w-full border-b border-[var(--color-border)] p-4 text-left transition-colors ${
                selectedConversationId === conversation.id
                  ? 'bg-[var(--color-surface-elevated)]'
                  : 'hover:bg-[var(--color-surface-elevated)]'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-[var(--color-text-primary)]">
                  {conversation.other_user?.username || 'Unknown'}
                </span>
                {conversation.unread_count > 0 && conversation.id !== selectedConversationId && (
                  <span className="rounded-full bg-[var(--color-primary)] px-2 py-0.5 text-xs text-white">
                    {conversation.unread_count}
                  </span>
                )}
              </div>
              {conversation.latest_message && (
                <p className="mt-1 truncate text-sm text-[var(--color-text-secondary)]">
                  {conversation.latest_message?.encrypted_content}
                </p>
              )}
            </button>
          ))}

          {conversations?.length === 0 && (
            <div className="p-4 text-center text-sm text-[var(--color-text-secondary)]">
              No conversations yet. Start a new chat!
            </div>
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex flex-1 flex-col overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
        {selectedConversationId || isCreatingChat ? (
          <>
            {/* Chat Header */}
            <div className="border-b border-[var(--color-border)] p-4">
              <h3 className="font-semibold text-[var(--color-text-primary)]">
                {isCreatingChat
                  ? 'New Chat'
                  : selectedConversation?.other_user?.username || 'Unknown'}
              </h3>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4">
              {isCreatingChat ? (
                <div className="text-center text-sm text-[var(--color-text-secondary)]">
                  Enter a username and message to start a conversation
                </div>
              ) : loadingMessages ? (
                <div className="text-center text-sm text-[var(--color-text-secondary)]">
                  Loading messages...
                </div>
              ) : (
                <div className="space-y-3">
                  {orderedMessages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${message.sender_id === user?.id ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-md rounded-lg px-4 py-2 ${
                          message.sender_id === user?.id
                            ? 'bg-[var(--color-primary)] text-white'
                            : 'bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)]'
                        }`}
                      >
                        <p className="text-sm">{message.encrypted_content}</p>
                        <span
                          className={`mt-1 block text-xs ${
                            message.sender_id === user?.id
                              ? 'text-white/70'
                              : 'text-[var(--color-text-muted)]'
                          }`}
                        >
                          {new Date(message.sent_at).toLocaleTimeString()}
                        </span>
                      </div>
                    </div>
                  ))}

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

              <form onSubmit={handleSendMessage} className="flex gap-2">
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
                    sendMessageMutation.isPending || (isCreatingChat && !newChatUsername.trim())
                  }
                  className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)] disabled:opacity-50"
                >
                  Send
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
  );
}
