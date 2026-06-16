import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { usersService } from '../services/usersService';
import { wallService } from '../services/wallService';
import { useSettings } from '../contexts/SettingsContext';
import { useAuth } from '../contexts/AuthContext';
import { resolveMediaUrl } from '../utils/mediaUrl';
import type { UserProfile, WallPostMedia } from '../types/users';
import { MarkdownRenderer } from '../components/common/MarkdownRenderer';
import { UserAvatar } from '../components/common/UserAvatar';
import { MediaLightbox } from '../components/common/MediaLightbox';
import { ErrorMessage } from '../components/common/StatusMessage';
import { Skeleton } from '../components/common/LoadingStates';
import { useFormat } from '../hooks/useFormat';
import EditProfileModal from '../components/profile/EditProfileModal';
import TopFriendsSection from '../components/profile/TopFriendsSection';
import WallSection from '../components/profile/WallSection';
import { friendsService, friendsQueryKeys } from '../services/friendsService';
import type { FriendshipStatus } from '../types/friends';
import { useToast } from '../hooks/useToast';

function checkOnline(lastSeen?: string | null): boolean {
  if (!lastSeen) return false;
  return Date.now() - new Date(lastSeen).getTime() < 5 * 60 * 1000;
}

function OnlineDot({ lastSeen }: { lastSeen?: string | null }) {
  const [isOnline, setIsOnline] = useState(() => checkOnline(lastSeen));

  useEffect(() => {
    setIsOnline(checkOnline(lastSeen));
    // Re-check every 30 s so the dot flips to offline without a page reload.
    const id = setInterval(() => setIsOnline(checkOnline(lastSeen)), 30_000);
    return () => clearInterval(id);
  }, [lastSeen]);

  return (
    <span
      title={isOnline ? 'Online' : 'Offline'}
      className={`inline-block w-2.5 h-2.5 rounded-full border-2 border-[var(--color-surface)] flex-shrink-0 ${
        isOnline ? 'bg-green-500' : 'bg-[var(--color-text-muted)]'
      }`}
    />
  );
}

function ProfileInfoCard({ location, t }: { location: string; t: TFunction }) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)] mb-3">
        {t('userProfilePage.headings.info')}
      </h3>
      <div className="flex items-center gap-2 text-sm text-[var(--color-text-primary)]">
        <svg
          className="w-4 h-4 flex-shrink-0 text-[var(--color-text-secondary)]"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M17.657 16.657L13.414 20.9a2 2 0 01-2.828 0l-4.243-4.243a8 8 0 1111.314 0z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
        <span className="truncate">{location}</span>
      </div>
    </div>
  );
}

function PhotosWidget({ media, t }: { media: WallPostMedia[]; t: TFunction }) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const photos = useMemo(() => media.slice(0, 9), [media]);

  if (photos.length === 0) return null;

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)] mb-3">
        {t('userProfilePage.headings.photos')}
      </h3>
      <div className="grid grid-cols-3 gap-1.5">
        {photos.map((photo, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => setLightboxIndex(idx)}
            className="block aspect-square overflow-hidden rounded-md bg-[var(--color-surface-elevated)]"
          >
            {photo.media_type === 'video' && !photo.thumbnail_url ? (
              <video
                src={resolveMediaUrl(photo.url)}
                className="h-full w-full object-cover"
                muted
                preload="metadata"
              />
            ) : (
              <img
                src={resolveMediaUrl(photo.thumbnail_url || photo.url)}
                alt=""
                className="h-full w-full object-cover transition group-hover:opacity-90"
                loading="lazy"
              />
            )}
          </button>
        ))}
      </div>

      {lightboxIndex !== null && (
        <MediaLightbox
          items={photos}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onIndexChange={setLightboxIndex}
        />
      )}
    </div>
  );
}

function MutualFriendsWidget({ username, t }: { username: string; t: TFunction }) {
  const mutualFriendsQuery = useQuery({
    queryKey: ['mutual-friends', username],
    queryFn: () => usersService.getMutualFriends(username),
    staleTime: 1000 * 60 * 5,
  });

  const mutuals = mutualFriendsQuery.data?.mutual_friends ?? [];
  if (mutualFriendsQuery.isLoading || mutuals.length === 0) return null;

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)] mb-3">
        {t('userProfilePage.headings.mutualFriends')}
      </h3>
      <p className="mb-2 text-xs text-[var(--color-text-secondary)]">
        {t('userProfilePage.mutualFriends.count', { count: mutuals.length })}
      </p>
      <div className="space-y-1.5">
        {mutuals.map((friend) => (
          <Link
            key={friend.id}
            to={`/users/${friend.username}`}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 -mx-2 hover:bg-[var(--color-surface-elevated)] transition"
          >
            <UserAvatar username={friend.username} avatarUrl={friend.avatar_url} size="sm" />
            <span className="truncate text-sm font-medium text-[var(--color-text-primary)]">
              {friend.username}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function UserProfilePage() {
  const { t } = useTranslation();
  const { formatNumber, formatDate, formatRelativeTime } = useFormat();
  const { username } = useParams<{ username: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { useRelativeTime } = useSettings();
  const canViewPrivateTabs = user?.username === username;
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const { toast } = useToast();

  const profileQuery = useQuery<UserProfile>({
    queryKey: ['user-profile', username],
    queryFn: () => usersService.getProfile(username!),
    enabled: !!username,
  });
  const { refetch: refetchProfile } = profileQuery;

  const profile = profileQuery.data;

  const wallQuery = useQuery({
    queryKey: ['wall-posts', username],
    queryFn: () => wallService.getWallPosts(username!),
    enabled: !!username && !profile?.locked,
    staleTime: 1000 * 30,
  });

  const wallMedia = useMemo(() => {
    const items: WallPostMedia[] = [];
    for (const post of wallQuery.data?.posts ?? []) {
      if (post.media) items.push(...post.media);
    }
    return items;
  }, [wallQuery.data?.posts]);

  const canMessageUser = user && profile && user.username !== profile.username;

  const blockedUsersQuery = useQuery({
    queryKey: ['blocked-users'],
    queryFn: () => usersService.getBlockedUsers(),
    enabled: Boolean(user && profile && user.username !== profile.username),
    staleTime: 1000 * 30,
  });
  const isBlocked = Boolean(
    profile &&
    blockedUsersQuery.data?.blocked_users?.some(
      (bu) => bu.username.toLowerCase() === profile.username.toLowerCase()
    )
  );

  const blockMutation = useMutation({
    mutationFn: async () => {
      if (profile) await usersService.blockUser(profile.username);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['blocked-users'] }),
  });

  const unblockMutation = useMutation({
    mutationFn: async () => {
      if (profile) await usersService.unblockUser(profile.username);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['blocked-users'] }),
  });

  const friendshipStatusQuery = useQuery({
    queryKey: friendsQueryKeys.status(username ?? ''),
    queryFn: () => friendsService.getFriendshipStatus(username ?? ''),
    enabled: Boolean(user && username && user.username !== username),
    refetchOnMount: 'always',
    staleTime: 60_000,
    retry: 1,
  });

  const friendshipStatus: FriendshipStatus = friendshipStatusQuery.data ?? 'none';
  const friendActionDisabled = friendshipStatusQuery.isFetching || friendshipStatusQuery.isLoading;

  const setFriendStatus = (status: FriendshipStatus) => {
    queryClient.setQueryData(friendsQueryKeys.status(username ?? ''), status);
  };

  const friendRequestMutation = useMutation({
    mutationFn: () => friendsService.sendFriendRequest(profile!.username),
    onSuccess: (data) => {
      toast.success(data.message);
      setFriendStatus(data.result === 'accepted' ? 'accepted' : 'pending_outgoing');
      queryClient.invalidateQueries({ queryKey: friendsQueryKeys.requests });
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: friendsQueryKeys.status(username ?? '') });
      toast.error(t('friends.errors.sendFailed'));
    },
  });

  const acceptFriendMutation = useMutation({
    mutationFn: () => friendsService.acceptFriendRequest(profile!.username),
    onSuccess: () => {
      toast.success(t('friends.toast.accepted'));
      setFriendStatus('accepted');
      queryClient.invalidateQueries({ queryKey: friendsQueryKeys.friends });
      queryClient.invalidateQueries({ queryKey: friendsQueryKeys.requests });
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: friendsQueryKeys.status(username ?? '') });
      toast.error(t('friends.errors.acceptFailed'));
    },
  });

  const cancelOrDeclineFriendMutation = useMutation({
    mutationFn: () => friendsService.declineOrCancelFriendRequest(profile!.username),
    onSuccess: () => {
      setFriendStatus('none');
      queryClient.invalidateQueries({ queryKey: friendsQueryKeys.requests });
      queryClient.invalidateQueries({ queryKey: friendsQueryKeys.status(username ?? '') });
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: friendsQueryKeys.status(username ?? '') });
      toast.error(t('friends.errors.cancelFailed'));
    },
  });

  const removeFriendMutation = useMutation({
    mutationFn: () => friendsService.removeFriend(profile!.username),
    onSuccess: () => {
      toast.success(t('friends.toast.removed'));
      setFriendStatus('none');
      queryClient.invalidateQueries({ queryKey: friendsQueryKeys.friends });
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: friendsQueryKeys.status(username ?? '') });
      toast.error(t('friends.errors.removeFailed'));
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (payload: {
      bio?: string | null;
      avatar_url?: string | null;
      status_text?: string | null;
      banner_url?: string | null;
      location?: string | null;
    }) => usersService.updateProfile(payload),
    onSuccess: async () => {
      await refetchProfile();
      setIsEditProfileOpen(false);
    },
    onError: (error) => {
      alert(
        t('userProfilePage.edit.errors.saveFailed', {
          message: error instanceof Error ? error.message : t('common.error'),
        })
      );
    },
  });

  useEffect(() => {
    if (!user || !username || user.username !== username) return;
    let isActive = true;
    usersService
      .ping()
      .then(() => {
        if (isActive) refetchProfile();
      })
      .catch(() => {});
    return () => {
      isActive = false;
    };
  }, [user, username, refetchProfile]);

  // ─── Loading skeleton ───────────────────────────────────────────────────────
  if (profileQuery.isLoading) {
    return (
      <div className="w-full">
        <div className="h-40 md:h-52 bg-[var(--color-surface-elevated)] animate-pulse" />
        <div className="bg-[var(--color-surface)] border-b border-[var(--color-border)] px-4 py-4">
          <div className="max-w-6xl mx-auto flex gap-4">
            <Skeleton variant="rectangular" width="80px" height="80px" />
            <div className="flex-1 space-y-2 mt-1">
              <Skeleton variant="text" width="180px" height="24px" />
              <Skeleton variant="text" width="140px" height="16px" />
            </div>
          </div>
        </div>
        <div className="max-w-6xl mx-auto px-4 py-6 flex gap-6">
          <div className="hidden md:block w-72 space-y-3">
            <Skeleton variant="rectangular" width="100%" height="120px" />
            <Skeleton variant="rectangular" width="100%" height="90px" />
          </div>
          <div className="flex-1 space-y-3">
            <Skeleton variant="rectangular" width="100%" height="40px" />
            <Skeleton variant="rectangular" width="100%" height="120px" />
            <Skeleton variant="rectangular" width="100%" height="120px" />
          </div>
        </div>
      </div>
    );
  }

  if (profileQuery.isError || !profile) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-8">
        <ErrorMessage>{t('userProfilePage.errors.loadFailed')}</ErrorMessage>
      </div>
    );
  }

  function renderFriendActionButtons() {
    return (
      <>
        {friendshipStatus === 'accepted' && (
          <button
            type="button"
            disabled={removeFriendMutation.isPending || friendActionDisabled}
            onClick={() => removeFriendMutation.mutate()}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-success)] px-3 py-1.5 text-sm font-semibold text-[var(--color-success)] hover:opacity-80 disabled:opacity-50 transition"
          >
            ✓ {t('friends.actions.friends')}
          </button>
        )}
        {friendshipStatus === 'pending_outgoing' && (
          <button
            type="button"
            disabled={cancelOrDeclineFriendMutation.isPending || friendActionDisabled}
            onClick={() => cancelOrDeclineFriendMutation.mutate()}
            className="inline-flex items-center rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm font-semibold text-[var(--color-text-secondary)] hover:border-[var(--color-error)] hover:text-[var(--color-error)] disabled:opacity-50 transition"
          >
            {t('friends.actions.cancelRequest')}
          </button>
        )}
        {friendshipStatus === 'pending_incoming' && (
          <div className="flex gap-2">
            <button
              type="button"
              disabled={acceptFriendMutation.isPending || friendActionDisabled}
              onClick={() => acceptFriendMutation.mutate()}
              className="inline-flex items-center rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 transition"
            >
              {t('friends.actions.accept')}
            </button>
            <button
              type="button"
              disabled={cancelOrDeclineFriendMutation.isPending || friendActionDisabled}
              onClick={() => cancelOrDeclineFriendMutation.mutate()}
              className="inline-flex items-center rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm font-semibold text-[var(--color-text-secondary)] hover:border-[var(--color-error)] hover:text-[var(--color-error)] disabled:opacity-50 transition"
            >
              {t('friends.actions.decline')}
            </button>
          </div>
        )}
        {friendshipStatus === 'none' && (
          <button
            type="button"
            disabled={friendRequestMutation.isPending || friendActionDisabled}
            onClick={() => friendRequestMutation.mutate()}
            className="inline-flex items-center gap-1 rounded-md border border-[var(--color-primary)] px-3 py-1.5 text-sm font-semibold text-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-white disabled:opacity-50 transition"
          >
            + {t('friends.actions.addFriend')}
          </button>
        )}
      </>
    );
  }

  if (profile.locked) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-12 flex flex-col items-center gap-3 text-center">
        <h1 className="text-xl md:text-2xl font-bold text-[var(--color-text-primary)]">
          {profile.username}
        </h1>
        <p className="text-sm text-[var(--color-text-secondary)]">
          {t('userProfilePage.locked.message')}
        </p>
        {user && canMessageUser && !isBlocked ? (
          renderFriendActionButtons()
        ) : !user ? (
          <button
            type="button"
            onClick={() =>
              window.dispatchEvent(new CustomEvent('open-auth-modal', { detail: 'login' }))
            }
            className="inline-flex items-center gap-1 rounded-md border border-[var(--color-primary)] px-3 py-1.5 text-sm font-semibold text-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-white transition"
          >
            + {t('friends.actions.addFriend')}
          </button>
        ) : null}
      </div>
    );
  }

  // Join date: respect relative-time preference, but use date-only when absolute
  // (no time-of-day shown for a membership start date).
  const createdLabel = useRelativeTime
    ? formatRelativeTime(new Date(profile.created_at))
    : formatDate(new Date(profile.created_at), { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div className="w-full">
      {/* ── Cover Banner ─────────────────────────────────────────────────── */}
      <div className="relative h-36 md:h-48 overflow-hidden">
        {profile.banner_url ? (
          <img
            src={resolveMediaUrl(profile.banner_url)}
            alt="Profile banner"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-[var(--color-primary)] via-[var(--color-primary-dark)] to-[var(--color-primary-light)] opacity-80" />
        )}
      </div>

      {/* ── Profile Header Bar ───────────────────────────────────────────── */}
      <div className="bg-[var(--color-surface)] border-b border-[var(--color-border)]">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex flex-col sm:flex-row sm:items-end gap-3 sm:gap-4 pb-4 relative">
            {/* Avatar — overlaps the banner */}
            <div className="flex-shrink-0 -mt-10 md:-mt-14 z-10 relative w-20 h-20 md:w-28 md:h-28">
              {profile.avatar_url ? (
                <img
                  src={resolveMediaUrl(profile.avatar_url)}
                  alt={t('userProfilePage.aria.avatarAlt', { username: profile.username })}
                  className="w-full h-full rounded-lg object-cover border-4 border-[var(--color-surface)] shadow-md"
                />
              ) : (
                <div className="w-full h-full rounded-lg bg-[var(--color-border)] border-4 border-[var(--color-surface)] shadow-md flex items-center justify-center text-3xl font-bold text-[var(--color-text-secondary)]">
                  {profile.username.charAt(0).toUpperCase()}
                </div>
              )}
              {/* Online status dot */}
              <div className="absolute bottom-1 right-1">
                <OnlineDot lastSeen={profile.last_seen} />
              </div>
            </div>

            {/* Name + Status */}
            <div className="flex-1 min-w-0 pt-1 sm:pb-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl md:text-2xl font-bold text-[var(--color-text-primary)] leading-tight">
                  {profile.username}
                </h1>
                {isBlocked && (
                  <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                    {t('userProfilePage.labels.blocked')}
                  </span>
                )}
              </div>
              {profile.status_text && (
                <p className="mt-0.5 text-sm italic text-[var(--color-text-secondary)] truncate max-w-sm">
                  "{profile.status_text}"
                </p>
              )}
              <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                {t('userProfilePage.labels.joined', { time: createdLabel })}
              </p>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap items-center gap-2 sm:pb-1">
              {canViewPrivateTabs && (
                <button
                  type="button"
                  onClick={() => setIsEditProfileOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm font-semibold text-[var(--color-text-primary)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                    />
                  </svg>
                  {t('userProfilePage.actions.editProfile')}
                </button>
              )}
              {canMessageUser && !isBlocked && (
                <Link
                  to={`/messages?to=${encodeURIComponent(profile.username)}`}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm font-semibold text-[var(--color-text-primary)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-3 3v-3z"
                    />
                  </svg>
                  {t('userProfilePage.actions.message')}
                </Link>
              )}
              {/* Friend buttons */}
              {user && canMessageUser && !isBlocked && renderFriendActionButtons()}
              {canMessageUser && (
                <button
                  type="button"
                  disabled={blockMutation.isPending || unblockMutation.isPending}
                  onClick={() => {
                    if (isBlocked) {
                      unblockMutation.mutate();
                    } else if (
                      window.confirm(
                        t('userProfilePage.actions.confirmBlock', { username: profile.username })
                      )
                    ) {
                      blockMutation.mutate();
                    }
                  }}
                  className={`inline-flex items-center rounded-md border px-3 py-1.5 text-sm font-semibold transition disabled:opacity-50 ${
                    isBlocked
                      ? 'border-[var(--color-success)] text-[var(--color-success)] hover:opacity-80'
                      : 'border-[var(--color-error)] text-[var(--color-error)] hover:opacity-80'
                  }`}
                >
                  {isBlocked
                    ? t('userProfilePage.actions.unblock')
                    : t('userProfilePage.actions.block')}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── About + Stats bar (full width) ──────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 mb-6">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)] mb-3">
            About Me
          </h3>
          {profile.bio ? (
            <MarkdownRenderer
              content={profile.bio}
              className="text-sm text-[var(--color-text-primary)]"
            />
          ) : (
            <p className="text-sm text-[var(--color-text-muted)] italic">
              {canViewPrivateTabs ? 'Add a bio to tell people about yourself.' : 'No bio yet.'}
            </p>
          )}
          <div className="mt-3 pt-3 border-t border-[var(--color-border)] flex flex-wrap gap-4 text-sm">
            <Link to={`/users/${username}/friends`} className="hover:underline">
              <span className="font-semibold text-[var(--color-text-primary)]">
                {wallQuery.isLoading ? '—' : formatNumber(wallQuery.data?.friend_count ?? 0)}
              </span>
              <span className="text-[var(--color-text-secondary)] ml-1">
                {t('userProfilePage.labels.friends')}
              </span>
            </Link>
            <div>
              <span className="font-semibold text-[var(--color-text-primary)]">
                {wallQuery.isLoading ? '—' : formatNumber(wallQuery.data?.photo_count ?? 0)}
              </span>
              <span className="text-[var(--color-text-secondary)] ml-1">
                {t('userProfilePage.labels.photos')}
              </span>
            </div>
            <div>
              <span className="font-semibold text-[var(--color-text-primary)]">
                {wallQuery.isLoading ? '—' : formatNumber(wallQuery.data?.own_post_count ?? 0)}
              </span>
              <span className="text-[var(--color-text-secondary)] ml-1">
                {t('userProfilePage.labels.wallPosts')}
              </span>
            </div>
            <div>
              <span className="font-semibold text-[var(--color-text-primary)]">
                {wallQuery.isLoading ? '—' : formatNumber(wallQuery.data?.reply_count ?? 0)}
              </span>
              <span className="text-[var(--color-text-secondary)] ml-1">
                {t('userProfilePage.labels.replies')}
              </span>
            </div>
          </div>
        </div>

        {/* ── 3-column layout: Friends | Wall | Activity ──────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-[200px_1fr_240px] lg:grid-cols-[260px_1fr_300px] gap-4 lg:gap-6 items-start">
          {/* ── Left: Friends ────────────────────────────────────────────── */}
          <aside className="order-2 md:order-1 flex flex-col gap-3">
            {username && (
              <TopFriendsSection username={username} isOwnProfile={canViewPrivateTabs} />
            )}
            {username && (
              <Link
                to={`/users/${username}/friends`}
                className="text-sm font-medium text-[var(--color-primary)] hover:underline"
              >
                {t('friends.actions.seeAll')} →
              </Link>
            )}
          </aside>

          {/* ── Middle: Wall ─────────────────────────────────────────────── */}
          <main className="order-1 lg:order-2 min-w-0">
            {username && <WallSection username={username} isOwnProfile={canViewPrivateTabs} />}
          </main>

          {/* ── Right: Info + Mutual Friends + Photos ───────────────────────── */}
          <aside className="order-3 flex flex-col gap-4">
            {profile.location && <ProfileInfoCard location={profile.location} t={t} />}

            {user && username && !canViewPrivateTabs && (
              <MutualFriendsWidget username={username} t={t} />
            )}

            <PhotosWidget media={wallMedia} t={t} />
          </aside>
        </div>
      </div>

      <EditProfileModal
        isOpen={isEditProfileOpen}
        onClose={() => setIsEditProfileOpen(false)}
        initialBio={profile.bio}
        initialAvatarUrl={profile.avatar_url}
        initialStatusText={profile.status_text}
        initialBannerUrl={profile.banner_url}
        initialLocation={profile.location}
        onUploadAvatar={async (file) => {
          const uploadResult = await usersService.uploadAvatar(file);
          return uploadResult.avatar_url;
        }}
        onUploadBanner={async (file) => {
          const uploadResult = await usersService.uploadBanner(file);
          return uploadResult.banner_url;
        }}
        isSaving={updateProfileMutation.isPending}
        onSave={async (payload) => {
          await updateProfileMutation.mutateAsync(payload);
        }}
      />
    </div>
  );
}
