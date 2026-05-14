import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import {
  HubJoinSlot,
  HubCreateSlot,
  HubModSlot,
  HubFeedControls,
  StandalonePostFeed,
  type FeedSlotPost,
  type SortOption,
} from './HubDesignSlots';
import { hubsService } from '../../services/hubsService';
import { subscriptionService } from '../../services/subscriptionService';
import type { User } from '../../types/auth';
import { splitAIDesignHTML, type DesignSlot } from '../../utils/splitAIDesignHTML';

interface HubAIDesignRendererProps {
  hubName: string;
  htmlContent: string;
  user: User | null;
  isModerator: boolean;
}

const EMPTY_POSTS: FeedSlotPost[] = [];

interface AIDesignMarkupProps {
  containerRef: RefObject<HTMLDivElement | null>;
  html: string;
}

const AIDesignMarkup = memo(function AIDesignMarkup({
  containerRef,
  html,
}: AIDesignMarkupProps) {
  return <div ref={containerRef} dangerouslySetInnerHTML={{ __html: html }} />;
});

export default function HubAIDesignRenderer({
  hubName,
  htmlContent,
  user,
  isModerator,
}: HubAIDesignRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const styleElRef = useRef<HTMLStyleElement | null>(null);
  const [markerElements, setMarkerElements] = useState<Map<string, HTMLElement>>(new Map());

  const [sort, setSort] = useState<SortOption>('hot');
  const [search, setSearch] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const handleSearch = useCallback(() => setActiveSearch(search), [search]);

  const { htmlWithoutStyles, styleContent, slotsByMarker } = useMemo(
    () => splitAIDesignHTML(htmlContent),
    [htmlContent],
  );

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
  const allPosts: FeedSlotPost[] = postsData?.posts ?? EMPTY_POSTS;
  const filteredPosts = useMemo(() => {
    if (!activeSearch) return allPosts;
    const q = activeSearch.toLowerCase();
    return allPosts.filter(p => p.title?.toLowerCase().includes(q));
  }, [allPosts, activeSearch]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const next = new Map<string, HTMLElement>();
    container.querySelectorAll<HTMLElement>('[data-hub-slot-marker]').forEach((node) => {
      const marker = node.getAttribute('data-hub-slot-marker');
      if (marker && slotsByMarker.has(marker)) {
        node.replaceChildren();
        next.set(marker, node);
      }
    });
    setMarkerElements(next);
  }, [htmlWithoutStyles, slotsByMarker]);

  useLayoutEffect(() => {
    markerElements.forEach((node, marker) => {
      const slot = slotsByMarker.get(marker);
      if (!slot) return;

      node.id = slot.id;
      const expectedAttributes = new Set<string>(['id', 'style', 'data-hub-slot-marker']);
      slot.attributes.forEach(({ name, value }) => {
        node.setAttribute(name, value);
        expectedAttributes.add(name);
      });
      Array.from(node.attributes).forEach(({ name }) => {
        if (!expectedAttributes.has(name)) {
          node.removeAttribute(name);
        }
      });
      if (slot.style) {
        node.setAttribute('style', slot.style);
      } else {
        node.removeAttribute('style');
      }
    });
  }, [markerElements, slotsByMarker]);

  const renderSlotContent = useCallback((slot: DesignSlot) => {
    switch (slot.id) {
      case 'hub-join':
        return (
          <HubJoinSlot
            hubName={hubName}
            isSubscribed={isSubscribed}
            userId={user?.id ?? null}
          />
        );
      case 'hub-create':
        return <HubCreateSlot hubName={hubName} userId={user?.id ?? null} />;
      case 'hub-mod':
        return <HubModSlot hubName={hubName} isModerator={isModerator} />;
      case 'hub-feed':
        return (
          <div className="hub-slot-feed">
            <HubFeedControls
              sort={sort}
              onSortChange={setSort}
              searchValue={search}
              onSearchChange={setSearch}
              onSearch={handleSearch}
            />
            <StandalonePostFeed
              posts={filteredPosts}
              loading={postsLoading}
              hubName={hubName}
            />
          </div>
        );
      default:
        return null;
    }
  }, [
    filteredPosts,
    handleSearch,
    hubName,
    isModerator,
    isSubscribed,
    postsLoading,
    search,
    sort,
    user,
  ]);

  return (
    <>
      <AIDesignMarkup containerRef={containerRef} html={htmlWithoutStyles} />
      {Array.from(slotsByMarker.entries()).map(([marker, slot]) => {
        const target = markerElements.get(marker);
        if (!target || !target.isConnected) {
          return null;
        }
        return createPortal(renderSlotContent(slot), target, marker);
      })}
    </>
  );
}
