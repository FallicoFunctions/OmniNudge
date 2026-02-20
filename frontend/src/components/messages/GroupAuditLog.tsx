import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { adminGroupsService } from '../../services/adminGroupsService';
import type { AuditLogEntry } from '../../services/adminGroupsService';

interface GroupAuditLogProps {
  conversationId: number;
}

const ACTION_TYPES = [
  { value: '', label: 'All actions' },
  { value: 'mute_member', label: 'Muted member' },
  { value: 'unmute_member', label: 'Unmuted member' },
  { value: 'ban_member', label: 'Banned member' },
  { value: 'unban_member', label: 'Unbanned member' },
  { value: 'delete_message', label: 'Deleted message' },
  { value: 'set_slow_mode', label: 'Updated slow mode' },
];

function exportToCsv(entries: AuditLogEntry[]) {
  const headers = ['ID', 'Time', 'Admin', 'Action', 'Target', 'Details'];
  const rows = entries.map((e) => [
    e.id,
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
  const [cursor, setCursor] = useState<number | undefined>(undefined);
  const [allEntries, setAllEntries] = useState<AuditLogEntry[]>([]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['group-audit-log', conversationId, actionTypeFilter, cursor],
    queryFn: async () => {
      const result = await adminGroupsService.getAuditLog(conversationId, {
        cursor,
        limit: 50,
        action_type: actionTypeFilter || undefined,
      });
      setAllEntries((prev) => {
        if (!cursor) return result.audit_log;
        const existingIds = new Set(prev.map((e) => e.id));
        const newEntries = result.audit_log.filter((e) => !existingIds.has(e.id));
        return [...prev, ...newEntries];
      });
      return result;
    },
  });

  const handleFilterChange = (value: string) => {
    setActionTypeFilter(value);
    setCursor(undefined);
    setAllEntries([]);
  };

  const handleLoadMore = () => {
    if (data?.next_cursor) {
      setCursor(data.next_cursor);
    }
  };

  const displayedEntries = allEntries.length > 0 ? allEntries : (data?.audit_log ?? []);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <select
          value={actionTypeFilter}
          onChange={(e) => handleFilterChange(e.target.value)}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-2 py-1.5 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary)] focus:outline-none"
        >
          {ACTION_TYPES.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {displayedEntries.length > 0 && (
          <button
            type="button"
            onClick={() => exportToCsv(displayedEntries)}
            className="flex items-center gap-1.5 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)]"
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
              <path d="M6.5 1v8M3 6l3.5 3.5L10 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M1 11h11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            {t('groups.admin.exportCsv')}
          </button>
        )}
      </div>

      {isLoading && !allEntries.length ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 rounded-md bg-[var(--color-surface-elevated)] animate-pulse" />
          ))}
        </div>
      ) : displayedEntries.length === 0 ? (
        <p className="py-6 text-center text-sm text-[var(--color-text-muted)]">
          {t('groups.admin.auditLogEmpty')}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[var(--color-border)]">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-elevated)]">
                <th className="px-3 py-2 text-left text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">Time</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">Admin</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">Action</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">Target</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">Details</th>
              </tr>
            </thead>
            <tbody>
              {displayedEntries.map((entry) => (
                <tr key={entry.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-hover)]">
                  <td className="px-3 py-2 text-xs text-[var(--color-text-muted)] whitespace-nowrap">
                    {new Date(entry.created_at).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 font-medium text-[var(--color-text-primary)]">{entry.admin_username}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-semibold ${
                      entry.action_type.includes('ban') ? 'bg-[var(--color-error)]/10 text-[var(--color-error)]' :
                      entry.action_type.includes('mute') ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                      'bg-[var(--color-surface-elevated)] text-[var(--color-text-secondary)]'
                    }`}>
                      {ACTION_TYPES.find(a => a.value === entry.action_type)?.label ?? entry.action_type}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-[var(--color-text-secondary)]">{entry.target_username ?? '—'}</td>
                  <td className="px-3 py-2 text-xs text-[var(--color-text-muted)] max-w-xs truncate">
                    {entry.details ? JSON.stringify(entry.details) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data?.next_cursor && (
        <button
          type="button"
          onClick={handleLoadMore}
          disabled={isFetching}
          className="w-full rounded-md border border-[var(--color-border)] py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)] disabled:opacity-60"
        >
          {isFetching ? 'Loading...' : 'Load more'}
        </button>
      )}
    </div>
  );
}
