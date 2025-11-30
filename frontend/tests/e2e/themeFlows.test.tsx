import React, { useState } from 'react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ThemeSelector from '../../src/components/themes/ThemeSelector';
import ThemeEditor from '../../src/components/themes/ThemeEditor';
import { ThemeProvider } from '../../src/contexts/ThemeContext';
import { useTheme } from '../../src/hooks/useTheme';
import type {
  UserTheme,
  UserSettings,
  CreateThemeRequest,
  UpdateThemeRequest,
} from '../../src/types/theme';

const { store, mockThemeService } = vi.hoisted(() => {
  const createTheme = (overrides: Partial<UserTheme> = {}): UserTheme => ({
    id: overrides.id ?? Math.floor(Math.random() * 1000),
    user_id: overrides.user_id ?? 1,
    theme_name: overrides.theme_name ?? 'Sample Theme',
    theme_description: overrides.theme_description ?? 'Description',
    theme_type: overrides.theme_type ?? 'predefined',
    scope_type: overrides.scope_type ?? 'global',
    css_variables: overrides.css_variables ?? { '--color-primary': '#6633ff' },
    custom_css: overrides.custom_css,
    is_public: overrides.is_public ?? false,
    install_count: overrides.install_count ?? 0,
    rating_count: overrides.rating_count ?? 0,
    average_rating: overrides.average_rating ?? 0,
    version: overrides.version ?? '1.0.0',
    category: overrides.category,
    tags: overrides.tags,
    thumbnail_url: overrides.thumbnail_url,
    created_at: overrides.created_at ?? new Date().toISOString(),
    updated_at: overrides.updated_at ?? new Date().toISOString(),
  });

  const createSettings = (overrides: Partial<UserSettings> = {}): UserSettings => ({
    user_id: 1,
    active_theme_id: overrides.active_theme_id,
    advanced_mode_enabled: overrides.advanced_mode_enabled ?? false,
    notification_sound: overrides.notification_sound ?? true,
    show_read_receipts: overrides.show_read_receipts ?? true,
    show_typing_indicators: overrides.show_typing_indicators ?? true,
    auto_append_invitation: overrides.auto_append_invitation ?? false,
    theme: overrides.theme ?? 'default',
    notify_comment_replies: overrides.notify_comment_replies ?? true,
    notify_post_milestone: overrides.notify_post_milestone ?? true,
    notify_post_velocity: overrides.notify_post_velocity ?? true,
    notify_comment_milestone: overrides.notify_comment_milestone ?? true,
    notify_comment_velocity: overrides.notify_comment_velocity ?? true,
    daily_digest: overrides.daily_digest ?? false,
    media_gallery_filter: overrides.media_gallery_filter ?? 'all',
    updated_at: overrides.updated_at ?? new Date().toISOString(),
  });

  const initialState = () => ({
    nextId: 300,
    predefined: [
      createTheme({ id: 1, theme_name: 'Aurora Glow' }),
      createTheme({ id: 2, theme_name: 'Midnight Pulse' }),
    ],
    custom: [
      createTheme({
        id: 101,
        theme_name: 'Studio Sunset',
        theme_type: 'variable_customization',
      }),
    ],
    settings: createSettings({ active_theme_id: 1 }),
  });

  const state = initialState();

  const service: Record<string, ReturnType<typeof vi.fn>> & {
    getPredefinedThemes: ReturnType<typeof vi.fn>;
    getMyThemes: ReturnType<typeof vi.fn>;
    getUserSettings: ReturnType<typeof vi.fn>;
    setActiveTheme: ReturnType<typeof vi.fn>;
    createTheme: ReturnType<typeof vi.fn>;
    updateTheme: ReturnType<typeof vi.fn>;
    setAdvancedMode: ReturnType<typeof vi.fn>;
  } = {
    getPredefinedThemes: vi.fn(async () => state.predefined),
    getMyThemes: vi.fn(async () => ({ themes: state.custom, total: state.custom.length })),
    getUserSettings: vi.fn(async () => state.settings),
    setActiveTheme: vi.fn(async (themeId: number) => {
      state.settings = { ...state.settings, active_theme_id: themeId };
    }),
    setAdvancedMode: vi.fn(async (enabled: boolean) => {
      state.settings = { ...state.settings, advanced_mode_enabled: enabled };
    }),
    createTheme: vi.fn(async (payload: CreateThemeRequest) => {
      const newTheme = createTheme({
        ...payload,
        id: state.nextId++,
        theme_type: payload.theme_type ?? 'variable_customization',
        scope_type: payload.scope_type ?? 'global',
      });
      state.custom = [...state.custom, newTheme];
      state.settings = { ...state.settings, active_theme_id: newTheme.id };
      return newTheme;
    }),
    updateTheme: vi.fn(async (id: number, updates: UpdateThemeRequest) => {
      const applyUpdates = (theme: UserTheme) =>
        theme.id === id ? { ...theme, ...updates } : theme;
      state.custom = state.custom.map(applyUpdates);
      state.predefined = state.predefined.map(applyUpdates);
      const merged = [...state.predefined, ...state.custom];
      const updated = merged.find((theme) => theme.id === id);
      if (!updated) {
        throw new Error('Theme not found');
      }
      return updated;
    }),
  };

  const reset = () => {
    const fresh = initialState();
    state.nextId = fresh.nextId;
    state.predefined = fresh.predefined;
    state.custom = fresh.custom;
    state.settings = fresh.settings;
    Object.values(service).forEach((fn) => {
      if ('mockClear' in fn) {
        fn.mockClear();
      }
    });
  };

  return { store: { state, reset }, mockThemeService: service };
});

vi.mock('../../src/services/themeService', () => ({
  themeService: mockThemeService,
}));

vi.mock('../../src/components/themes/CSSVariableEditor', () => ({
  default: () => <div data-testid="css-variable-editor">Variable Editor</div>,
}));

vi.mock('../../src/components/themes/ThemePreview', () => ({
  default: () => <div data-testid="theme-preview">Preview</div>,
}));

vi.mock('react-colorful', () => ({
  HexColorPicker: ({ color, onChange }: { color: string; onChange: (value: string) => void }) => (
    <input
      data-testid="color-picker"
      value={color}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

const renderWithProviders = (ui: React.ReactElement) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>{ui}</ThemeProvider>
    </QueryClientProvider>
  );
};

const ThemeTestHarness = () => {
  const [isEditorOpen, setEditorOpen] = useState(false);
  const [editorTheme, setEditorTheme] = useState<UserTheme | null>(null);
  const { customThemes } = useTheme();

  const openNewThemeEditor = () => {
    setEditorTheme(null);
    setEditorOpen(true);
  };

  const openEditFirstTheme = () => {
    if (customThemes.length > 0) {
      setEditorTheme(customThemes[0]);
      setEditorOpen(true);
    }
  };

  return (
    <div>
      <ThemeSelector onCreateNewTheme={openNewThemeEditor} />
      <button type="button" onClick={openEditFirstTheme}>
        Edit Custom Theme
      </button>
      {isEditorOpen && (
        <ThemeEditor
          isOpen
          initialTheme={editorTheme}
          onClose={() => {
            setEditorOpen(false);
            setEditorTheme(null);
          }}
        />
      )}
    </div>
  );
};

describe('Theme flows E2E', () => {
  beforeEach(() => {
    localStorage.clear();
    store.reset();
  });

  it('allows selecting a predefined theme and persists selection', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ThemeSelector />);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Active Theme/i })).toBeInTheDocument()
    );

    await user.click(screen.getByRole('button', { name: /Active Theme/i }));
    await user.click(await screen.findByRole('button', { name: /Midnight Pulse/i }));

    await waitFor(() => {
      expect(screen.getByText('Midnight Pulse')).toBeInTheDocument();
    });

    expect(mockThemeService.setActiveTheme).toHaveBeenCalledWith(2);
    const stored = JSON.parse(localStorage.getItem('omninudge.activeTheme') ?? '{}');
    expect(stored.id).toBe(2);
  });

  it('allows creating a new custom theme through the editor flow', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ThemeTestHarness />);

    await user.click(screen.getByRole('button', { name: /Active Theme/i }));
    await user.click(screen.getByRole('button', { name: /\+ Create New Theme/i }));

    await waitFor(() => expect(screen.getByText(/Theme Editor/i)).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /Next/i }));
    const [nameInput, descriptionInput] = screen.getAllByRole('textbox');
    await user.type(nameInput, 'Desert Bloom');
    await user.type(descriptionInput, 'Earthy palette');
    await user.click(screen.getByRole('button', { name: /Next/i }));
    await user.click(screen.getByRole('button', { name: /Next/i }));
    await user.click(screen.getByRole('button', { name: /Create Theme/i }));

    await waitFor(() => expect(mockThemeService.createTheme).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.queryByText(/Theme Editor/i)).not.toBeInTheDocument()
    );

    await user.click(screen.getByRole('button', { name: /Active Theme/i }));
    await waitFor(() => {
      const buttons = screen.getAllByRole('button', { name: /Desert Bloom/i });
      expect(buttons.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('allows editing an existing custom theme', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ThemeTestHarness />);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Edit Custom Theme/i })).toBeInTheDocument()
    );

    await user.click(screen.getByRole('button', { name: /Edit Custom Theme/i }));

    await waitFor(() => expect(screen.getByText(/Theme Editor/i)).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /Next/i }));
    const [nameInput] = screen.getAllByRole('textbox');
    await user.clear(nameInput);
    await user.type(nameInput, 'Studio Sunrise');
    await user.click(screen.getByRole('button', { name: /Next/i }));
    await user.click(screen.getByRole('button', { name: /Next/i }));
    await user.click(screen.getByRole('button', { name: /Update Theme/i }));

    await waitFor(() => expect(mockThemeService.updateTheme).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.queryByText(/Theme Editor/i)).not.toBeInTheDocument()
    );

    await user.click(screen.getByRole('button', { name: /Active Theme/i }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Studio Sunrise/i })).toBeInTheDocument()
    );
  });

  it('lets users switch between themes multiple times', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ThemeSelector />);

    await waitFor(() => expect(screen.getByText('Aurora Glow')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /Active Theme/i }));
    await user.click(await screen.findByRole('button', { name: /Midnight Pulse/i }));
    await waitFor(() => expect(screen.getByText('Midnight Pulse')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /Active Theme/i }));
    await user.click(await screen.findByRole('button', { name: /Aurora Glow/i }));
    await waitFor(() => expect(screen.getByText('Aurora Glow')).toBeInTheDocument());

    expect(mockThemeService.setActiveTheme).toHaveBeenCalledWith(1);
    expect(mockThemeService.setActiveTheme).toHaveBeenCalledWith(2);
  });

  it('hydrates the previously selected theme from storage on reload', async () => {
    const user = userEvent.setup();
    const firstRender = renderWithProviders(<ThemeSelector />);

    await waitFor(() => expect(screen.getByText('Aurora Glow')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /Active Theme/i }));
    await user.click(await screen.findByRole('button', { name: /Midnight Pulse/i }));
    await waitFor(() => expect(screen.getByText('Midnight Pulse')).toBeInTheDocument());

    firstRender.unmount();
    store.state.settings = { ...store.state.settings, active_theme_id: undefined };

    renderWithProviders(<ThemeSelector />);

    await waitFor(() => expect(screen.getByText('Midnight Pulse')).toBeInTheDocument());
  });
});
