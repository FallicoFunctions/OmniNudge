import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThreadView } from './ThreadView';
import { __resetThreadCacheForTests } from '../../hooks/useThread';
import type { Message } from '../../types/messages';

vi.mock('../../hooks/useMediaQuery', () => ({
  useMediaQuery: () => false,
}));

vi.mock('../../services/messagesService', () => ({
  messagesService: {
    getMessageThread: vi.fn(),
  },
}));

import { messagesService } from '../../services/messagesService';

const getMessageThreadMock = vi.mocked(messagesService.getMessageThread);

function makeMessage(id: number, overrides: Partial<Message> = {}): Message {
  return {
    id,
    conversation_id: 10,
    sender_id: 1,
    recipient_id: 2,
    encrypted_content: `message-${id}`,
    message_type: 'text',
    sent_at: new Date('2026-02-19T00:00:00Z').toISOString(),
    encryption_version: 'v1',
    ...overrides,
  };
}

describe('ThreadView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetThreadCacheForTests();
  });

  it('loads and renders root + replies', async () => {
    getMessageThreadMock.mockResolvedValueOnce({
      root_message: makeMessage(100),
      replies: [makeMessage(101, { reply_to: 100 })],
      reply_count: 1,
      limit: 20,
      offset: 0,
    });

    render(
      <ThreadView
        open={true}
        rootMessageId={100}
        currentUserId={1}
        onClose={() => {}}
        renderMessageContent={(message) => <span>{message.encrypted_content}</span>}
        formatTimestamp={() => 'now'}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Thread')).toBeInTheDocument();
      expect(screen.getByText('message-100')).toBeInTheDocument();
      expect(screen.getByText('message-101')).toBeInTheDocument();
    });
  });

  it('loads more replies using offset pagination', async () => {
    getMessageThreadMock
      .mockResolvedValueOnce({
        root_message: makeMessage(100),
        replies: [makeMessage(101, { reply_to: 100 })],
        reply_count: 2,
        limit: 20,
        offset: 0,
      })
      .mockResolvedValueOnce({
        root_message: makeMessage(100),
        replies: [makeMessage(102, { reply_to: 101, thread_root: 100 })],
        reply_count: 2,
        limit: 20,
        offset: 1,
      });

    const user = userEvent.setup();
    render(
      <ThreadView
        open={true}
        rootMessageId={100}
        currentUserId={1}
        onClose={() => {}}
        renderMessageContent={(message) => <span>{message.encrypted_content}</span>}
        formatTimestamp={() => 'now'}
      />
    );

    await waitFor(() => expect(screen.getByText('message-101')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Load more replies' }));

    await waitFor(() => {
      expect(getMessageThreadMock).toHaveBeenCalledWith(100, 20, 1);
      expect(screen.getByText('message-102')).toBeInTheDocument();
    });
  });

  it('submits reply text to root when reply input is used', async () => {
    getMessageThreadMock.mockResolvedValue({
      root_message: makeMessage(100),
      replies: [],
      reply_count: 0,
      limit: 20,
      offset: 0,
    });

    const onSubmitReply = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(
      <ThreadView
        open={true}
        rootMessageId={100}
        currentUserId={1}
        onClose={() => {}}
        onSubmitReply={onSubmitReply}
        renderMessageContent={(message) => <span>{message.encrypted_content}</span>}
        formatTimestamp={() => 'now'}
      />
    );

    await waitFor(() => expect(screen.getByText('message-100')).toBeInTheDocument());
    await user.type(screen.getByPlaceholderText('Reply in thread...'), 'hello thread');
    await user.click(screen.getByRole('button', { name: 'Reply' }));

    await waitFor(() => {
      expect(onSubmitReply).toHaveBeenCalledWith({ replyTo: 100, content: 'hello thread' });
    });
  });
});
