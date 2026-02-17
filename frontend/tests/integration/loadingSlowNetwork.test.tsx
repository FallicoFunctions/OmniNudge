import { useEffect, useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SkeletonPost } from '../../src/components/loading';

function SlowFeedSimulation() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(false);
    }, 1200);
    return () => clearTimeout(timer);
  }, []);

  if (loading) {
    return (
      <div data-testid="slow-network-loading">
        <SkeletonPost />
      </div>
    );
  }

  return <div data-testid="slow-network-content">Loaded content</div>;
}

describe('Slow network loading behavior', () => {
  it('shows skeleton immediately during slow response and swaps to content', async () => {
    render(<SlowFeedSimulation />);

    expect(screen.getByTestId('slow-network-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('slow-network-content')).not.toBeInTheDocument();

    await waitFor(
      () => {
        expect(screen.getByTestId('slow-network-content')).toBeInTheDocument();
      },
      { timeout: 2500 }
    );
  });
});
