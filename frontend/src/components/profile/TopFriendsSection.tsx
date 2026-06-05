import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { usersService } from '../../services/usersService';
import { friendsService } from '../../services/friendsService';
import { resolveMediaUrl } from '../../utils/mediaUrl';
import type { TopFriendsConfig } from '../../types/users';
import { useToast } from '../../hooks/useToast';

const TOP_FRIEND_COUNTS = [0, 2, 4, 6, 8] as const;

interface Props {
  username: string;
  isOwnProfile: boolean;
}

interface PickerProps {
  currentConfig: TopFriendsConfig;
  onSave: (cfg: TopFriendsConfig) => void;
  onCancel: () => void;
  isSaving: boolean;
}

function TopFriendsPicker({ currentConfig, onSave, onCancel, isSaving }: PickerProps) {
  const [count, setCount] = useState<0 | 2 | 4 | 6 | 8>(currentConfig.count);
  const [selected, setSelected] = useState<string[]>(currentConfig.friends ?? []);
  const [bestFriend, setBestFriend] = useState<string>(currentConfig.best_friend ?? '');

  const friendsQuery = useQuery({
    queryKey: ['friends'],
    queryFn: () => friendsService.getFriends(),
  });

  // Remove any pre-selected entries that are no longer friends (unfriended / deleted account)
  // so invisible stale entries cannot permanently fill slots and block the Save button.
  // Must run in useEffect — calling setState during render is a React rules violation.
  useEffect(() => {
    if (!friendsQuery.data) return;
    const currentSet = new Set(friendsQuery.data.map((f) => f.username));
    setSelected((prev) => {
      const next = prev.filter((u) => currentSet.has(u));
      return next.length === prev.length ? prev : next;
    });
    setBestFriend((prev) => (currentSet.has(prev) ? prev : ''));
  }, [friendsQuery.data]);

  const toggleFriend = (username: string) => {
    // Compute next selected list without side effects inside the updater.
    const next = selected.includes(username)
      ? selected.filter((u) => u !== username)
      : count > 0 && selected.length >= count
        ? selected
        : [...selected, username];

    setSelected(next);

    // Clear bestFriend if it was just deselected — done outside the setter.
    if (!next.includes(bestFriend)) {
      setBestFriend('');
    }
  };

  const handleCountChange = (newCount: 0 | 2 | 4 | 6 | 8) => {
    setCount(newCount);
    if (newCount === 0) {
      setSelected([]);
      setBestFriend('');
    } else if (selected.length > newCount) {
      const trimmed = selected.slice(0, newCount);
      setSelected(trimmed);
      if (!trimmed.includes(bestFriend)) setBestFriend('');
    }
  };

  const handleSave = () => {
    onSave({ count, friends: selected, best_friend: bestFriend || null });
  };

  const friends = friendsQuery.data ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-xl">
        <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
          Configure Top Friends
        </h3>

        <div className="mt-4">
          <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)] mb-2">
            Show
          </label>
          <div className="flex gap-2 flex-wrap">
            {TOP_FRIEND_COUNTS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => handleCountChange(n as 0 | 2 | 4 | 6 | 8)}
                className={`px-3 py-1.5 rounded-full text-sm font-semibold border transition ${
                  count === n
                    ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]'
                    : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]'
                }`}
              >
                {n === 0 ? 'Off' : `${n} friends`}
              </button>
            ))}
          </div>
        </div>

        {count > 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)] mb-2">
              Select {count} friends ({selected.length}/{count})
            </p>
            {friendsQuery.isLoading ? (
              <p className="text-sm text-[var(--color-text-secondary)]">Loading friends…</p>
            ) : friends.length === 0 ? (
              <p className="text-sm text-[var(--color-text-secondary)]">No friends yet.</p>
            ) : (
              <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
                {friends.map((f) => {
                  const isSelected = selected.includes(f.username);
                  const isBest = bestFriend === f.username;
                  return (
                    <div
                      key={f.username}
                      className={`flex items-center gap-3 rounded-md px-3 py-2 cursor-pointer transition ${
                        isSelected
                          ? 'bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/30'
                          : 'hover:bg-[var(--color-surface-elevated)] border border-transparent'
                      }`}
                      onClick={() => toggleFriend(f.username)}
                    >
                      {f.avatar_url ? (
                        <img
                          src={resolveMediaUrl(f.avatar_url)}
                          alt={f.username}
                          className="w-8 h-8 rounded-lg object-cover flex-shrink-0"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-lg bg-[var(--color-border)] flex items-center justify-center text-xs font-semibold text-[var(--color-text-secondary)] flex-shrink-0">
                          {f.username.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span className="flex-1 text-sm font-medium text-[var(--color-text-primary)]">
                        {f.username}
                      </span>
                      {isSelected && (
                        <button
                          type="button"
                          title={isBest ? 'Remove best friend' : 'Set as best friend'}
                          onClick={(e) => {
                            e.stopPropagation();
                            setBestFriend(isBest ? '' : f.username);
                          }}
                          className={`text-lg transition ${isBest ? 'text-yellow-400' : 'text-[var(--color-text-muted)] hover:text-yellow-400'}`}
                        >
                          ★
                        </button>
                      )}
                      {isSelected && (
                        <svg className="w-4 h-4 text-[var(--color-primary)]" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {bestFriend && (
              <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
                ★ <span className="font-medium">{bestFriend}</span> is your best friend
              </p>
            )}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || (count > 0 && selected.length !== count)}
            className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {isSaving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TopFriendsSection({ username, isOwnProfile }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);

  const topFriendsQuery = useQuery({
    queryKey: ['top-friends', username],
    queryFn: () => usersService.getTopFriends(username),
    staleTime: 1000 * 60 * 2,
  });

  const saveMutation = useMutation({
    mutationFn: (cfg: TopFriendsConfig) => usersService.setTopFriends(cfg),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['top-friends', username] });
      setIsEditing(false);
      toast.success(t('friends.toast.topFriendsUpdated'));
    },
    onError: () => {
      toast.error(t('friends.errors.topFriendsFailed'));
    },
  });

  const isLoading = topFriendsQuery.isLoading;
  const data = topFriendsQuery.data;
  const count = data?.count ?? 0;
  const friends = data?.friends ?? [];
  const bestFriend = data?.best_friend ?? '';

  // For non-owners: show a loading skeleton while the query is in flight,
  // then hide the section only after we've confirmed count === 0.
  if (!isOwnProfile && !isLoading && count === 0) return null;

  const currentConfig: TopFriendsConfig = {
    count: (count as 0 | 2 | 4 | 6 | 8),
    best_friend: bestFriend || null,
    friends: friends.map((f) => f.username),
  };

  return (
    <>
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">
            Top Friends
          </h3>
          {isOwnProfile && (
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              disabled={isLoading}
              className="text-xs font-medium text-[var(--color-primary)] hover:underline disabled:opacity-40"
            >
              Edit
            </button>
          )}
        </div>

        {isLoading ? (
          // Loading skeleton for both owner and visitor views
          <div className="grid grid-cols-2 gap-3">
            {[1, 2].map((i) => (
              <div key={i} className="flex flex-col items-center gap-1">
                <div className="w-12 h-12 rounded-lg bg-[var(--color-surface-elevated)] animate-pulse" />
                <div className="w-10 h-3 rounded bg-[var(--color-surface-elevated)] animate-pulse" />
              </div>
            ))}
          </div>
        ) : count === 0 || friends.length === 0 ? (
          isOwnProfile ? (
            <p className="text-xs text-[var(--color-text-muted)]">
              Click Edit to set your top friends.
            </p>
          ) : null
        ) : (
          // Grid: 2 cols for 2 friends, 4 cols for 4+
          <div className={`grid gap-3 ${count <= 2 ? 'grid-cols-2' : 'grid-cols-4'}`}>
            {friends.map((friend) => (
              <Link
                key={friend.username}
                to={`/users/${friend.username}`}
                className="flex flex-col items-center gap-1 group"
              >
                <div className="relative">
                  {friend.avatar_url ? (
                    <img
                      src={resolveMediaUrl(friend.avatar_url)}
                      alt={friend.username}
                      className="w-12 h-12 rounded-lg object-cover border-2 border-[var(--color-border)] group-hover:border-[var(--color-primary)] transition"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-[var(--color-border)] flex items-center justify-center text-sm font-semibold text-[var(--color-text-secondary)] border-2 border-[var(--color-border)] group-hover:border-[var(--color-primary)] transition">
                      {friend.username.charAt(0).toUpperCase()}
                    </div>
                  )}
                  {friend.username === bestFriend && (
                    <span
                      className="absolute -top-1.5 -right-1.5 text-sm leading-none"
                      title="Best Friend"
                    >
                      ★
                    </span>
                  )}
                </div>
                <span className="text-xs font-medium text-[var(--color-text-secondary)] group-hover:text-[var(--color-primary)] truncate max-w-[56px] text-center transition">
                  {friend.username}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {isEditing && (
        <TopFriendsPicker
          currentConfig={currentConfig}
          onSave={(cfg) => saveMutation.mutate(cfg)}
          onCancel={() => setIsEditing(false)}
          isSaving={saveMutation.isPending}
        />
      )}
    </>
  );
}
