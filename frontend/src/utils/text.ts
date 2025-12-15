let domParser: DOMParser | null = null;

function ensureParser(): DOMParser | null {
  if (typeof window === 'undefined') {
    return null;
  }
  if (!domParser) {
    domParser = new DOMParser();
  }
  return domParser;
}

export function decodeHtmlEntities(input?: string | null): string {
  if (!input) {
    return input ?? '';
  }

  const parser = ensureParser();
  if (parser) {
    const doc = parser.parseFromString(input, 'text/html');
    return doc.documentElement.textContent ?? input;
  }

  return input
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
