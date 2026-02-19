import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useFolders } from '../../src/hooks/useFolders';
import { foldersService } from '../../src/services/foldersService';

vi.mock('../../src/services/foldersService', () => ({
  foldersService: {
    listFolders: vi.fn(),
    getFolderConversations: vi.fn(),
    createFolder: vi.fn(),
    updateFolder: vi.fn(),
    deleteFolder: vi.fn(),
    reorderFolders: vi.fn(),
    addConversation: vi.fn(),
    removeConversation: vi.fn(),
  },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useFolders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.mocked(foldersService.listFolders).mockResolvedValue([]);
    vi.mocked(foldersService.getFolderConversations).mockResolvedValue([]);
  });

  it('hydrates selected folder from localStorage', async () => {
    localStorage.setItem('messages.selected_folder_id', '2');
    vi.mocked(foldersService.listFolders).mockResolvedValue([
      { id: 2, user_id: 1, name: 'Pinned', color: '#fff', icon: '📁', position: 0 },
    ]);
    vi.mocked(foldersService.getFolderConversations).mockResolvedValue([
      {
        id: 10,
        user1_id: 1,
        user2_id: 2,
        created_at: '2026-02-19T00:00:00Z',
        last_message_at: '2026-02-19T00:00:00Z',
        conversation_type: 'dm',
        unread_count: 0,
      },
    ]);

    const { result } = renderHook(() => useFolders(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.selectedFolderId).toBe(2);
    });
    await waitFor(() => {
      expect(result.current.selectedFolderConversations).toHaveLength(1);
    });
  });

  it('filters conversations by selected folder', async () => {
    localStorage.setItem('messages.selected_folder_id', '4');
    vi.mocked(foldersService.getFolderConversations).mockResolvedValue([
      {
        id: 33,
        user1_id: 1,
        user2_id: 3,
        created_at: '2026-02-19T00:00:00Z',
        last_message_at: '2026-02-19T00:00:00Z',
        conversation_type: 'dm',
        unread_count: 0,
      },
    ]);

    const { result } = renderHook(() => useFolders(), { wrapper: createWrapper() });
    await waitFor(() => {
      expect(result.current.selectedFolderConversations).toHaveLength(1);
    });

    const filtered = result.current.filterConversationsBySelectedFolder([
      {
        id: 33,
        user1_id: 1,
        user2_id: 3,
        created_at: '2026-02-19T00:00:00Z',
        last_message_at: '2026-02-19T00:00:00Z',
        conversation_type: 'dm',
        unread_count: 0,
      },
      {
        id: 34,
        user1_id: 1,
        user2_id: 4,
        created_at: '2026-02-19T00:00:00Z',
        last_message_at: '2026-02-19T00:00:00Z',
        conversation_type: 'dm',
        unread_count: 0,
      },
    ]);
    expect(filtered.map((c) => c.id)).toEqual([33]);
  });

  it('persists selected folder to localStorage', async () => {
    const { result } = renderHook(() => useFolders(), { wrapper: createWrapper() });

    act(() => {
      result.current.setSelectedFolderId(9);
    });

    await waitFor(() => {
      expect(result.current.selectedFolderId).toBe(9);
    });
    expect(localStorage.getItem('messages.selected_folder_id')).toBe('9');
  });
});
