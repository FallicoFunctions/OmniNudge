import { beforeEach, describe, expect, it, vi } from 'vitest';
import { themeService } from '../../src/services/themeService';
import type { CreateThemeRequest, UpdateThemeRequest } from '../../src/types/theme';

const mockApi = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('../../src/services/api', () => ({
  default: mockApi,
}));

describe('themeService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches predefined themes', async () => {
    const mockThemes = [{ id: 1 }, { id: 2 }];
    mockApi.get.mockResolvedValue({ data: { themes: mockThemes } });

    const result = await themeService.getPredefinedThemes();

    expect(mockApi.get).toHaveBeenCalledWith('/themes/predefined');
    expect(result).toEqual(mockThemes);
  });

  it('creates a theme', async () => {
    const payload: CreateThemeRequest = {
      theme_name: 'New Theme',
      theme_type: 'variable_customization',
      scope_type: 'global',
    };
    const response = { id: 99, ...payload };
    mockApi.post.mockResolvedValue({ data: response });

    const result = await themeService.createTheme(payload);

    expect(mockApi.post).toHaveBeenCalledWith('/themes', payload);
    expect(result).toEqual(response);
  });

  it('updates an existing theme', async () => {
    const updates: UpdateThemeRequest = { theme_description: 'Updated' };
    const response = { id: 3, ...updates };
    mockApi.put.mockResolvedValue({ data: response });

    const result = await themeService.updateTheme(3, updates);

    expect(mockApi.put).toHaveBeenCalledWith('/themes/3', updates);
    expect(result).toEqual(response);
  });

  it('sets advanced mode preference', async () => {
    mockApi.post.mockResolvedValue({ data: {} });
    await themeService.setAdvancedMode(true);
    expect(mockApi.post).toHaveBeenCalledWith('/themes/advanced-mode', { enabled: true });
  });

  it('sets active theme', async () => {
    mockApi.post.mockResolvedValue({ data: {} });
    await themeService.setActiveTheme(10);
    expect(mockApi.post).toHaveBeenCalledWith('/themes/active', { theme_id: 10 });
  });

  it('gets user settings', async () => {
    const settings = { active_theme_id: 1 };
    mockApi.get.mockResolvedValue({ data: settings });

    const result = await themeService.getUserSettings();
    expect(mockApi.get).toHaveBeenCalledWith('/settings');
    expect(result).toEqual(settings);
  });
});
