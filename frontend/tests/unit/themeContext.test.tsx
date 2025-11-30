import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { ThemeProvider } from '../../src/contexts/ThemeContext';
import { useTheme } from '../../src/hooks/useTheme';
import type { UserSettings, UserTheme } from '../../src/types/theme';

const mockThemeService = vi.hoisted(() => ({
  getPredefinedThemes: vi.fn(),
  getMyThemes: vi.fn(),
  getUserSettings: vi.fn(),
  setActiveTheme: vi.fn(),
  setAdvancedMode: vi.fn(),
}));

vi.mock('../../src/services/themeService', () => ({
  themeService: mockThemeService,
}));

const createTheme = (overrides: Partial<UserTheme> = {}): UserTheme => ({
  id: overrides.id ?? 1,
  user_id: 1,
  theme_name: overrides.theme_name ?? 'Sample Theme',
  theme_type: 'predefined',
  scope_type: 'global',
  css_variables: overrides.css_variables ?? { '--color-primary': '#111111' },
  is_public: false,
  install_count: 0,
  rating_count: 0,
  average_rating: 0,
  version: '1.0.0',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
});

const createSettings = (overrides: Partial<UserSettings> = {}): UserSettings => ({
  user_id: 1,
  active_theme_id: overrides.active_theme_id,
  advanced_mode_enabled: overrides.advanced_mode_enabled ?? false,
  notification_sound: false,
  show_read_receipts: true,
  show_typing_indicators: true,
  auto_append_invitation: false,
  theme: 'default',
  notify_comment_replies: true,
  notify_post_milestone: true,
  notify_post_velocity: true,
  notify_comment_milestone: true,
  notify_comment_velocity: true,
  daily_digest: false,
  media_gallery_filter: 'all',
  updated_at: new Date().toISOString(),
});

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>{children}</ThemeProvider>
    </QueryClientProvider>
  );
};

describe('ThemeProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockThemeService.getPredefinedThemes.mockResolvedValue([createTheme({ id: 1 })]);
    mockThemeService.getMyThemes.mockResolvedValue({
      themes: [createTheme({ id: 2, theme_type: 'variable_customization' })],
      total: 1,
    });
    mockThemeService.getUserSettings.mockResolvedValue(createSettings());
    mockThemeService.setActiveTheme.mockResolvedValue(undefined);
    mockThemeService.setAdvancedMode.mockResolvedValue(undefined);
  });

  it('loads themes and initializes active theme', async () => {
    const wrapper = createWrapper();
    const { result } = renderHook(() => useTheme(), { wrapper });

    await waitFor(() => {
      expect(result.current.predefinedThemes).toHaveLength(1);
    });
    expect(result.current.customThemes).toHaveLength(1);
    expect(result.current.activeTheme?.id).toBe(1);
  });

  it('selects theme by id and syncs to server', async () => {
    const wrapper = createWrapper();
    const { result } = renderHook(() => useTheme(), { wrapper });

    await waitFor(() => {
      expect(result.current.customThemes).toHaveLength(1);
    });

    await act(async () => {
      await result.current.selectThemeById(2);
    });

    expect(mockThemeService.setActiveTheme).toHaveBeenCalledWith(2);
    expect(result.current.activeTheme?.id).toBe(2);
  });

  it('updates advanced mode preference', async () => {
    const wrapper = createWrapper();
    const { result } = renderHook(() => useTheme(), { wrapper });

    await waitFor(() => expect(result.current.userSettings).not.toBeNull());

    await act(async () => {
      await result.current.setAdvancedMode(true);
    });

    expect(mockThemeService.setAdvancedMode).toHaveBeenCalledWith(true);
    expect(result.current.userSettings?.advanced_mode_enabled).toBe(true);
  });
});
