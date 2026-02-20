import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { foldersService } from '../services/foldersService';
import type { Conversation, ConversationFolder } from '../types/messages';

const SELECTED_FOLDER_STORAGE_KEY = 'messages.selected_folder_id';

const loadSelectedFolderId = (): number | null => {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(SELECTED_FOLDER_STORAGE_KEY);
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const persistSelectedFolderId = (folderID: number | null): void => {
  if (typeof window === 'undefined') return;
  if (folderID === null) {
    window.localStorage.removeItem(SELECTED_FOLDER_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(SELECTED_FOLDER_STORAGE_KEY, String(folderID));
};

/** Ensures conversation_count is always a number (never undefined) to keep optimistic math stable. */
function normalizeCount(f: ConversationFolder): ConversationFolder {
  return { ...f, conversation_count: f.conversation_count ?? 0 };
}

export function useFolders() {
  const queryClient = useQueryClient();
  const [selectedFolderId, setSelectedFolderIdState] = useState<number | null>(() =>
    loadSelectedFolderId()
  );

  const foldersQuery = useQuery<ConversationFolder[]>({
    queryKey: ['folders'],
    queryFn: () => foldersService.listFolders(),
    // Normalize counts so display and optimistic logic always see numbers
    select: (data) => data.map(normalizeCount),
  });

  const folderConversationsQuery = useQuery<Conversation[]>({
    queryKey: ['folders', selectedFolderId, 'conversations'],
    queryFn: () => foldersService.getFolderConversations(selectedFolderId as number),
    enabled: selectedFolderId !== null,
    staleTime: 60_000,
  });

  const setSelectedFolderId = useCallback((folderID: number | null) => {
    setSelectedFolderIdState(folderID);
    persistSelectedFolderId(folderID);
  }, []);

  const createFolderMutation = useMutation({
    mutationFn: foldersService.createFolder,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['folders'] });
    },
  });

  const updateFolderMutation = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: { name?: string; color?: string; icon?: string } }) =>
      foldersService.updateFolder(id, patch),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['folders'] });
    },
  });

  const deleteFolderMutation = useMutation({
    mutationFn: (id: number) => foldersService.deleteFolder(id),
    onSuccess: (_, folderID) => {
      if (selectedFolderId === folderID) {
        setSelectedFolderId(null);
      }
      void queryClient.invalidateQueries({ queryKey: ['folders'] });
      void queryClient.invalidateQueries({ queryKey: ['folders', folderID, 'conversations'] });
    },
  });

  const reorderFoldersMutation = useMutation({
    mutationFn: (folderIDs: number[]) => foldersService.reorderFolders(folderIDs),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['folders'] });
    },
  });

  const addConversationMutation = useMutation({
    mutationFn: ({ folderID, conversationID }: { folderID: number; conversationID: number }) =>
      foldersService.addConversation(folderID, conversationID),
    onMutate: async ({ folderID }) => {
      // Cancel in-flight refetches so they don't overwrite optimistic update
      await queryClient.cancelQueries({ queryKey: ['folders'] });
      const previousFolders = queryClient.getQueryData<ConversationFolder[]>(['folders']);
      queryClient.setQueryData<ConversationFolder[]>(['folders'], (old) =>
        old?.map((f) =>
          f.id === folderID ? { ...f, conversation_count: (f.conversation_count ?? 0) + 1 } : f,
        ),
      );
      return { previousFolders };
    },
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['folders'] });
      void queryClient.invalidateQueries({ queryKey: ['folders', variables.folderID, 'conversations'] });
    },
    onError: (_, __, context) => {
      // Restore snapshot — guaranteed accurate regardless of concurrent mutations
      if (context?.previousFolders !== undefined) {
        queryClient.setQueryData(['folders'], context.previousFolders);
      }
    },
  });

  const removeConversationMutation = useMutation({
    mutationFn: ({ folderID, conversationID }: { folderID: number; conversationID: number }) =>
      foldersService.removeConversation(folderID, conversationID),
    onMutate: async ({ folderID }) => {
      await queryClient.cancelQueries({ queryKey: ['folders'] });
      const previousFolders = queryClient.getQueryData<ConversationFolder[]>(['folders']);
      queryClient.setQueryData<ConversationFolder[]>(['folders'], (old) =>
        old?.map((f) =>
          f.id === folderID ? { ...f, conversation_count: Math.max(0, (f.conversation_count ?? 0) - 1) } : f,
        ),
      );
      return { previousFolders };
    },
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['folders'] });
      void queryClient.invalidateQueries({ queryKey: ['folders', variables.folderID, 'conversations'] });
    },
    onError: (_, __, context) => {
      if (context?.previousFolders !== undefined) {
        queryClient.setQueryData(['folders'], context.previousFolders);
      }
    },
  });

  const selectedFolderConversationIDs = useMemo(() => {
    if (!selectedFolderId) return null;
    return new Set((folderConversationsQuery.data ?? []).map((c) => c.id));
  }, [selectedFolderId, folderConversationsQuery.data]);

  const filterConversationsBySelectedFolder = useCallback((conversations: Conversation[]): Conversation[] => {
    if (!selectedFolderConversationIDs) return conversations;
    return conversations.filter((conversation) => selectedFolderConversationIDs.has(conversation.id));
  }, [selectedFolderConversationIDs]);

  return {
    folders: foldersQuery.data ?? [],
    isLoadingFolders: foldersQuery.isLoading,
    selectedFolderId,
    setSelectedFolderId,
    selectedFolderConversations: folderConversationsQuery.data ?? [],
    isLoadingSelectedFolderConversations: folderConversationsQuery.isLoading,
    filterConversationsBySelectedFolder,
    createFolder: createFolderMutation.mutateAsync,
    updateFolder: updateFolderMutation.mutateAsync,
    deleteFolder: deleteFolderMutation.mutateAsync,
    isDeletingFolder: deleteFolderMutation.isPending,
    deletingFolderId: deleteFolderMutation.variables ?? null,
    reorderFolders: reorderFoldersMutation.mutateAsync,
    addConversationToFolder: addConversationMutation.mutateAsync,
    removeConversationFromFolder: removeConversationMutation.mutateAsync,
  };
}
