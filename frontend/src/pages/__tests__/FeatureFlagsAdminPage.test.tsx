import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

// --- Service mock ---
const { mockGetFlags, mockUpdateFlag, mockCreateFlag, mockDeleteFlag, mockGetAuditLog } =
  vi.hoisted(() => ({
    mockGetFlags: vi.fn(),
    mockUpdateFlag: vi.fn(),
    mockCreateFlag: vi.fn(),
    mockDeleteFlag: vi.fn(),
    mockGetAuditLog: vi.fn(),
  }));

vi.mock('../../services/featureFlagService', () => ({
  default: {
    getFlags: mockGetFlags,
    updateFlag: mockUpdateFlag,
    createFlag: mockCreateFlag,
    deleteFlag: mockDeleteFlag,
    getAuditLog: mockGetAuditLog,
  },
}));

// --- Hook mocks ---
vi.mock('../../hooks/useFormat', () => ({
  useFormat: () => ({
    formatDate: (d: unknown) => String(d),
    formatNumber: (n: unknown) => String(n),
  }),
}));

import AdminFeatureFlags from '../FeatureFlagsAdminPage';

const sampleFlag = {
  key: 'new-ui',
  description: 'New UI experiment',
  enabled: true,
  percentage: 100,
  environment: 'all' as const,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

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

describe('FeatureFlagsAdminPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuditLog.mockResolvedValue([]);
  });

  it('renders loading state initially', () => {
    mockGetFlags.mockImplementation(() => new Promise(() => {}));
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <AdminFeatureFlags />
      </Wrapper>,
    );
    expect(screen.getByText(/loading feature flags/i)).toBeInTheDocument();
  });

  it('renders flags list after loading', async () => {
    mockGetFlags.mockResolvedValue([sampleFlag]);
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <AdminFeatureFlags />
      </Wrapper>,
    );
    await waitFor(() => {
      expect(screen.getByText('new-ui')).toBeInTheDocument();
    });
  });

  it('renders "Create New Flag" button', async () => {
    mockGetFlags.mockResolvedValue([]);
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <AdminFeatureFlags />
      </Wrapper>,
    );
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /create new flag/i })).toBeInTheDocument();
    });
  });

  it('calls updateFlag when toggle button is clicked', async () => {
    mockGetFlags.mockResolvedValue([sampleFlag]);
    mockUpdateFlag.mockResolvedValue({ ...sampleFlag, enabled: false });
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <AdminFeatureFlags />
      </Wrapper>,
    );
    await waitFor(() => screen.getByText('new-ui'));

    const toggleBtn = screen.getByRole('button', {
      name: /toggle enabled for new-ui/i,
    });
    fireEvent.click(toggleBtn);

    await waitFor(() => {
      expect(mockUpdateFlag).toHaveBeenCalledWith('new-ui', { enabled: false });
    });
  });

  it('renders table column headers', async () => {
    mockGetFlags.mockResolvedValue([]);
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <AdminFeatureFlags />
      </Wrapper>,
    );
    await waitFor(() => {
      expect(screen.getByRole('columnheader', { name: /^key$/i })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: /status/i })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: /rollout/i })).toBeInTheDocument();
    });
  });
});
