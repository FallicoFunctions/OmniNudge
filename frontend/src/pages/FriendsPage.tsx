import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  friendsService,
  friendsQueryKeys,
} from '../services/friendsService';
import { Panel } from '../components/common/Panel';
import { ErrorMessage, LoadingMessage } from '../components/common/StatusMessage';
import { resolveMediaUrl } from '../utils/mediaUrl';
import { useFormat } from '../hooks/useFormat';
import { useToast } from '../hooks/useToast';

type Tab = 'friends' | 'incoming' | 'outgoing';

export default function FriendsPage() {
  const { t } = useTranslation();
  const { formatDate } = useFormat();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('friends');

  const friendsQuery = useQuery({
    queryKey: friendsQueryKeys.friends,
    queryFn: () => friendsService.getFriends(),
    staleTime: 0,
    refetchInterval: 30_000, // Poll so cross-session changes (e.g. other user accepts) show up
  });

  const requestsQuery = useQuery({
    queryKey: friendsQueryKeys.requests,
    queryFn: () => friendsService.getFriendRequests(),
    staleTime: 0,
    // No refetchInterval here — AccountMenu already polls this key every 30s.
    // Two independent timers on the same key can desync and fire near-simultaneously.
  });

  // Helper: immediately remove a user from the incoming list in the cache
  const removeFromIncoming = (username: string) => {
    queryClient.setQueryData(friendsQueryKeys.requests, (old: typeof requestsQuery.data) => {
      if (!old) return old;
      return { ...old, incoming: old.incoming.filter((r) => r.username !== username) };
    });
  };

  const removeFriendMutation = useMutation({
    mutationFn: (username: string) => friendsService.removeFriend(username),
    // Capture snapshot before optimistic removal so we can roll back on failure
    onMutate: async (username) => {
      await queryClient.cancelQueries({ queryKey: friendsQueryKeys.friends });
      const snapshot = queryClient.getQueryData<typeof friendsQuery.data>(friendsQueryKeys.friends);
      // Optimistically remove from list immediately
      queryClient.setQueryData(friendsQueryKeys.friends, (old: typeof friendsQuery.data) =>
        old ? old.filter((f) => f.username !== username) : old
      );
      return { snapshot };
    },
    onSuccess: (_data, username) => {
      toast.success(t('friends.toast.removed'));
      // Force a reconciling refetch so any race with refetchInterval is resolved from truth
      queryClient.invalidateQueries({ queryKey: friendsQueryKeys.friends });
      // Also invalidate the profile-page status cache for this user so the button
      // on /users/:username updates immediately rather than showing stale "Friends"
      queryClient.invalidateQueries({ queryKey: friendsQueryKeys.status(username) });
    },
    onError: (_err, _username, context) => {
      // Roll back the optimistic removal so the list is consistent with the DB
      if (context?.snapshot !== undefined) {
        queryClient.setQueryData(friendsQueryKeys.friends, context.snapshot);
      }
      toast.error(t('friends.errors.removeFailed'));
    },
  });

  const acceptMutation = useMutation({
    mutationFn: (username: string) => friendsService.acceptFriendRequest(username),
    onMutate: async (username) => {
      await queryClient.cancelQueries({ queryKey: friendsQueryKeys.requests });
      const snapshot = queryClient.getQueryData<typeof requestsQuery.data>(friendsQueryKeys.requests);
      removeFromIncoming(username);
      return { snapshot };
    },
    onSuccess: (_data, username, context) => {
      toast.success(t('friends.toast.accepted'));
      // Optimistic: add to friends list immediately using the pre-removal snapshot.
      // Falls back to the refetch below when the snapshot is unavailable (cold load).
      const accepted = context?.snapshot?.incoming?.find((r) => r.username === username);
      if (accepted) {
        queryClient.setQueryData(friendsQueryKeys.friends, (old: typeof friendsQuery.data) => {
          const newFriend = {
            id: accepted.id,
            username: accepted.username,
            avatar_url: accepted.avatar_url,
            friends_since: new Date().toISOString(),
          };
          return old ? [...old, newFriend] : [newFriend];
        });
      }
      // Refetch (not just invalidate) the friends list so it's always up-to-date,
      // even when the optimistic add was skipped due to a missing snapshot.
      queryClient.refetchQueries({ queryKey: friendsQueryKeys.friends });
      queryClient.invalidateQueries({ queryKey: friendsQueryKeys.requests });
      // Sync the per-user status cache so the accepted user's profile page
      // shows "Friends ✓" immediately instead of stale Accept/Decline buttons.
      queryClient.invalidateQueries({ queryKey: friendsQueryKeys.status(username) });
    },
    onError: (_err, _username, context) => {
      if (context?.snapshot !== undefined) {
        queryClient.setQueryData(friendsQueryKeys.requests, context.snapshot);
      }
      toast.error(t('friends.errors.acceptFailed'));
    },
  });

  // Single mutation handles both decline (incoming) and cancel (outgoing) — same
  // API endpoint, same rollback logic, only the optimistic cache slice differs.
  const declineOrCancelMutation = useMutation({
    mutationFn: ({ username }: { username: string; direction: 'incoming' | 'outgoing' }) =>
      friendsService.declineOrCancelFriendRequest(username),
    onMutate: async ({ username, direction }) => {
      await queryClient.cancelQueries({ queryKey: friendsQueryKeys.requests });
      const snapshot = queryClient.getQueryData<typeof requestsQuery.data>(friendsQueryKeys.requests);
      queryClient.setQueryData(friendsQueryKeys.requests, (old: typeof requestsQuery.data) => {
        if (!old) return old;
        return { ...old, [direction]: old[direction].filter((r) => r.username !== username) };
      });
      return { snapshot };
    },
    onSuccess: (_data, { username, direction }) => {
      queryClient.invalidateQueries({ queryKey: friendsQueryKeys.requests });
      if (direction === 'incoming') {
        // Bust the requester's per-profile status so their profile page shows
        // "+ Add Friend" immediately instead of stale Accept/Decline buttons.
        queryClient.invalidateQueries({ queryKey: friendsQueryKeys.status(username) });
        toast.success(t('friends.toast.declined'));
      }
    },
    onError: (_err, { direction }, context) => {
      if (context?.snapshot !== undefined) {
        queryClient.setQueryData(friendsQueryKeys.requests, context.snapshot);
      }
      toast.error(t(direction === 'incoming' ? 'friends.errors.declineFailed' : 'friends.errors.cancelFailed'));
    },
  });

  const incomingCount = requestsQuery.data?.incoming?.length ?? 0;
  const outgoingCount = requestsQuery.data?.outgoing?.length ?? 0;

  const tabs: { key: Tab; labelKey: string; badge?: number; badgePlain?: boolean }[] = [
    {
      key: 'friends',
      labelKey: 'friends.tabs.friends',
      badge: friendsQuery.data?.length,
      badgePlain: true,
    },
    {
      key: 'incoming',
      labelKey: 'friends.tabs.incoming',
      badge: incomingCount || undefined,
    },
    {
      key: 'outgoing',
      labelKey: 'friends.tabs.outgoing',
      badge: outgoingCount || undefined,
    },
  ];

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">
          {t('friends.title')}
        </h1>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
          {t('friends.subtitle')}
        </p>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex gap-1 border-b border-[var(--color-border)]">
        {tabs.map(({ key, labelKey, badge, badgePlain }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`relative flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold transition-colors ${
              tab === key
                ? 'border-b-2 border-[var(--color-primary)] text-[var(--color-primary)]'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            {t(labelKey)}
            {badge != null && badge > 0 && (
              badgePlain
                ? <span className="text-xs font-bold">{badge}</span>
                : <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--color-primary)] px-1 text-xs font-bold text-white">{badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab: Friends List */}
      {tab === 'friends' && (
        <Panel>
          {friendsQuery.isLoading ? (
            <LoadingMessage>{t('friends.loading')}</LoadingMessage>
          ) : friendsQuery.isError ? (
            <ErrorMessage>{t('friends.errors.loadFailed')}</ErrorMessage>
          ) : !friendsQuery.data?.length ? (
            <div className="py-8 text-center">
              <p className="text-sm text-[var(--color-text-secondary)]">{t('friends.empty')}</p>
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                {t('friends.emptyHint')}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {friendsQuery.data.map((friend) => (
                <article
                  key={friend.id}
                  className="flex flex-col gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-center gap-3">
                    {friend.avatar_url ? (
                      <img
                        src={resolveMediaUrl(friend.avatar_url)}
                        alt={friend.username}
                        className="h-10 w-10 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-primary)] text-sm font-bold text-white">
                        {friend.username[0].toUpperCase()}
                      </div>
                    )}
                    <div>
                      <Link
                        to={`/users/${friend.username}`}
                        className="text-base font-semibold text-[var(--color-text-primary)] hover:text-[var(--color-primary)]"
                      >
                        {friend.username}
                      </Link>
                      <p className="text-xs text-[var(--color-text-secondary)]">
                        {t('friends.friendsSince', {
                          date: formatDate(friend.friends_since, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          }),
                        })}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={
                      removeFriendMutation.isPending &&
                      removeFriendMutation.variables === friend.username
                    }
                    onClick={() => removeFriendMutation.mutate(friend.username)}
                    className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-text-secondary)] hover:border-[var(--color-error)] hover:text-[var(--color-error)] disabled:opacity-50"
                  >
                    {t('friends.actions.unfriend')}
                  </button>
                </article>
              ))}
            </div>
          )}
        </Panel>
      )}

      {/* Tab: Incoming Requests */}
      {tab === 'incoming' && (
        <Panel>
          {requestsQuery.isLoading || requestsQuery.isFetching ? (
            <LoadingMessage>{t('friends.loading')}</LoadingMessage>
          ) : requestsQuery.isError ? (
            <ErrorMessage>{t('friends.errors.loadFailed')}</ErrorMessage>
          ) : !requestsQuery.data?.incoming?.length ? (
            <div className="py-8 text-center">
              <p className="text-sm text-[var(--color-text-secondary)]">
                {t('friends.incoming.empty')}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {requestsQuery.data.incoming.map((req) => (
                <article
                  key={req.id}
                  className="flex flex-col gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-center gap-3">
                    {req.avatar_url ? (
                      <img
                        src={resolveMediaUrl(req.avatar_url)}
                        alt={req.username}
                        className="h-10 w-10 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-primary)] text-sm font-bold text-white">
                        {req.username[0].toUpperCase()}
                      </div>
                    )}
                    <div>
                      <Link
                        to={`/users/${req.username}`}
                        className="text-base font-semibold text-[var(--color-text-primary)] hover:text-[var(--color-primary)]"
                      >
                        {req.username}
                      </Link>
                      <p className="text-xs text-[var(--color-text-secondary)]">
                        {t('friends.incoming.sentAt', {
                          date: formatDate(req.sent_at, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          }),
                        })}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={acceptMutation.isPending}
                      onClick={() => acceptMutation.mutate(req.username)}
                      className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)] disabled:opacity-50"
                    >
                      {t('friends.actions.accept')}
                    </button>
                    <button
                      type="button"
                      disabled={
                        declineOrCancelMutation.isPending &&
                        declineOrCancelMutation.variables?.username === req.username
                      }
                      onClick={() => declineOrCancelMutation.mutate({ username: req.username, direction: 'incoming' })}
                      className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-text-secondary)] hover:border-[var(--color-error)] hover:text-[var(--color-error)] disabled:opacity-50"
                    >
                      {t('friends.actions.decline')}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </Panel>
      )}

      {/* Tab: Outgoing Requests */}
      {tab === 'outgoing' && (
        <Panel>
          {requestsQuery.isLoading || requestsQuery.isFetching ? (
            <LoadingMessage>{t('friends.loading')}</LoadingMessage>
          ) : requestsQuery.isError ? (
            <ErrorMessage>{t('friends.errors.loadFailed')}</ErrorMessage>
          ) : !requestsQuery.data?.outgoing?.length ? (
            <div className="py-8 text-center">
              <p className="text-sm text-[var(--color-text-secondary)]">
                {t('friends.outgoing.empty')}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {requestsQuery.data.outgoing.map((req) => (
                <article
                  key={req.id}
                  className="flex flex-col gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-center gap-3">
                    {req.avatar_url ? (
                      <img
                        src={resolveMediaUrl(req.avatar_url)}
                        alt={req.username}
                        className="h-10 w-10 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-primary)] text-sm font-bold text-white">
                        {req.username[0].toUpperCase()}
                      </div>
                    )}
                    <div>
                      <Link
                        to={`/users/${req.username}`}
                        className="text-base font-semibold text-[var(--color-text-primary)] hover:text-[var(--color-primary)]"
                      >
                        {req.username}
                      </Link>
                      <p className="text-xs text-[var(--color-text-secondary)]">
                        {t('friends.outgoing.sentAt', {
                          date: formatDate(req.sent_at, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          }),
                        })}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={
                      declineOrCancelMutation.isPending &&
                      declineOrCancelMutation.variables?.username === req.username
                    }
                    onClick={() => declineOrCancelMutation.mutate({ username: req.username, direction: 'outgoing' })}
                    className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-text-secondary)] hover:border-[var(--color-error)] hover:text-[var(--color-error)] disabled:opacity-50"
                  >
                    {t('friends.actions.cancelRequest')}
                  </button>
                </article>
              ))}
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}
