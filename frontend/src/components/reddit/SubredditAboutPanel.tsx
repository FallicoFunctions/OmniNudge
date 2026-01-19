import type { RefObject } from 'react';
import { LoadingMessage, ErrorMessage, EmptyMessage } from '../common/StatusMessage';
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
  console.log('SubredditAboutPanel - about:', about, 'over_18:', about?.over_18);
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
          About this subreddit
        </h3>
        {about?.over_18 && (
          <span className="rounded bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">
            NSFW
          </span>
        )}
      </div>
      {isLoading ? (
        <LoadingMessage>Loading details…</LoadingMessage>
      ) : isError ? (
        <ErrorMessage>Unable to load subreddit details.</ErrorMessage>
      ) : about ? (
        <>
          {iconUrl && (
            <img
              src={iconUrl}
              alt=""
              className="mt-3 h-12 w-12 rounded-full object-cover"
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
            <EmptyMessage>No description provided.</EmptyMessage>
          )}
          <div className="mt-4 space-y-2 text-xs text-[var(--color-text-secondary)]">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[var(--color-text-primary)]">Members</span>
              <span>
                {typeof about.subscribers === 'number' ? about.subscribers.toLocaleString() : '—'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[var(--color-text-primary)]">Active Omni Users</span>
              <span>
                {typeof activeOmniUsers === 'number' ? activeOmniUsers.toLocaleString() : '—'}
              </span>
            </div>
            {about.created_utc && (
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[var(--color-text-primary)]">Created</span>
                <span>{new Date(about.created_utc * 1000).toLocaleDateString()}</span>
              </div>
            )}
          </div>
        </>
      ) : (
        <EmptyMessage>No details available.</EmptyMessage>
      )}
    </div>
  );
}
