import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MessagesPage from '../MessagesPage';
import type { Conversation } from '../../types/messages';
import { hubsService } from '../../services/hubsService';
import { redditService } from '../../services/redditService';

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
      conversations: [activeConversation],
      next_cursor: undefined,
    })),
    getArchivedConversationsPage: vi.fn(async () => ({
      conversations: [archivedConversation],
      next_cursor: undefined,
    })),
  },
}));

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
    const row = await screen.findByRole('button', { name: 'Open conversation' });

    fireEvent.touchStart(row, {
      touches: [{ clientX: 240, clientY: 24 }],
    });
    fireEvent.touchEnd(row, {
      changedTouches: [{ clientX: 140, clientY: 25 }],
    });

    await waitFor(() => {
      expect(archiveConversation).toHaveBeenCalledWith(101);
    });
  });

  it('unarchives on right swipe in archived tab', async () => {
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Archived' }));
    const row = await screen.findByRole('button', { name: 'Open conversation' });

    fireEvent.touchStart(row, {
      touches: [{ clientX: 120, clientY: 20 }],
    });
    fireEvent.touchEnd(row, {
      changedTouches: [{ clientX: 220, clientY: 22 }],
    });

    await waitFor(() => {
      expect(unarchiveConversation).toHaveBeenCalledWith(202);
    });
  });

  it('does not request slideshow posts when input is only a prefix', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Open conversation' }));
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
  });

  it('does not open conversation when checkbox receives keyboard events', async () => {
    renderPage();

    await screen.findByText('alice');
    setActiveConversationId.mockClear();
    const checkbox = await screen.findByRole('checkbox');
    fireEvent.keyDown(checkbox, { key: ' ', code: 'Space' });

    expect(setActiveConversationId).not.toHaveBeenCalled();
  });
});
