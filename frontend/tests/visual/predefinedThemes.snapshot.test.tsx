import React from 'react';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import ThemePreviewCard from '../../src/components/themes/ThemePreviewCard';
import type { UserTheme } from '../../src/types/theme';

const createTheme = (theme: Partial<UserTheme>): UserTheme => ({
  id: theme.id ?? Math.floor(Math.random() * 10000),
  user_id: 1,
  theme_name: theme.theme_name ?? 'Theme',
  theme_description: theme.theme_description ?? '',
  theme_type: theme.theme_type ?? 'predefined',
  scope_type: theme.scope_type ?? 'global',
  css_variables: theme.css_variables ?? {},
  is_public: true,
  install_count: theme.install_count ?? 0,
  rating_count: theme.rating_count ?? 0,
  average_rating: theme.average_rating ?? 4.5,
  version: '1.0.0',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

const PREDEFINED_THEMES: UserTheme[] = [
  createTheme({
    id: 1,
    theme_name: 'Aurora Glow',
    theme_description: 'Cool gradient inspired by northern lights.',
    css_variables: {
      '--color-primary': '#6366f1',
      '--color-background': '#0f172a',
      '--color-surface': '#1e1b4b',
      '--color-text-primary': '#e0e7ff',
      '--color-text-secondary': '#c7d2fe',
      '--color-border': '#312e81',
    },
  }),
  createTheme({
    id: 2,
    theme_name: 'Midnight Pulse',
    theme_description: 'High-contrast dark UI with neon accents.',
    css_variables: {
      '--color-primary': '#14b8a6',
      '--color-background': '#020617',
      '--color-surface': '#0f172a',
      '--color-text-primary': '#f8fafc',
      '--color-text-secondary': '#94a3b8',
      '--color-border': '#1e293b',
    },
  }),
  createTheme({
    id: 3,
    theme_name: 'Desert Bloom',
    theme_description: 'Warm desert sunset palette.',
    css_variables: {
      '--color-primary': '#f97316',
      '--color-background': '#fff7ed',
      '--color-surface': '#fffbeb',
      '--color-text-primary': '#7c2d12',
      '--color-text-secondary': '#9a3412',
      '--color-border': '#fed7aa',
    },
  }),
  createTheme({
    id: 4,
    theme_name: 'Neon Circuit',
    theme_description: 'Electric teal and magenta for futuristic dashboards.',
    css_variables: {
      '--color-primary': '#0ea5e9',
      '--color-background': '#0a0a0f',
      '--color-surface': '#111827',
      '--color-text-primary': '#e0f2fe',
      '--color-text-secondary': '#bae6fd',
      '--color-border': '#1f2937',
    },
  }),
  createTheme({
    id: 5,
    theme_name: 'Forest Whisper',
    theme_description: 'Organic greens with calming neutrals.',
    css_variables: {
      '--color-primary': '#16a34a',
      '--color-background': '#f1f5f9',
      '--color-surface': '#f8fafc',
      '--color-text-primary': '#064e3b',
      '--color-text-secondary': '#047857',
      '--color-border': '#bbf7d0',
    },
  }),
  createTheme({
    id: 6,
    theme_name: 'Ocean Mist',
    theme_description: 'Soft teal gradients with airy whites.',
    css_variables: {
      '--color-primary': '#0ea5e9',
      '--color-background': '#e0f2fe',
      '--color-surface': '#f0f9ff',
      '--color-text-primary': '#0c4a6e',
      '--color-text-secondary': '#0284c7',
      '--color-border': '#bae6fd',
    },
  }),
  createTheme({
    id: 7,
    theme_name: 'Solar Flare',
    theme_description: 'Bold oranges with deep charcoal.',
    css_variables: {
      '--color-primary': '#fb923c',
      '--color-background': '#1c1917',
      '--color-surface': '#292524',
      '--color-text-primary': '#fef3c7',
      '--color-text-secondary': '#fcd34d',
      '--color-border': '#7c2d12',
    },
  }),
  createTheme({
    id: 8,
    theme_name: 'Velvet Noir',
    theme_description: 'Luxury purples with gold highlights.',
    css_variables: {
      '--color-primary': '#9333ea',
      '--color-background': '#0f0a1f',
      '--color-surface': '#1f1537',
      '--color-text-primary': '#f5f3ff',
      '--color-text-secondary': '#c4b5fd',
      '--color-border': '#4c1d95',
      '--color-success': '#facc15',
    },
  }),
];

describe('Predefined theme snapshots', () => {
  PREDEFINED_THEMES.forEach((theme) => {
    it(`matches snapshot for ${theme.theme_name}`, () => {
      const { container } = render(<ThemePreviewCard theme={theme} />);
      expect(container.firstChild).toMatchSnapshot();
    });
  });
});
