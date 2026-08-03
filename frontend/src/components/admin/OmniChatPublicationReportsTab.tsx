import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminService } from '../../services/adminService';

const REPORTS_KEY = ['adminOmniChatPublicationReports', 'open'];

export default function OmniChatPublicationReportsTab() {
  const queryClient = useQueryClient();
  const reportsQuery = useQuery({
    queryKey: REPORTS_KEY,
    queryFn: () => adminService.listOmniChatPublicationReports('open'),
  });
  const resolveMutation = useMutation({
    mutationFn: ({ id, resolution }: { id: string; resolution: 'removed' | 'dismissed' }) =>
      adminService.resolveOmniChatPublicationReport(id, resolution),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: REPORTS_KEY }),
  });

  return (
    <section aria-labelledby="publication-reports-heading" className="space-y-4">
      <div>
        <h2 id="publication-reports-heading" className="text-2xl font-bold">
          Explore reports
        </h2>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          Review reported OmniChat publications and remove content or dismiss the report.
        </p>
      </div>
      {reportsQuery.isLoading && <p>Loading publication reports…</p>}
      {reportsQuery.isError && (
        <p role="alert" className="rounded border border-red-300 bg-red-50 p-4 text-red-800">
          Publication reports could not be loaded.
        </p>
      )}
      {resolveMutation.isError && (
        <p role="alert" className="rounded border border-red-300 bg-red-50 p-4 text-red-800">
          The moderation action could not be completed.
        </p>
      )}
      {!reportsQuery.isLoading && (reportsQuery.data?.length ?? 0) === 0 && (
        <p className="rounded border border-[var(--color-border)] p-5 text-[var(--color-text-secondary)]">
          No open Explore reports.
        </p>
      )}
      <div className="space-y-3">
        {reportsQuery.data?.map((report) => (
          <article
            key={report.id}
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold">
                  {report.reason} · {report.content_kind}
                </p>
                <p className="text-sm text-[var(--color-text-secondary)]">
                  Reported by @{report.reporter_username} · author @{report.author_username}
                </p>
              </div>
              <time className="text-xs text-[var(--color-text-secondary)]">
                {new Date(report.created_at).toLocaleString()}
              </time>
            </div>
            {report.caption && <p className="mt-3 text-sm">{report.caption}</p>}
            {report.details && (
              <p className="mt-2 rounded bg-[var(--color-surface)] p-3 text-sm">{report.details}</p>
            )}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                disabled={resolveMutation.isPending}
                onClick={() => resolveMutation.mutate({ id: report.id, resolution: 'removed' })}
                className="rounded bg-red-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                Remove publication
              </button>
              <button
                type="button"
                disabled={resolveMutation.isPending}
                onClick={() => resolveMutation.mutate({ id: report.id, resolution: 'dismissed' })}
                className="rounded border border-[var(--color-border)] px-3 py-2 text-sm disabled:opacity-50"
              >
                Dismiss report
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
