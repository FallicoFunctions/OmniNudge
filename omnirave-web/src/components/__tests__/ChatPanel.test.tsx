import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChatPanel } from '../ChatPanel';

describe('ChatPanel', () => {
  it('keeps the input line visible when the history shell is collapsed', () => {
    render(<ChatPanel messages={[]} onSendMessage={() => {}} isSending={false} />);

    fireEvent.click(screen.getByRole('button', { name: /Collapse chat history/i }));

    expect(screen.getByPlaceholderText('Type message...')).toBeVisible();
  });

  it('renders chat history and submits a new message through the runtime callback', () => {
    const onSendMessage = vi.fn();

    const view = render(
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

    fireEvent.change(within(view.container).getByPlaceholderText('Type message...'), {
      target: { value: 'Meet at techno room' },
    });
    fireEvent.click(within(view.container).getByRole('button', { name: /Send/i }));

    expect(onSendMessage).toHaveBeenCalledWith('Meet at techno room');
  }, 10000);
});
