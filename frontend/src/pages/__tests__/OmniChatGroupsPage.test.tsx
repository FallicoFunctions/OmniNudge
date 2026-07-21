import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OmniChatGroupsWorkspace } from '../OmniChatGroupsPage';
import { omnichatService } from '../../services/omnichatService';

vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ isAuthenticated: true, user: { id: 9 } }) }));
vi.mock('../../services/omnichatService', () => ({
  omnichatQueryKeys: {
    groups: ['omnichat', 'groups'],
    group: (id: string) => ['omnichat', 'group', id],
    groupMessages: (id: string) => ['omnichat', 'group-messages', id],
    personas: () => ['omnichat', 'personas'],
  },
  omnichatService: {
    listGroups: vi.fn(),
    getGroup: vi.fn(),
    listGroupMessages: vi.fn(),
    sendGroupMessage: vi.fn(),
    listPersonas: vi.fn(),
    createGroup: vi.fn(),
    createGroupInvite: vi.fn(),
    joinGroup: vi.fn(),
  },
}));

const group = {
  id: 'group-1',
  owner_user_id: 1,
  name: 'Park Friends',
  description: 'Our shared story',
  visibility: 'private' as const,
  viewer_role: 'owner' as const,
  members: [
    { user_id: 1, username: 'nick', role: 'owner' as const, joined_at: '2026-07-20T00:00:00Z' },
  ],
  personas: [
    { persona_id: 42, name: 'Sadie', display_order: 0, joined_at: '2026-07-20T00:00:00Z' },
  ],
  created_at: '2026-07-20T00:00:00Z',
  updated_at: '2026-07-20T00:00:00Z',
  last_message_at: '2026-07-20T00:00:00Z',
};

describe('OmniChatGroupsWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(omnichatService.listGroups).mockResolvedValue([group]);
    vi.mocked(omnichatService.getGroup).mockResolvedValue(group);
    vi.mocked(omnichatService.listGroupMessages).mockResolvedValue([]);
    vi.mocked(omnichatService.listPersonas).mockResolvedValue([]);
    vi.mocked(omnichatService.sendGroupMessage).mockResolvedValue([]);
  });

  it('lets a member address a character in a shared group', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <MemoryRouter>
        <QueryClientProvider client={client}>
          <OmniChatGroupsWorkspace />
        </QueryClientProvider>
      </MemoryRouter>
    );
    fireEvent.click(await screen.findByRole('button', { name: /Park Friends/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Ask Sadie/ }));
    fireEvent.change(screen.getByLabelText('Group message'), {
      target: { value: 'What did you bring?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send group message' }));
    await waitFor(() =>
      expect(omnichatService.sendGroupMessage).toHaveBeenCalledWith(
        'group-1',
        'What did you bring?',
        [42]
      )
    );
  });

  it('attempts an invalid invite only once instead of retrying on every render', async () => {
    vi.mocked(omnichatService.joinGroup).mockRejectedValue(new Error('invalid invite'));
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    function LocationProbe() {
      const location = useLocation();
      return <span data-testid="location-search">{location.search}</span>;
    }
    render(
      <MemoryRouter initialEntries={['/omnichat/groups?invite=bad-token']}>
        <QueryClientProvider client={client}>
          <OmniChatGroupsWorkspace />
          <LocationProbe />
        </QueryClientProvider>
      </MemoryRouter>
    );

    await waitFor(() => expect(omnichatService.joinGroup).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId('location-search')).toBeEmptyDOMElement());
    expect(vi.mocked(omnichatService.joinGroup).mock.calls[0]?.[0]).toBe('bad-token');
    await new Promise((resolve) => window.setTimeout(resolve, 50));
    expect(omnichatService.joinGroup).toHaveBeenCalledTimes(1);
  });

  it('uses the oldest group timestamp and id together when loading another page', async () => {
    const firstPage = Array.from({ length: 50 }, (_, index) => ({
      ...group,
      id: `group-${index + 1}`,
      name: `Group ${index + 1}`,
      last_message_at: `2026-07-20T00:${String(49 - index).padStart(2, '0')}:00Z`,
    }));
    vi.mocked(omnichatService.listGroups)
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce([]);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <MemoryRouter>
        <QueryClientProvider client={client}>
          <OmniChatGroupsWorkspace />
        </QueryClientProvider>
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Load more groups' }));
    await waitFor(() =>
      expect(omnichatService.listGroups).toHaveBeenLastCalledWith(
        firstPage[49].last_message_at,
        firstPage[49].id,
        50
      )
    );
  });
});
