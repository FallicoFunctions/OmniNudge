import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}));

vi.mock('../../services/bugReportService', () => ({
  bugReportService: {
    getKnownBugs: vi.fn().mockResolvedValue({ bugs: [] }),
    submitBugReport: vi.fn().mockResolvedValue({ success: true }),
  },
}));

vi.mock('../../components/bugReports/BugReportModal', () => ({
  default: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) =>
    isOpen ? (
      <div role="dialog" aria-label="bug-report-modal">
        <button onClick={onClose}>Close</button>
      </div>
    ) : null,
}));

vi.mock('../../components/common/Panel', () => ({
  Panel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('../../components/common/StatusMessage', () => ({
  LoadingMessage: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import BugReportingPage from '../BugReportingPage';

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
};

describe('BugReportingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the bug reporting page heading', async () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <BugReportingPage />
      </Wrapper>,
    );
    await waitFor(() => {
      // The h1 renders t('mainLayout.bugReporting') — i18n mock returns the key as-is
      expect(
        screen.getByRole('heading', { name: 'mainLayout.bugReporting' }),
      ).toBeInTheDocument();
    });
  });

  it('renders a "report bug" button with the correct label', async () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <BugReportingPage />
      </Wrapper>,
    );
    await waitFor(() => {
      // Button uses t('bugReportingPage.reportButton'); mock returns key as-is
      expect(
        screen.getByRole('button', { name: 'bugReportingPage.reportButton' }),
      ).toBeInTheDocument();
    });
  });

  it('opens bug report modal when report button is clicked', async () => {
    const user = userEvent.setup();
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <BugReportingPage />
      </Wrapper>,
    );

    const reportBtn = await screen.findByRole('button', { name: 'bugReportingPage.reportButton' });
    await user.click(reportBtn);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  it('shows empty state when no known bugs returned', async () => {
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <BugReportingPage />
      </Wrapper>,
    );
    // with empty bugs array, no bug list items should appear
    await waitFor(() => {
      expect(screen.queryByRole('listitem')).toBeNull();
    });
  });
});
