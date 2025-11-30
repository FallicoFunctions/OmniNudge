import React from 'react';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import ThemePreview from '../../src/components/themes/ThemePreview';
import { DEFAULT_THEME_VARIABLES } from '../../src/data/themeVariables';

const flushPreviewTimers = () => {
  vi.advanceTimersByTime(500);
};

const renderSnapshot = (props: React.ComponentProps<typeof ThemePreview>) => {
  const { container } = render(<ThemePreview {...props} showControls={false} />);
  flushPreviewTimers();
  return container.firstChild;
};

describe('ThemePreview snapshots', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('matches snapshot for default desktop feed view', () => {
    const node = renderSnapshot({ variables: DEFAULT_THEME_VARIABLES });
    expect(node).toMatchSnapshot();
  });

  it('matches snapshot for mobile messages view', () => {
    const customVars = {
      ...DEFAULT_THEME_VARIABLES,
      '--color-primary': '#ff6b6b',
      '--color-background': '#0f172a',
      '--color-surface': '#1e293b',
      '--color-text-primary': '#f8fafc',
      '--color-text-secondary': '#cbd5f5',
    };
    const node = renderSnapshot({
      variables: customVars,
      initialDevice: 'mobile',
      initialPage: 'messages',
    });
    expect(node).toMatchSnapshot();
  });
});
