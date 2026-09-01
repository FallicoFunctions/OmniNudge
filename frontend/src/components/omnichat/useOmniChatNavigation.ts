import { useCallback } from 'react';
import { useNavigate } from 'react-router';
import type { SidebarTab } from './OmniChatSidebar';

/**
 * Where each side-toolbar tab goes.
 *
 * This mapping was copied into six pages, byte for byte, and one of them had
 * already pulled it into a local hook without the others following. Adding a
 * tab meant editing all six and the compiler could not tell you if you missed
 * one -- the tab would simply do nothing on that page.
 *
 * The Discover page keeps its own handler because two of its tabs do something
 * other than navigate: search opens an overlay in place, and characters checks
 * whether somebody is signed in first. It calls this for everything else.
 */
export const OMNICHAT_TAB_ROUTES: Record<SidebarTab, string> = {
  discover: '/omnichat',
  chat: '/omnichat/chat',
  groups: '/omnichat/groups',
  create: '/omnichat/create',
  explore: '/omnichat/explore',
  characters: '/omnichat/studio',
  search: '/omnichat?search=open',
  newOmniAI: '/omnichat/new-omniai',
};

export function useOmniChatNavigation() {
  const navigate = useNavigate();
  return useCallback(
    (tab: SidebarTab) => {
      const route = OMNICHAT_TAB_ROUTES[tab];
      if (route) navigate(route);
    },
    [navigate]
  );
}
