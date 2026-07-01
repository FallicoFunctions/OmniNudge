import { api } from '../lib/api';
import type {
  BotConversation,
  BotConversationDetail,
  BotMessage,
  BotPersona,
  PersonaCategory,
} from '../types/omnichat';

export const omnichatService = {
  async listPersonas(category?: PersonaCategory): Promise<BotPersona[]> {
    const query = category ? `?category=${encodeURIComponent(category)}` : '';
    const res = await api.get<{ personas: BotPersona[] }>(`/omnichat/personas${query}`);
    return res.personas;
  },

  async listConversations(): Promise<BotConversation[]> {
    const res = await api.get<{ conversations: BotConversation[] }>('/omnichat/conversations');
    return res.conversations ?? [];
  },

  async createConversation(personaId: number, title?: string): Promise<BotConversation> {
    return api.post<BotConversation>('/omnichat/conversations', {
      persona_id: personaId,
      title,
    });
  },

  async getConversation(conversationId: number): Promise<BotConversationDetail> {
    return api.get<BotConversationDetail>(`/omnichat/conversations/${conversationId}`);
  },

  async sendMessage(conversationId: number, content: string): Promise<BotMessage> {
    return api.post<BotMessage>(`/omnichat/conversations/${conversationId}/messages`, {
      content,
    });
  },
};

export const omnichatQueryKeys = {
  personas: (category?: PersonaCategory) => ['omnichat', 'personas', category ?? 'all'] as const,
  conversations: ['omnichat', 'conversations'] as const,
  conversation: (id: number) => ['omnichat', 'conversation', id] as const,
};
