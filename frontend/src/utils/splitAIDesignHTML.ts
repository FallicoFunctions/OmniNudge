export type SlotId = 'hub-feed' | 'hub-join' | 'hub-create' | 'hub-mod';

export interface DesignSlot {
  id: SlotId;
  style: string; // raw cssText from the slot element's style attribute
}

export interface SplitDesignResult {
  // The AI HTML split into segments. Each segment is either a raw HTML string
  // or a slot marker. Rendered in order they produce the full page.
  segments: Array<{ type: 'html'; html: string } | { type: 'slot'; slot: DesignSlot }>;
  // The extracted <style> block content (empty string if none).
  styleContent: string;
  // Whether any slots were found.
  hasSlots: boolean;
}

const SLOT_IDS: SlotId[] = ['hub-feed', 'hub-join', 'hub-create', 'hub-mod'];
const PLACEHOLDER_PREFIX = '__OMNINUDGE_SLOT_';

export function splitAIDesignHTML(html: string): SplitDesignResult {
  if (!html) {
    return { segments: [{ type: 'html', html: '' }], styleContent: '', hasSlots: false };
  }

  const doc = new DOMParser().parseFromString(html, 'text/html');

  // Extract <style> content — DOMParser moves style blocks to <head>.
  const styleContent = Array.from(doc.querySelectorAll('style'))
    .map(s => s.textContent ?? '')
    .join('\n');

  // Find all slot elements and record their styles, then replace with placeholders.
  const slots = new Map<string, DesignSlot>();
  for (const id of SLOT_IDS) {
    const el = doc.getElementById(id);
    if (!el) continue;
    const slot: DesignSlot = { id: id as SlotId, style: el.getAttribute('style') ?? '' };
    slots.set(id, slot);
    const placeholder = doc.createElement('div');
    placeholder.id = `${PLACEHOLDER_PREFIX}${id}`;
    el.replaceWith(placeholder);
  }

  if (slots.size === 0) {
    return {
      segments: [{ type: 'html', html: doc.body.innerHTML }],
      styleContent,
      hasSlots: false,
    };
  }

  // Split the serialized body HTML at each placeholder marker.
  let remaining = doc.body.innerHTML;
  const segments: SplitDesignResult['segments'] = [];

  // Process in document order by repeatedly finding the earliest placeholder.
  while (remaining.length > 0) {
    let earliest = -1;
    let earliestId: SlotId | null = null;

    for (const id of slots.keys()) {
      const marker = `<div id="${PLACEHOLDER_PREFIX}${id}"></div>`;
      const idx = remaining.indexOf(marker);
      if (idx !== -1 && (earliest === -1 || idx < earliest)) {
        earliest = idx;
        earliestId = id as SlotId;
      }
    }

    if (earliest === -1 || !earliestId) {
      // No more placeholders — rest is trailing HTML.
      if (remaining) segments.push({ type: 'html', html: remaining });
      break;
    }

    const marker = `<div id="${PLACEHOLDER_PREFIX}${earliestId}"></div>`;
    if (earliest > 0) {
      segments.push({ type: 'html', html: remaining.slice(0, earliest) });
    }
    segments.push({ type: 'slot', slot: slots.get(earliestId)! });
    remaining = remaining.slice(earliest + marker.length);
    slots.delete(earliestId); // each slot only appears once
  }

  return { segments, styleContent, hasSlots: true };
}
