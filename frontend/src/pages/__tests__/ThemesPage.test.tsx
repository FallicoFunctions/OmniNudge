import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}));

let mockActiveTheme: { theme_name: string; theme_description: string } | null = null;

vi.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    // Closure over module-level variable so beforeEach can reset it cleanly
    activeTheme: mockActiveTheme,
    isLoading: false,
    cssVariables: {},
  }),
}));

vi.mock('../../hooks/useFormat', () => ({
  useFormat: () => ({
    formatNumber: (n: number) => String(n),
    formatDate: () => 'Jan 1, 2026',
    formatRelativeTime: () => 'just now',
  }),
}));

vi.mock('../../components/themes/ThemeSelector', () => ({
  default: ({ onCreateNewTheme }: { onCreateNewTheme: () => void }) => (
    <button onClick={onCreateNewTheme}>themesPage.selector.create</button>
  ),
}));

vi.mock('../../components/themes/ThemePreview', () => ({
  default: () => <div data-testid="theme-preview" />,
}));

vi.mock('../../components/settings/ThemeSettingsSection', () => ({
  default: ({ onCreateTheme }: { onCreateTheme: () => void }) => (
    <button onClick={onCreateTheme}>ThemeSettings</button>
  ),
}));

vi.mock('../../components/themes/ThemeGallery', () => ({
  default: () => <div data-testid="theme-gallery" />,
}));

vi.mock('../../components/themes/ThemeEditor', () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="theme-editor">
      <button onClick={onClose}>Close</button>
    </div>
  ),
}));

vi.mock('../../components/common/StatusMessage', () => ({
  LoadingMessage: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import ThemesPage from '../ThemesPage';

describe('ThemesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockActiveTheme = null;
  });

  it('renders the themes page heading (no-theme-selected state)', () => {
    render(
      <MemoryRouter>
        <ThemesPage />
      </MemoryRouter>
    );
    // When no active theme, the h1 renders the i18n key 'themesPage.hero.noThemeSelected'
    expect(
      screen.getByRole('heading', { name: 'themesPage.hero.noThemeSelected' })
    ).toBeInTheDocument();
  });

  it('shows no-theme-selected heading when no active theme', async () => {
    render(
      <MemoryRouter>
        <ThemesPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('themesPage.hero.noThemeSelected')).toBeInTheDocument();
    });
  });

  it('renders the create theme button', async () => {
    render(
      <MemoryRouter>
        <ThemesPage />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('themesPage.selector.create')).toBeInTheDocument();
    });
  });

  it('shows active theme name when a theme is active', async () => {
    mockActiveTheme = { theme_name: 'Ocean Blue', theme_description: 'A blue theme' };

    render(
      <MemoryRouter>
        <ThemesPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Ocean Blue')).toBeInTheDocument();
    });
  });
});
