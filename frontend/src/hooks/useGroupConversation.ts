import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { groupsService } from '../services/groupsService';
import type {
  Conversation,
  GroupInvite,
  GroupParticipant,
  GroupRole,
  GroupSettings,
  TransferOwnershipRequest,
  UpdateGroupRequest,
} from '../types/messages';

interface UseGroupConversationOptions {
  conversationId: number | null;
  currentUserId: number | undefined;
}

export function useGroupConversation({ conversationId, currentUserId }: UseGroupConversationOptions) {
  const queryClient = useQueryClient();

  // ── Queries ──────────────────────────────────────────────────────────────

  const {
    data: participants = [],
    isLoading: loadingParticipants,
    refetch: refetchParticipants,
  } = useQuery<GroupParticipant[]>({
    queryKey: ['group-participants', conversationId],
    queryFn: () => groupsService.getParticipants(conversationId!),
    enabled: !!conversationId,
    staleTime: 60_000,
  });

  const {
    data: settings,
    isLoading: loadingSettings,
  } = useQuery<GroupSettings>({
    queryKey: ['group-settings', conversationId],
    queryFn: () => groupsService.getSettings(conversationId!),
    enabled: !!conversationId,
    staleTime: 60_000,
  });

  // Derive current user's role in this group
  const currentUserRole: GroupRole | null =
    participants.find((p) => p.user_id === currentUserId)?.role ?? null;
  const isOwner = currentUserRole === 'owner';
  const isAdmin = currentUserRole === 'admin' || isOwner;

  // ── Mutations ────────────────────────────────────────────────────────────

  const addParticipantMutation = useMutation({
    mutationFn: (userId: number) => groupsService.addParticipant(conversationId!, userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['group-participants', conversationId] }),
  });

  const removeParticipantMutation = useMutation({
    mutationFn: (userId: number) => groupsService.removeParticipant(conversationId!, userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['group-participants', conversationId] }),
  });

  const changeRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: number; role: 'admin' | 'member' }) =>
      groupsService.updateParticipantRole(conversationId!, userId, { role }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['group-participants', conversationId] }),
  });

  const updateGroupMutation = useMutation({
    mutationFn: (data: UpdateGroupRequest) => groupsService.updateGroup(conversationId!, data),
    onSuccess: (updated: Conversation) => {
      queryClient.setQueryData<Conversation[]>(['conversations'], (prev) =>
        prev?.map((c) => (c.id === conversationId ? { ...c, ...updated } : c))
      );
    },
  });

  const updateSettingsMutation = useMutation({
    mutationFn: (data: Partial<GroupSettings>) => groupsService.updateSettings(conversationId!, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['group-settings', conversationId] }),
  });

  const leaveGroupMutation = useMutation({
    mutationFn: () => groupsService.leaveGroup(conversationId!),
    onSuccess: () => {
      queryClient.setQueryData<Conversation[]>(['conversations'], (prev) =>
        prev?.filter((c) => c.id !== conversationId)
      );
    },
  });

  const transferOwnershipMutation = useMutation({
    mutationFn: (data: TransferOwnershipRequest) =>
      groupsService.transferOwnership(conversationId!, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['group-participants', conversationId] }),
  });

  // ── Stable callbacks ─────────────────────────────────────────────────────

  const addParticipant = useCallback(
    (userId: number) => addParticipantMutation.mutateAsync(userId),
    [addParticipantMutation]
  );

  const removeParticipant = useCallback(
    (userId: number) => removeParticipantMutation.mutateAsync(userId),
    [removeParticipantMutation]
  );

  const changeRole = useCallback(
    (userId: number, role: 'admin' | 'member') => changeRoleMutation.mutateAsync({ userId, role }),
    [changeRoleMutation]
  );

  const updateGroup = useCallback(
    (data: UpdateGroupRequest) => updateGroupMutation.mutateAsync(data),
    [updateGroupMutation]
  );

  const updateSettings = useCallback(
    (data: Partial<GroupSettings>) => updateSettingsMutation.mutateAsync(data),
    [updateSettingsMutation]
  );

  const leaveGroup = useCallback(
    () => leaveGroupMutation.mutateAsync(),
    [leaveGroupMutation]
  );

  const transferOwnership = useCallback(
    (newOwnerId: number) => transferOwnershipMutation.mutateAsync({ new_owner_user_id: newOwnerId }),
    [transferOwnershipMutation]
  );

  return {
    participants,
    loadingParticipants,
    settings,
    loadingSettings,
    currentUserRole,
    isOwner,
    isAdmin,
    refetchParticipants,
    addParticipant,
    removeParticipant,
    changeRole,
    updateGroup,
    updateSettings,
    leaveGroup,
    transferOwnership,
    isAddingParticipant: addParticipantMutation.isPending,
    isRemovingParticipant: removeParticipantMutation.isPending,
    isChangingRole: changeRoleMutation.isPending,
    isUpdatingGroup: updateGroupMutation.isPending,
    isUpdatingSettings: updateSettingsMutation.isPending,
    isLeavingGroup: leaveGroupMutation.isPending,
    isTransferringOwnership: transferOwnershipMutation.isPending,
  };
}

// ── Group Invites hook ────────────────────────────────────────────────────────

export function useGroupInvites() {
  const queryClient = useQueryClient();

  const {
    data: invites = [],
    isLoading,
    refetch,
  } = useQuery<GroupInvite[]>({
    queryKey: ['group-invites'],
    queryFn: () => groupsService.getMyInvites(),
    staleTime: 30_000,
  });

  const acceptMutation = useMutation({
    mutationFn: (inviteId: number) => groupsService.acceptInvite(inviteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-invites'] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  const declineMutation = useMutation({
    mutationFn: (inviteId: number) => groupsService.declineInvite(inviteId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['group-invites'] }),
  });

  const acceptInvite = useCallback(
    (inviteId: number) => acceptMutation.mutateAsync(inviteId),
    [acceptMutation]
  );

  const declineInvite = useCallback(
    (inviteId: number) => declineMutation.mutateAsync(inviteId),
    [declineMutation]
  );

  const pendingCount = invites.filter((i) => i.status === 'pending').length;

  return {
    invites,
    isLoading,
    refetch,
    pendingCount,
    acceptInvite,
    declineInvite,
    isAccepting: acceptMutation.isPending,
    isDeclining: declineMutation.isPending,
  };
}
