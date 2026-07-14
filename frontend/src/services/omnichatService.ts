import { api } from '../lib/api';
import type {
  AnonymousMessageRequest,
  AnonymousMessageResponse,
  BotConversation,
  BotConversationDetail,
  BotMessage,
  BotPersona,
  BotPersonaDefinition,
  ConversationSettings,
  PersonaDefinitionPayload,
  PersonaCategory,
} from '../types/omnichat';
import { getStoredAuthToken } from '../lib/api';

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

  async listMyPersonas(): Promise<BotPersona[]> {
    const res = await api.get<{ personas: BotPersona[] }>('/omnichat/my-personas');
    return res.personas ?? [];
  },

  async getPersonaDefinition(personaId: number): Promise<BotPersonaDefinition> {
    const res = await api.get<{ persona: BotPersonaDefinition }>(`/omnichat/personas/${personaId}`);
    return res.persona;
  },

  async createPersona(payload: PersonaDefinitionPayload): Promise<BotPersonaDefinition> {
    const res = await api.post<{ persona: BotPersonaDefinition }>('/omnichat/personas', payload);
    return res.persona;
  },

  async updatePersona(
    personaId: number,
    payload: PersonaDefinitionPayload
  ): Promise<BotPersonaDefinition> {
    const res = await api.put<{ persona: BotPersonaDefinition }>(`/omnichat/personas/${personaId}`, payload);
    return res.persona;
  },

  async deletePersona(personaId: number): Promise<void> {
    await api.delete(`/omnichat/personas/${personaId}`);
  },

  async importPersona(
    file: File,
    options?: { avatarUrl?: string; isNsfw?: boolean }
  ): Promise<BotPersonaDefinition> {
    const formData = new FormData();
    formData.append('file', file);
    if (options?.avatarUrl) {
      formData.append('avatar_url', options.avatarUrl);
    }
    if (options?.isNsfw) {
      formData.append('is_nsfw', 'true');
    }

    const token = getStoredAuthToken();
    const response = await fetch(
      `${import.meta.env.VITE_API_URL || 'http://localhost:8080/api/v1'}/omnichat/personas/import`,
      {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      }
    );

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error((body && (body.message || body.error)) || 'Import failed');
    }

    return body.persona as BotPersonaDefinition;
  },

  async exportPersona(personaId: number): Promise<Blob> {
    const token = getStoredAuthToken();
    const response = await fetch(
      `${import.meta.env.VITE_API_URL || 'http://localhost:8080/api/v1'}/omnichat/personas/${personaId}/export`,
      {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }
    );

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error((body && (body.message || body.error)) || 'Export failed');
    }

    return response.blob();
  },
};

export const omnichatQueryKeys = {
  personas: (category?: PersonaCategory) => ['omnichat', 'personas', category ?? 'all'] as const,
  conversations: ['omnichat', 'conversations'] as const,
  conversation: (id: number) => ['omnichat', 'conversation', id] as const,
};
