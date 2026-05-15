import {
  useCallback,
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
    <style>html, body { margin: 0; padding: 0; }</style>
    ${scopedStyles}
  </head>
  <body>${htmlWithoutStyles}</body>
</html>`;
  }, [htmlWithoutStyles, styleContent]);

  const syncFrameDocument = useCallback(() => {
    const nextDoc = iframeRef.current?.contentDocument ?? null;
    setFrameDocument(nextDoc);
  }, []);

  useLayoutEffect(() => {
    const iframe = iframeRef.current;
    const nextDoc = iframe?.contentDocument ?? null;
    if (!nextDoc) {
      setFrameDocument(null);
      return;
    }

    // jsdom does not reliably populate iframe srcDoc content or dispatch load.
    if (nextDoc.body && nextDoc.body.childNodes.length === 0) {
      nextDoc.open();
      nextDoc.write(frameSrcDoc);
      nextDoc.close();
    }

    setFrameDocument(nextDoc);
  }, [frameSrcDoc]);

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
      {Array.from(slotsByMarker.entries()).map(([marker, slot]) => {
        const target = markerElements.get(marker);
        if (!target || !target.isConnected) {
          return null;
        }
        return createPortal(renderSlotContent(slot), target, marker);
      })}
    </div>
  );
}
