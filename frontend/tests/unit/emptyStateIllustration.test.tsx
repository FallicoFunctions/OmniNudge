import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmptyState, type EmptyStateIllustrationVariant } from '../../src/components/empty';

describe('EmptyState illustrations', () => {
  const variants: EmptyStateIllustrationVariant[] = [
    'noData',
    'noResults',
    'error',
    'permission',
    'messages',
    'posts',
    'media',
    'members',
    'notifications',
  ];

  it.each(variants)('renders variant: %s', (variant) => {
    const { container } = render(
      <EmptyState
        illustration={variant}
        title={`Title ${variant}`}
        description={`Description ${variant}`}
      />
    );

    expect(screen.getByText(`Title ${variant}`)).toBeInTheDocument();
    expect(container.querySelector('svg')).toBeTruthy();
  });
});
