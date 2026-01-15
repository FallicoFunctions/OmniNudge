import type { Hub } from '../../services/hubsService';
import { LoadingMessage, ErrorMessage, EmptyMessage } from '../common/StatusMessage';
import { PostBodyMarkdown } from '../posts/PostBodyMarkdown';

type HubAboutPanelProps = {
  hubDetails?: Hub | null;
  displayTitle?: string | null;
  sidebarMarkdown?: string | null;
  isLoading: boolean;
  isError: boolean;
  showStats?: boolean;
  activeOmniUsers?: number | null;
};

export default function HubAboutPanel({
  hubDetails,
  displayTitle,
  sidebarMarkdown,
  isLoading,
  isError,
  showStats = false,
  activeOmniUsers,
}: HubAboutPanelProps) {
  const trimmedSidebar = sidebarMarkdown?.trim();
  const hasSidebarMarkdown = Boolean(trimmedSidebar);
  const resolvedTitle = displayTitle?.trim() || hubDetails?.title;

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
        About this hub
      </h3>
      {isLoading ? (
        <LoadingMessage>Loading details…</LoadingMessage>
      ) : isError ? (
        <ErrorMessage>Unable to load hub details.</ErrorMessage>
      ) : hubDetails ? (
        <>
          {resolvedTitle && (
            <p className="mt-2 text-base font-semibold text-[var(--color-text-primary)]">
              {resolvedTitle}
            </p>
          )}
          {hasSidebarMarkdown ? (
            <PostBodyMarkdown
              content={trimmedSidebar ?? ''}
              className="mt-2 text-sm text-[var(--color-text-primary)] leading-relaxed"
            />
          ) : hubDetails.description ? (
            <p className="mt-2 text-sm text-[var(--color-text-primary)] whitespace-pre-line">
              {hubDetails.description}
            </p>
          ) : (
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              No description has been added yet.
            </p>
          )}
          {showStats && (
            <div className="mt-4 space-y-2 text-xs text-[var(--color-text-secondary)]">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[var(--color-text-primary)]">Members</span>
                <span>{hubDetails.subscriber_count?.toLocaleString() ?? '—'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[var(--color-text-primary)]">Active Omni Users</span>
                <span>{typeof activeOmniUsers === 'number' ? activeOmniUsers.toLocaleString() : '—'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[var(--color-text-primary)]">Visibility</span>
                <span>
                  {hubDetails.type
                    ? hubDetails.type.charAt(0).toUpperCase() + hubDetails.type.slice(1)
                    : '—'}
                </span>
              </div>
              {hubDetails.created_at && (
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[var(--color-text-primary)]">Created</span>
                  <span>{new Date(hubDetails.created_at).toLocaleDateString()}</span>
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <EmptyMessage>Hub details unavailable.</EmptyMessage>
      )}
    </div>
  );
}
