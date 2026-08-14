import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OmniChatPublicationReportsTab from '../OmniChatPublicationReportsTab';
import { adminService } from '../../../services/adminService';

vi.mock('../../../services/adminService', () => ({
  adminService: {
    listOmniChatPublicationReports: vi.fn(),
    resolveOmniChatPublicationReport: vi.fn(),
  },
}));

function renderTab() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <OmniChatPublicationReportsTab />
    </QueryClientProvider>
  );
}

describe('OmniChatPublicationReportsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(adminService.listOmniChatPublicationReports).mockResolvedValue([
      {
        id: 'report-1',
        publication_id: 'publication-1',
        reporter_user_id: 8,
        reporter_username: 'viewer',
        author_user_id: 9,
        author_username: 'author',
        content_kind: 'chat',
        caption: 'Reported memory',
        reason: 'harassment',
        details: 'Please review this.',
        status: 'open',
        created_at: '2026-07-20T00:00:00Z',
      },
    ]);
    vi.mocked(adminService.resolveOmniChatPublicationReport).mockResolvedValue();
  });

  it('loads the moderation queue and removes a reported publication', async () => {
    renderTab();

    expect(await screen.findByText('Reported memory')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove publication' }));

    await waitFor(() =>
      expect(adminService.resolveOmniChatPublicationReport).toHaveBeenCalledWith(
        'report-1',
        'removed'
      )
    );
  });
});
