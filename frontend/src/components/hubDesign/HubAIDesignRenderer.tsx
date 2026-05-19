import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
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

export default function HubAIDesignRenderer({
  hubName,
  htmlContent,
  user,
  isModerator,
}: HubAIDesignRendererProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [frameDocument, setFrameDocument] = useState<Document | null>(null);
  const [frameHeight, setFrameHeight] = useState<number>(1);
  const [markerElements, setMarkerElements] = useState<Map<string, HTMLElement>>(new Map());

  const [sort, setSort] = useState<SortOption>('hot');
  const [search, setSearch] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const handleSearch = useCallback(() => setActiveSearch(search), [search]);

  const { htmlWithoutStyles, styleContent, slotsByMarker } = useMemo(
    () => splitAIDesignHTML(htmlContent),
    [htmlContent],
  );

  const frameSrcDoc = useMemo(() => {
    const scopedStyles = styleContent ? `<style>${styleContent}</style>` : '';
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>html, body { margin: 0; padding: 0; overflow-x: hidden; }</style>
    ${scopedStyles}
    <style>
      /* Slot container reset — ensures React portal content is never clipped
         by AI-generated height:0 or overflow:hidden on slot hosts. */
      #hub-join, #hub-create, #hub-mod, #hub-feed {
        overflow: visible !important;
        min-height: 0 !important;
        height: auto !important;
        max-height: none !important;
      }
    </style>
  </head>
  <body>${htmlWithoutStyles}</body>
</html>`;
  }, [htmlWithoutStyles, styleContent]);

  // Called by onLoad once the browser has fully parsed the new srcDoc.
  // This is the authoritative setter for frameDocument in real browsers.
  const syncFrameDocument = useCallback(() => {
    const nextDoc = iframeRef.current?.contentDocument ?? null;
    setFrameDocument(nextDoc);
  }, []);

  // When srcDoc content changes, clear frameDocument immediately so React
  // can detach portal content from the old marker elements WHILE those elements
  // are still connected. If we waited for onLoad, the browser would have already
  // replaced the iframe document, leaving portals pointing at disconnected nodes.
  // syncFrameDocument (via onLoad) re-populates frameDocument once loading is done.
  useLayoutEffect(() => {
    setFrameDocument(null);
  }, [frameSrcDoc]);

  // Fallback for jsdom (tests) where iframe srcDoc doesn't fire a load event.
  // In real browsers onLoad handles this; the body already has content so this
  // is a no-op there.
  useEffect(() => {
    if (frameDocument !== null) return;
    const iframe = iframeRef.current;
    const doc = iframe?.contentDocument ?? null;
    if (!doc || !doc.body || doc.body.childNodes.length > 0) return;

    doc.open();
    doc.write(frameSrcDoc);
    doc.close();
    setFrameDocument(doc);
  }, [frameDocument, frameSrcDoc]);

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
    if (!frameDocument) return;

    const next = new Map<string, HTMLElement>();
    frameDocument.querySelectorAll<HTMLElement>('[data-hub-slot-marker]').forEach((node) => {
      const marker = node.getAttribute('data-hub-slot-marker');
      if (marker && slotsByMarker.has(marker)) {
        node.replaceChildren();
        next.set(marker, node);
      }
    });
    setMarkerElements(next);
    return () => {
      setMarkerElements(new Map());
    };
  }, [frameDocument, frameSrcDoc, slotsByMarker]);

  useLayoutEffect(() => {
    if (!frameDocument) return;

    const root = frameDocument.documentElement;
    const body = frameDocument.body;
    if (!root || !body) return;

    const updateHeight = () => {
      const nextHeight = Math.max(
        body.scrollHeight,
        body.offsetHeight,
        root.scrollHeight,
        root.offsetHeight,
      );
      setFrameHeight(Math.max(1, nextHeight));
    };

    updateHeight();

    const ResizeObserverCtor =
      frameDocument.defaultView?.ResizeObserver ??
      (typeof ResizeObserver !== 'undefined' ? ResizeObserver : undefined);
    const observer = ResizeObserverCtor ? new ResizeObserverCtor(() => updateHeight()) : null;
    observer?.observe(root);
    observer?.observe(body);
    frameDocument.defaultView?.addEventListener('load', updateHeight);

    return () => {
      observer?.disconnect();
      frameDocument.defaultView?.removeEventListener('load', updateHeight);
    };
  }, [frameDocument, markerElements, filteredPosts, postsLoading, search, sort, isSubscribed, isModerator, user]);

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
    <div style={{ width: '100%', maxWidth: '100%', overflowX: 'hidden' }}>
      {/*
       * Portals MUST be declared before the iframe. React processes sibling
       * fibers left-to-right during deletion. If the iframe came first, React
       * would remove it from the DOM (detaching iframe.contentDocument) before
       * cleaning up the portals, causing removeChild to throw on the now-dead
       * marker elements. Declaring portals first ensures their content is
       * removed while the iframe — and its document — is still attached.
       */}
      {Array.from(slotsByMarker.entries()).map(([marker, slot]) => {
        const target = markerElements.get(marker);
        if (!target || !target.isConnected) {
          return null;
        }
        return createPortal(renderSlotContent(slot), target, marker);
      })}
      <iframe
        key={hubName}
        ref={iframeRef}
        title={`${hubName} custom page preview`}
        srcDoc={frameSrcDoc}
        sandbox="allow-same-origin"
        onLoad={syncFrameDocument}
        style={{
          width: '100%',
          maxWidth: '100%',
          border: '0',
          display: 'block',
          overflow: 'hidden',
          height: `${frameHeight}px`,
        }}
      />
    </div>
  );
}
