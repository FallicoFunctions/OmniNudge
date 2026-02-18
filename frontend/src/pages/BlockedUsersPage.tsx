import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { usersService } from '../services/usersService';
import { Panel } from '../components/common/Panel';
import { ErrorMessage, LoadingMessage } from '../components/common/StatusMessage';
import { useFormat } from '../hooks/useFormat';

export default function BlockedUsersPage() {
  const { t } = useTranslation();
  const { formatDate } = useFormat();
  const queryClient = useQueryClient();

  const blockedUsersQuery = useQuery({
    queryKey: ['blocked-users'],
    queryFn: () => usersService.getBlockedUsers(),
  });

  const unblockMutation = useMutation({
    mutationFn: async (username: string) => usersService.unblockUser(username),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['blocked-users'] });
    },
  });

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">
          {t('blockedUsersPage.title')}
        </h1>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
          {t('blockedUsersPage.subtitle')}
        </p>
      </div>

      <Panel>
        {blockedUsersQuery.isLoading ? (
          <LoadingMessage>{t('blockedUsersPage.loading')}</LoadingMessage>
        ) : blockedUsersQuery.isError ? (
          <ErrorMessage>{t('blockedUsersPage.errors.loadFailed')}</ErrorMessage>
        ) : !blockedUsersQuery.data?.blocked_users?.length ? (
          <p className="text-sm text-[var(--color-text-secondary)]">
            {t('blockedUsersPage.empty')}
          </p>
        ) : (
          <div className="space-y-3">
            {blockedUsersQuery.data.blocked_users.map((blockedUser) => (
              <article
                key={blockedUser.id}
                className="flex flex-col gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <Link
                    to={`/users/${blockedUser.username}`}
                    className="text-base font-semibold text-[var(--color-text-primary)] hover:text-[var(--color-primary)]"
                  >
                    {blockedUser.username}
                  </Link>
                  <p className="text-xs text-[var(--color-text-secondary)]">
                    {t('blockedUsersPage.blockedAt', {
                      time: formatDate(blockedUser.blocked_at, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      }),
                    })}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={unblockMutation.isPending}
                  onClick={() => unblockMutation.mutate(blockedUser.username)}
                  className="rounded-md border border-[var(--color-error)] px-4 py-2 text-sm font-semibold text-[var(--color-error)] hover:bg-red-50 disabled:opacity-50"
                >
                  {t('blockedUsersPage.actions.unblock')}
                </button>
              </article>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

