import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useGroupConversation } from '../../hooks/useGroupConversation';
import { GroupAvatar } from './GroupAvatar';
import { MuteUserModal } from './MuteUserModal';
import { BanUserModal } from './BanUserModal';
import { SlowModeControl } from './SlowModeControl';
import { GroupAuditLog } from './GroupAuditLog';
import { adminGroupsService } from '../../services/adminGroupsService';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Conversation, GroupParticipant, GroupRole } from '../../types/messages';

interface GroupDetailsSidebarProps {
  conversation: Conversation;
  currentUserId: number;
  onClose: () => void;
}

type SidebarTab = 'members' | 'settings' | 'audit';

function RoleBadge({ role }: { role: GroupRole }) {
  const { t } = useTranslation();
  if (role === 'member') return null;
  return (
    <span
      className={`px-1.5 py-0.5 text-[10px] font-semibold rounded ${
        role === 'owner'
          ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
          : 'bg-blue-100 text-[var(--color-primary)] dark:bg-blue-900/30'
      }`}
    >
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
  onMute,
  onBan,
}: {
  participant: GroupParticipant;
  currentUserRole: GroupRole | null;
  currentUserId: number;
  onRemove: (userId: number) => void;
  onChangeRole: (userId: number, role: 'admin' | 'member') => void;
  onMute: (participant: GroupParticipant) => void;
  onBan: (participant: GroupParticipant) => void;
}) {
  const { t } = useTranslation();
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const isCurrentUser = participant.user_id === currentUserId;

  // Close on outside click
  useEffect(() => {
    if (!showMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMenu]);
  const canManage =
    (currentUserRole === 'owner' || currentUserRole === 'admin') &&
    !isCurrentUser &&
    participant.role !== 'owner';

  return (
    <div className="flex items-center gap-2 px-4 py-2 hover:bg-[var(--color-hover)] relative">
      <div className="h-8 w-8 rounded-lg bg-[var(--color-primary)]/20 flex items-center justify-center text-sm font-semibold text-[var(--color-primary)] shrink-0">
        {participant.username[0].toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">
            {participant.username}
            {isCurrentUser && (
              <span className="ml-1.5 text-xs text-[var(--color-text-muted)]">
                {t('common.you')}
              </span>
            )}
          </p>
        </div>
      </div>
      <RoleBadge role={participant.role} />
      {canManage && (
        <div className="relative" ref={menuRef}>
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
            <div className="absolute right-0 top-8 z-10 w-48 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl">
              {participant.role === 'member' && currentUserRole === 'owner' && (
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm hover:bg-[var(--color-hover)]"
                  onClick={() => {
                    onChangeRole(participant.user_id, 'admin');
                    setShowMenu(false);
                  }}
                >
                  {t('groups.makeAdmin')}
                </button>
              )}
              {participant.role === 'admin' && currentUserRole === 'owner' && (
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm hover:bg-[var(--color-hover)]"
                  onClick={() => {
                    onChangeRole(participant.user_id, 'member');
                    setShowMenu(false);
                  }}
                >
                  {t('groups.removeAdmin')}
                </button>
              )}
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm text-amber-600 hover:bg-[var(--color-hover)]"
                onClick={() => {
                  onMute(participant);
                  setShowMenu(false);
                }}
              >
                {t('groups.admin.mute')}
              </button>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm text-[var(--color-error)] hover:bg-[var(--color-hover)]"
                onClick={() => {
                  onBan(participant);
                  setShowMenu(false);
                }}
              >
                {t('groups.admin.ban')}
              </button>
              <div className="my-0.5 border-t border-[var(--color-border)]" />
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm text-[var(--color-error)] hover:bg-[var(--color-hover)]"
                onClick={() => {
                  onRemove(participant.user_id);
                  setShowMenu(false);
                }}
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

export function GroupDetailsSidebar({
  conversation,
  currentUserId,
  onClose,
}: GroupDetailsSidebarProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<SidebarTab>('members');
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(conversation.group_name ?? '');
  const [leaveError, setLeaveError] = useState('');
  const [settingsError, setSettingsError] = useState('');
  const [muteTarget, setMuteTarget] = useState<GroupParticipant | null>(null);
  const [banTarget, setBanTarget] = useState<GroupParticipant | null>(null);

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
    updateSettings,
    leaveGroup,
    isLeavingGroup,
    isUpdatingGroup,
    isUpdatingSettings,
  } = useGroupConversation({ conversationId: conversation.id, currentUserId });

  const muteMutation = useMutation({
    mutationFn: ({
      userId,
      durationMinutes,
      reason,
    }: {
      userId: number;
      durationMinutes: number;
      reason: string;
    }) =>
      adminGroupsService.muteUser(conversation.id, userId, {
        duration_minutes: durationMinutes,
        reason,
      }),
    onSuccess: () => {
      setMuteTarget(null);
      queryClient.invalidateQueries({ queryKey: ['group-restrictions', conversation.id] });
    },
  });

  const banMutation = useMutation({
    mutationFn: ({
      userId,
      reason,
      deleteMessages,
    }: {
      userId: number;
      reason: string;
      deleteMessages: boolean;
    }) =>
      adminGroupsService.banUser(conversation.id, userId, {
        reason,
        delete_messages: deleteMessages,
      }),
    onSuccess: () => {
      setBanTarget(null);
      queryClient.invalidateQueries({ queryKey: ['group-restrictions', conversation.id] });
      queryClient.invalidateQueries({ queryKey: ['group-participants', conversation.id] });
    },
  });

  const slowModeMutation = useMutation({
    mutationFn: (seconds: number) => adminGroupsService.setSlowMode(conversation.id, seconds),
  });

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

  const tabs: { id: SidebarTab; label: string; adminOnly?: boolean }[] = [
    { id: 'members', label: t('groups.members') },
    { id: 'settings', label: t('groups.settingsSection'), adminOnly: true },
    { id: 'audit', label: t('groups.admin.auditLog'), adminOnly: true },
  ];

  const visibleTabs = tabs.filter((tab) => !tab.adminOnly || isAdmin);

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
            <path
              d="M1 1l12 12M13 1L1 13"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
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
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveName();
                  if (e.key === 'Escape') setIsEditingName(false);
                }}
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
                  onClick={() => {
                    setEditedName(conversation.group_name ?? '');
                    setIsEditingName(true);
                  }}
                  aria-label={t('groups.editName')}
                  className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                >
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
                    <path
                      d="M9 1.5l2.5 2.5-7.5 7.5H1.5V9L9 1.5z"
                      stroke="currentColor"
                      strokeWidth="1.3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
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
          {!loadingParticipants && (
            <p className="text-xs text-[var(--color-text-muted)]">
              {t('groups.participantCount', { count: participants.length })}
            </p>
          )}
        </div>

        {/* Tab navigation */}
        {visibleTabs.length > 1 && (
          <div className="flex border-b border-[var(--color-border)]">
            {visibleTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 px-3 py-2.5 text-xs font-semibold transition-colors ${
                  activeTab === tab.id
                    ? 'border-b-2 border-[var(--color-primary)] text-[var(--color-primary)]'
                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {/* Members tab */}
        {activeTab === 'members' && (
          <div className="py-2">
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
                  onMute={setMuteTarget}
                  onBan={setBanTarget}
                />
              ))
            )}
          </div>
        )}

        {/* Settings tab (admin only) */}
        {activeTab === 'settings' && isAdmin && (
          <div className="px-4 py-4 space-y-4">
            {settings && (
              <div className="space-y-3">
                {(
                  [
                    { key: 'anyone_can_invite', labelKey: 'groups.settings.anyoneCanInvite' },
                    { key: 'anyone_can_pin', labelKey: 'groups.settings.anyoneCanPin' },
                    { key: 'message_history_visible', labelKey: 'groups.settings.historyVisible' },
                  ] as const
                ).map(({ key, labelKey }) => (
                  <label
                    key={key}
                    className="flex cursor-pointer items-center justify-between gap-3"
                  >
                    <span className="text-sm text-[var(--color-text-primary)]">{t(labelKey)}</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={settings[key]}
                      onClick={() => {
                        setSettingsError('');
                        updateSettings({ [key]: !settings[key] }).catch(() =>
                          setSettingsError(t('groups.settings.updateError'))
                        );
                      }}
                      disabled={isUpdatingSettings}
                      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60 ${
                        settings[key] ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                          settings[key] ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </label>
                ))}
              </div>
            )}
            {settingsError && (
              <p className="text-xs text-[var(--color-error)]" role="alert">
                {settingsError}
              </p>
            )}
            <div className="pt-2 border-t border-[var(--color-border)]">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-3">
                {t('groups.admin.slowMode')}
              </h4>
              <SlowModeControl
                currentSeconds={settings?.slow_mode_seconds ?? 0}
                onSetSlowMode={(seconds) => slowModeMutation.mutate(seconds)}
                isLoading={slowModeMutation.isPending}
              />
            </div>
          </div>
        )}

        {/* Audit Log tab (admin only) */}
        {activeTab === 'audit' && isAdmin && (
          <div className="px-4 py-4">
            <GroupAuditLog conversationId={conversation.id} />
          </div>
        )}

        {/* Leave group (always visible at bottom) */}
        <div className="px-4 py-4 border-t border-[var(--color-border)]">
          {leaveError && <p className="mb-2 text-xs text-[var(--color-error)]">{leaveError}</p>}
          {isOwner && (
            <p className="mb-2 text-xs text-[var(--color-text-muted)]">
              {t('groups.transferOwnershipHint')}
            </p>
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

      {/* Mute modal */}
      {muteTarget && (
        <MuteUserModal
          username={muteTarget.username}
          onConfirm={(durationMinutes, reason) =>
            muteMutation.mutate({ userId: muteTarget.user_id, durationMinutes, reason })
          }
          onCancel={() => setMuteTarget(null)}
          isLoading={muteMutation.isPending}
        />
      )}

      {/* Ban modal */}
      {banTarget && (
        <BanUserModal
          username={banTarget.username}
          onConfirm={(reason, deleteMessages) =>
            banMutation.mutate({ userId: banTarget.user_id, reason, deleteMessages })
          }
          onCancel={() => setBanTarget(null)}
          isLoading={banMutation.isPending}
        />
      )}
    </div>
  );
}
