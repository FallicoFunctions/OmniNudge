import api from './api';
import type {
  UserTheme,
  CreateThemeRequest,
  UpdateThemeRequest,
  UserSettings,
  ThemeOverride
} from '../types/theme';

export const themeService = {
  // Get predefined themes
  getPredefinedThemes: async (): Promise<UserTheme[]> => {
    const { data } = await api.get('/themes/predefined');
    return data.themes;
  },

  // Get user's custom themes
  getMyThemes: async (limit = 20, offset = 0): Promise<{ themes: UserTheme[]; total: number }> => {
    const { data } = await api.get('/themes/my', { params: { limit, offset } });
    return data;
  },

  // Get single theme by ID
  getTheme: async (id: number): Promise<UserTheme> => {
    const { data } = await api.get(`/themes/${id}`);
    return data;
  },

  // Create new theme
  createTheme: async (theme: CreateThemeRequest): Promise<UserTheme> => {
    const { data } = await api.post('/themes', theme);
    return data;
  },

  // Update existing theme
  updateTheme: async (id: number, updates: UpdateThemeRequest): Promise<UserTheme> => {
    const { data } = await api.put(`/themes/${id}`, updates);
    return data;
  },

  // Delete theme
  deleteTheme: async (id: number): Promise<void> => {
    await api.delete(`/themes/${id}`);
  },

  // Browse public themes
  browseThemes: async (
    limit = 20,
    offset = 0,
    category?: string
  ): Promise<{ themes: UserTheme[]; total: number }> => {
    const { data } = await api.get('/themes/browse', {
      params: { limit, offset, category }
    });
    return data;
  },

  // Install theme
  installTheme: async (themeId: number): Promise<void> => {
    await api.post('/themes/install', { theme_id: themeId });
  },

  // Uninstall theme
  uninstallTheme: async (themeId: number): Promise<void> => {
    await api.delete(`/themes/install/${themeId}`);
  },

  // Set active theme
  setActiveTheme: async (themeId: number): Promise<void> => {
    await api.post('/themes/active', { theme_id: themeId });
  },

  // Get installed themes
  getInstalledThemes: async (): Promise<UserTheme[]> => {
    const { data } = await api.get('/themes/installed');
    return data.themes;
  },

  // Set page override
  setPageOverride: async (pageName: string, themeId: number): Promise<ThemeOverride> => {
    const { data } = await api.post('/themes/overrides', { page_name: pageName, theme_id: themeId });
    return data;
  },

  // Get all page overrides
  getAllOverrides: async (): Promise<ThemeOverride[]> => {
    const { data } = await api.get('/themes/overrides');
    return data.overrides;
  },

  // Get page override
  getPageOverride: async (pageName: string): Promise<ThemeOverride | null> => {
    const { data } = await api.get(`/themes/overrides/${pageName}`);
    return data;
  },

  // Delete page override
  deletePageOverride: async (pageName: string): Promise<void> => {
    await api.delete(`/themes/overrides/${pageName}`);
  },

  // Toggle advanced mode
  setAdvancedMode: async (enabled: boolean): Promise<void> => {
    await api.post('/themes/advanced-mode', { enabled });
  },

  // Rate theme
  rateTheme: async (themeId: number, rating: number, review?: string): Promise<void> => {
    await api.post('/themes/rate', { theme_id: themeId, rating, review });
  },

  // Get user settings
  getUserSettings: async (): Promise<UserSettings> => {
    const { data } = await api.get('/settings');
    return data;
  },
};
