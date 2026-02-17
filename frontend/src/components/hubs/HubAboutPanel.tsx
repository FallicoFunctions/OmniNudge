import type { Hub } from '../../services/hubsService';
import { useTranslation } from 'react-i18next';
import { useFormat } from '../../hooks/useFormat';
import { LoadingMessage, ErrorMessage } from '../common/StatusMessage';
import { EmptyState } from '../empty';
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
  const { t } = useTranslation();
  const { formatNumber, formatDate } = useFormat();
  const trimmedSidebar = sidebarMarkdown?.trim();
  const hasSidebarMarkdown = Boolean(trimmedSidebar);
  const resolvedTitle = displayTitle?.trim() || hubDetails?.title;

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
          {t('hubAboutPanel.title')}
        </h3>
        {hubDetails?.nsfw && (
          <span className="rounded bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">
            {t('posts.badges.nsfw')}
          </span>
        )}
      </div>
      {isLoading ? (
        <LoadingMessage>{t('hubAboutPanel.loading')}</LoadingMessage>
      ) : isError ? (
        <ErrorMessage>{t('hubAboutPanel.errors.unableToLoad')}</ErrorMessage>
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
              {t('hubAboutPanel.emptyDescription')}
            </p>
          )}
          {showStats && (
            <div className="mt-4 space-y-2 text-xs text-[var(--color-text-secondary)]">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[var(--color-text-primary)]">{t('hubAboutPanel.labels.members')}</span>
                <span>{typeof hubDetails.subscriber_count === 'number' ? formatNumber(hubDetails.subscriber_count) : '—'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[var(--color-text-primary)]">{t('hubAboutPanel.labels.activeOmniUsers')}</span>
                <span>{typeof activeOmniUsers === 'number' ? formatNumber(activeOmniUsers) : '—'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[var(--color-text-primary)]">{t('hubAboutPanel.labels.visibility')}</span>
                <span>
                  {hubDetails.type
                    ? hubDetails.type.charAt(0).toUpperCase() + hubDetails.type.slice(1)
                    : '—'}
                </span>
              </div>
              {hubDetails.created_at && (
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[var(--color-text-primary)]">{t('hubAboutPanel.labels.created')}</span>
                  <span>{formatDate(new Date(hubDetails.created_at), { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <EmptyState illustration="noData" title={t('hubAboutPanel.empty')} className="py-6" />
      )}
    </div>
  );
}
