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
    renderPage('/search?tab=messages&sort=old&has_files=true&has_links=true&include_archived=true&mpage=2');

    await waitFor(() => {
      expect(searchMessagesMock).toHaveBeenCalled();
    });

    expect(searchMessagesMock).toHaveBeenCalledWith({
      query: '',
      sort: 'old',
      limit: 50,
      offset: 50,
      hasFiles: true,
      hasLinks: true,
      includeArchived: true,
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

  it('does not call message search API when unauthenticated', async () => {
    useAuthMock.mockReturnValue({ user: null });
    renderPage('/search?tab=messages&q=thread');

    await waitFor(() => {
      expect(searchMessagesMock).not.toHaveBeenCalled();
    });

    expect(screen.getByText('Sign in to search messages.')).toBeInTheDocument();
  });
});
