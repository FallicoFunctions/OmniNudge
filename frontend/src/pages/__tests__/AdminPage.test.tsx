import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import AdminPage from '../AdminPage';
import { adminService } from '../../services/adminService';
import type { AdminUser } from '../../types/admin';

// Mock the admin service
vi.mock('../../services/adminService', () => ({
  adminService: {
    listUsers: vi.fn(),
    getSiteStats: vi.fn(),
    getAllBanHistory: vi.fn(),
    banUser: vi.fn(),
    shadowBanUser: vi.fn(),
    unbanUser: vi.fn(),
    softDeleteUser: vi.fn(),
    getBanHistory: vi.fn(),
    updateUserRole: vi.fn(),
  },
}));

// Mock auth context
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1, username: 'admin', role: 'admin' },
    isAuthenticated: true,
  }),
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </BrowserRouter>
  );
};

const goToUserManagementTab = async () => {
  fireEvent.click(screen.getByText('User Management'));
  await waitFor(() => expect(adminService.listUsers).toHaveBeenCalled());
};

describe('AdminPage - Ban System', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock implementations
    vi.mocked(adminService.getSiteStats).mockResolvedValue({
      total_users: 100,
      total_posts: 500,
      total_comments: 1000,
      total_hubs: 10,
      total_conversations: 50,
      total_messages: 200,
      total_reports: 5,
      open_reports: 2,
      approved_reports: 1,
      rejected_reports: 1,
      no_action_reports: 1,
      reviewed_reports: 0,
      dismissed_reports: 0,
      false_report_rate_pct: 33.3,
      avg_report_resolution_hours: 4.2,
      admin_count: 2,
      moderator_count: 5,
    });

    vi.mocked(adminService.listUsers).mockResolvedValue({
      users: [
        {
          id: 2,
          username: 'testuser',
          email: 'test@example.com',
          role: 'user',
          created_at: '2024-01-01T00:00:00Z',
          shadow_banned: false,
          banned: false,
          deleted: false,
          show_ban_reason: false,
        },
        {
          id: 3,
          username: 'banneduser',
          email: 'banned@example.com',
          role: 'user',
          created_at: '2024-01-01T00:00:00Z',
          shadow_banned: false,
          banned: true,
          deleted: false,
          ban_reason: 'Spam',
          show_ban_reason: true,
          banned_at: '2024-01-02T00:00:00Z',
          banned_by: 1,
        },
      ],
      limit: 50,
      offset: 0,
      total: 2,
    });

    vi.mocked(adminService.getAllBanHistory).mockResolvedValue({
      history: [],
      limit: 50,
      offset: 0,
      total: 0,
    });
  });

  it('renders user list with ban status badges', async () => {
    render(<AdminPage />, { wrapper: createWrapper() });
    await goToUserManagementTab();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /testuser/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /banneduser/i })).toBeInTheDocument();
    });

    // Check for banned badge
    expect(screen.getByText('Banned', { selector: 'span' })).toBeInTheDocument();
  }, 10000);

  it('opens ban modal when ban action is clicked', async () => {
    render(<AdminPage />, { wrapper: createWrapper() });
    await goToUserManagementTab();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /testuser/i })).toBeInTheDocument();
    });

    // Find and click the Actions button for the first user
    const actionButtons = screen.getAllByRole('button', { name: /^Actions/i });
    fireEvent.click(actionButtons[0]);

    // Click the Ban option
    const banButton = screen.getByText('Ban');
    fireEvent.click(banButton);

    // Check that modal opened
    await waitFor(() => {
      expect(screen.getByText('Ban User')).toBeInTheDocument();
    });
  });

  it('submits ban action with reason', async () => {
    vi.mocked(adminService.banUser).mockResolvedValue({ message: 'User banned' });

    render(<AdminPage />, { wrapper: createWrapper() });
    await goToUserManagementTab();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /testuser/i })).toBeInTheDocument();
    });

    // Open action menu and click ban
    const actionButtons = screen.getAllByRole('button', { name: /^Actions/i });
    fireEvent.click(actionButtons[0]);
    const banButton = screen.getByText('Ban');
    fireEvent.click(banButton);

    await waitFor(() => {
      expect(screen.getByText('Ban User')).toBeInTheDocument();
    });

    // Fill in reason
    const reasonTextarea = screen.getByPlaceholderText('Enter reason...');
    fireEvent.change(reasonTextarea, { target: { value: 'Spam posting' } });

    // Check "show reason" checkbox
    const showReasonCheckbox = screen.getByLabelText('Show reason to user');
    fireEvent.click(showReasonCheckbox);

    // Submit
    const confirmButton = screen.getByRole('button', { name: /^Confirm$/i });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(adminService.banUser).toHaveBeenCalledWith(2, 'Spam posting', true);
    });
  });

  it('handles shadow ban action', async () => {
    vi.mocked(adminService.shadowBanUser).mockResolvedValue({ message: 'User shadow banned' });

    render(<AdminPage />, { wrapper: createWrapper() });
    await goToUserManagementTab();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /testuser/i })).toBeInTheDocument();
    });

    // Open action menu and click shadow ban
    const actionButtons = screen.getAllByRole('button', { name: /^Actions/i });
    fireEvent.click(actionButtons[0]);
    const shadowBanButton = screen.getByText('Shadow Ban');
    fireEvent.click(shadowBanButton);

    await waitFor(() => {
      expect(screen.getByText('Shadow Ban User')).toBeInTheDocument();
    });

    // Fill in reason
    const reasonTextarea = screen.getByPlaceholderText('Enter reason...');
    fireEvent.change(reasonTextarea, { target: { value: 'Suspicious activity' } });

    // Submit
    const confirmButton = screen.getByRole('button', { name: /^Confirm$/i });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(adminService.shadowBanUser).toHaveBeenCalledWith(2, 'Suspicious activity', false);
    });
  });

  it('handles unban action', async () => {
    vi.mocked(adminService.unbanUser).mockResolvedValue({ message: 'User unbanned' });

    render(<AdminPage />, { wrapper: createWrapper() });
    await goToUserManagementTab();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /banneduser/i })).toBeInTheDocument();
    });

    // Open action menu for banned user and click unban
    const actionButtons = screen.getAllByRole('button', { name: /^Actions/i });
    fireEvent.click(actionButtons[1]); // Second user is banned
    const unbanButton = screen.getByText('Unban');
    fireEvent.click(unbanButton);

    await waitFor(() => {
      expect(screen.getByText('Unban User')).toBeInTheDocument();
    });

    // Fill in reason
    const reasonTextarea = screen.getByPlaceholderText('Enter reason...');
    fireEvent.change(reasonTextarea, { target: { value: 'Appeal approved' } });

    // Submit
    const confirmButton = screen.getByRole('button', { name: /^Confirm$/i });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(adminService.unbanUser).toHaveBeenCalledWith(3, 'Appeal approved');
    });
  });

  it('filters users by ban status', async () => {
    const mockBannedUsers: { users: AdminUser[]; limit: number; offset: number; total: number } = {
      users: [
        {
          id: 3,
          username: 'banneduser',
          email: 'banned@example.com',
          role: 'user',
          created_at: '2024-01-01T00:00:00Z',
          shadow_banned: false,
          banned: true,
          deleted: false,
          ban_reason: 'Spam',
          show_ban_reason: true,
        },
      ],
      limit: 50,
      offset: 0,
      total: 1,
    };

    vi.mocked(adminService.listUsers).mockResolvedValue(mockBannedUsers);

    render(<AdminPage />, { wrapper: createWrapper() });
    await goToUserManagementTab();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /banneduser/i })).toBeInTheDocument();
    });

    // Change status filter to "Banned"
    const statusFilter = screen.getByDisplayValue('All Status');
    fireEvent.change(statusFilter, { target: { value: 'banned' } });

    await waitFor(() => {
      expect(adminService.listUsers).toHaveBeenCalledWith('', '', 'banned', 50, 0, '');
    });
  });

  it('displays ban history modal', async () => {
    const mockHistory = {
      history: [
        {
          id: 1,
          user_id: 2,
          action: 'ban',
          reason: 'Spam',
          show_reason: true,
          admin_id: 1,
          admin_name: 'admin',
          created_at: '2024-01-02T00:00:00Z',
        },
        {
          id: 2,
          user_id: 2,
          action: 'unban',
          reason: 'Appeal approved',
          show_reason: false,
          admin_id: 1,
          admin_name: 'admin',
          created_at: '2024-01-03T00:00:00Z',
        },
      ],
    };

    vi.mocked(adminService.getBanHistory).mockResolvedValue(mockHistory);

    render(<AdminPage />, { wrapper: createWrapper() });
    await goToUserManagementTab();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /testuser/i })).toBeInTheDocument();
    });

    // Open action menu and click "View Ban History"
    const actionButtons = screen.getAllByRole('button', { name: /^Actions/i });
    fireEvent.click(actionButtons[0]);
    const historyButton = screen.getByText('View Ban History');
    fireEvent.click(historyButton);

    await waitFor(() => {
      expect(screen.getByText(/Ban history for testuser/i)).toBeInTheDocument();
      expect(screen.getByText('ban')).toBeInTheDocument();
      expect(screen.getByText('unban')).toBeInTheDocument();
      expect(screen.getByText('Spam')).toBeInTheDocument();
      expect(screen.getByText('Appeal approved')).toBeInTheDocument();
    });
  });

  it('supports bulk ban actions', async () => {
    vi.mocked(adminService.banUser).mockResolvedValue({ message: 'User banned' });

    render(<AdminPage />, { wrapper: createWrapper() });
    await goToUserManagementTab();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /testuser/i })).toBeInTheDocument();
    });

    // Select users via checkboxes
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes.length).toBeGreaterThanOrEqual(2);
    fireEvent.click(checkboxes[0]); // First user checkbox
    fireEvent.click(checkboxes[1]); // Second user checkbox

    // Click bulk ban button
    const bulkBanButton = screen.getByText('Ban');
    fireEvent.click(bulkBanButton);

    await waitFor(() => {
      expect(screen.getByText(/Bulk Ban Users/)).toBeInTheDocument();
    });

    // Fill in reason
    const reasonTextarea = screen.getByPlaceholderText('Enter reason...');
    fireEvent.change(reasonTextarea, { target: { value: 'Bulk spam' } });

    // Submit
    const confirmButton = screen.getByText(/Confirm \(2 users\)/);
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(adminService.banUser).toHaveBeenCalledTimes(2);
      expect(adminService.banUser).toHaveBeenCalledWith(2, 'Bulk spam', false);
      expect(adminService.banUser).toHaveBeenCalledWith(3, 'Bulk spam', false);
    });
  });

  it('toggles between card and table view', async () => {
    render(<AdminPage />, { wrapper: createWrapper() });
    await goToUserManagementTab();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /testuser/i })).toBeInTheDocument();
    });

    // Initially in card view
    expect(screen.getByText('Card View')).toHaveClass(/bg-\[var\(--color-primary\)\]/);

    // Switch to table view
    const tableViewButton = screen.getByText('Table View');
    fireEvent.click(tableViewButton);

    // Check that table headers are present
    expect(screen.getByText('ID')).toBeInTheDocument();
    expect(screen.getByText('Username')).toBeInTheDocument();
    expect(screen.getByText('Email')).toBeInTheDocument();
  });

  it('exports users to CSV', async () => {
    // Mock URL.createObjectURL and revokeObjectURL
    global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    global.URL.revokeObjectURL = vi.fn();

    // Mock document.createElement to track link clicks
    const mockClick = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    const createElementMock: typeof document.createElement = vi.fn((tagName: string) => {
      const element = originalCreateElement(tagName);
      if (tagName === 'a') {
        element.click = mockClick;
      }
      return element;
    });
    document.createElement = createElementMock;

    render(<AdminPage />, { wrapper: createWrapper() });
    await goToUserManagementTab();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /testuser/i })).toBeInTheDocument();
    });

    // Click export CSV button
    const exportButton = screen.getByText('Export CSV');
    fireEvent.click(exportButton);

    expect(mockClick).toHaveBeenCalled();
    expect(global.URL.createObjectURL).toHaveBeenCalled();

    // Cleanup
    document.createElement = originalCreateElement;
  });

  it('shows ban activity tab with history', async () => {
    const mockHistory = {
      history: [
        {
          id: 1,
          user_id: 2,
          action: 'ban',
          reason: 'Test',
          show_reason: true,
          admin_id: 1,
          admin_name: 'admin',
          created_at: '2024-01-02T00:00:00Z',
        },
      ],
      limit: 50,
      offset: 0,
      total: 1,
    };

    vi.mocked(adminService.getAllBanHistory).mockResolvedValue(mockHistory);

    render(<AdminPage />, { wrapper: createWrapper() });

    // Click ban activity tab
    const banActivityTab = screen.getByText('Ban Activity');
    fireEvent.click(banActivityTab);

    await waitFor(() => {
      expect(screen.getByText(/^ban$/i)).toBeInTheDocument();
      expect(screen.getByText(/Test/)).toBeInTheDocument();
      expect(screen.getByText(/by admin/i)).toBeInTheDocument();
    });
  });

  it('prevents ban action without reason', async () => {
    // Mock window.alert
    global.alert = vi.fn();

    render(<AdminPage />, { wrapper: createWrapper() });
    await goToUserManagementTab();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /testuser/i })).toBeInTheDocument();
    });

    // Open ban modal
    const actionButtons = screen.getAllByRole('button', { name: /^Actions/i });
    fireEvent.click(actionButtons[0]);
    const banButton = screen.getByText('Ban');
    fireEvent.click(banButton);

    await waitFor(() => {
      expect(screen.getByText('Ban User')).toBeInTheDocument();
    });

    // Try to submit without reason
    const confirmButton = screen.getByRole('button', { name: /^Confirm$/i });
    expect(confirmButton).toBeDisabled();
  });
});
