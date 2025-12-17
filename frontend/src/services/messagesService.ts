import { api } from '../lib/api';
import type { Conversation, Message, SendMessageRequest } from '../types/messages';
import type { UserProfile } from '../types/users';

async function fetchUserByUsername(username: string): Promise<UserProfile> {
  return api.get<UserProfile>(`/users/${username}`);
}

async function ensureConversationId(data: SendMessageRequest): Promise<number> {
  if (data.conversation_id) {
    return data.conversation_id;
  }

  if (!data.recipient_username) {
    throw new Error('Recipient username is required to start a conversation');
  }

  const user = await fetchUserByUsername(data.recipient_username);
  const conversation = await api.post<Conversation>('/conversations', {
    other_user_id: user.id,
  });

  return conversation.id;
}

export const messagesService = {
  async getConversations(): Promise<Conversation[]> {
    const response = await api.get<{ conversations: Conversation[] }>('/conversations');
    return response.conversations;
  },

  async getConversation(id: number): Promise<Conversation> {
    return api.get<Conversation>(`/conversations/${id}`);
  },

  async getMessages(conversationId: number): Promise<Message[]> {
    const response = await api.get<{ messages: Message[] }>(
      `/conversations/${conversationId}/messages`
    );
    return response.messages;
  },

  async sendMessage(data: SendMessageRequest): Promise<Message> {
    const conversationId = await ensureConversationId(data);

    return api.post<Message>('/messages', {
      conversation_id: conversationId,
      encrypted_content: data.content,
      message_type: data.media_file_id ? 'image' : 'text',
      media_file_id: data.media_file_id,
      encryption_version: 'v1',
    });
  },

  async markAsRead(conversationId: number): Promise<void> {
    await api.post(`/conversations/${conversationId}/read`, {});
  },
};
