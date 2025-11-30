import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import ThemeEditor from '../../src/components/themes/ThemeEditor';
import type { UserTheme } from '../../src/types/theme';
import { themeService } from '../../src/services/themeService';

const createTheme = (overrides: Partial<UserTheme> = {}): UserTheme => ({
  id: overrides.id ?? 1,
  user_id: 1,
  theme_name: overrides.theme_name ?? 'Base Theme',
  theme_type: overrides.theme_type ?? 'predefined',
  scope_type: 'global',
  css_variables: overrides.css_variables ?? { '--color-primary': '#ff0000' },
  is_public: false,
  install_count: 0,
  rating_count: 0,
  average_rating: 0,
  version: '1.0.0',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
});

let mockContextValue: any;

vi.mock('../../src/hooks/useTheme', () => ({
  useTheme: () => mockContextValue,
}));

vi.mock('../../src/components/themes/CSSVariableEditor', () => ({
  default: () => <div data-testid="css-variable-editor">Editor</div>,
}));

vi.mock('../../src/components/themes/ThemePreview', () => ({
  default: () => <div data-testid="theme-preview">Preview</div>,
}));

vi.mock('react-colorful', () => ({
  HexColorPicker: () => <div data-testid="color-picker" />,
}));

describe('ThemeEditor integration', () => {
  beforeEach(() => {
    mockContextValue = {
      predefinedThemes: [createTheme({ id: 1 })],
      customThemes: [],
      refreshThemes: vi.fn().mockResolvedValue(undefined),
      selectTheme: vi.fn().mockResolvedValue(undefined),
    };
    vi.spyOn(themeService, 'createTheme').mockResolvedValue(createTheme({ id: 5 }));
    vi.spyOn(themeService, 'updateTheme').mockResolvedValue(createTheme({ id: 5 }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('creates a new theme and activates it', async () => {
    const onClose = vi.fn();

    render(<ThemeEditor isOpen onClose={onClose} />);

    fireEvent.click(screen.getByText(/Start from Scratch/i));
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));

    const [nameInput, descriptionInput] = screen.getAllByRole('textbox');
    fireEvent.change(nameInput, { target: { value: 'Sunset' } });
    fireEvent.change(descriptionInput, { target: { value: 'Warm tones' } });
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));
    fireEvent.click(screen.getByRole('button', { name: /Create Theme/i }));

    await waitFor(() => {
      expect(themeService.createTheme).toHaveBeenCalledWith(
        expect.objectContaining({
          theme_name: 'Sunset',
          theme_description: 'Warm tones',
        })
      );
    });

    expect(mockContextValue.refreshThemes).toHaveBeenCalled();
    expect(mockContextValue.selectTheme).toHaveBeenCalled();

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('updates an existing theme without reactivating it', async () => {
    const initialTheme = createTheme({ id: 42, theme_name: 'Existing' });
    const onClose = vi.fn();

    render(<ThemeEditor isOpen onClose={onClose} initialTheme={initialTheme} />);

    fireEvent.click(screen.getByRole('button', { name: /Next/i }));
    const [nameInput] = screen.getAllByRole('textbox');
    fireEvent.change(nameInput, { target: { value: 'Updated Theme' } });
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));
    fireEvent.click(screen.getByRole('button', { name: /Update Theme/i }));

    await waitFor(() => {
      expect(themeService.updateTheme).toHaveBeenCalledWith(
        42,
        expect.objectContaining({
          theme_name: 'Updated Theme',
        })
      );
    });

    expect(mockContextValue.refreshThemes).toHaveBeenCalled();
    expect(mockContextValue.selectTheme).not.toHaveBeenCalled();
  });
});
