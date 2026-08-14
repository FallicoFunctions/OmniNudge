import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MarkdownRenderer } from './MarkdownRenderer';

describe('MarkdownRenderer URL handling', () => {
  it('does not emit executable URL schemes in Markdown links', () => {
    render(<MarkdownRenderer content="[unsafe](javascript:alert(1))" />);

    expect(screen.getByRole('link', { name: 'unsafe' })).toHaveAttribute('href', '#');
  });
});
