import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { messagesService } from '../services/messagesService';
import { mediaService } from '../services/mediaService';
import { useAuth } from '../contexts/AuthContext';
import { useMessagingContext } from '../contexts/MessagingContext';
import type { Conversation, SendMessageRequest } from '../types/messages';

export default function MessagesPage() {
  const { user } = useAuth();
  const { setActiveConversationId } = useMessagingContext();
  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);
  const [messageText, setMessageText] = useState('');
  const [newChatUsername, setNewChatUsername] = useState('');
  const [isCreatingChat, setIsCreatingChat] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const toUsernameParam = searchParams.get('to');
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      setMessageText('');
      setSelectedFile(null);
      if (!variables.conversation_id && variables.recipient_username) {
        setSelectedConversationId(message.conversation_id);
        setIsCreatingChat(false);
        setNewChatUsername('');
      }
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/quicktime', 'video/webm'];
      if (!validTypes.includes(file.type)) {
        alert('Invalid file type. Please select an image or video.');
        return;
      }
      // Validate file size (25MB)
      if (file.size > 25 * 1024 * 1024) {
        alert('File too large. Maximum size is 25MB.');
        return;
      }
      setSelectedFile(file);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedMessage = messageText.trim();
    if (!trimmedMessage && !selectedFile) return;

    try {
      let mediaFileId: number | undefined;

      // Upload media first if selected
      if (selectedFile) {
        setUploadingMedia(true);
        const uploadedMedia = await uploadMediaMutation.mutateAsync(selectedFile);
        mediaFileId = uploadedMedia.id;
        setUploadingMedia(false);
      }

      if (isCreatingChat) {
        const recipient = newChatUsername.trim();
        if (!recipient) return;
        sendMessageMutation.mutate({
          recipient_username: recipient,
          content: trimmedMessage || '📎 Media',
          media_file_id: mediaFileId,
        });
        return;
      }

      if (selectedConversationId) {
        sendMessageMutation.mutate({
          conversation_id: selectedConversationId,
          content: trimmedMessage || '📎 Media',
          media_file_id: mediaFileId,
        });
      }
    } catch (error) {
      setUploadingMedia(false);
      console.error('Failed to send message:', error);
      alert('Failed to upload media. Please try again.');
    }
  };

  const selectedConversation = conversations?.find((c) => c.id === selectedConversationId);
  const orderedMessages = useMemo(() => (messages ? [...messages].reverse() : []), [messages]);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const scrollToLatestMessage = useCallback(() => {
    const container = messagesContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, []);

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
    scrollToLatestMessage();
  }, [selectedConversationId, isCreatingChat, loadingMessages, scrollToLatestMessage, messages]);

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
                setSelectedFile(null);
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
                setSelectedFile(null);
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
            <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4">
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
                        {message.media_file_id && message.media_url && (
                          <div className="mb-2">
                            {message.message_type === 'image' ? (
                              <img
                                src={`http://localhost:8080${message.media_url}`}
                                alt="Shared media"
                                className="max-w-full rounded cursor-pointer"
                                onClick={() => window.open(`http://localhost:8080${message.media_url}`, '_blank')}
                              />
                            ) : message.message_type === 'video' ? (
                              <video
                                src={`http://localhost:8080${message.media_url}`}
                                controls
                                className="max-w-full rounded"
                              />
                            ) : null}
                          </div>
                        )}
                        {message.encrypted_content !== '📎 Media' && (
                          <p className="text-sm">{message.encrypted_content}</p>
                        )}
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

              {selectedFile && (
                <div className="mb-2 flex items-center gap-2 rounded-md bg-[var(--color-surface-elevated)] p-2">
                  <span className="text-sm text-[var(--color-text-secondary)]">
                    📎 {selectedFile.name}
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
                  accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm"
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-surface)]"
                  title="Attach image or video"
                >
                  📎
                </button>
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
  );
}
