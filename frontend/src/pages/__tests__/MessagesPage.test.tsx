import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MessagesPage from '../MessagesPage';
import type { Conversation } from '../../types/messages';
import { hubsService } from '../../services/hubsService';
import { redditService } from '../../services/redditService';
import { messagesService } from '../../services/messagesService';

const archiveConversation = vi.fn();
const archiveConversationsBatch = vi.fn();
const unarchiveConversation = vi.fn();
const setActiveConversationId = vi.fn();

const activeConversation: Conversation = {
  id: 101,
  created_at: new Date().toISOString(),
  last_message_at: new Date().toISOString(),
  conversation_type: 'dm',
  unread_count: 0,
  archived_at: null,
  is_archived: false,
  other_user: {
    id: 42,
    username: 'alice',
  },
};

const archivedConversation: Conversation = {
  ...activeConversation,
  id: 202,
  is_archived: true,
  archived_at: new Date().toISOString(),
  other_user: {
    id: 43,
    username: 'bob',
  },
};

const forwardTargetConversation: Conversation = {
  ...activeConversation,
  id: 303,
  other_user: {
    id: 42,
    username: 'alice-archive',
  },
};

const mockConversationMessage = {
  id: 9001,
  conversation_id: 101,
  sender_id: 42,
  recipient_id: 7,
  encrypted_content: 'source-encrypted',
  sender_encrypted_content: 'source-sender-encrypted',
  message_type: 'text' as const,
  sent_at: new Date().toISOString(),
  encryption_version: 'v1',
  reply_count: 1,
};

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 7, username: 'tester' },
  }),
}));

vi.mock('../../contexts/MessagingContext', () => ({
  useMessagingContext: () => ({
    setActiveConversationId,
  }),
}));

vi.mock('../../contexts/WebSocketContext', () => ({
  useWebSocket: () => ({
    sendTypingIndicator: vi.fn(),
    isUserOnline: vi.fn(() => false),
  }),
}));

vi.mock('../../contexts/SettingsContext', () => ({
  useSettings: () => ({
    typingIndicators: false,
    readReceipts: false,
    speakerDeviceId: '',
  }),
}));

vi.mock('../../hooks/useArchive', () => ({
  useArchive: () => ({
    archiveConversation,
    archiveConversationsBatch,
    unarchiveConversation,
    isArchiving: false,
    isBatchArchiving: false,
    isUnarchiving: false,
  }),
}));

vi.mock('../../hooks/useMediaQuery', () => ({
  useMediaQuery: () => true,
}));

vi.mock('../../services/messagesService', () => ({
  messagesService: {
    getConversationsPage: vi.fn(async () => ({
      conversations: [activeConversation, forwardTargetConversation],
      next_cursor: undefined,
    })),
    getArchivedConversationsPage: vi.fn(async () => ({
      conversations: [archivedConversation],
      next_cursor: undefined,
    })),
    getMessagesPage: vi.fn(async () => ({
      messages: [mockConversationMessage],
      next_cursor: undefined,
    })),
    getPinnedMessages: vi.fn(async () => ({
      pinned_messages: [],
    })),
    getMessageThread: vi.fn(async () => ({
      root_message: mockConversationMessage,
      replies: [],
      reply_count: 0,
      limit: 20,
      offset: 0,
    })),
    sendMessage: vi.fn(async () => ({
      ...mockConversationMessage,
      id: 9002,
      encrypted_content: 'sent-message',
      sender_id: 7,
      recipient_id: 42,
      reply_to: 9001,
      thread_root: 9001,
      reply_count: 0,
    })),
    pinMessage: vi.fn(async () => {}),
    unpinMessage: vi.fn(async () => {}),
    forwardMessage: vi.fn(async () => ({
      original_message_id: 9001,
      forwarded_message_ids: [9002],
      forwarded_count: 1,
    })),
  },
}));

vi.mock('../../services/encryptionService', () => ({
  encryptionService: {
    getPublicKeys: vi.fn(async () => ({
      42: 'recipient-public-key-b64',
    })),
  },
}));

vi.mock('../../services/keyManagementService', () => ({
  getOwnKeys: vi.fn(async () => ({
    publicKey: {} as CryptoKey,
    privateKey: {} as CryptoKey,
  })),
  getUserPublicKey: vi.fn(async () => ({}) as CryptoKey),
}));

vi.mock('../../utils/encryption', async () => {
  const actual =
    await vi.importActual<typeof import('../../utils/encryption')>('../../utils/encryption');
  return {
    ...actual,
    decryptMessage: vi.fn(async () => 'decrypted-forward-plaintext'),
    encryptMessage: vi.fn(async () => 'fresh-forward-cipher'),
    encryptForMultipleRecipients: vi.fn(async () => ({
      encryptedContent: 'fresh-multi-cipher',
      senderEncryptedContent: 'fresh-multi-sender-cipher',
      sharedIv: 'shared-iv',
      recipientKeys: { 7: 'rk7', 42: 'rk42' },
    })),
  };
});

vi.mock('../../services/hubsService', () => ({
  hubsService: {
    searchHubs: vi.fn(async () => []),
    getHubPosts: vi.fn(async () => ({ posts: [] })),
  },
}));

vi.mock('../../services/redditService', () => ({
  redditService: {
    autocompleteSubreddits: vi.fn(async () => []),
    getSubredditPosts: vi.fn(async () => ({ posts: [] })),
  },
}));

const renderPage = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <MessagesPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
};

describe('MessagesPage swipe archive gestures', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('archives on left swipe in active tab', async () => {
    renderPage();

    await screen.findByText('alice');
    const row = (await screen.findAllByRole('button', { name: 'Open conversation' }))[0];

    fireEvent.touchStart(row, {
      touches: [{ clientX: 240, clientY: 24 }],
    });
    fireEvent.touchEnd(row, {
      changedTouches: [{ clientX: 140, clientY: 25 }],
    });

    await waitFor(() => {
      expect(archiveConversation).toHaveBeenCalledWith(101);
    });
  }, 10000);

  it('unarchives on right swipe in archived tab', async () => {
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Archived' }));
    const row = (await screen.findAllByRole('button', { name: 'Open conversation' }))[0];

    fireEvent.touchStart(row, {
      touches: [{ clientX: 120, clientY: 20 }],
    });
    fireEvent.touchEnd(row, {
      changedTouches: [{ clientX: 220, clientY: 22 }],
    });

    await waitFor(() => {
      expect(unarchiveConversation).toHaveBeenCalledWith(202);
    });
  }, 10000);

  it('does not request slideshow posts when input is only a prefix', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    renderPage();

    fireEvent.click((await screen.findAllByRole('button', { name: 'Open conversation' }))[0]);
    fireEvent.click(await screen.findByRole('button', { name: 'Browse Reddit/Hub' }));
    const input = await screen.findByPlaceholderText('e.g., r/pics or h/gaming');
    fireEvent.change(input, { target: { value: 'h/' } });
    fireEvent.click(screen.getByRole('button', { name: 'Load Scroll' }));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Failed to load posts. Please try again.');
    });
    expect(hubsService.getHubPosts).not.toHaveBeenCalled();
    expect(redditService.getSubredditPosts).not.toHaveBeenCalled();

    alertSpy.mockRestore();
  }, 10000);

  it('does not open conversation when checkbox receives keyboard events', async () => {
    renderPage();

    await screen.findByText('alice');
    setActiveConversationId.mockClear();
    const checkbox = (await screen.findAllByRole('checkbox'))[0];
    fireEvent.keyDown(checkbox, { key: ' ', code: 'Space' });

    expect(setActiveConversationId).not.toHaveBeenCalled();
  });

  it('forwards with fresh encrypted payload from message menu action', async () => {
    renderPage();

    fireEvent.click((await screen.findAllByRole('button', { name: 'Open conversation' }))[0]);

    const messageOptionButtons = await screen.findAllByLabelText('Message options');
    fireEvent.click(messageOptionButtons[0]);
    fireEvent.click(
      await screen.findByRole('button', {
        name: /forward|messages\.actions\.forward/i,
      })
    );
    fireEvent.click(await screen.findByLabelText('alice-archive'));

    const forwardButtons = screen.getAllByRole('button', {
      name: /forward|messages\.actions\.forward/i,
    });
    fireEvent.click(forwardButtons[forwardButtons.length - 1]);

    await waitFor(() => {
      expect(messagesService.forwardMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          message_id: 9001,
          conversation_ids: [303],
          encrypted_content: 'fresh-forward-cipher',
          sender_encrypted_content: 'fresh-forward-cipher',
        })
      );
    });
  }, 10000);

  it('opens thread view from thread preview and requests thread data', async () => {
    renderPage();

    fireEvent.click((await screen.findAllByRole('button', { name: 'Open conversation' }))[0]);

    const previewButton = await screen.findByRole('button', { name: 'Open thread' });
    fireEvent.click(previewButton);

    await waitFor(() => {
      expect(messagesService.getMessageThread).toHaveBeenCalledWith(9001, 20, 0);
    });
    expect(screen.getByText('Thread')).toBeInTheDocument();
  });

  it('sends reply_to when replying from message menu', async () => {
    renderPage();

    fireEvent.click((await screen.findAllByRole('button', { name: 'Open conversation' }))[0]);

    const menuButton = await screen.findByRole('button', { name: 'Message options' });
    fireEvent.click(menuButton);
    fireEvent.click(screen.getByRole('button', { name: 'Reply' }));

    const input = screen.getByPlaceholderText('Type a message...');
    fireEvent.change(input, { target: { value: 'Reply from menu' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => {
      expect(messagesService.sendMessage).toHaveBeenCalled();
    });

    const payload = vi.mocked(messagesService.sendMessage).mock.calls.at(-1)?.[0];
    expect(payload).toBeDefined();
    expect(payload?.reply_to).toBe(9001);
  }, 10000);
});
