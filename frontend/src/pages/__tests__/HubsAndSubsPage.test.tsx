import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

// --- Service mocks ---
const { mockGetAllHubs } = vi.hoisted(() => ({ mockGetAllHubs: vi.fn() }));
vi.mock('../../services/hubsService', () => ({
  hubsService: {
    getAllHubs: mockGetAllHubs,
    searchHubs: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock('../../services/redditService', () => ({
  redditService: {
    autocompleteSubreddits: vi.fn().mockResolvedValue([]),
  },
}));

// --- Hook mocks ---
vi.mock('../../hooks/useFormat', () => ({
  useFormat: () => ({
    formatNumber: (n: unknown) => String(n),
    formatDate: (d: unknown) => String(d),
  }),
}));

// --- Component mocks ---
vi.mock('../../components/common/StatusMessage', () => ({
  EmptyMessage: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="empty-message">{children}</div>
  ),
  ErrorMessage: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="error-message">{children}</div>
  ),
  LoadingMessage: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="loading-message">{children}</div>
  ),
}));
vi.mock('../../components/empty', () => ({
  EmptyState: () => <div data-testid="empty-state" />,
}));
vi.mock('../../components/common/OffsetPaginationControls', () => ({
  OffsetPaginationControls: () => <div data-testid="pagination" />,
}));

import HubsAndSubsPage from '../HubsAndSubsPage';

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
};

describe('HubsAndSubsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    mockGetAllHubs.mockResolvedValue({ hubs: [], total: 0 });
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <HubsAndSubsPage />
      </Wrapper>
    );
    expect(document.body).toBeTruthy();
  });

  it('renders alphabet filter buttons', () => {
    mockGetAllHubs.mockResolvedValue({ hubs: [], total: 0 });
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <HubsAndSubsPage />
      </Wrapper>
    );
    // A-Z alphabet letters should be rendered as filter buttons
    expect(screen.getByRole('button', { name: 'A' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Z' })).toBeInTheDocument();
  });

  it('shows hub list when data loads', async () => {
    mockGetAllHubs.mockResolvedValue({
      hubs: [{ id: 1, name: 'coding', title: 'Coding Hub', member_count: 42, is_nsfw: false }],
      total: 1,
    });
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <HubsAndSubsPage />
      </Wrapper>
    );
    await waitFor(() => {
      // Hub name appears as link text in the list
      const links = screen.getAllByRole('link');
      const hubLink = links.find((l) => l.textContent?.includes('coding'));
      expect(hubLink).toBeTruthy();
    });
  });

  it('renders search input', () => {
    mockGetAllHubs.mockResolvedValue({ hubs: [], total: 0 });
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <HubsAndSubsPage />
      </Wrapper>
    );
    const searchInputs = screen.getAllByRole('textbox');
    expect(searchInputs.length).toBeGreaterThan(0);
  });

  it('shows empty state when no hubs match', async () => {
    mockGetAllHubs.mockResolvedValue({ hubs: [], total: 0 });
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <HubsAndSubsPage />
      </Wrapper>
    );
    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    });
  });
});
