import { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { adminGroupsService } from '../../services/adminGroupsService';
import type { AuditLogEntry } from '../../services/adminGroupsService';

interface GroupAuditLogProps {
  conversationId: number;
}

const ACTION_TYPE_KEYS: { value: string; labelKey: string }[] = [
  { value: '', labelKey: 'groups.admin.allActions' },
  { value: 'mute_member', labelKey: 'groups.admin.actionTypes.mute_member' },
  { value: 'unmute_member', labelKey: 'groups.admin.actionTypes.unmute_member' },
  { value: 'ban_member', labelKey: 'groups.admin.actionTypes.ban_member' },
  { value: 'unban_member', labelKey: 'groups.admin.actionTypes.unban_member' },
  { value: 'delete_message', labelKey: 'groups.admin.actionTypes.delete_message' },
  { value: 'set_slow_mode', labelKey: 'groups.admin.actionTypes.set_slow_mode' },
];

function getActionLabel(actionType: string, t: (key: string) => string): string {
  const match = ACTION_TYPE_KEYS.find((a) => a.value === actionType);
  return match ? t(match.labelKey) : actionType;
}

type Translate = (key: string, options?: Record<string, unknown>) => string;

function durationText(minutes: number, t: Translate): string {
  if (minutes <= 0) return t('groups.admin.durationPermanent');
  if (minutes % 1440 === 0) return t('groups.admin.detailDays', { count: minutes / 1440 });
  if (minutes % 60 === 0) return t('groups.admin.detailHours', { count: minutes / 60 });
  return t('groups.admin.detailMinutes', { count: minutes });
}

/** The details an admin action saved, as a sentence rather than JSON. */
export function describeDetails(
  details: Record<string, unknown> | null | undefined,
  t: Translate
): string {
  if (!details) return '—';
  const parts: string[] = [];
  for (const [key, value] of Object.entries(details)) {
    if (key === 'reason') {
      if (typeof value === 'string' && value.trim()) {
        parts.push(t('groups.admin.detailReason', { reason: value.trim() }));
      }
    } else if (key === 'duration_minutes' && typeof value === 'number') {
      parts.push(t('groups.admin.detailDuration', { duration: durationText(value, t) }));
    } else if (key === 'delete_messages') {
      if (value === true) parts.push(t('groups.admin.detailMessagesDeleted'));
    } else if (key === 'message_id') {
      parts.push(t('groups.admin.detailMessageId', { id: value }));
    } else if (key === 'via' && (value === 'invite' || value === 'add')) {
      parts.push(
        t(value === 'invite' ? 'groups.admin.detailViaInvite' : 'groups.admin.detailViaAdd')
      );
    } else if (key === 'seconds' && typeof value === 'number') {
      parts.push(
        value > 0
          ? t('groups.admin.detailSlowMode', { seconds: value })
          : t('groups.admin.slowModeOff')
      );
    } else {
      parts.push(`${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`);
    }
  }
  return parts.length > 0 ? parts.join(' · ') : '—';
}

function actionBadgeClass(actionType: string): string {
  if (actionType.includes('ban')) return 'bg-[var(--color-error)]/10 text-[var(--color-error)]';
  if (actionType.includes('mute'))
    return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
  return 'bg-[var(--color-surface-elevated)] text-[var(--color-text-secondary)]';
}

function exportToCsv(entries: AuditLogEntry[], t: (key: string) => string) {
  const headers = [
    t('groups.admin.colTime'),
    t('groups.admin.colAdmin'),
    t('groups.admin.colAction'),
    t('groups.admin.colTarget'),
    t('groups.admin.colDetails'),
  ];
  const rows = entries.map((e) => [
    e.created_at,
    e.admin_username,
    e.action_type,
    e.target_username ?? '',
    JSON.stringify(e.details ?? {}),
  ]);
  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `audit-log-group-${entries[0]?.conversation_id ?? 'unknown'}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function GroupAuditLog({ conversationId }: GroupAuditLogProps) {
  const { t } = useTranslation();
  const [actionTypeFilter, setActionTypeFilter] = useState('');
  const [showRaw, setShowRaw] = useState(false);

  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } = useInfiniteQuery({
    queryKey: ['group-audit-log', conversationId, actionTypeFilter],
    queryFn: ({ pageParam }) =>
      adminGroupsService.getAuditLog(conversationId, {
        cursor: pageParam as number | undefined,
        limit: 50,
        action_type: actionTypeFilter || undefined,
      }),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
  });

  const allEntries = data?.pages.flatMap((p) => p.audit_log) ?? [];

  const handleFilterChange = (value: string) => {
    setActionTypeFilter(value);
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <select
          value={actionTypeFilter}
          onChange={(e) => handleFilterChange(e.target.value)}
          aria-label={t('groups.admin.filterByAction', { defaultValue: 'Filter by action' })}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-2 py-1.5 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none"
        >
          {ACTION_TYPE_KEYS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {t(opt.labelKey)}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
          <input type="checkbox" checked={showRaw} onChange={(e) => setShowRaw(e.target.checked)} />
          {t('groups.admin.showRawDetails')}
        </label>
        {allEntries.length > 0 && (
          <button
            type="button"
            onClick={() => exportToCsv(allEntries, t)}
            className="flex items-center gap-1.5 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)]"
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
              <path
                d="M6.5 1v8M3 6l3.5 3.5L10 6"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path d="M1 11h11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            {t('groups.admin.exportCsv')}
          </button>
        )}
      </div>

      {/* Loading skeleton */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-10 rounded-md bg-[var(--color-surface-elevated)] animate-pulse"
            />
          ))}
        </div>
      ) : allEntries.length === 0 ? (
        <p className="py-6 text-center text-sm text-[var(--color-text-muted)]">
          {t('groups.admin.auditLogEmpty')}
        </p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-[var(--color-border)]">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-elevated)]">
                  {[
                    t('groups.admin.colTime'),
                    t('groups.admin.colAdmin'),
                    t('groups.admin.colAction'),
                    t('groups.admin.colTarget'),
                    t('groups.admin.colDetails'),
                  ].map((col) => (
                    <th
                      key={col}
                      className="px-3 py-2 text-left text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wide"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allEntries.map((entry) => (
                  <tr
                    key={entry.id}
                    className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-hover)]"
                  >
                    <td className="px-3 py-2 text-xs text-[var(--color-text-muted)] whitespace-nowrap">
                      {new Date(entry.created_at).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 font-medium text-[var(--color-text-primary)]">
                      {entry.admin_username}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-block rounded px-1.5 py-0.5 text-xs font-semibold ${actionBadgeClass(entry.action_type)}`}
                      >
                        {getActionLabel(entry.action_type, t)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[var(--color-text-secondary)]">
                      {entry.target_username ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-xs text-[var(--color-text-muted)] max-w-xs">
                      {showRaw
                        ? entry.details
                          ? JSON.stringify(entry.details)
                          : '—'
                        : describeDetails(entry.details, t)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {hasNextPage && (
            <button
              type="button"
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              className="w-full rounded-md border border-[var(--color-border)] py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)] disabled:opacity-60"
            >
              {isFetchingNextPage
                ? t('common.loading')
                : t('groups.admin.loadMore', { defaultValue: 'Load more' })}
            </button>
          )}
        </>
      )}
    </div>
  );
}
