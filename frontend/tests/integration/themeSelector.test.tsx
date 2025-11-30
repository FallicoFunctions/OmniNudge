import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent, screen, waitFor } from '@testing-library/react';
import React from 'react';
import ThemeSelector from '../../src/components/themes/ThemeSelector';
import { ThemeContext } from '../../src/contexts/ThemeContext';
import type { UserTheme } from '../../src/types/theme';

const createTheme = (overrides: Partial<UserTheme> = {}): UserTheme => ({
  id: overrides.id ?? 1,
  user_id: 1,
  theme_name: overrides.theme_name ?? `Theme ${overrides.id ?? 1}`,
  theme_type: 'predefined',
  scope_type: 'global',
  css_variables: {},
  is_public: false,
  install_count: 0,
  rating_count: 0,
  average_rating: 0,
  version: '1.0.0',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
});

const renderSelector = (valueOverrides: Partial<React.ContextType<typeof ThemeContext>> = {}) => {
  const defaultValue: React.ContextType<typeof ThemeContext> = {
    activeTheme: null,
    predefinedThemes: [createTheme({ id: 1 }), createTheme({ id: 2 })],
    customThemes: [],
    cssVariables: {},
    isLoading: false,
    error: null,
    selectTheme: vi.fn(),
    selectThemeById: vi.fn(),
    refreshThemes: vi.fn(),
    userSettings: null,
    refreshSettings: vi.fn(),
    setAdvancedMode: vi.fn(),
  };

  const value = { ...defaultValue, ...valueOverrides };

  return render(
    <ThemeContext.Provider value={value}>
      <ThemeSelector />
    </ThemeContext.Provider>
  );
};

describe('ThemeSelector integration', () => {
  it('selects a theme and closes menu', async () => {
    const selectTheme = vi.fn().mockResolvedValue(undefined);
    renderSelector({ selectTheme });

    fireEvent.click(screen.getByRole('button', { name: /active theme/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Theme 1/i }));

    await waitFor(() => {
      expect(selectTheme).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
    });

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  it('shows loading state', () => {
    renderSelector({ isLoading: true });
    fireEvent.click(screen.getByRole('button', { name: /active theme/i }));
    expect(screen.getByText(/Loading themes/i)).toBeInTheDocument();
  });

  it('refresh button calls refresh handler', async () => {
    const refreshThemes = vi.fn().mockResolvedValue(undefined);
    renderSelector({ refreshThemes });

    fireEvent.click(screen.getByRole('button', { name: /active theme/i }));
    fireEvent.click(screen.getByRole('button', { name: /refresh/i }));
    await waitFor(() => {
      expect(refreshThemes).toHaveBeenCalled();
    });
  });
});
