import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { useFormat } from '../../hooks/useFormat';
import { LoadingMessage, ErrorMessage } from '../common/StatusMessage';
import { EmptyState } from '../empty';
import type { RedditSubredditAbout } from '../../types/reddit';

type SubredditAboutPanelProps = {
  about?: RedditSubredditAbout | null;
  iconUrl?: string | null;
  isLoading: boolean;
  isError: boolean;
  sidebarHtml?: string | null;
  sidebarRef?: RefObject<HTMLDivElement | null>;
  activeOmniUsers?: number | null;
};

export default function SubredditAboutPanel({
  about,
  iconUrl,
  isLoading,
  isError,
  sidebarHtml,
  sidebarRef,
  activeOmniUsers,
}: SubredditAboutPanelProps) {
  const { t } = useTranslation();
  const { formatNumber, formatDate } = useFormat();

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
          {t('subredditAboutPanel.title')}
        </h3>
        {about?.over18 && (
          <span className="rounded bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">
            {t('posts.badges.nsfw')}
          </span>
        )}
      </div>
      {isLoading ? (
        <LoadingMessage>{t('subredditAboutPanel.loading')}</LoadingMessage>
      ) : isError ? (
        <ErrorMessage>{t('subredditAboutPanel.errors.unableToLoad')}</ErrorMessage>
      ) : about ? (
        <>
          {iconUrl && (
            <img
              src={iconUrl}
              alt=""
              className="mt-3 h-12 w-12 rounded-lg object-cover"
              loading="lazy"
            />
          )}
          {sidebarHtml ? (
            <div
              ref={sidebarRef}
              className="reddit-sidebar-content mt-3"
              dangerouslySetInnerHTML={{ __html: sidebarHtml }}
            />
          ) : about.public_description ? (
            <p className="mt-3 text-sm text-[var(--color-text-primary)]">
              {about.public_description}
            </p>
          ) : (
            <EmptyState
              illustration="noData"
              title={t('subredditAboutPanel.emptyDescription')}
              className="py-6"
            />
          )}
          <div className="mt-4 space-y-2 text-xs text-[var(--color-text-secondary)]">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[var(--color-text-primary)]">
                {t('subredditAboutPanel.labels.members')}
              </span>
              <span>
                {typeof about.subscribers === 'number' ? formatNumber(about.subscribers) : '—'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[var(--color-text-primary)]">
                {t('subredditAboutPanel.labels.activeOmniUsers')}
              </span>
              <span>
                {typeof activeOmniUsers === 'number' ? formatNumber(activeOmniUsers) : '—'}
              </span>
            </div>
            {about.created_utc && (
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[var(--color-text-primary)]">
                  {t('subredditAboutPanel.labels.created')}
                </span>
                <span>{formatDate(new Date(about.created_utc * 1000), { month: 'short', day: 'numeric', year: 'numeric' })}</span>
              </div>
            )}
          </div>
        </>
      ) : (
        <EmptyState illustration="noData" title={t('subredditAboutPanel.empty')} className="py-6" />
      )}
    </div>
  );
}
