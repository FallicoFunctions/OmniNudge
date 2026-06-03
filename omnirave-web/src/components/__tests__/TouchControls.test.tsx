import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TouchControls } from '../TouchControls';

describe('TouchControls', () => {
  it('renders touch controls on mobile and requires explicit enter interaction', () => {
    const onUnlock = vi.fn();

    render(<TouchControls unlocked={false} onUnlock={onUnlock} onMoveToZone={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: /Enter OmniRave/i }));
    expect(onUnlock).toHaveBeenCalledTimes(1);
  });

  it('renders the active touch controls after unlock', () => {
    render(<TouchControls unlocked={true} onUnlock={() => {}} onMoveToZone={() => {}} />);

    expect(screen.getByTestId('touch-controls')).toBeInTheDocument();
  });

  it('sends a movement target when a touch zone shortcut is tapped', () => {
    const onMoveToZone = vi.fn();

    const view = render(<TouchControls unlocked={true} onUnlock={() => {}} onMoveToZone={onMoveToZone} />);

    fireEvent.click(within(view.container).getByRole('button', { name: /Touch Jump to The Underground/i }));
    expect(onMoveToZone).toHaveBeenCalledWith('techno_room');
  });
});
