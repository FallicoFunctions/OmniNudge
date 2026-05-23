import {
  memo,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { subscriptionService } from '../../services/subscriptionService';
import type { User } from '../../types/auth';
import { splitAIDesignHTML, type DesignSlot } from '../../utils/splitAIDesignHTML';
import { HubCreateSlot, HubJoinSlot, HubModSlot } from './HubDesignSlots';

type RouteVariant = 'index' | 'post' | 'wiki';

interface HubAIDesignLayoutProps {
  hubName: string;
  htmlContent: string;
  user: User | null;
  isModerator: boolean;
  routeVariant: RouteVariant;
  children: ReactNode;
}

interface AIDesignMarkupProps {
  containerRef: RefObject<HTMLDivElement | null>;
  html: string;
}

const ROUTE_CLASS_BY_VARIANT: Record<RouteVariant, string> = {
  index: 'hub-route-index',
  post: 'hub-route-post',
  wiki: 'hub-route-wiki',
};

const AIDesignMarkup = memo(function AIDesignMarkup({ containerRef, html }: AIDesignMarkupProps) {
  return <div ref={containerRef} dangerouslySetInnerHTML={{ __html: html }} />;
});

function isContentSlot(slot: DesignSlot, routeVariant: RouteVariant, hasExplicitContentSlot: boolean) {
  if (slot.id === 'hub-content') {
    return true;
  }
  return !hasExplicitContentSlot && routeVariant !== 'index' && slot.id === 'hub-feed';
}

export default function HubAIDesignLayout({
  hubName,
  htmlContent,
  user,
  isModerator,
  routeVariant,
  children,
}: HubAIDesignLayoutProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const styleElRef = useRef<HTMLStyleElement | null>(null);
  const markerElementsRef = useRef<Map<string, HTMLElement>>(new Map());
  const [markerElements, setMarkerElements] = useState<Map<string, HTMLElement>>(new Map());

  const { htmlWithoutStyles, styleContent, slotsByMarker } = useMemo(
    () => splitAIDesignHTML(htmlContent),
    [htmlContent],
  );

  const hasExplicitContentSlot = useMemo(
    () => Array.from(slotsByMarker.values()).some((slot) => slot.id === 'hub-content'),
    [slotsByMarker],
  );

  const { data: subscriptionData } = useQuery({
    queryKey: ['hub-subscription', hubName],
    queryFn: () => subscriptionService.checkHubSubscription(hubName),
    enabled: !!user,
  });
  const isSubscribed = subscriptionData?.is_subscribed ?? false;

  useLayoutEffect(() => {
    const head = document.head;
    if (!head) return;

    if (styleContent) {
      const el = document.createElement('style');
      el.setAttribute('data-hub-ai-design', `${hubName}-${routeVariant}`);
      el.textContent = styleContent;
      head.appendChild(el);
      styleElRef.current = el;
    }

    return () => {
      styleElRef.current?.remove();
      styleElRef.current = null;
    };
  }, [styleContent, hubName, routeVariant]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const root = container.firstElementChild as HTMLElement | null;
    if (root) {
      root.dataset.hubRoute = routeVariant;
      Object.values(ROUTE_CLASS_BY_VARIANT).forEach((className) => root.classList.remove(className));
      root.classList.add(ROUTE_CLASS_BY_VARIANT[routeVariant]);
    }

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
  }, [htmlWithoutStyles, routeVariant, slotsByMarker]);

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

  const renderSlotContent = (slot: DesignSlot) => {
    if (isContentSlot(slot, routeVariant, hasExplicitContentSlot)) {
      return (
        <div className={`hub-route-content ${ROUTE_CLASS_BY_VARIANT[routeVariant]}`}>
          {children}
        </div>
      );
    }

    switch (slot.id) {
      case 'hub-join':
        return <HubJoinSlot hubName={hubName} isSubscribed={isSubscribed} userId={user?.id ?? null} />;
      case 'hub-create':
        return <HubCreateSlot hubName={hubName} userId={user?.id ?? null} />;
      case 'hub-mod':
        return <HubModSlot hubName={hubName} isModerator={isModerator} />;
      default:
        return null;
    }
  };

  return (
    <>
      <AIDesignMarkup containerRef={containerRef} html={htmlWithoutStyles} />
      {Array.from(markerElements.entries()).map(([marker, element]) => {
        const slot = slotsByMarker.get(marker);
        if (!slot) return null;
        return createPortal(renderSlotContent(slot), element, marker);
      })}
    </>
  );
}
