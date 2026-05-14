export type SlotId = 'hub-feed' | 'hub-join' | 'hub-create' | 'hub-mod';

export interface DesignSlot {
  id: SlotId;
  tagName: string;
  attributes: Array<{ name: string; value: string }>;
  style: string; // raw cssText from the slot element's style attribute
}

export interface SplitDesignResult {
  htmlWithoutStyles: string;
  styleContent: string;
  hasSlots: boolean;
  slotsByMarker: Map<string, DesignSlot>;
}

const SLOT_IDS: SlotId[] = ['hub-feed', 'hub-join', 'hub-create', 'hub-mod'];
const MARKER_PREFIX = 'hub-slot-marker-';
const SAFE_SLOT_HOST_TAGS = new Set(['div', 'section', 'aside', 'article', 'header', 'footer', 'main']);
const SAFE_SLOT_ATTR_NAMES = new Set([
  'class',
  'title',
  'dir',
  'lang',
  'aria-label',
  'aria-labelledby',
  'aria-describedby',
]);

function isSafeSlotAttribute(attributeName: string): boolean {
  if (attributeName.startsWith('data-')) {
    return true;
  }
  return SAFE_SLOT_ATTR_NAMES.has(attributeName);
}

function sanitizeSlotHost(doc: Document, slotNode: HTMLElement, slotId: SlotId, marker: string): HTMLElement {
  const normalizedTagName = SAFE_SLOT_HOST_TAGS.has(slotNode.tagName.toLowerCase())
    ? slotNode.tagName.toLowerCase()
    : 'div';
  const safeAttributes = Array.from(slotNode.attributes)
    .filter((attribute) => isSafeSlotAttribute(attribute.name))
    .map((attribute) => ({ name: attribute.name, value: attribute.value }));
  const style = slotNode.getAttribute('style') ?? '';
  const sanitizedHost = normalizedTagName === slotNode.tagName.toLowerCase()
    ? slotNode
    : doc.createElement(normalizedTagName);

  if (sanitizedHost !== slotNode) {
    while (slotNode.firstChild) {
      sanitizedHost.appendChild(slotNode.firstChild);
    }
    slotNode.replaceWith(sanitizedHost);
  }

  Array.from(sanitizedHost.attributes).forEach((attribute) => {
    sanitizedHost.removeAttribute(attribute.name);
  });
  sanitizedHost.id = slotId;
  sanitizedHost.setAttribute('data-hub-slot-marker', marker);
  safeAttributes.forEach(({ name, value }) => {
    sanitizedHost.setAttribute(name, value);
  });
  if (style) {
    sanitizedHost.setAttribute('style', style);
  }

  return sanitizedHost;
}

export function splitAIDesignHTML(html: string): SplitDesignResult {
  if (!html) {
    return {
      htmlWithoutStyles: '',
      styleContent: '',
      hasSlots: false,
      slotsByMarker: new Map(),
    };
  }

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const styleContent = Array.from(doc.querySelectorAll('style'))
    .map((styleNode) => styleNode.textContent ?? '')
    .join('\n');
  doc.querySelectorAll('style').forEach((styleNode) => styleNode.remove());

  const slotsByMarker = new Map<string, DesignSlot>();
  for (const id of SLOT_IDS) {
    const slotNode = doc.getElementById(id);
    if (!slotNode) continue;

    const marker = `${MARKER_PREFIX}${id}`;
    const sanitizedHost = sanitizeSlotHost(doc, slotNode, id, marker);
    slotsByMarker.set(marker, {
      id,
      tagName: sanitizedHost.tagName.toLowerCase(),
      attributes: Array.from(sanitizedHost.attributes)
        .filter((attribute) => !['id', 'style', 'data-hub-slot-marker'].includes(attribute.name))
        .map((attribute) => ({ name: attribute.name, value: attribute.value })),
      style: sanitizedHost.getAttribute('style') ?? '',
    });
  }

  return {
    htmlWithoutStyles: doc.body.innerHTML,
    styleContent,
    hasSlots: slotsByMarker.size > 0,
    slotsByMarker,
  };
}
