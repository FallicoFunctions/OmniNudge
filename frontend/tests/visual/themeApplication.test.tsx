import React from 'react';
import { describe, expect, it, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ThemePreview from '../../src/components/themes/ThemePreview';
import ThemePreviewCard from '../../src/components/themes/ThemePreviewCard';
import type { UserTheme } from '../../src/types/theme';

const createTheme = (overrides: Partial<UserTheme>): UserTheme => ({
  id: overrides.id ?? 999,
  user_id: 1,
  theme_name: overrides.theme_name ?? 'Visual Theme',
  theme_type: overrides.theme_type ?? 'predefined',
  scope_type: overrides.scope_type ?? 'global',
  css_variables: overrides.css_variables ?? {},
  is_public: overrides.is_public ?? true,
  install_count: overrides.install_count ?? 420,
  rating_count: overrides.rating_count ?? 20,
  average_rating: overrides.average_rating ?? 4.6,
  version: overrides.version ?? '1.0.0',
  created_at: overrides.created_at ?? new Date().toISOString(),
  updated_at: overrides.updated_at ?? new Date().toISOString(),
  theme_description: overrides.theme_description ?? 'Preview card visualization',
});

describe('Theme application styling', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('applies custom CSS variables to ThemePreview', () => {
    vi.useFakeTimers();
    const customVariables = {
      '--color-primary': '#ff6b6b',
      '--color-background': '#0b1120',
      '--color-surface': '#1e1b4b',
      '--color-text-primary': '#e2e8f0',
      '--color-text-secondary': '#cbd5f5',
    };

    const { container } = render(
      <ThemePreview variables={customVariables} showControls={false} initialPage="profile" />
    );
    vi.advanceTimersByTime(500);

    const frame = container.querySelector('.rounded-3xl') as HTMLElement | null;
    expect(frame).not.toBeNull();
    expect(frame?.getAttribute('style')).toContain('--color-primary: #ff6b6b');
    expect(frame?.getAttribute('style')).toContain('--color-background: #0b1120');
  });

  it('renders ThemePreviewCard using theme color tokens', () => {
    const theme = createTheme({
      theme_name: 'Sunset Dream',
      css_variables: {
        '--color-primary': '#f97316',
        '--color-background': '#fff7ed',
        '--color-surface': '#fffbeb',
        '--color-text-primary': '#7c2d12',
        '--color-text-secondary': '#9a3412',
        '--color-border': '#fed7aa',
        '--color-success': '#16a34a',
      },
    });

    render(<ThemePreviewCard theme={theme} isActive />);

    const cta = screen.getByText('CTA') as HTMLElement;
    expect(cta.style.backgroundColor).toBe('rgb(249, 115, 22)');
    expect(screen.getByText('Sunset Dream')).toBeInTheDocument();
  });
});
