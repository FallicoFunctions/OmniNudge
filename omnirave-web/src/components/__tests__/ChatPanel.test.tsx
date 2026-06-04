import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChatPanel } from '../ChatPanel';

describe('ChatPanel', () => {
  it('keeps the input line visible when the history shell is collapsed', () => {
    render(<ChatPanel messages={[]} onSendMessage={() => {}} isSending={false} initialHistoryCollapsed />);

    const collapseButton = screen.getByRole('button', { name: /Expand chat history/i });

    expect(collapseButton).toHaveAttribute('aria-expanded', 'false');
    expect(collapseButton).toHaveAttribute('aria-controls');

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
    expect(within(view.container).getByRole('button', { name: /Collapse chat history/i })).toHaveAttribute('aria-expanded', 'true');

    fireEvent.change(within(view.container).getByPlaceholderText('Type message...'), {
      target: { value: 'Meet at techno room' },
    });
    fireEvent.click(within(view.container).getByRole('button', { name: /Send/i }));

    expect(onSendMessage).toHaveBeenCalledWith('Meet at techno room');
  }, 10000);

  it('clears the draft when the runtime respawn reset signal changes without reopening history', () => {
    const view = render(
      <ChatPanel
        messages={[]}
        onSendMessage={() => {}}
        isSending={false}
        initialHistoryCollapsed
        composerResetSignal={0}
      />,
    );

    const toggle = within(view.container).getByRole('button', { name: /Expand chat history/i });
    const input = within(view.container).getByPlaceholderText('Type message...');

    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.change(input, {
      target: { value: 'Keep this only until respawn' },
    });

    view.rerender(
      <ChatPanel
        messages={[]}
        onSendMessage={() => {}}
        isSending={false}
        initialHistoryCollapsed
        composerResetSignal={1}
      />,
    );

    expect(within(view.container).getByPlaceholderText('Type message...')).toHaveValue('');
    expect(within(view.container).getByRole('button', { name: /Expand chat history/i })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });
});
