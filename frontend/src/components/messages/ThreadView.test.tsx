import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThreadView } from './ThreadView';
import { __resetThreadCacheForTests } from '../../hooks/useThread';
import type { Message } from '../../types/messages';

const useMediaQueryMock = vi.fn(() => false);

vi.mock('../../hooks/useMediaQuery', () => ({
  useMediaQuery: () => useMediaQueryMock(),
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
    getMessageThreadMock.mockReset();
    __resetThreadCacheForTests();
    useMediaQueryMock.mockReturnValue(false);
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

  it('renders deep threads and caps nested visual depth indentation at level 3', async () => {
    const deepReplies = Array.from({ length: 10 }, (_, index) =>
      makeMessage(101 + index, {
        reply_to: index === 0 ? 100 : 100 + index,
        thread_root: 100,
      })
    );

    getMessageThreadMock.mockResolvedValueOnce({
      root_message: makeMessage(100),
      replies: deepReplies,
      reply_count: 10,
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

    await waitFor(() => expect(screen.getByText('message-110')).toBeInTheDocument());
    const deepest = document.getElementById('thread-message-110');
    expect(deepest).toBeTruthy();
    expect(deepest?.style.marginLeft).toBe('36px');
  });

  it('jumps to parent message when Jump action is clicked on a reply', async () => {
    getMessageThreadMock.mockResolvedValueOnce({
      root_message: makeMessage(100),
      replies: [makeMessage(101, { reply_to: 100, thread_root: 100 })],
      reply_count: 1,
      limit: 20,
      offset: 0,
    });

    const scrollSpy = vi.fn();
    const originalScrollIntoView = Element.prototype.scrollIntoView;
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollSpy,
    });
    try {
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
      await user.click(screen.getByRole('button', { name: 'Jump' }));

      expect(scrollSpy).toHaveBeenCalledTimes(1);
    } finally {
      if (originalScrollIntoView) {
        Object.defineProperty(Element.prototype, 'scrollIntoView', {
          configurable: true,
          value: originalScrollIntoView,
        });
      } else {
        Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
      }
    }
  });

  it('uses mobile layout classes when media query matches mobile', async () => {
    useMediaQueryMock.mockReturnValue(true);
    getMessageThreadMock.mockResolvedValueOnce({
      root_message: makeMessage(100),
      replies: [],
      reply_count: 0,
      limit: 20,
      offset: 0,
    });

    const { container } = render(
      <ThreadView
        open={true}
        rootMessageId={100}
        currentUserId={1}
        onClose={() => {}}
        renderMessageContent={(message) => <span>{message.encrypted_content}</span>}
        formatTimestamp={() => 'now'}
      />
    );

    await waitFor(() => expect(screen.getByText('message-100')).toBeInTheDocument());
    const backdrop = container.querySelector('.fixed.inset-0');
    expect(backdrop?.className).toContain('items-center');
    expect(backdrop?.className).toContain('p-4');
  });

  it('applies real-time thread reply updates from browser events', async () => {
    getMessageThreadMock.mockResolvedValueOnce({
      root_message: makeMessage(100),
      replies: [],
      reply_count: 0,
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

    await waitFor(() => expect(screen.getByText('message-100')).toBeInTheDocument());

    act(() => {
      window.dispatchEvent(
        new CustomEvent('thread-reply-added', {
          detail: {
            type: 'thread_reply_added',
            conversation_id: 10,
            thread_root: 100,
            reply_id: 111,
            reply_count: 1,
            message: makeMessage(111, { reply_to: 100, thread_root: 100 }),
          },
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByText('message-111')).toBeInTheDocument();
      expect(screen.getByText('1 reply')).toBeInTheDocument();
    });
  });

  it('shows deleted-root indicator when root is tombstoned', async () => {
    getMessageThreadMock.mockResolvedValueOnce({
      root_message: makeMessage(100, {
        encrypted_content: '[deleted]',
        deleted_for_sender: true,
        deleted_for_recipient: true,
      }),
      replies: [makeMessage(101, { reply_to: 100, thread_root: 100 })],
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
      expect(screen.getByText('Message deleted')).toBeInTheDocument();
      expect(screen.getByText('message-101')).toBeInTheDocument();
    });
  });
});
