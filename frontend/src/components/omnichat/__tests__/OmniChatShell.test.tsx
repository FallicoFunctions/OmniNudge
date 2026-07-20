import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import OmniChatShell from '../OmniChatShell';

let mockIsAuthenticated = true;
let mockIsAutoCollapseWidth = false;

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: mockIsAuthenticated,
    user: mockIsAuthenticated ? { username: 'Derrf' } : null,
    logout: vi.fn(),
  }),
}));

vi.mock('../../../hooks/useMediaQuery', () => ({
  useMediaQuery: () => mockIsAutoCollapseWidth,
}));

function renderShell() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <OmniChatShell activeTab="chat" onTabChange={() => {}}>
          <div>Chat content</div>
        </OmniChatShell>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function getDesktopToggle(name: 'Open menu' | 'Close menu') {
  return screen.getAllByRole('button', { name })[0];
}

describe('OmniChatShell sidebar auto-collapse', () => {
  beforeEach(() => {
    localStorage.clear();
    mockIsAuthenticated = true;
    mockIsAutoCollapseWidth = false;
  });

  it('auto-collapses the desktop sidebar when mounted below the threshold', async () => {
    mockIsAutoCollapseWidth = true;

    renderShell();

    await waitFor(() => {
      expect(localStorage.getItem('omnichat_sidebar_collapsed')).toBe('true');
    });
    expect(getDesktopToggle('Open menu')).toBeInTheDocument();
  });

  it('lets the user reopen the sidebar while still below the threshold', async () => {
    mockIsAutoCollapseWidth = true;

    renderShell();

    await waitFor(() => {
      expect(localStorage.getItem('omnichat_sidebar_collapsed')).toBe('true');
    });
    const openButton = getDesktopToggle('Open menu');
    fireEvent.click(openButton);

    expect(localStorage.getItem('omnichat_sidebar_collapsed')).toBe('false');
    expect(getDesktopToggle('Close menu')).toBeInTheDocument();
  });

  it('respects the saved expanded state when mounted above the threshold', () => {
    localStorage.setItem('omnichat_sidebar_collapsed', 'false');

    renderShell();

    expect(localStorage.getItem('omnichat_sidebar_collapsed')).toBe('false');
    expect(getDesktopToggle('Close menu')).toBeInTheDocument();
  });
});
