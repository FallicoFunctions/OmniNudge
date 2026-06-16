import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { usersService } from '../services/usersService';
import { ErrorMessage, LoadingMessage } from '../components/common/StatusMessage';
import { UserAvatar } from '../components/common/UserAvatar';

export default function UserFriendsListPage() {
  const { t } = useTranslation();
  const { username } = useParams<{ username: string }>();

  const friendsQuery = useQuery({
    queryKey: ['user-friends', username],
    queryFn: () => usersService.getUserFriends(username!),
    enabled: !!username,
  });

  const friends = friendsQuery.data?.friends ?? [];

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8">
      <div className="mb-6">
        <Link
          to={`/users/${username}`}
          className="text-sm font-medium text-[var(--color-primary)] hover:underline"
        >
          ← {t('userProfilePage.friendsPage.backToProfile')}
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-[var(--color-text-primary)]">
          {t('userProfilePage.friendsPage.title', { username })}
        </h1>
      </div>

      {friendsQuery.isLoading ? (
        <LoadingMessage>{t('userProfilePage.friendsPage.loading')}</LoadingMessage>
      ) : friendsQuery.isError ? (
        <ErrorMessage>{t('userProfilePage.errors.friendsLoadFailed')}</ErrorMessage>
      ) : friends.length === 0 ? (
        <p className="text-sm text-[var(--color-text-secondary)]">
          {t('userProfilePage.friendsPage.empty')}
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {friends.map((friend) => (
            <Link
              key={friend.id}
              to={`/users/${friend.username}`}
              className="flex flex-col items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 hover:border-[var(--color-primary)] transition"
            >
              <UserAvatar username={friend.username} avatarUrl={friend.avatar_url} size="lg" />
              <span className="text-sm font-medium text-[var(--color-text-primary)] text-center truncate w-full">
                {friend.username}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
