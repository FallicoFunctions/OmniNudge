import { useEffect, useLayoutEffect, useRef, useMemo, useState, useCallback } from 'react';
import * as ReactDOM from 'react-dom/client';
import { createElement } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  HubJoinSlot, HubCreateSlot, HubModSlot,
  HubFeedControls, StandalonePostFeed,
  type SortOption,
} from './HubDesignSlots';
import { hubsService } from '../../services/hubsService';
import { subscriptionService } from '../../services/subscriptionService';
import type { User } from '../../types/auth';
import type { PlatformPost } from '../../types/posts';

interface HubAIDesignRendererProps {
  hubName: string;
  htmlContent: string;
  user: User | null;
  isModerator: boolean;
}

const EMPTY_POSTS: PlatformPost[] = [];
const SLOT_IDS = ['hub-join', 'hub-create', 'hub-mod', 'hub-feed'] as const;

export default function HubAIDesignRenderer({
  hubName,
  htmlContent,
  user,
  isModerator,
}: HubAIDesignRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const styleElRef = useRef<HTMLStyleElement | null>(null);
  const rootsRef = useRef<Partial<Record<string, ReactDOM.Root>>>({});

  const [sort, setSort] = useState<SortOption>('hot');
  const [search, setSearch] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const handleSearch = useCallback(() => setActiveSearch(search), [search]);

  // ── HTML / style extraction ────────────────────────────────────────────────
  const { cleanHtml, styleContent } = useMemo(() => {
    const doc = new DOMParser().parseFromString(htmlContent, 'text/html');
    const styles = Array.from(doc.querySelectorAll('style'))
      .map(s => s.textContent ?? '').join('\n');
    return { cleanHtml: doc.body.innerHTML, styleContent: styles };
  }, [htmlContent]);

  useEffect(() => {
    if (!styleContent) return;
    const el = document.createElement('style');
    el.setAttribute('data-hub-ai-design', hubName);
    el.textContent = styleContent;
    document.head.appendChild(el);
    styleElRef.current = el;
    return () => { el.remove(); styleElRef.current = null; };
  }, [styleContent, hubName]);

  // ── Data queries ──────────────────────────────────────────────────────────
  const { data: subscriptionData } = useQuery({
    queryKey: ['hub-subscription', hubName],
    queryFn: () => subscriptionService.checkHubSubscription(hubName),
    enabled: !!user,
  });
  const isSubscribed = subscriptionData?.is_subscribed ?? false;

  const { data: postsData, isLoading: postsLoading } = useQuery({
    queryKey: ['hub-ai-posts', hubName, sort],
    queryFn: () => hubsService.getHubPosts(hubName, sort, 25),
  });
  const allPosts: PlatformPost[] = postsData?.posts ?? EMPTY_POSTS;
  const filteredPosts = useMemo(() => {
    if (!activeSearch) return allPosts;
    const q = activeSearch.toLowerCase();
    return allPosts.filter(p => p.title?.toLowerCase().includes(q));
  }, [allPosts, activeSearch]);

  // ── Live refs — always hold latest values without triggering re-renders ────
  // Effect 1 (useLayoutEffect) reads this synchronously so it always has current data.
  const liveRef = useRef({ isSubscribed, user, isModerator, sort, search,
                            handleSearch, postsLoading, filteredPosts });
  useEffect(() => {
    liveRef.current = { isSubscribed, user, isModerator, sort, search,
                        handleSearch, postsLoading, filteredPosts };
  });

  // ── Shared render function — called by both effects ───────────────────────
  const renderIntoRoots = useCallback((
    iv: typeof liveRef.current,
    roots: typeof rootsRef.current,
  ) => {
    roots['hub-join']?.render(
      createElement(HubJoinSlot, { hubName, isSubscribed: iv.isSubscribed, userId: iv.user?.id ?? null })
    );
    roots['hub-create']?.render(
      createElement(HubCreateSlot, { hubName, userId: iv.user?.id ?? null })
    );
    roots['hub-mod']?.render(
      createElement(HubModSlot, { hubName, isModerator: iv.isModerator })
    );
    roots['hub-feed']?.render(
      createElement('div', null,
        createElement(HubFeedControls, {
          sort: iv.sort, onSortChange: setSort,
          searchValue: iv.search, onSearchChange: setSearch, onSearch: iv.handleSearch,
        }),
        createElement(StandalonePostFeed, {
          posts: iv.filteredPosts, loading: iv.postsLoading, hubName,
        })
      )
    );
  }, [hubName]); // hubName only — rest comes through liveRef / args

  // ── EFFECT 1: Create roots once per design ────────────────────────────────
  // useLayoutEffect runs synchronously after DOM mutation, before paint.
  // This guarantees the slot divs from dangerouslySetInnerHTML exist when
  // we query them — no setTimeout race condition.
  useLayoutEffect(() => {
    const c = containerRef.current;
    if (!c) return;

    // Teardown any previous roots (design changed).
    Object.values(rootsRef.current).forEach(r => { try { r?.unmount(); } catch { /**/ } });
    rootsRef.current = {};

    // Create one root per slot.
    SLOT_IDS.forEach(slotId => {
      const slot = c.querySelector(`#${slotId}`);
      if (!slot) return;
      slot.innerHTML = '';
      const wrapper = document.createElement('div');
      wrapper.style.cssText = 'display:contents';
      slot.appendChild(wrapper);
      rootsRef.current[slotId] = ReactDOM.createRoot(wrapper);
    });

    // Render immediately with the CURRENT live values (via ref, not stale closure).
    renderIntoRoots(liveRef.current, rootsRef.current);

    return () => {
      Object.values(rootsRef.current).forEach(r => { try { r?.unmount(); } catch { /**/ } });
      rootsRef.current = {};
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleanHtml, hubName]); // intentionally minimal — liveRef provides current data

  // ── EFFECT 2: Update roots when data changes ──────────────────────────────
  // Never unmounts roots — just re-renders into existing ones.
  useEffect(() => {
    if (!Object.keys(rootsRef.current).length) return; // roots not ready yet
    renderIntoRoots(liveRef.current, rootsRef.current);
  }, [isSubscribed, user, isModerator, sort, search, handleSearch,
      postsLoading, filteredPosts, renderIntoRoots]);

  return <div ref={containerRef} dangerouslySetInnerHTML={{ __html: cleanHtml }} />;
}
