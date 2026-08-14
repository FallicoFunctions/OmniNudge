import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useMobileMediaUnlock } from '../useMobileMediaUnlock';

function Probe() {
  const state = useMobileMediaUnlock();
  return (
    <div>
      <span>{state.unlocked ? 'unlocked' : 'locked'}</span>
      <span>{state.isTouchDevice ? 'touch' : 'desktop'}</span>
    </div>
  );
}

describe('useMobileMediaUnlock', () => {
  it('starts desktop sessions unlocked', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );

    render(<Probe />);

    expect(screen.getByText('desktop')).toBeInTheDocument();
    expect(screen.getByText('unlocked')).toBeInTheDocument();
  });

  it('keeps touch devices locked until the player explicitly unlocks', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation(() => ({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );

    render(<Probe />);

    expect(screen.getByText('touch')).toBeInTheDocument();
    expect(screen.getByText('locked')).toBeInTheDocument();
  });
});
