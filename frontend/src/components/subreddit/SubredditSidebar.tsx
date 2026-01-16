import type { RefObject } from 'react';
import SubredditAboutPanel from '../reddit/SubredditAboutPanel';
import { SubredditModeratorsPanel } from './SubredditModeratorsPanel';
import type { RedditSubredditAbout } from '../../types/reddit';

type SubredditSidebarProps = {
  about?: RedditSubredditAbout | null;
  iconUrl?: string | null;
  isLoading: boolean;
  isError: boolean;
  sidebarHtml?: string | null;
  sidebarRef: RefObject<HTMLDivElement | null>;
  activeOmniUsers?: number | null;
};

export function SubredditSidebar({
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
