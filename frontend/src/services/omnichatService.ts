import { api } from '../lib/api';
import type {
  AnonymousMessageRequest,
  AnonymousMessageResponse,
  BotConversation,
  BotConversationDetail,
  BotMessage,
  BotPersona,
  ConversationSettings,
  PersonaCategory,
} from '../types/omnichat';

export const omnichatService = {
  async listPersonas(category?: PersonaCategory): Promise<BotPersona[]> {
    const query = category ? `?category=${encodeURIComponent(category)}` : '';
    const res = await api.get<{ personas: BotPersona[] }>(`/omnichat/personas${query}`);
    return res.personas;
  },

  async listConversations(personaId?: number): Promise<BotConversation[]> {
    const query = personaId ? `?persona_id=${personaId}` : '';
    const res = await api.get<{ conversations: BotConversation[] }>(`/omnichat/conversations${query}`);
    return res.conversations ?? [];
  },

  async createConversation(
    personaId: number,
    title?: string,
    forceNew?: boolean,
    settings?: ConversationSettings,
  ): Promise<BotConversation> {
    return api.post<BotConversation>('/omnichat/conversations', {
      persona_id: personaId,
      title,
      force_new: forceNew,
      settings,
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

  async updateSettings(conversationId: number, settings: ConversationSettings): Promise<void> {
    await api.put(`/omnichat/conversations/${conversationId}/settings`, { settings });
  },

  async forkConversation(conversationId: number): Promise<BotConversation> {
    return api.post<BotConversation>(`/omnichat/conversations/${conversationId}/fork`);
  },

  async deleteConversation(conversationId: number): Promise<void> {
    await api.delete(`/omnichat/conversations/${conversationId}`);
  },

  async sendAnonymousMessage(req: AnonymousMessageRequest): Promise<AnonymousMessageResponse> {
    return api.post<AnonymousMessageResponse>('/omnichat/anonymous/messages', req);
  },

  async createConversationWithMessages(
    personaId: number,
    messages: BotMessage[],
    title?: string,
    settings?: ConversationSettings,
  ): Promise<BotConversation> {
    return api.post<BotConversation>('/omnichat/conversations', {
      persona_id: personaId,
      title,
      force_new: true,
      settings,
      messages,
    });
  },
};

export const omnichatQueryKeys = {
  personas: (category?: PersonaCategory) => ['omnichat', 'personas', category ?? 'all'] as const,
  conversations: ['omnichat', 'conversations'] as const,
  conversation: (id: number) => ['omnichat', 'conversation', id] as const,
};
