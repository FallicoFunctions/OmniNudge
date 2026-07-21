import { api } from '../lib/api';
import type {
  PreviewMessageRequest,
  PreviewMessageResponse,
  BotConversation,
  BotConversationDetail,
  BotMessage,
  BotPersona,
  BotPersonaDefinition,
  ConversationSettings,
  PersonaDefinitionPayload,
  PersonaCategory,
  OmniChatGenerationJob,
  OmniChatGenerationRequest,
  OmniChatMediaAsset,
  OmniChatMediaKind,
  OmniChatPublication,
  OmniChatPublicationComment,
  OmniChatGroup,
  OmniChatGroupInvite,
  OmniChatGroupMessage,
  OmniChatPersonaVoice,
  OmniChatVoiceCatalog,
  OmniChatCallSession,
  OmniChatSceneState,
} from '../types/omnichat';
import { API_BASE_URL, getStoredAuthToken } from '../lib/api';

function getApiUrl(path: string): URL {
  return new URL(`${API_BASE_URL.replace(/\/$/, '')}${path}`);
}

/**
 * Media URLs are returned by an API response, but must never be allowed to
 * redirect an authenticated browser request to a third party.  In particular,
 * a compromised publication record must not receive the user's bearer token.
 */
function resolveApiMediaContentUrl(assetId: string, publicContentUrl?: string): string {
  const fallback = getApiUrl(`/omnichat/media/${encodeURIComponent(assetId)}/content`);
  if (!publicContentUrl) return fallback.toString();

  let candidate: URL;
  try {
    candidate = new URL(publicContentUrl, fallback);
  } catch {
    throw new Error('Generated media URL is invalid');
  }

  if (candidate.protocol !== fallback.protocol || candidate.origin !== fallback.origin) {
    throw new Error('Generated media is hosted by an untrusted origin');
  }

  return candidate.toString();
}

export const omnichatService = {
  async listPersonas(category?: PersonaCategory): Promise<BotPersona[]> {
    const query = category ? `?category=${encodeURIComponent(category)}` : '';
    const res = await api.get<{ personas: BotPersona[] }>(`/omnichat/personas${query}`);
    return res.personas;
  },

  async listConversations(personaId?: number): Promise<BotConversation[]> {
    const query = personaId ? `?persona_id=${personaId}` : '';
    const res = await api.get<{ conversations: BotConversation[] }>(
      `/omnichat/conversations${query}`
    );
    return res.conversations ?? [];
  },

  async createConversation(
    personaId: number,
    title?: string,
    forceNew?: boolean,
    settings?: ConversationSettings
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

  async regenerateMessage(conversationId: number, messageId: number): Promise<BotMessage> {
    return api.post<BotMessage>(
      `/omnichat/conversations/${conversationId}/messages/${messageId}/regenerate`
    );
  },

  async editMessage(
    conversationId: number,
    messageId: number,
    content: string
  ): Promise<BotMessage> {
    return api.patch<BotMessage>(
      `/omnichat/conversations/${conversationId}/messages/${messageId}`,
      { content }
    );
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

  async deletePersonaConversations(personaId: number): Promise<void> {
    await api.delete(`/omnichat/personas/${personaId}/conversations`);
  },

  async sendPreviewMessage(req: PreviewMessageRequest): Promise<PreviewMessageResponse> {
    return api.post<PreviewMessageResponse>('/omnichat/preview/messages', req);
  },

  async createConversationWithMessages(
    personaId: number,
    messages: BotMessage[],
    title?: string,
    settings?: ConversationSettings
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
    const res = await api.put<{ persona: BotPersonaDefinition }>(
      `/omnichat/personas/${personaId}`,
      payload
    );
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

  async createGeneration(request: OmniChatGenerationRequest): Promise<OmniChatGenerationJob> {
    const response = await api.post<{ job: OmniChatGenerationJob }>(
      '/omnichat/generations',
      request
    );
    return response.job;
  },

  async getGeneration(jobId: string): Promise<OmniChatGenerationJob> {
    const response = await api.get<{ job: OmniChatGenerationJob }>(
      `/omnichat/generations/${encodeURIComponent(jobId)}`
    );
    return response.job;
  },

  async listGenerations(limit = 50): Promise<OmniChatGenerationJob[]> {
    const response = await api.get<{ jobs: OmniChatGenerationJob[] }>(
      `/omnichat/generations?limit=${limit}`
    );
    return response.jobs ?? [];
  },

  async cancelGeneration(jobId: string): Promise<void> {
    await api.delete(`/omnichat/generations/${encodeURIComponent(jobId)}`);
  },

  async listGallery(
    kind?: OmniChatMediaKind,
    before?: string,
    beforeId?: string,
    limit = 50
  ): Promise<OmniChatMediaAsset[]> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (kind) params.set('kind', kind);
    if (before) params.set('before', before);
    if (beforeId) params.set('before_id', beforeId);
    const response = await api.get<{ assets: OmniChatMediaAsset[] }>(
      `/omnichat/gallery?${params.toString()}`
    );
    return response.assets ?? [];
  },

  async getMediaAsset(assetId: string): Promise<OmniChatMediaAsset> {
    const response = await api.get<{ asset: OmniChatMediaAsset }>(
      `/omnichat/media/${encodeURIComponent(assetId)}`
    );
    return response.asset;
  },

  async getMediaAssetContent(assetId: string, publicContentUrl?: string): Promise<Blob> {
    const token = getStoredAuthToken();
    const contentUrl = resolveApiMediaContentUrl(assetId, publicContentUrl);
    const response = await fetch(contentUrl, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      cache: 'no-store',
    });
    if (!response.ok) {
      throw new Error('Failed to load generated media');
    }
    return response.blob();
  },

  async getScene(conversationId: number): Promise<OmniChatSceneState> {
    const response = await api.get<{ scene: OmniChatSceneState }>(
      `/omnichat/conversations/${conversationId}/scene`
    );
    return response.scene;
  },

  async updateScene(
    conversationId: number,
    scene: OmniChatSceneState
  ): Promise<OmniChatSceneState> {
    const response = await api.put<{ scene: OmniChatSceneState }>(
      `/omnichat/conversations/${conversationId}/scene`,
      scene
    );
    return response.scene;
  },

  async listExplore(
    kind?: 'image' | 'video' | 'chat',
    before?: string,
    beforeId?: string,
    limit = 20
  ): Promise<OmniChatPublication[]> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (kind) params.set('kind', kind);
    if (before) params.set('before', before);
    if (beforeId) params.set('before_id', beforeId);
    const response = await api.get<{ publications: OmniChatPublication[] }>(
      `/omnichat/explore?${params.toString()}`
    );
    return response.publications ?? [];
  },

  async getPublication(id: string): Promise<OmniChatPublication> {
    const response = await api.get<{ publication: OmniChatPublication }>(
      `/omnichat/explore/${encodeURIComponent(id)}`
    );
    return response.publication;
  },

  async publishMedia(assetId: string, caption = ''): Promise<OmniChatPublication> {
    const response = await api.post<{ publication: OmniChatPublication }>(
      '/omnichat/explore/publish/media',
      { asset_id: assetId, caption }
    );
    return response.publication;
  },

  async publishChat(
    conversationId: number,
    messageIds: number[],
    title: string,
    caption = ''
  ): Promise<OmniChatPublication> {
    const response = await api.post<{ publication: OmniChatPublication }>(
      '/omnichat/explore/publish/chat',
      {
        conversation_id: conversationId,
        message_ids: messageIds,
        title,
        caption,
      }
    );
    return response.publication;
  },

  async setPublicationLiked(id: string, liked: boolean): Promise<void> {
    await api.put(`/omnichat/explore/${encodeURIComponent(id)}/like`, { liked });
  },

  async setPublicationBookmarked(id: string, bookmarked: boolean): Promise<void> {
    await api.put(`/omnichat/explore/${encodeURIComponent(id)}/bookmark`, { bookmarked });
  },

  async listPublicationComments(
    id: string,
    after?: string,
    afterId?: string,
    limit = 50
  ): Promise<OmniChatPublicationComment[]> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (after) params.set('after', after);
    if (afterId) params.set('after_id', afterId);
    const response = await api.get<{ comments: OmniChatPublicationComment[] }>(
      `/omnichat/explore/${encodeURIComponent(id)}/comments?${params.toString()}`
    );
    return response.comments ?? [];
  },

  async addPublicationComment(
    id: string,
    body: string,
    parentId?: string
  ): Promise<OmniChatPublicationComment> {
    const response = await api.post<{ comment: OmniChatPublicationComment }>(
      `/omnichat/explore/${encodeURIComponent(id)}/comments`,
      { body, parent_id: parentId }
    );
    return response.comment;
  },

  async deletePublicationComment(commentId: string): Promise<void> {
    await api.delete(`/omnichat/explore/comments/${encodeURIComponent(commentId)}`);
  },

  async recordPublicationShare(id: string): Promise<string> {
    const response = await api.post<{ share_path: string }>(
      `/omnichat/explore/${encodeURIComponent(id)}/share`
    );
    return response.share_path;
  },

  async setFollowing(userId: number, following: boolean): Promise<void> {
    await api.put(`/omnichat/explore/users/${userId}/follow`, { following });
  },

  async continueSharedChat(id: string): Promise<BotConversation> {
    const response = await api.post<{ conversation: BotConversation }>(
      `/omnichat/explore/${encodeURIComponent(id)}/continue`
    );
    return response.conversation;
  },

  async reportPublication(id: string, reason: string, details = ''): Promise<void> {
    await api.post(`/omnichat/explore/${encodeURIComponent(id)}/report`, { reason, details });
  },

  async removePublication(id: string): Promise<void> {
    await api.delete(`/omnichat/explore/${encodeURIComponent(id)}`);
  },

  async createGroup(
    name: string,
    description: string,
    personaIds: number[]
  ): Promise<OmniChatGroup> {
    const response = await api.post<{ group: OmniChatGroup }>('/omnichat/groups', {
      name,
      description,
      persona_ids: personaIds,
    });
    return response.group;
  },

  async listGroups(before?: string, beforeId?: string, limit = 50): Promise<OmniChatGroup[]> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (before) params.set('before', before);
    if (beforeId) params.set('before_id', beforeId);
    const response = await api.get<{ groups: OmniChatGroup[] }>(
      `/omnichat/groups?${params.toString()}`
    );
    return response.groups ?? [];
  },

  async getGroup(id: string): Promise<OmniChatGroup> {
    const response = await api.get<{ group: OmniChatGroup }>(
      `/omnichat/groups/${encodeURIComponent(id)}`
    );
    return response.group;
  },

  async listGroupMessages(
    id: string,
    before?: string,
    beforeId?: string,
    limit = 100
  ): Promise<OmniChatGroupMessage[]> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (before) params.set('before', before);
    if (beforeId) params.set('before_id', beforeId);
    const response = await api.get<{ messages: OmniChatGroupMessage[] }>(
      `/omnichat/groups/${encodeURIComponent(id)}/messages?${params.toString()}`
    );
    return response.messages ?? [];
  },

  async sendGroupMessage(
    id: string,
    content: string,
    responderPersonaIds: number[] = []
  ): Promise<OmniChatGroupMessage[]> {
    const response = await api.post<{ messages: OmniChatGroupMessage[] }>(
      `/omnichat/groups/${encodeURIComponent(id)}/messages`,
      {
        content,
        responder_persona_ids: responderPersonaIds,
      }
    );
    return response.messages;
  },

  async createGroupInvite(
    id: string,
    maxUses = 10
  ): Promise<{ invite: OmniChatGroupInvite; token: string }> {
    return api.post(`/omnichat/groups/${encodeURIComponent(id)}/invites`, { max_uses: maxUses });
  },

  async joinGroup(token: string): Promise<OmniChatGroup> {
    const response = await api.post<{ group: OmniChatGroup }>('/omnichat/groups/join', { token });
    return response.group;
  },

  async getPersonaVoice(personaId: number): Promise<OmniChatPersonaVoice> {
    const response = await api.get<{ voice: OmniChatPersonaVoice }>(
      `/omnichat/personas/${personaId}/voice`
    );
    return response.voice;
  },

  async listVoicePresets(): Promise<OmniChatVoiceCatalog> {
    return api.get<OmniChatVoiceCatalog>('/omnichat/voice-presets');
  },

  async previewVoicePreset(presetId: string): Promise<Blob> {
    const token = getStoredAuthToken();
    const response = await fetch(
      `${API_BASE_URL}/omnichat/voice-presets/${encodeURIComponent(presetId)}/preview`,
      {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }
    );
    if (!response.ok) throw new Error('Voice preview is unavailable');
    const blob = await response.blob();
    if (blob.type !== 'audio/wav' || blob.size === 0 || blob.size > 25 * 1024 * 1024) {
      throw new Error('Voice preview is invalid');
    }
    return blob;
  },

  async updatePersonaVoice(
    personaId: number,
    voice: Omit<OmniChatPersonaVoice, 'persona_id' | 'active' | 'updated_at'>
  ): Promise<OmniChatPersonaVoice> {
    const response = await api.put<{ voice: OmniChatPersonaVoice }>(
      `/omnichat/personas/${personaId}/voice`,
      voice
    );
    return response.voice;
  },

  async getMessageSpeech(conversationId: number, messageId: number): Promise<Blob> {
    const token = getStoredAuthToken();
    const response = await fetch(
      `${API_BASE_URL}/omnichat/conversations/${conversationId}/messages/${messageId}/speech`,
      {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: 'force-cache',
      }
    );
    if (!response.ok) throw new Error('Character speech is unavailable');
    return response.blob();
  },

  async startCall(conversationId: number, mode: 'voice' | 'video'): Promise<OmniChatCallSession> {
    const response = await api.post<{ session: OmniChatCallSession }>(
      `/omnichat/conversations/${conversationId}/calls`,
      { mode }
    );
    return response.session;
  },

  async endCall(callId: string): Promise<void> {
    await api.delete(`/omnichat/calls/${encodeURIComponent(callId)}`);
  },

  async recordCallTurn(callId: string): Promise<void> {
    await api.post(`/omnichat/calls/${encodeURIComponent(callId)}/turns`);
  },
};

export const omnichatQueryKeys = {
  personas: (category?: PersonaCategory) => ['omnichat', 'personas', category ?? 'all'] as const,
  conversations: ['omnichat', 'conversations'] as const,
  conversation: (id: number) => ['omnichat', 'conversation', id] as const,
  generation: (id: string) => ['omnichat', 'generation', id] as const,
  generations: ['omnichat', 'generations'] as const,
  gallery: (kind?: OmniChatMediaKind) => ['omnichat', 'gallery', kind ?? 'all'] as const,
  explore: (kind?: string) => ['omnichat', 'explore', kind ?? 'all'] as const,
  publication: (id: string) => ['omnichat', 'publication', id] as const,
  publicationComments: (id: string) => ['omnichat', 'publication', id, 'comments'] as const,
  groups: ['omnichat', 'groups'] as const,
  group: (id: string) => ['omnichat', 'group', id] as const,
  groupMessages: (id: string) => ['omnichat', 'group-messages', id] as const,
  personaVoice: (id: number) => ['omnichat', 'persona-voice', id] as const,
  voicePresets: ['omnichat', 'voice-presets'] as const,
};
