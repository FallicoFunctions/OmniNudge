import { api } from '../lib/api';
import type { ModMailConversation, CreateModMailRequest, UpdateModMailStatusRequest } from '../types/modmail';

export const modMailService = {
  // Create a new mod mail conversation
  async createModMail(data: CreateModMailRequest): Promise<{ conversation_id: number; message_id: number; hub_name: string; subject: string }> {
    return api.post<{ conversation_id: number; message_id: number; hub_name: string; subject: string }>('/mod-mail', data);
  },

  // Get mod mail conversations for a specific hub (moderators only)
  async getHubModMail(hubName: string, status: 'open' | 'archived' | 'resolved' | 'all' = 'open'): Promise<{ conversations: ModMailConversation[]; hub_name: string; status: string }> {
    return api.get<{ conversations: ModMailConversation[]; hub_name: string; status: string }>(`/mod-mail/hubs/${hubName}?status=${status}`);
  },

  // Get mod mail recipients (hub moderators + admins)
  async getRecipients(hubName: string): Promise<{ hub_name: string; recipient_ids: number[] }> {
    return api.get<{ hub_name: string; recipient_ids: number[] }>(`/mod-mail/hubs/${hubName}/recipients`);
  },

  // Get mod mail conversations created by the current user
  async getUserModMail(): Promise<{ conversations: ModMailConversation[] }> {
    return api.get<{ conversations: ModMailConversation[] }>('/mod-mail/user');
  },

  // Update mod mail status (moderators only)
  async updateStatus(conversationId: number, data: UpdateModMailStatusRequest): Promise<{ conversation_id: number; status: string }> {
    return api.patch<{ conversation_id: number; status: string }>(`/mod-mail/${conversationId}/status`, data);
  },
};
