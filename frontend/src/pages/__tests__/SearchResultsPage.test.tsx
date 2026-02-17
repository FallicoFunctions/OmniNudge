import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, waitFor, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SearchResultsPage from '../SearchResultsPage';

const useAuthMock = vi.fn();
const useSettingsMock = vi.fn();
const useRedditBlocklistMock = vi.fn();
const searchMessagesMock = vi.fn();
const siteWideSearchMock = vi.fn();
const getOwnKeysMock = vi.fn();

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock('../../contexts/SettingsContext', () => ({
  useSettings: () => useSettingsMock(),
}));

vi.mock('../../contexts/RedditBlockContext', () => ({
  useRedditBlocklist: () => useRedditBlocklistMock(),
}));

vi.mock('../../services/searchService', () => ({
  siteWideSearch: (...args: unknown[]) => siteWideSearchMock(...args),
  searchMessages: (...args: unknown[]) => searchMessagesMock(...args),
}));

vi.mock('../../services/keyManagementService', () => ({
  getOwnKeys: (...args: unknown[]) => getOwnKeysMock(...args),
}));

vi.mock('../../hooks/useSavedItems', () => ({
  useSavedItems: () => ({ data: { items: [] } }),
}));

vi.mock('../../hooks/useHiddenItems', () => ({
  useHiddenItems: () => ({ data: { items: [] } }),
}));

vi.mock('../../components/common/CrosspostModal', () => ({
  CrosspostModal: () => null,
}));

const renderPage = (initialEntry: string) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/search" element={<SearchResultsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
};

describe('SearchResultsPage message search URL behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    useAuthMock.mockReturnValue({ user: { id: 1, username: 'tester', role: 'user' } });
    useSettingsMock.mockReturnValue({
      searchIncludeNsfwByDefault: false,
      blockAllNsfw: false,
      useRelativeTime: true,
    });
    useRedditBlocklistMock.mockReturnValue({ blockedUsers: new Set<string>() });
    getOwnKeysMock.mockResolvedValue(null);

    siteWideSearchMock.mockResolvedValue({
      posts: { platform: [], reddit: [], redditAfter: null, platformNextCursor: null },
      subreddits: [],
      subredditsAfter: null,
      hubs: [],
      hubsNextCursor: null,
      users: { reddit: [], omni: [], redditAfter: null, omniNextCursor: null },
    });

    searchMessagesMock.mockResolvedValue({
      messages: [],
      limit: 50,
      offset: 0,
      query: '',
      sort: 'relevance',
      total: 0,
    });
  });

  it('loads message-tab deep links with filter/page params even when q is empty', async () => {
    renderPage('/search?tab=messages&sort=old&has_files=true&has_links=true&include_archived=true&conversation_id=42&sender_id=7&start_date=2026-02-01T00:00:00Z&end_date=2026-02-15T00:00:00Z&mpage=2');

    await waitFor(() => {
      expect(searchMessagesMock).toHaveBeenCalled();
    });

    expect(searchMessagesMock).toHaveBeenCalledWith({
      query: '',
      sort: 'old',
      limit: 50,
      offset: 50,
      conversationId: 42,
      senderId: 7,
      hasFiles: true,
      hasLinks: true,
      includeArchived: true,
      startDate: '2026-02-01T00:00:00Z',
      endDate: '2026-02-15T00:00:00Z',
    });
  });

  it('applies has_files filter toggle through message search params', async () => {
    const user = userEvent.setup();
    renderPage('/search?tab=messages&q=hello&sort=relevance');

    await waitFor(() => {
      expect(searchMessagesMock).toHaveBeenCalled();
    });

    searchMessagesMock.mockClear();

    await user.click(screen.getByLabelText('Has files'));

    await waitFor(() => {
      expect(searchMessagesMock).toHaveBeenCalledWith({
        query: 'hello',
        sort: 'relevance',
        limit: 50,
        offset: 0,
        hasFiles: true,
        hasLinks: false,
        includeArchived: false,
      });
    });
  });

  it('applies include_archived filter toggle through message search params', async () => {
    const user = userEvent.setup();
    renderPage('/search?tab=messages&q=thread&sort=new');

    await waitFor(() => {
      expect(searchMessagesMock).toHaveBeenCalled();
    });

    searchMessagesMock.mockClear();

    await user.click(screen.getByLabelText('Include archived'));

    await waitFor(() => {
      expect(searchMessagesMock).toHaveBeenCalledWith({
        query: 'thread',
        sort: 'new',
        limit: 50,
        offset: 0,
        hasFiles: false,
        hasLinks: false,
        includeArchived: true,
      });
    });
  });

  it('applies conversation and sender filters from message-tab controls', async () => {
    const user = userEvent.setup();
    renderPage('/search?tab=messages&q=hello&sort=relevance');

    await waitFor(() => {
      expect(searchMessagesMock).toHaveBeenCalled();
    });

    searchMessagesMock.mockClear();

    const conversationInput = screen.getByLabelText('Conversation');
    const senderInput = screen.getByLabelText('Sender');
    await user.clear(conversationInput);
    await user.type(conversationInput, '42');
    await user.clear(senderInput);
    await user.type(senderInput, '7');
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() => {
      expect(searchMessagesMock).toHaveBeenCalledWith({
        query: 'hello',
        sort: 'relevance',
        limit: 50,
        offset: 0,
        conversationId: 42,
        senderId: 7,
        hasFiles: false,
        hasLinks: false,
        includeArchived: false,
        startDate: undefined,
        endDate: undefined,
      });
    });
  });

  it('applies date range filters from message-tab controls', async () => {
    const user = userEvent.setup();
    renderPage('/search?tab=messages&q=hello&sort=relevance');

    await waitFor(() => {
      expect(searchMessagesMock).toHaveBeenCalled();
    });

    searchMessagesMock.mockClear();

    await user.type(screen.getByLabelText('From'), '2026-02-10T12:00');
    await user.type(screen.getByLabelText('To'), '2026-02-15T12:00');
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() => {
      expect(searchMessagesMock).toHaveBeenCalledWith(
        expect.objectContaining({
          query: 'hello',
          sort: 'relevance',
          limit: 50,
          offset: 0,
          startDate: expect.any(String),
          endDate: expect.any(String),
        })
      );
    });
  });

  it('clears conversation, sender, and date filters from message-tab controls', async () => {
    const user = userEvent.setup();
    renderPage('/search?tab=messages&q=hello&sort=relevance&conversation_id=42&sender_id=7&start_date=2026-02-10T00:00:00Z&end_date=2026-02-15T00:00:00Z');

    await waitFor(() => {
      expect(searchMessagesMock).toHaveBeenCalled();
    });

    searchMessagesMock.mockClear();
    await user.click(screen.getByRole('button', { name: 'Clear' }));

    await waitFor(() => {
      expect(searchMessagesMock).toHaveBeenCalledWith({
        query: 'hello',
        sort: 'relevance',
        limit: 50,
        offset: 0,
        conversationId: undefined,
        senderId: undefined,
        hasFiles: false,
        hasLinks: false,
        includeArchived: false,
        startDate: undefined,
        endDate: undefined,
      });
    });
  });

  it('does not call message search API when unauthenticated', async () => {
    useAuthMock.mockReturnValue({ user: null });
    renderPage('/search?tab=messages&q=thread');

    await waitFor(() => {
      expect(searchMessagesMock).not.toHaveBeenCalled();
    });

    expect(screen.getByText('Sign in to search messages.')).toBeInTheDocument();
  });
});
