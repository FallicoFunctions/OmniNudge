import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import type { UserTheme } from '../../src/types/theme';
import ThemeSelector from '../../src/components/themes/ThemeSelector';
import { ThemeContext } from '../../src/contexts/ThemeContext';

const mockTheme = (overrides: Partial<UserTheme> = {}): UserTheme => ({
  id: overrides.id ?? 1,
  user_id: 1,
  theme_name: `Theme ${overrides.id ?? 1}`,
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

const renderWithContext = (valueOverrides: Partial<React.ContextType<typeof ThemeContext>>) => {
  const value: React.ContextType<typeof ThemeContext> = {
    activeTheme: null,
    predefinedThemes: [mockTheme({ id: 1 }), mockTheme({ id: 2 })],
    customThemes: [],
    cssVariables: {},
    isLoading: false,
    error: null,
    selectTheme: async () => {},
    selectThemeById: async () => {},
    refreshThemes: async () => {},
    userSettings: null,
    refreshSettings: async () => {},
    setAdvancedMode: async () => {},
    ...valueOverrides,
  };

  return render(
    <ThemeContext.Provider value={value}>
      <ThemeSelector />
    </ThemeContext.Provider>
  );
};

test('ThemeSelector opens menu and selects a theme', async () => {
  let selectedId: number | undefined;
  renderWithContext({
    selectTheme: async (theme) => {
      selectedId = theme.id;
    },
  });

  const trigger = screen.getByRole('button', { name: /active theme/i });
  fireEvent.click(trigger);

  const option = await screen.findByRole('button', { name: /Theme 1/i });
  fireEvent.click(option);

  assert.equal(selectedId, 1);
});

test('ThemeSelector shows loading state', () => {
  renderWithContext({ isLoading: true });
  fireEvent.click(screen.getByRole('button', { name: /active theme/i }));
  assert.ok(screen.getByText(/Loading themes/i));
});

test('ThemeSelector announces selection', () => {
  renderWithContext({});
  fireEvent.click(screen.getByRole('button', { name: /active theme/i }));
  fireEvent.click(screen.getByRole('button', { name: /Theme 1/i }));
  const liveRegion = screen.getByText(/Theme Theme 1 selected/);
  assert.ok(liveRegion);
});
