import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useGroupConversation } from '../../hooks/useGroupConversation';
import { GroupAvatar } from './GroupAvatar';
import type { Conversation, GroupParticipant, GroupRole } from '../../types/messages';

interface GroupDetailsSidebarProps {
  conversation: Conversation;
  currentUserId: number;
  onClose: () => void;
}

function RoleBadge({ role }: { role: GroupRole }) {
  const { t } = useTranslation();
  if (role === 'member') return null;
  return (
    <span className={`px-1.5 py-0.5 text-[10px] font-semibold rounded ${
      role === 'owner'
        ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
        : 'bg-blue-100 text-[var(--color-primary)] dark:bg-blue-900/30'
    }`}>
      {t(`groups.roles.${role}`)}
    </span>
  );
}

function ParticipantRow({
  participant,
  currentUserRole,
  currentUserId,
  onRemove,
  onChangeRole,
}: {
  participant: GroupParticipant;
  currentUserRole: GroupRole | null;
  currentUserId: number;
  onRemove: (userId: number) => void;
  onChangeRole: (userId: number, role: 'admin' | 'member') => void;
}) {
  const { t } = useTranslation();
  const [showMenu, setShowMenu] = useState(false);
  const isCurrentUser = participant.user_id === currentUserId;
  const canManage =
    (currentUserRole === 'owner' || currentUserRole === 'admin') &&
    !isCurrentUser &&
    participant.role !== 'owner';

  return (
    <div className="flex items-center gap-2 px-4 py-2 hover:bg-[var(--color-hover)] relative">
      <div className="h-8 w-8 rounded-full bg-[var(--color-primary)]/20 flex items-center justify-center text-sm font-semibold text-[var(--color-primary)] shrink-0">
        {participant.username[0].toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">
          {participant.username}
          {isCurrentUser && (
            <span className="ml-1.5 text-xs text-[var(--color-text-muted)]">{t('common.you')}</span>
          )}
        </p>
      </div>
      <RoleBadge role={participant.role} />
      {canManage && (
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowMenu((s) => !s)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-text-muted)] hover:bg-[var(--color-surface-elevated)]"
            aria-label={t('groups.participantActions')}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
              <circle cx="7" cy="3" r="1.2" fill="currentColor" />
              <circle cx="7" cy="7" r="1.2" fill="currentColor" />
              <circle cx="7" cy="11" r="1.2" fill="currentColor" />
            </svg>
          </button>
          {showMenu && (
            <div className="absolute right-0 top-8 z-10 w-44 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl">
              {participant.role === 'member' && currentUserRole === 'owner' && (
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm hover:bg-[var(--color-hover)]"
                  onClick={() => { onChangeRole(participant.user_id, 'admin'); setShowMenu(false); }}
                >
                  {t('groups.makeAdmin')}
                </button>
              )}
              {participant.role === 'admin' && currentUserRole === 'owner' && (
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm hover:bg-[var(--color-hover)]"
                  onClick={() => { onChangeRole(participant.user_id, 'member'); setShowMenu(false); }}
                >
                  {t('groups.removeAdmin')}
                </button>
              )}
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm text-[var(--color-error)] hover:bg-[var(--color-hover)]"
                onClick={() => { onRemove(participant.user_id); setShowMenu(false); }}
              >
                {t('groups.removeFromGroup')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function GroupDetailsSidebar({ conversation, currentUserId, onClose }: GroupDetailsSidebarProps) {
  const { t } = useTranslation();
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(conversation.group_name ?? '');
  const [leaveError, setLeaveError] = useState('');

  const {
    participants,
    loadingParticipants,
    settings,
    currentUserRole,
    isAdmin,
    isOwner,
    removeParticipant,
    changeRole,
    updateGroup,
    leaveGroup,
    isLeavingGroup,
    isUpdatingGroup,
  } = useGroupConversation({ conversationId: conversation.id, currentUserId });

  // Sort: owner → admins → members
  const sorted = [...participants].sort((a, b) => {
    const order = { owner: 0, admin: 1, member: 2 };
    return (order[a.role] ?? 3) - (order[b.role] ?? 3);
  });

  const handleSaveName = async () => {
    if (!editedName.trim()) return;
    await updateGroup({ name: editedName.trim() });
    setIsEditingName(false);
  };

  const handleLeave = async () => {
    try {
      await leaveGroup();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      setLeaveError(
        msg.includes('transfer') ? t('groups.leaveOwnerError') : t('groups.leaveError')
      );
    }
  };

  return (
    <div className="flex h-full flex-col border-l border-[var(--color-border)] bg-[var(--color-surface)]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
          {t('groups.groupInfo')}
        </h3>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('common.close')}
          className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--color-text-muted)] hover:bg-[var(--color-hover)]"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
            <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Group identity */}
        <div className="flex flex-col items-center gap-3 px-4 py-6 border-b border-[var(--color-border)]">
          <GroupAvatar
            name={conversation.group_name ?? 'Group'}
            avatarUrl={conversation.group_avatar_url}
            size={64}
          />
          {isEditingName && isAdmin ? (
            <div className="flex gap-2 items-center w-full">
              <input
                type="text"
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                maxLength={100}
                className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none"
                onKeyDown={(e) => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setIsEditingName(false); }}
                autoFocus
              />
              <button
                type="button"
                onClick={handleSaveName}
                disabled={isUpdatingGroup}
                className="rounded-md bg-[var(--color-primary)] px-3 py-1 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
              >
                {t('common.save')}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
                {conversation.group_name}
              </h2>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => { setEditedName(conversation.group_name ?? ''); setIsEditingName(true); }}
                  aria-label={t('groups.editName')}
                  className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                >
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
                    <path d="M9 1.5l2.5 2.5-7.5 7.5H1.5V9L9 1.5z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              )}
            </div>
          )}
          {conversation.group_description && (
            <p className="text-xs text-center text-[var(--color-text-secondary)]">
              {conversation.group_description}
            </p>
          )}
          <p className="text-xs text-[var(--color-text-muted)]">
            {t('groups.participantCount', { count: participants.length })}
          </p>
        </div>

        {/* Settings (admin only) */}
        {isAdmin && settings && (
          <div className="px-4 py-4 border-b border-[var(--color-border)]">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-3">
              {t('groups.settingsSection')}
            </h4>
            <div className="space-y-2 text-sm text-[var(--color-text-secondary)]">
              <p>{settings.anyone_can_invite ? '✓' : '✗'} {t('groups.settings.anyoneCanInvite')}</p>
              <p>{settings.anyone_can_pin ? '✓' : '✗'} {t('groups.settings.anyoneCanPin')}</p>
              <p>{settings.message_history_visible ? '✓' : '✗'} {t('groups.settings.historyVisible')}</p>
            </div>
          </div>
        )}

        {/* Participants */}
        <div className="py-2">
          <h4 className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
            {t('groups.members')} ({participants.length})
          </h4>
          {loadingParticipants ? (
            <p className="px-4 text-sm text-[var(--color-text-muted)]">{t('common.loading')}</p>
          ) : (
            sorted.map((p) => (
              <ParticipantRow
                key={p.user_id}
                participant={p}
                currentUserRole={currentUserRole}
                currentUserId={currentUserId}
                onRemove={removeParticipant}
                onChangeRole={changeRole}
              />
            ))
          )}
        </div>

        {/* Leave group */}
        <div className="px-4 py-4 border-t border-[var(--color-border)]">
          {leaveError && (
            <p className="mb-2 text-xs text-[var(--color-error)]">{leaveError}</p>
          )}
          {isOwner && (
            <p className="mb-2 text-xs text-[var(--color-text-muted)]">{t('groups.transferOwnershipHint')}</p>
          )}
          <button
            type="button"
            onClick={handleLeave}
            disabled={isLeavingGroup}
            className="w-full rounded-md border border-[var(--color-error)]/40 px-3 py-2 text-sm font-medium text-[var(--color-error)] hover:bg-[var(--color-error)]/5 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLeavingGroup ? t('groups.leaving') : t('groups.leaveGroup')}
          </button>
        </div>
      </div>
    </div>
  );
}
