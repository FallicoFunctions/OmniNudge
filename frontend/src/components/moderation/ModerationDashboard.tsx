import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { moderationService } from '../../services/moderationService';
import { useFormat } from '../../hooks/useFormat';
import type { ModerationReport, ReportStatus } from '../../types/moderation';
import { LoadingMessage } from '../common/StatusMessage';
import { EmptyState } from '../empty';
import { OffsetPaginationControls } from '../common/OffsetPaginationControls';

interface ModerationDashboardProps {
  titleKey?: string;
}

export function ModerationDashboard({ titleKey = 'modToolsPage.reports.title' }: ModerationDashboardProps) {
  const { t } = useTranslation();
  const { formatDate } = useFormat();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<ReportStatus>('open');
  const [sortFilter, setSortFilter] = useState<'priority' | 'recent'>('priority');
  const [offset, setOffset] = useState(0);
  const limit = 25;

  useEffect(() => {
    setOffset(0);
  }, [statusFilter, sortFilter]);

  const { data, isLoading } = useQuery({
    queryKey: ['modReports', statusFilter, sortFilter, limit, offset],
    queryFn: () => moderationService.getReports(statusFilter, sortFilter, limit, offset),
    refetchInterval: 30000,
  });

  const updateReportStatusMutation = useMutation({
    mutationFn: ({ reportId, status }: { reportId: number; status: ReportStatus }) =>
      moderationService.updateReportStatus(reportId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['modReports'] });
    },
  });

  if (isLoading) {
    return (
      <div className="text-center py-8">
        <LoadingMessage>{t('common.loading')}</LoadingMessage>
      </div>
    );
  }

  const reports = data?.reports ?? [];
  const hasMore = reports.length >= limit;
  const canGoPrev = offset > 0;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">{t(titleKey)}</h2>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as ReportStatus)}
            className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
          >
            <option value="open">{t('modToolsPage.reports.status.open')}</option>
            <option value="approved">{t('modToolsPage.reports.status.approved')}</option>
            <option value="rejected">{t('modToolsPage.reports.status.rejected')}</option>
            <option value="no_action">{t('modToolsPage.reports.status.no_action')}</option>
            <option value="reviewed">{t('modToolsPage.reports.status.reviewed')}</option>
            <option value="dismissed">{t('modToolsPage.reports.status.dismissed')}</option>
          </select>
          <select
            value={sortFilter}
            onChange={(e) => setSortFilter(e.target.value as 'priority' | 'recent')}
            className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
          >
            <option value="priority">{t('modToolsPage.reports.sort.priority')}</option>
            <option value="recent">{t('modToolsPage.reports.sort.recent')}</option>
          </select>
        </div>
      </div>

      {reports.length === 0 && (
        <div className="text-center py-12">
          <EmptyState illustration="noData" title={t('modToolsPage.reports.empty')} />
        </div>
      )}

      <div className="space-y-3">
        {reports.map((report: ModerationReport) => (
          <div
            key={report.id}
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold">#{report.id}</span>
                  <span className="rounded bg-[var(--color-surface)] px-2 py-0.5 text-xs font-medium text-[var(--color-text-secondary)]">
                    {t(`modToolsPage.reports.targetType.${report.target_type}`, {
                      defaultValue: report.target_type,
                    })}
                  </span>
                  <span className="rounded bg-[var(--color-surface)] px-2 py-0.5 text-xs font-medium text-[var(--color-text-secondary)]">
                    {t(`modToolsPage.reports.reason.${report.reason || 'other'}`, {
                      defaultValue: report.reason || t('modToolsPage.reports.reason.other'),
                    })}
                  </span>
                  <span className="rounded bg-[var(--color-primary)] px-2 py-0.5 text-xs font-semibold text-white">
                    {t(`modToolsPage.reports.status.${report.status}`, { defaultValue: report.status })}
                  </span>
                </div>
                <div className="text-sm text-[var(--color-text-secondary)]">
                  {t('modToolsPage.reports.meta', {
                    reporterId: report.reporter_id,
                    targetId: report.target_id,
                    createdAt: formatDate(report.created_at, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    }),
                  })}
                </div>
                {report.description && (
                  <div className="max-w-3xl text-sm text-[var(--color-text-primary)]">
                    {report.description}
                  </div>
                )}
              </div>

              {report.status === 'open' && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      updateReportStatusMutation.mutate({ reportId: report.id, status: 'approved' })
                    }
                    disabled={updateReportStatusMutation.isPending}
                    className="rounded bg-green-600 px-3 py-1 text-sm text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    {t('modToolsPage.reports.actions.approve')}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      updateReportStatusMutation.mutate({ reportId: report.id, status: 'rejected' })
                    }
                    disabled={updateReportStatusMutation.isPending}
                    className="rounded bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {t('modToolsPage.reports.actions.reject')}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      updateReportStatusMutation.mutate({ reportId: report.id, status: 'no_action' })
                    }
                    disabled={updateReportStatusMutation.isPending}
                    className="rounded bg-[var(--color-surface)] px-3 py-1 text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-border)] disabled:opacity-50"
                  >
                    {t('modToolsPage.reports.actions.noAction')}
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {reports.length > 0 && (
        <OffsetPaginationControls
          showDivider={false}
          className="mt-6 justify-center gap-4"
          hasPrev={canGoPrev}
          hasMore={hasMore}
          onPrev={() => setOffset((prev) => Math.max(0, prev - limit))}
          onNext={() => setOffset((prev) => prev + limit)}
          centerContent={
            <span className="px-4 py-2">{t('searchPage.pagination.page', { page: offset / limit + 1 })}</span>
          }
        />
      )}
    </div>
  );
}
