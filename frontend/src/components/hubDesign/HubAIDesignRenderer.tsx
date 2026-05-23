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
} from './HubDesignSlots';
import { subscriptionService } from '../../services/subscriptionService';
import type { User } from '../../types/auth';
import { splitAIDesignHTML, type DesignSlot } from '../../utils/splitAIDesignHTML';
import HubFeedSlotContent from './HubFeedSlotContent';

interface HubAIDesignRendererProps {
  hubName: string;
  htmlContent: string;
  user: User | null;
  isModerator: boolean;
}

const FEED_LAYOUT_GUARD_CSS = `
#hub-feed > .hub-slot-feed {
  display: block;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
}

#hub-feed > .hub-slot-feed > .hub-slot-feed-controls {
  display: flex;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
  flex-wrap: wrap;
}

#hub-feed > .hub-slot-feed > .hub-slot-feed-controls > .hub-slot-feed-tabs,
#hub-feed > .hub-slot-feed > .hub-slot-feed-controls > .hub-slot-feed-search-wrap {
  min-width: 0;
  max-width: 100%;
}

#hub-feed > .hub-slot-feed > .hub-slot-feed-controls .hub-slot-search {
  width: min(250px, 100%);
  max-width: 100%;
  box-sizing: border-box;
}

#hub-feed > .hub-slot-feed > .hub-slot-feed-list {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
}

#hub-feed > .hub-slot-feed > .hub-slot-feed-list > .hub-slot-post-card {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
  grid-column: auto;
  grid-row: auto;
}

#hub-feed > .hub-slot-feed > .hub-slot-feed-list > .hub-slot-post-card .hub-slot-post-title {
  overflow-wrap: anywhere;
  word-break: break-word;
}

#hub-feed > .hub-slot-feed > .hub-slot-feed-list > .hub-slot-post-card .hub-slot-post-meta {
  display: flex;
  flex-wrap: wrap;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
}

#hub-feed > .hub-slot-feed > .hub-slot-feed-list > .hub-slot-post-card .hub-slot-post-meta > * {
  min-width: 0;
}
`;

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
  const guardStyleElRef = useRef<HTMLStyleElement | null>(null);
  const markerElementsRef = useRef<Map<string, HTMLElement>>(new Map());
  const [markerElements, setMarkerElements] = useState<Map<string, HTMLElement>>(new Map());

  const { htmlWithoutStyles, styleContent, slotsByMarker } = useMemo(
    () => splitAIDesignHTML(htmlContent),
    [htmlContent],
  );

  useEffect(() => {
    const head = document.head;
    if (!head) return;

    if (styleContent) {
      const el = document.createElement('style');
      el.setAttribute('data-hub-ai-design', hubName);
      el.textContent = styleContent;
      head.appendChild(el);
      styleElRef.current = el;
    }

    const guardEl = document.createElement('style');
    guardEl.setAttribute('data-hub-ai-design-guard', hubName);
    guardEl.textContent = FEED_LAYOUT_GUARD_CSS;
    head.appendChild(guardEl);
    guardStyleElRef.current = guardEl;

    return () => {
      styleElRef.current?.remove();
      styleElRef.current = null;
      guardStyleElRef.current?.remove();
      guardStyleElRef.current = null;
    };
  }, [styleContent, hubName]);

  // ── Data queries ──────────────────────────────────────────────────────────
  const { data: subscriptionData } = useQuery({
    queryKey: ['hub-subscription', hubName],
    queryFn: () => subscriptionService.checkHubSubscription(hubName),
    enabled: !!user,
  });
  const isSubscribed = subscriptionData?.is_subscribed ?? false;

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const previousMarkers = markerElementsRef.current;
    const next = new Map<string, HTMLElement>();
    container.querySelectorAll<HTMLElement>('[data-hub-slot-marker]').forEach((node) => {
      const marker = node.getAttribute('data-hub-slot-marker');
      if (marker && slotsByMarker.has(marker)) {
        if (previousMarkers.get(marker) !== node) {
          node.replaceChildren();
        }
        next.set(marker, node);
      }
    });
    markerElementsRef.current = next;
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
        return <HubFeedSlotContent hubName={hubName} />;
      default:
        return null;
    }
  }, [hubName, isModerator, isSubscribed, user]);

  return (
    <div style={{ width: '100%', maxWidth: '100%', overflowX: 'hidden' }}>
      <AIDesignMarkup containerRef={containerRef} html={htmlWithoutStyles} />
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
