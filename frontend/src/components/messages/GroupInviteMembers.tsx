import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { groupsService } from '../../services/groupsService';
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
  const [invitedIds, setInvitedIds] = useState<number[]>([]);
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
    mutationFn: (user: FoundUser) =>
      groupsService.createInvite(conversationId, { user_id: user.id }),
    onSuccess: (_invite, user) => {
      setInvitedIds((ids) => [...ids, user.id]);
      setStatus({ ok: true, text: `${t('groups.inviteSent')}: ${user.username}` });
      setQuery('');
    },
    onError: () => setStatus({ ok: false, text: t('groups.inviteFailed') }),
  });

  const candidates = results.filter((u) => !memberIds.includes(u.id) && !invitedIds.includes(u.id));

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="mx-4 mb-2 w-[calc(100%-2rem)] rounded-md border border-[var(--color-border)] px-3 py-2 text-sm font-medium text-[var(--color-primary)] hover:bg-[var(--color-hover)]"
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
        }}
        placeholder={t('groups.searchUsersPlaceholder')}
        aria-label={t('groups.addMembers')}
        autoFocus
        className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none"
      />
      {candidates.length > 0 && (
        <ul className="mt-1 rounded-md border border-[var(--color-border)]">
          {candidates.map((user) => (
            <li key={user.id}>
              <button
                type="button"
                onClick={() => invite.mutate(user)}
                disabled={invite.isPending}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-[var(--color-hover)] disabled:opacity-60"
              >
                <div className="h-6 w-6 rounded-lg bg-[var(--color-primary)] flex items-center justify-center text-xs text-white font-semibold">
                  {user.username[0].toUpperCase()}
                </div>
                <span className="text-[var(--color-text-primary)]">{user.username}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {status && (
        <p
          role={status.ok ? 'status' : 'alert'}
          className={`mt-1 text-xs ${status.ok ? 'text-[var(--color-text-muted)]' : 'text-[var(--color-error)]'}`}
        >
          {status.text}
        </p>
      )}
    </div>
  );
}
