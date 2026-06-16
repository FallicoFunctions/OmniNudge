import { api } from '../lib/api';
import type { GetReactionsResponse, MessageReaction } from '../types/reactions';

export const reactionsService = {
  /**
   * Fetch aggregated reactions for a message.
   * GET /api/v1/messages/{messageId}/reactions
   */
  async getReactions(messageId: number): Promise<GetReactionsResponse> {
    return api.get<GetReactionsResponse>(`/messages/${messageId}/reactions`);
  },

  /**
   * Add an emoji reaction to a message.
   * POST /api/v1/messages/{messageId}/reactions
   * Returns the created reaction (includes the ID needed for removal).
   */
  async addReaction(messageId: number, emoji: string): Promise<MessageReaction> {
    return api.post<MessageReaction>(`/messages/${messageId}/reactions`, { emoji });
  },

  /**
   * Remove a specific reaction by its ID.
   * DELETE /api/v1/messages/{messageId}/reactions/{reactionId}
   */
  async removeReaction(messageId: number, reactionId: number): Promise<void> {
    await api.delete(`/messages/${messageId}/reactions/${reactionId}`);
  },
};
