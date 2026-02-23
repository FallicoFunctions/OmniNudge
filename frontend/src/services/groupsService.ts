import { api } from '../lib/api';
import type {
  Conversation,
  CreateGroupRequest,
  CreateGroupInviteRequest,
  GroupInvite,
  GroupParticipant,
  GroupSettings,
  TransferOwnershipRequest,
  UpdateGroupRequest,
  UpdateParticipantRoleRequest,
} from '../types/messages';

export const groupsService = {
  /** Create a new group conversation */
  async createGroup(data: CreateGroupRequest): Promise<Conversation> {
    return api.post<Conversation>('/conversations/groups', data);
  },

  /** Get all participants of a group */
  async getParticipants(conversationId: number): Promise<GroupParticipant[]> {
    const res = await api.get<{ participants: GroupParticipant[] }>(
      `/conversations/${conversationId}/participants`
    );
    return res.participants;
  },

  /** Add a participant to a group */
  async addParticipant(conversationId: number, userId: number): Promise<void> {
    await api.post(`/conversations/${conversationId}/participants`, { user_id: userId });
  },

  /** Remove a participant from a group */
  async removeParticipant(conversationId: number, userId: number): Promise<void> {
    await api.delete(`/conversations/${conversationId}/participants/${userId}`);
  },

  /** Change a participant's role */
  async updateParticipantRole(
    conversationId: number,
    userId: number,
    data: UpdateParticipantRoleRequest
  ): Promise<void> {
    await api.patch(`/conversations/${conversationId}/participants/${userId}`, data);
  },

  /** Update group name/avatar/description */
  async updateGroup(conversationId: number, data: UpdateGroupRequest): Promise<Conversation> {
    return api.patch<Conversation>(`/conversations/${conversationId}/group`, data);
  },

  /** Get group settings */
  async getSettings(conversationId: number): Promise<GroupSettings> {
    return api.get<GroupSettings>(`/conversations/${conversationId}/settings`);
  },

  /** Update group settings */
  async updateSettings(
    conversationId: number,
    data: Partial<GroupSettings>
  ): Promise<GroupSettings> {
    return api.patch<GroupSettings>(`/conversations/${conversationId}/settings`, data);
  },

  /** Send a group invite */
  async createInvite(conversationId: number, data: CreateGroupInviteRequest): Promise<GroupInvite> {
    return api.post<GroupInvite>(`/conversations/${conversationId}/invites`, data);
  },

  /** Accept a group invite */
  async acceptInvite(inviteId: number): Promise<void> {
    await api.post(`/groups/invites/${inviteId}/accept`, {});
  },

  /** Decline a group invite */
  async declineInvite(inviteId: number): Promise<void> {
    await api.post(`/groups/invites/${inviteId}/decline`, {});
  },

  /** Get pending group invites for the current user */
  async getMyInvites(): Promise<GroupInvite[]> {
    const res = await api.get<{ invites: GroupInvite[] }>('/groups/invites');
    return res.invites;
  },

  /** Leave a group */
  async leaveGroup(conversationId: number): Promise<void> {
    await api.post(`/conversations/${conversationId}/leave`, {});
  },

  /** Transfer group ownership */
  async transferOwnership(
    conversationId: number,
    data: TransferOwnershipRequest
  ): Promise<void> {
    await api.post(`/conversations/${conversationId}/transfer-ownership`, data);
  },

  /** Discover public groups */
  async discoverGroups(params?: {
    query?: string;
    limit?: number;
    cursor?: string;
  }): Promise<{ groups: Conversation[]; next_cursor?: string }> {
    const p = new URLSearchParams();
    if (params?.query) p.set('q', params.query);
    if (params?.limit) p.set('limit', String(params.limit));
    if (params?.cursor) p.set('cursor', params.cursor);
    const qs = p.toString();
    return api.get<{ groups: Conversation[]; next_cursor?: string }>(
      `/groups/discover${qs ? `?${qs}` : ''}`
    );
  },
};
