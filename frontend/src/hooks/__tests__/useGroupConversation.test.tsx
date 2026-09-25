import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { useGroupConversation, useGroupInvites } from '../useGroupConversation';

const server = vi.hoisted(() => ({ joined: false, left: false, name: 'Test' }));

vi.mock('../../services/groupsService', () => ({
  groupsService: {
    getMyInvites: vi.fn(async () => [{ id: 5, conversation_id: 47, status: 'pending' }]),
    acceptInvite: vi.fn(async () => {
      server.joined = true;
    }),
    getParticipants: vi.fn(async () => []),
    getSettings: vi.fn(async () => ({})),
    leaveGroup: vi.fn(async () => {
      server.left = true;
    }),
    updateGroup: vi.fn(async (_id: number, data: { name: string }) => {
      server.name = data.name;
      return {};
    }),
  },
}));

describe('useGroupInvites', () => {
  // The page opens the group as soon as accepting resolves. The conversation
  // list had not reloaded by then, so the page, finding the group missing,
  // opened the first conversation instead.
  it('resolves an accept only once the conversation list holds the group', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(
      () => {
        useQuery({
          queryKey: ['conversations', 'all'],
          queryFn: async () => {
            await new Promise((resolve) => setTimeout(resolve, 20));
            return server.joined ? [{ id: 47 }] : [];
          },
        });
        return useGroupInvites();
      },
      { wrapper }
    );
    await waitFor(() => expect(queryClient.getQueryData(['conversations', 'all'])).toEqual([]));

    await act(() => result.current.acceptInvite(5));

    expect(queryClient.getQueryData(['conversations', 'all'])).toEqual([{ id: 47 }]);
  });
});

// The group's own actions edited a cache entry, ['conversations'], that no list
// reads, so leaving or renaming showed only after a refresh.
describe('useGroupConversation', () => {
  function withList() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const hook = renderHook(
      () => {
        useQuery({
          queryKey: ['conversations', 'all'],
          queryFn: async () => (server.left ? [] : [{ id: 47, group_name: server.name }]),
        });
        return useGroupConversation({ conversationId: 47, currentUserId: 7 });
      },
      { wrapper }
    );
    return { queryClient, ...hook };
  }

  it('drops the group from the list once leaving resolves', async () => {
    const { queryClient, result } = withList();
    await waitFor(() => expect(queryClient.getQueryData(['conversations', 'all'])).toHaveLength(1));

    await act(() => result.current.leaveGroup());

    expect(queryClient.getQueryData(['conversations', 'all'])).toEqual([]);
  });

  it('shows the new name in the list once renaming resolves', async () => {
    server.left = false;
    const { queryClient, result } = withList();
    await waitFor(() => expect(queryClient.getQueryData(['conversations', 'all'])).toHaveLength(1));

    await act(() => result.current.updateGroup({ name: 'Renamed' }));

    expect(queryClient.getQueryData(['conversations', 'all'])).toEqual([
      { id: 47, group_name: 'Renamed' },
    ]);
  });
});
