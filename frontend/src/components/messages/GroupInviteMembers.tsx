import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { groupsService } from '../../services/groupsService';
import { historyForNewcomer } from '../../services/newcomerHistory';
import type { SearchUsers } from './CreateGroupModal';

type FoundUser = Awaited<ReturnType<SearchUsers>>[number];

interface GroupInviteMembersProps {
  conversationId: number;
  memberIds: number[];
  searchUsers: SearchUsers;
}

export function GroupInviteMembers({
  conversationId,
  memberIds,
  searchUsers,
}: GroupInviteMembersProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FoundUser[]>([]);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        setResults(await searchUsers(query));
      } catch {
        setResults([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, searchUsers]);

  const invite = useMutation({
    mutationFn: async (user: FoundUser) =>
      groupsService.createInvite(conversationId, {
        user_id: user.id,
        history: await historyForNewcomer(conversationId, user.id),
      }),
    onSuccess: (_invite, user) => {
      setStatus({ ok: true, text: `${t('groups.inviteSent')}: ${user.username}` });
      setQuery('');
    },
    // lib/api throws a plain Error carrying the server's code and message on
    // the error itself. Reading an Axios-style response.data found nothing, so
    // every refusal said only "Failed to send invite".
    onError: (error) => {
      // Only a server's answer carries a status; a network failure's message
      // ("Failed to fetch") is not one to show.
      const { code, message, status } = error as Error & { code?: string; status?: number };
      setStatus({
        ok: false,
        text:
          code === 'group_user_banned'
            ? t('groups.inviteBanned')
            : (status && message?.trim()) || t('groups.inviteFailed'),
      });
    },
  });

  // Only members are left out. Someone invited before stays findable: they may
  // have been removed since, and inviting again only renews the invite.
  const candidates = results.filter((u) => !memberIds.includes(u.id));

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="mx-4 mb-2 w-[calc(100%-2rem)] rounded-md border border-border px-3 py-2 text-sm font-medium text-primary hover:bg-(--color-hover)"
      >
        {t('groups.addMembers')}
      </button>
    );
  }

  return (
    <div className="px-4 pb-2">
      <input
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setStatus(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setIsOpen(false);
          if (e.key === 'Enter' && candidates.length > 0 && !invite.isPending) {
            e.preventDefault();
            invite.mutate(candidates[0]);
          }
        }}
        placeholder={t('groups.searchUsersPlaceholder')}
        aria-label={t('groups.addMembers')}
        autoFocus
        className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-hidden"
      />
      {candidates.length > 0 && (
        <ul className="mt-1 rounded-md border border-border">
          {candidates.map((user) => (
            <li key={user.id}>
              <button
                type="button"
                onClick={() => invite.mutate(user)}
                disabled={invite.isPending}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-(--color-hover) disabled:opacity-60"
              >
                <div className="h-6 w-6 rounded-lg bg-primary flex items-center justify-center text-xs text-white font-semibold">
                  {user.username[0].toUpperCase()}
                </div>
                <span className="text-text-primary">{user.username}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {status && (
        <p
          role={status.ok ? 'status' : 'alert'}
          className={`mt-1 text-xs ${status.ok ? 'text-(--color-text-muted)' : 'text-(--color-error)'}`}
        >
          {status.text}
        </p>
      )}
    </div>
  );
}
