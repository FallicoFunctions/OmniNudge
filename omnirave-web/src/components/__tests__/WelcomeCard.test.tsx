import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WelcomeCard } from '../WelcomeCard';

describe('WelcomeCard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('routes edit avatar through the welcome shell action', () => {
    const onEditAvatar = vi.fn();

    render(<WelcomeCard playerName="nick" mode="signup" onClose={vi.fn()} onEditAvatar={onEditAvatar} />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit Avatar' }));

    expect(onEditAvatar).toHaveBeenCalledTimes(1);
  });

  it('auto-dismisses after a short delay', () => {
    const onClose = vi.fn();

    render(<WelcomeCard playerName="nick" mode="login" onClose={onClose} onEditAvatar={vi.fn()} />);

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not restart the dismiss timer on rerender', () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <WelcomeCard playerName="nick" mode="login" onClose={onClose} onEditAvatar={vi.fn()} />,
    );

    act(() => {
      vi.advanceTimersByTime(4000);
    });

    rerender(<WelcomeCard playerName="nick" mode="login" onClose={onClose} onEditAvatar={vi.fn()} />);

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
