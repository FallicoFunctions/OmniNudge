import { api } from '../lib/api';
import type { Conversation, Message, SendMessageRequest } from '../types/messages';

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
    return api.post<Message>('/messages', data);
  },

  async markAsRead(conversationId: number): Promise<void> {
    await api.post(`/conversations/${conversationId}/read`, {});
  },
};
