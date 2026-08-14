/**
 * Accept only a same-origin path for client-side redirects. Location state and
 * custom events are not an authorization boundary, so they must never choose
 * an external destination after authentication or a privileged action.
 */
export function getSafeInternalPath(value: unknown, fallback = '/'): string {
  if (typeof value !== 'string') {
    return fallback;
  }

  const candidate = value.trim();
  if (!candidate.startsWith('/') || candidate.startsWith('//') || candidate.includes('\\')) {
    return fallback;
  }

  try {
    const parsed = new URL(candidate, window.location.origin);
    if (parsed.origin !== window.location.origin || parsed.pathname.startsWith('//')) {
      return fallback;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}
