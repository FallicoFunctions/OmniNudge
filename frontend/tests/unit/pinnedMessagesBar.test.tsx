import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PinnedMessagesBar } from '../../src/components/messages/PinnedMessagesBar';
import type { Message } from '../../src/types/messages';

const makeMessage = (id: number, pinnedBy?: number): Message => ({
  id,
  conversation_id: 99,
  sender_id: 1,
  recipient_id: 2,
  encrypted_content: `message ${id}`,
  message_type: 'text',
  sent_at: new Date().toISOString(),
  encryption_version: 'plaintext',
  pinned: true,
  pinned_by: pinnedBy ?? 1,
  pinned_at: new Date().toISOString(),
});

describe('PinnedMessagesBar', () => {
  it('renders nothing when there are no pinned messages', () => {
    const { container } = render(
      <PinnedMessagesBar
        pinnedMessages={[]}
        expanded={false}
        onToggleExpanded={vi.fn()}
        onJumpToMessage={vi.fn()}
        onUnpinMessage={vi.fn()}
      />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('shows first three messages and toggles expansion', () => {
    const onToggleExpanded = vi.fn();
    const messages = [makeMessage(1), makeMessage(2), makeMessage(3), makeMessage(4)];

    const { rerender } = render(
      <PinnedMessagesBar
        pinnedMessages={messages}
        currentUserId={1}
        expanded={false}
        onToggleExpanded={onToggleExpanded}
        onJumpToMessage={vi.fn()}
        onUnpinMessage={vi.fn()}
      />
    );

    expect(screen.getByText('message 1')).toBeInTheDocument();
    expect(screen.queryByText('message 4')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Show 1 more'));
    expect(onToggleExpanded).toHaveBeenCalledTimes(1);

    rerender(
      <PinnedMessagesBar
        pinnedMessages={messages}
        currentUserId={1}
        expanded={true}
        onToggleExpanded={onToggleExpanded}
        onJumpToMessage={vi.fn()}
        onUnpinMessage={vi.fn()}
      />
    );

    expect(screen.getByText('message 4')).toBeInTheDocument();
  });

  it('shows unpin button only when the user can unpin', () => {
    const messages = [makeMessage(1, 7), makeMessage(2, 8)];

    const { rerender } = render(
      <PinnedMessagesBar
        pinnedMessages={messages}
        currentUserId={7}
        expanded={true}
        onToggleExpanded={vi.fn()}
        onJumpToMessage={vi.fn()}
        onUnpinMessage={vi.fn()}
      />
    );

    expect(screen.getAllByText('Unpin')).toHaveLength(1);

    rerender(
      <PinnedMessagesBar
        pinnedMessages={messages}
        currentUserId={9}
        currentUserRole="admin"
        expanded={true}
        onToggleExpanded={vi.fn()}
        onJumpToMessage={vi.fn()}
        onUnpinMessage={vi.fn()}
      />
    );

    expect(screen.getAllByText('Unpin')).toHaveLength(2);
  });

  it('fires jump and unpin callbacks', () => {
    const onJumpToMessage = vi.fn();
    const onUnpinMessage = vi.fn();

    render(
      <PinnedMessagesBar
        pinnedMessages={[makeMessage(1, 5)]}
        currentUserId={5}
        expanded={true}
        onToggleExpanded={vi.fn()}
        onJumpToMessage={onJumpToMessage}
        onUnpinMessage={onUnpinMessage}
      />
    );

    fireEvent.click(screen.getByText('message 1'));
    expect(onJumpToMessage).toHaveBeenCalledWith(1);

    fireEvent.click(screen.getByText('Unpin'));
    expect(onUnpinMessage).toHaveBeenCalledWith(1);
  });
});
