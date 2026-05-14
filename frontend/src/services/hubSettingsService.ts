import api from './api';
import type {
  HubSettings,
  HubModerator,
  UpdateHubSettingsRequest,
  AddModeratorRequest,
  UpdateModeratorRoleRequest,
} from '../types/hubSettings';

export const hubSettingsService = {
  // Hub Settings
  async getHubSettings(hubName: string): Promise<HubSettings> {
    const response = await api.get(`/hubs/${hubName}/settings`);
    return response.data;
  },

  async updateHubSettings(
    hubName: string,
    settings: UpdateHubSettingsRequest
  ): Promise<void> {
    await api.put(`/hubs/${hubName}/settings`, settings);
  },

  async updateHubNSFW(hubName: string, nsfw: boolean): Promise<void> {
    await api.put(`/hubs/${hubName}/nsfw`, { nsfw });
  },

  // Moderators
  async getHubModerators(hubName: string): Promise<{ moderators: HubModerator[] }> {
    const response = await api.get(`/hubs/${hubName}/moderators`);
    return response.data;
  },

  async addModerator(hubName: string, data: AddModeratorRequest): Promise<void> {
    await api.post(`/hubs/${hubName}/moderators`, data);
  },

  async updateModeratorRole(
    hubName: string,
    userId: number,
    data: UpdateModeratorRoleRequest
  ): Promise<void> {
    await api.patch(`/hubs/${hubName}/moderators/${userId}`, data);
  },

  async removeModerator(hubName: string, userId: number): Promise<void> {
    await api.delete(`/hubs/${hubName}/moderators/${userId}`);
  },

};
