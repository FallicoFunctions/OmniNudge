import type { RefObject } from 'react';
import SubredditAboutPanel from '../reddit/SubredditAboutPanel';
import { SubredditModeratorsPanel } from './SubredditModeratorsPanel';
import type { RedditSubredditAbout } from '../../types/reddit';

type SubredditSidebarProps = {
  showOmniOnly: boolean;
  onToggleShowOmniOnly: () => void;
  about?: RedditSubredditAbout | null;
  iconUrl?: string | null;
  isLoading: boolean;
  isError: boolean;
  sidebarHtml?: string | null;
  sidebarRef: RefObject<HTMLDivElement | null>;
  activeOmniUsers?: number | null;
};

export function SubredditSidebar({
  showOmniOnly,
  onToggleShowOmniOnly,
  about,
  iconUrl,
  isLoading,
  isError,
  sidebarHtml,
  sidebarRef,
  activeOmniUsers,
}: SubredditSidebarProps) {
  return (
    <aside className="space-y-4">
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
            Show only Omni posts
          </span>
          <button
            type="button"
            onClick={onToggleShowOmniOnly}
            className={`rounded-md px-3 py-2 text-sm font-medium ${
              showOmniOnly
                ? 'bg-[var(--color-primary)] text-white'
                : 'bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)] hover:bg-[var(--color-border)]'
            }`}
          >
            {showOmniOnly ? 'On' : 'Off'}
          </button>
        </div>
      </div>

      <SubredditAboutPanel
        about={about}
        iconUrl={iconUrl}
        isLoading={isLoading}
        isError={isError}
        sidebarHtml={sidebarHtml}
        sidebarRef={sidebarRef}
        activeOmniUsers={activeOmniUsers}
      />

      <SubredditModeratorsPanel />
    </aside>
  );
}
