import api from './api';
import type {
  HubSettings,
  HubModerator,
  HubTheme,
  UpdateHubSettingsRequest,
  AddModeratorRequest,
  UpdateModeratorRoleRequest,
  CreateThemeRequest,
  PreviewThemeRequest,
  PreviewThemeResponse,
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

  // Themes
  async getActiveTheme(hubName: string): Promise<HubTheme> {
    const response = await api.get(`/hubs/${hubName}/theme`);
    return response.data;
  },

  async getAllThemes(hubName: string): Promise<{ themes: HubTheme[] }> {
    const response = await api.get(`/hubs/${hubName}/themes`);
    return response.data;
  },

  async createTheme(hubName: string, theme: CreateThemeRequest): Promise<{ theme_id: number }> {
    const response = await api.post(`/hubs/${hubName}/themes`, theme);
    return response.data;
  },

  async updateTheme(
    hubName: string,
    themeId: number,
    theme: CreateThemeRequest
  ): Promise<{ new_theme_id: number }> {
    const response = await api.put(`/hubs/${hubName}/themes/${themeId}`, theme);
    return response.data;
  },

  async activateTheme(hubName: string, themeId: number): Promise<void> {
    await api.post(`/hubs/${hubName}/themes/${themeId}/activate`);
  },

  async deleteTheme(hubName: string, themeId: number): Promise<void> {
    await api.delete(`/hubs/${hubName}/themes/${themeId}`);
  },

  async previewTheme(
    hubName: string,
    preview: PreviewThemeRequest
  ): Promise<PreviewThemeResponse> {
    const response = await api.post(`/hubs/${hubName}/themes/preview`, preview);
    return response.data;
  },
};
