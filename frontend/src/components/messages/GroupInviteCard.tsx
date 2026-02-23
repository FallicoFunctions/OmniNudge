import { useTranslation } from 'react-i18next';
import { useGroupInvites } from '../../hooks/useGroupConversation';
import { GroupAvatar } from './GroupAvatar';
import type { GroupInvite } from '../../types/messages';

interface GroupInviteCardProps {
  invite: GroupInvite;
  onAccept: (inviteId: number) => Promise<void>;
  onDecline: (inviteId: number) => Promise<void>;
  isAccepting: boolean;
  isDeclining: boolean;
}

export function GroupInviteCard({
  invite,
  onAccept,
  onDecline,
  isAccepting,
  isDeclining,
}: GroupInviteCardProps) {
  const { t } = useTranslation();

  return (
    <div className="flex items-start gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <GroupAvatar
        name={invite.group_name ?? 'Group'}
        avatarUrl={invite.group_avatar_url}
        size={44}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[var(--color-text-primary)] truncate">
          {invite.group_name ?? t('groups.unknownGroup')}
        </p>
        {invite.invited_by_username && (
          <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
            {t('groups.invitedBy', { name: invite.invited_by_username })}
          </p>
        )}
        <div className="flex gap-2 mt-3">
          <button
            type="button"
            onClick={() => onDecline(invite.id)}
            disabled={isAccepting || isDeclining}
            className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)] disabled:opacity-60"
          >
            {t('groups.decline')}
          </button>
          <button
            type="button"
            onClick={() => onAccept(invite.id)}
            disabled={isAccepting || isDeclining}
            className="rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            {isAccepting ? t('common.loading') : t('groups.accept')}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Displays all pending group invites for the current user */
export function GroupInvitesList({ onConversationOpened: _onConversationOpened }: { onConversationOpened?: (id: number) => void }) {
  const { t } = useTranslation();
  const { invites, isLoading, acceptInvite, declineInvite, isAccepting, isDeclining } = useGroupInvites();

  const pending = invites.filter((i) => i.status === 'pending');

  if (isLoading || pending.length === 0) return null;

  return (
    <div className="p-4 border-b border-[var(--color-border)]">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-3">
        {t('groups.pendingInvites')} ({pending.length})
      </h3>
      <div className="space-y-3">
        {pending.map((invite) => (
          <GroupInviteCard
            key={invite.id}
            invite={invite}
            onAccept={async (id) => {
              await acceptInvite(id);
            }}
            onDecline={declineInvite}
            isAccepting={isAccepting}
            isDeclining={isDeclining}
          />
        ))}
      </div>
    </div>
  );
}
