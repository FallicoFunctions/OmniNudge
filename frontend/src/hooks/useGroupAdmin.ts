import { useState, useEffect, useCallback, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminGroupsService } from '../services/adminGroupsService';
import type { GroupRestriction } from '../services/adminGroupsService';

interface UseGroupAdminOptions {
  conversationId: number;
  conversationType?: string;
  isAdmin?: boolean;
  onWebSocketEvent?: (handler: (type: string, payload: unknown) => void) => () => void;
}

export function useGroupAdmin({
  conversationId,
  conversationType,
  isAdmin = false,
}: UseGroupAdminOptions) {
  const queryClient = useQueryClient();
  const isGroup = conversationType === 'group';

  // Current user's restriction
  const { data: myRestriction } = useQuery({
    queryKey: ['group-my-restriction', conversationId],
    queryFn: () => adminGroupsService.getMyRestriction(conversationId),
    enabled: isGroup,
    refetchInterval: 30_000,
  });

  const isMuted = myRestriction?.restriction_type === 'mute';
  const muteExpiresAt = myRestriction?.expires_at ?? null;

  // Slow mode countdown
  const [remainingCooldown, setRemainingCooldown] = useState(0);
  const [slowModeSeconds, setSlowModeSeconds] = useState(0);
  const cooldownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startCooldown = useCallback((seconds: number) => {
    setRemainingCooldown(seconds);
    if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
    cooldownTimerRef.current = setInterval(() => {
      setRemainingCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(cooldownTimerRef.current!);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => {
    return () => {
      if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
    };
  }, []);

  // Mutations
  const muteUser = useMutation({
    mutationFn: ({ userId, durationMinutes, reason }: { userId: number; durationMinutes: number; reason?: string }) =>
      adminGroupsService.muteUser(conversationId, userId, { duration_minutes: durationMinutes, reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-restrictions', conversationId] });
    },
  });

  const unmuteUser = useMutation({
    mutationFn: (userId: number) => adminGroupsService.unmuteUser(conversationId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-restrictions', conversationId] });
    },
  });

  const banUser = useMutation({
    mutationFn: ({
      userId,
      reason,
      deleteMessages,
    }: {
      userId: number;
      reason?: string;
      deleteMessages: boolean;
    }) =>
      adminGroupsService.banUser(conversationId, userId, {
        reason,
        delete_messages: deleteMessages,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-restrictions', conversationId] });
      queryClient.invalidateQueries({ queryKey: ['group-participants', conversationId] });
    },
  });

  const unbanUser = useMutation({
    mutationFn: (userId: number) => adminGroupsService.unbanUser(conversationId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-restrictions', conversationId] });
    },
  });

  const adminDeleteMessage = useMutation({
    mutationFn: (messageId: number) => adminGroupsService.adminDeleteMessage(conversationId, messageId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
    },
  });

  const setSlowMode = useMutation({
    mutationFn: (seconds: number) => adminGroupsService.setSlowMode(conversationId, seconds),
    onSuccess: (data) => {
      setSlowModeSeconds(data.slow_mode_seconds);
    },
  });

  // Handle WebSocket events for real-time updates
  const handleWebSocketEvent = useCallback(
    (type: string, payload: unknown) => {
      const p = payload as Record<string, unknown>;
      if (!p || p['conversation_id'] !== conversationId) return;

      switch (type) {
        case 'group_member_muted':
        case 'group_member_unmuted':
        case 'group_member_banned':
          queryClient.invalidateQueries({ queryKey: ['group-my-restriction', conversationId] });
          queryClient.invalidateQueries({ queryKey: ['group-restrictions', conversationId] });
          if (type === 'group_member_banned') {
            queryClient.invalidateQueries({ queryKey: ['group-participants', conversationId] });
          }
          break;
        case 'group_message_deleted_by_admin':
          queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
          break;
        case 'group_slow_mode_updated':
          setSlowModeSeconds((p['slow_mode_seconds'] as number) ?? 0);
          break;
      }
    },
    [conversationId, queryClient]
  );

  return {
    isMuted,
    muteExpiresAt,
    slowModeSeconds,
    remainingCooldown,
    startCooldown,
    isAdmin,
    muteUser: muteUser.mutate,
    unmuteUser: unmuteUser.mutate,
    banUser: banUser.mutate,
    unbanUser: unbanUser.mutate,
    adminDeleteMessage: adminDeleteMessage.mutate,
    setSlowMode: setSlowMode.mutate,
    isMuting: muteUser.isPending,
    isBanning: banUser.isPending,
    handleWebSocketEvent,
  } as const;
}

export type UseGroupAdminReturn = ReturnType<typeof useGroupAdmin>;
