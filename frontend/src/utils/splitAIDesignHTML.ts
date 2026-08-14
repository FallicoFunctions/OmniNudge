import DOMPurify from 'dompurify';

export type SlotId = 'hub-feed' | 'hub-join' | 'hub-create' | 'hub-mod' | 'hub-content';

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

const SLOT_IDS: SlotId[] = ['hub-feed', 'hub-join', 'hub-create', 'hub-mod', 'hub-content'];
const MARKER_PREFIX = 'hub-slot-marker-';
const SAFE_SLOT_HOST_TAGS = new Set([
  'div',
  'section',
  'aside',
  'article',
  'header',
  'footer',
  'main',
]);
const SAFE_SLOT_ATTR_NAMES = new Set([
  'class',
  'title',
  'dir',
  'lang',
  'aria-label',
  'aria-labelledby',
  'aria-describedby',
]);

const SAFE_DESIGN_TAGS = [
  'a',
  'article',
  'aside',
  'b',
  'blockquote',
  'br',
  'button',
  'code',
  'div',
  'em',
  'figcaption',
  'figure',
  'footer',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hr',
  'img',
  'li',
  'main',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'small',
  'span',
  'strong',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'ul',
];

const SAFE_DESIGN_ATTRS = [
  'alt',
  'aria-describedby',
  'aria-label',
  'aria-labelledby',
  'class',
  'colspan',
  'dir',
  'height',
  'href',
  'id',
  'lang',
  'role',
  'rowspan',
  'src',
  'style',
  'title',
  'width',
];

const UNSAFE_CSS = /(?:@import\b|url\s*\(|expression\s*\(|-moz-binding\b|behavior\s*:)/i;

function sanitizeCss(css: string): string {
  // Hub designs may style their own layout, but remote CSS resources and legacy
  // executable CSS features can leak user data or execute in vulnerable engines.
  return UNSAFE_CSS.test(css) ? '' : css;
}

function sanitizeDesignUrl(value: string, allowHash = false): string | null {
  const candidate = value.trim();
  if (!candidate || candidate.includes('\\') || candidate.startsWith('//')) {
    return null;
  }
  if (allowHash && candidate.startsWith('#')) {
    return candidate;
  }

  try {
    const parsed = new URL(candidate, window.location.origin);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function sanitizeDesignMarkup(markup: string): string {
  const sanitized = DOMPurify.sanitize(markup, {
    ALLOWED_TAGS: SAFE_DESIGN_TAGS,
    ALLOWED_ATTR: SAFE_DESIGN_ATTRS,
    ALLOW_DATA_ATTR: true,
    ALLOW_ARIA_ATTR: true,
  });
  const template = document.createElement('template');
  template.innerHTML = sanitized;

  template.content.querySelectorAll<HTMLElement>('*').forEach((element) => {
    const style = element.getAttribute('style');
    if (style) {
      const safeStyle = sanitizeCss(style);
      if (safeStyle) {
        element.setAttribute('style', safeStyle);
      } else {
        element.removeAttribute('style');
      }
    }

    if (element.tagName.toLowerCase() === 'a') {
      const href = element.getAttribute('href');
      const safeHref = href ? sanitizeDesignUrl(href, true) : null;
      if (!safeHref) {
        element.removeAttribute('href');
        return;
      }
      element.setAttribute('href', safeHref);
      const targetUrl = new URL(safeHref, window.location.origin);
      if (targetUrl.origin !== window.location.origin) {
        element.setAttribute('target', '_blank');
        element.setAttribute('rel', 'noopener noreferrer');
      }
      return;
    }

    if (element.tagName.toLowerCase() === 'img') {
      const src = element.getAttribute('src');
      const safeSrc = src ? sanitizeDesignUrl(src) : null;
      if (safeSrc) {
        element.setAttribute('src', safeSrc);
      } else {
        element.removeAttribute('src');
      }
    }
  });

  return template.innerHTML;
}

function isSafeSlotAttribute(attributeName: string): boolean {
  if (attributeName.startsWith('data-')) {
    return true;
  }
  return SAFE_SLOT_ATTR_NAMES.has(attributeName);
}

function sanitizeSlotHost(
  doc: Document,
  slotNode: HTMLElement,
  slotId: SlotId,
  marker: string
): HTMLElement {
  const normalizedTagName = SAFE_SLOT_HOST_TAGS.has(slotNode.tagName.toLowerCase())
    ? slotNode.tagName.toLowerCase()
    : 'div';
  const safeAttributes = Array.from(slotNode.attributes)
    .filter((attribute) => isSafeSlotAttribute(attribute.name))
    .map((attribute) => ({ name: attribute.name, value: attribute.value }));
  const style = slotNode.getAttribute('style') ?? '';
  const sanitizedHost =
    normalizedTagName === slotNode.tagName.toLowerCase()
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

  const sourceDoc = new DOMParser().parseFromString(html, 'text/html');
  const styleContent = sanitizeCss(
    Array.from(sourceDoc.querySelectorAll('style'))
      .map((styleNode) => styleNode.textContent ?? '')
      .join('\n')
  );
  sourceDoc.querySelectorAll('style').forEach((styleNode) => styleNode.remove());

  const doc = new DOMParser().parseFromString(
    sanitizeDesignMarkup(sourceDoc.body.innerHTML),
    'text/html'
  );

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
