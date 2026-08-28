import { api } from '../lib/api';
import type {
  PreviewMessageRequest,
  PreviewMessageResponse,
  OmniChatAllowanceState,
  BotConversation,
  BotConversationDetail,
  BotMessagePage,
  BotMessage,
  BotPersona,
  BotPersonaDefinition,
  ConversationSettings,
  PersonaDefinitionPayload,
  IAIOptions,
  CreateIAIRequest,
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
  OmniChatModelSelection,
  OmniChatModelKey,
  OmniChatModelScope,
  OmniChatResponseFeedbackRequest,
  OmniChatMemoryList,
  OmniChatAcceptedTurn,
} from '../types/omnichat';
import { API_BASE_URL } from '../lib/api';
import { authenticatedFetch } from './authSession';
import type {
  OmniChatBillingOffer,
  OmniChatBillingUsage,
  OmniChatCheckoutResponse,
  OmniChatVideoEntitlement,
  OmniChatWallet,
} from '../types/omnichatCommerce';

// The backend limits a completion attempt to 25 seconds, then gives its
// persisted reply (including a safe fallback) up to 10 seconds to commit.
// Keep a five-second transport margin so the client receives that definitive
// outcome without recreating the former 30+ second stranded-composer UX.
const OMNICHAT_SEND_TIMEOUT_MS = 40_000;

function getApiUrl(path: string): URL {
  return new URL(`${API_BASE_URL.replace(/\/$/, '')}${path}`);
}

export function createOmniChatCheckoutIdempotencyId(): string {
  return createOmniChatRequestId();
}

/**
 * Creates the opaque identifier that ties one user intent to all transport
 * attempts. Callers must create it before invoking a mutation, never inside a
 * request function that TanStack Query or application code could retry.
 */
export function createOmniChatRequestId(): string {
  if (typeof globalThis.crypto?.randomUUID !== 'function') {
    throw new Error('Secure request identifiers are unavailable');
  }
  return globalThis.crypto.randomUUID();
}

export function createOmniChatSocialRequestId(): string {
  return createOmniChatRequestId();
}

export function isSafeOmniChatCheckoutURL(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      Boolean(url.hostname) &&
      url.username === '' &&
      url.password === ''
    );
  } catch {
    return false;
  }
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

/**
 * Resolves with the persona's next reply in a conversation.
 *
 * Sending no longer returns the answer, but a live call still needs one before
 * it can speak. The completed reply already arrives as a window event from the
 * websocket layer, so this waits on that rather than on the request.
 *
 * Start it before sending: a fast reply can land before the send promise
 * settles, and a listener attached afterwards would miss it.
 */
export function waitForOmniChatReply(
  conversationId: number,
  signal?: AbortSignal,
  timeoutMs = 90_000
): Promise<BotMessage> {
  return new Promise<BotMessage>((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      window.removeEventListener('omnichat-message-complete', onComplete);
      signal?.removeEventListener('abort', onAbort);
      globalThis.clearTimeout(timer);
    };
    const onComplete = (event: Event) => {
      const message = (event as CustomEvent<BotMessage>).detail;
      if (!message || message.conversation_id !== conversationId) return;
      if (message.role !== 'assistant') return;
      settled = true;
      cleanup();
      resolve(message);
    };
    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new DOMException('Waiting for the reply was cancelled', 'AbortError'));
    };
    const timer = globalThis.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new DOMException('The reply did not arrive in time', 'TimeoutError'));
    }, timeoutMs);

    window.addEventListener('omnichat-message-complete', onComplete);
    if (signal?.aborted) onAbort();
    else signal?.addEventListener('abort', onAbort, { once: true });
  });
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

  /** Messages older than `beforeId`, oldest first. Every message is stored. */
  async getOlderMessages(conversationId: number, beforeId: number): Promise<BotMessagePage> {
    return api.get<BotMessagePage>(
      `/omnichat/conversations/${conversationId}/messages?before=${beforeId}`
    );
  },

  /**
   * Records the turn. The reply is not in the response: it arrives over the
   * websocket, which is also where it always arrived -- this call simply stops
   * waiting around for it.
   */
  async sendMessage(
    conversationId: number,
    content: string,
    requestId: string,
    signal?: AbortSignal
  ): Promise<OmniChatAcceptedTurn> {
    const requestController = new AbortController();
    const abortFromCaller = () => requestController.abort(signal?.reason);
    const timeout = globalThis.setTimeout(() => {
      requestController.abort(new DOMException('The OmniChat reply timed out', 'TimeoutError'));
    }, OMNICHAT_SEND_TIMEOUT_MS);

    if (signal?.aborted) abortFromCaller();
    else signal?.addEventListener('abort', abortFromCaller, { once: true });

    try {
      return await api.post<OmniChatAcceptedTurn>(
        `/omnichat/conversations/${conversationId}/messages`,
        { content, request_id: requestId },
        { signal: requestController.signal }
      );
    } finally {
      globalThis.clearTimeout(timeout);
      signal?.removeEventListener('abort', abortFromCaller);
    }
  },

  async regenerateMessage(
    conversationId: number,
    messageId: number,
    requestId: string
  ): Promise<BotMessage> {
    return api.post<BotMessage>(
      `/omnichat/conversations/${conversationId}/messages/${messageId}/regenerate`,
      { request_id: requestId }
    );
  },

  async reportResponseFeedback(
    conversationId: number,
    messageId: number,
    feedback: OmniChatResponseFeedbackRequest
  ): Promise<void> {
    await api.post(
      `/omnichat/conversations/${conversationId}/messages/${messageId}/feedback`,
      feedback
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

  async getModelSelection(conversationId: number): Promise<OmniChatModelSelection> {
    return api.get<OmniChatModelSelection>(
      `/omnichat/model-selection?conversation_id=${encodeURIComponent(conversationId)}`
    );
  },

  async setModelSelection(
    conversationId: number,
    modelKey: OmniChatModelKey,
    scope: OmniChatModelScope
  ): Promise<OmniChatModelSelection> {
    return api.put<OmniChatModelSelection>('/omnichat/model-selection', {
      conversation_id: conversationId,
      model_key: modelKey,
      scope,
    });
  },

  async forkConversation(conversationId: number): Promise<BotConversation> {
    return api.post<BotConversation>(`/omnichat/conversations/${conversationId}/fork`);
  },

  async deleteConversation(conversationId: number): Promise<void> {
    await api.delete(`/omnichat/conversations/${conversationId}`);
  },

  async listConversationMemories(conversationId: number): Promise<OmniChatMemoryList> {
    return api.get<OmniChatMemoryList>(`/omnichat/conversations/${conversationId}/memories`);
  },

  /** Withdraws a memory from recall. The record itself is retained. */
  async forgetMemory(memoryId: number): Promise<void> {
    await api.delete(`/omnichat/memories/${memoryId}`);
  },

  async deletePersonaConversations(personaId: number): Promise<void> {
    await api.delete(`/omnichat/personas/${personaId}/conversations`);
  },

  async sendPreviewMessage(req: PreviewMessageRequest): Promise<PreviewMessageResponse> {
    return api.post<PreviewMessageResponse>('/omnichat/preview/messages', req);
  },

  async getAllowance(): Promise<OmniChatAllowanceState> {
    return api.get<OmniChatAllowanceState>('/omnichat/allowance');
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

  /**
   * What the creation flow may offer. Fetched once when the flow opens.
   *
   * The three lists that depend on an earlier answer arrive already worked out
   * -- eyes by drawing style, builds by gender, hair shapes by style then
   * gender then texture -- so the interface looks its answer up and never
   * applies the rule itself.
   */
  async getIAIOptions(): Promise<IAIOptions> {
    return api.get<IAIOptions>('/omnichat/iai/options');
  },

  /**
   * Names to start her off with, already blended.
   *
   * One call when the name screen opens; the shuffle is local after that. A
   * name per press would put a round trip behind a button somebody presses
   * idly.
   */
  async getIAINames(ethnicity: string, gender: string): Promise<string[]> {
    const query = new URLSearchParams();
    if (ethnicity) query.set('ethnicity', ethnicity);
    if (gender) query.set('gender', gender);
    const suffix = query.toString();
    const res = await api.get<{ names: string[] }>(
      `/omnichat/iai/names${suffix ? `?${suffix}` : ''}`
    );
    return res.names ?? [];
  },

  async createIAI(payload: CreateIAIRequest): Promise<BotPersona> {
    const res = await api.post<{ persona: BotPersona }>('/omnichat/iai', payload);
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

    const response = await authenticatedFetch(
      `${import.meta.env.VITE_API_URL || 'http://localhost:8080/api/v1'}/omnichat/personas/import`,
      {
        method: 'POST',
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
    const response = await authenticatedFetch(
      `${import.meta.env.VITE_API_URL || 'http://localhost:8080/api/v1'}/omnichat/personas/${personaId}/export`
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

  async createMediaCommand(
    conversationId: number,
    request: Pick<
      OmniChatGenerationRequest,
      'request_id' | 'kind' | 'prompt' | 'aspect_ratio' | 'duration_seconds'
    >
  ): Promise<{ job: OmniChatGenerationJob; message: BotMessage }> {
    return api.post<{ job: OmniChatGenerationJob; message: BotMessage }>(
      `/omnichat/conversations/${encodeURIComponent(conversationId)}/media-command`,
      request
    );
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

  async deleteMediaAsset(assetId: string): Promise<void> {
    await api.delete(`/omnichat/media/${encodeURIComponent(assetId)}`);
  },

  async getBillingCatalog(): Promise<OmniChatBillingOffer[]> {
    const response = await api.get<{ offers: OmniChatBillingOffer[] }>('/omnichat/billing/catalog');
    return response.offers ?? [];
  },

  async getBillingWallet(): Promise<OmniChatWallet> {
    const response = await api.get<{ wallet: OmniChatWallet }>('/omnichat/billing/wallet');
    return response.wallet;
  },

  async getBillingUsage(limit = 50): Promise<OmniChatBillingUsage> {
    return api.get<OmniChatBillingUsage>(
      `/omnichat/billing/usage?limit=${encodeURIComponent(limit)}`
    );
  },

  async getVideoEntitlement(): Promise<OmniChatVideoEntitlement> {
    return api.get<OmniChatVideoEntitlement>('/omnichat/billing/video-entitlement');
  },

  async createBillingCheckout(
    offerId: string,
    idempotencyId: string
  ): Promise<OmniChatCheckoutResponse> {
    return api.post<OmniChatCheckoutResponse>('/omnichat/billing/checkout', {
      offer_id: offerId,
      idempotency_id: idempotencyId,
    });
  },

  async getMediaAssetContent(assetId: string, publicContentUrl?: string): Promise<Blob> {
    const contentUrl = resolveApiMediaContentUrl(assetId, publicContentUrl);
    const response = await authenticatedFetch(contentUrl, {
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
    idempotencyKey: string,
    caption = ''
  ): Promise<OmniChatPublication> {
    const response = await api.post<{ publication: OmniChatPublication }>(
      '/omnichat/explore/publish/chat',
      {
        conversation_id: conversationId,
        message_ids: messageIds,
        title,
        caption,
        idempotency_key: idempotencyKey,
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

  async listBookmarkedPublications(
    before?: string,
    beforeId?: string,
    limit = 20
  ): Promise<OmniChatPublication[]> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (before) params.set('before', before);
    if (beforeId) params.set('before_id', beforeId);
    const response = await api.get<{ publications: OmniChatPublication[] }>(
      `/omnichat/explore/bookmarks?${params.toString()}`
    );
    return response.publications ?? [];
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

  async continueSharedChat(id: string, idempotencyKey: string): Promise<BotConversation> {
    const response = await api.post<{ conversation: BotConversation }>(
      `/omnichat/explore/${encodeURIComponent(id)}/continue`,
      { idempotency_key: idempotencyKey }
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
    idempotencyKey: string,
    responderPersonaIds: number[] = []
  ): Promise<OmniChatGroupMessage[]> {
    const response = await api.post<{ messages: OmniChatGroupMessage[] }>(
      `/omnichat/groups/${encodeURIComponent(id)}/messages`,
      {
        content,
        responder_persona_ids: responderPersonaIds,
        idempotency_key: idempotencyKey,
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

  async updateGroup(
    id: string,
    name: string,
    description: string,
    visibility: OmniChatGroup['visibility']
  ): Promise<OmniChatGroup> {
    const response = await api.patch<{ group: OmniChatGroup }>(
      `/omnichat/groups/${encodeURIComponent(id)}`,
      { name, description, visibility }
    );
    return response.group;
  },

  async leaveGroup(id: string): Promise<void> {
    await api.delete(`/omnichat/groups/${encodeURIComponent(id)}/members/me`);
  },

  async setGroupMemberRole(id: string, userId: number, role: 'admin' | 'member'): Promise<void> {
    await api.patch(`/omnichat/groups/${encodeURIComponent(id)}/members/${userId}/role`, {
      role,
    });
  },

  async removeGroupMember(id: string, userId: number): Promise<void> {
    await api.delete(`/omnichat/groups/${encodeURIComponent(id)}/members/${userId}`);
  },

  async transferGroupOwnership(id: string, userId: number): Promise<void> {
    await api.post(`/omnichat/groups/${encodeURIComponent(id)}/members/${userId}/transfer`, {});
  },

  async listGroupInvites(id: string): Promise<OmniChatGroupInvite[]> {
    const response = await api.get<{ invites: OmniChatGroupInvite[] }>(
      `/omnichat/groups/${encodeURIComponent(id)}/invites`
    );
    return response.invites ?? [];
  },

  async revokeGroupInvite(id: string, inviteId: string): Promise<void> {
    await api.delete(
      `/omnichat/groups/${encodeURIComponent(id)}/invites/${encodeURIComponent(inviteId)}`
    );
  },

  async archiveGroup(id: string): Promise<void> {
    await api.post(`/omnichat/groups/${encodeURIComponent(id)}/archive`, {});
  },

  async deleteGroup(id: string): Promise<void> {
    await api.delete(`/omnichat/groups/${encodeURIComponent(id)}`);
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

  async previewVoicePreset(presetId: string, signal?: AbortSignal): Promise<Blob> {
    const response = await authenticatedFetch(
      `${API_BASE_URL}/omnichat/voice-presets/${encodeURIComponent(presetId)}/preview`,
      {
        method: 'POST',
        signal,
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
    const response = await authenticatedFetch(
      `${API_BASE_URL}/omnichat/conversations/${conversationId}/messages/${messageId}/speech`,
      {
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

  async refreshCallToken(callId: string): Promise<string> {
    const response = await api.post<{ live_video_token: string }>(
      `/omnichat/calls/${encodeURIComponent(callId)}/token`
    );
    if (!response.live_video_token) throw new Error('Live video token is unavailable');
    return response.live_video_token;
  },

  async recordCallTurn(callId: string): Promise<void> {
    await api.post(`/omnichat/calls/${encodeURIComponent(callId)}/turns`);
  },
};

export const omnichatQueryKeys = {
  personas: (category?: PersonaCategory) => ['omnichat', 'personas', category ?? 'all'] as const,
  conversations: ['omnichat', 'conversations'] as const,
  conversation: (id: number) => ['omnichat', 'conversation', id] as const,
  conversationMemories: (id: number) => ['omnichat', 'conversation', id, 'memories'] as const,
  generation: (id: string) => ['omnichat', 'generation', id] as const,
  generations: ['omnichat', 'generations'] as const,
  gallery: (kind?: OmniChatMediaKind) => ['omnichat', 'gallery', kind ?? 'all'] as const,
  media: (id: string) => ['omnichat', 'media', id] as const,
  billingCatalog: ['omnichat', 'billing', 'catalog'] as const,
  billingWallet: ['omnichat', 'billing', 'wallet'] as const,
  billingUsage: (limit = 50) => ['omnichat', 'billing', 'usage', limit] as const,
  videoEntitlement: ['omnichat', 'billing', 'video-entitlement'] as const,
  iaiOptions: ['omnichat', 'iai', 'options'] as const,
  iaiNames: (ethnicity: string, gender: string) =>
    ['omnichat', 'iai', 'names', ethnicity || 'any', gender || 'any'] as const,
  explore: (kind?: string) => ['omnichat', 'explore', kind ?? 'all'] as const,
  publication: (id: string) => ['omnichat', 'publication', id] as const,
  publicationComments: (id: string) => ['omnichat', 'publication', id, 'comments'] as const,
  groups: ['omnichat', 'groups'] as const,
  group: (id: string) => ['omnichat', 'group', id] as const,
  groupMessages: (id: string) => ['omnichat', 'group-messages', id] as const,
  allowance: (authenticated: boolean) =>
    ['omnichat', 'allowance', authenticated ? 'account' : 'guest'] as const,
  personaVoice: (id: number) => ['omnichat', 'persona-voice', id] as const,
  voicePresets: ['omnichat', 'voice-presets'] as const,
  modelSelection: (conversationId: number) =>
    ['omnichat', 'model-selection', conversationId] as const,
};
