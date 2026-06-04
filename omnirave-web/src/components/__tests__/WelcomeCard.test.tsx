import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WelcomeCard } from '../WelcomeCard';

describe('WelcomeCard', () => {
  it('routes edit avatar through the welcome shell action', () => {
    const onEditAvatar = vi.fn();

    render(<WelcomeCard playerName="nick" mode="signup" onClose={vi.fn()} onEditAvatar={onEditAvatar} />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit Avatar' }));

    expect(onEditAvatar).toHaveBeenCalledTimes(1);
  });
});
