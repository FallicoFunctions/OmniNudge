import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChatPanel } from '../ChatPanel';

describe('ChatPanel', () => {
  it('renders chat history and submits a new message through the runtime callback', () => {
    const onSendMessage = vi.fn();

    render(
      <ChatPanel
        messages={[
          {
            playerId: 'guest-1',
            playerName: 'Guest-1',
            body: 'Warm up at the main stage',
            createdAt: '2026-06-02T12:00:00Z',
          },
        ]}
        onSendMessage={onSendMessage}
        isSending={false}
      />,
    );

    expect(screen.getByText(/Warm up at the main stage/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Message/i), {
      target: { value: 'Meet at techno room' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Send/i }));

    expect(onSendMessage).toHaveBeenCalledWith('Meet at techno room');
  }, 10000);
});
