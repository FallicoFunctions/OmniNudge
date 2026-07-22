const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api/v1';
const CSRF_COOKIE_NAME = 'omni_csrf';

let refreshPromise: Promise<boolean> | null = null;

function requestTargetsAPI(input: RequestInfo | URL): boolean {
  const target = input instanceof Request ? input.url : String(input);
  const browserBase = typeof window === 'undefined' ? 'http://localhost' : window.location.href;
  try {
    const requestURL = new URL(target, browserBase);
    const apiURL = new URL(API_BASE_URL, browserBase);
    const apiPath = apiURL.pathname.replace(/\/$/, '');
    return (
      requestURL.origin === apiURL.origin &&
      (requestURL.pathname === apiPath || requestURL.pathname.startsWith(`${apiPath}/`))
    );
  } catch {
    return false;
  }
}

function isAuthenticationEntryPoint(input: RequestInfo | URL): boolean {
  const target = input instanceof Request ? input.url : String(input);
  return ['/auth/refresh', '/auth/login', '/auth/register', '/auth/oauth/complete'].some((path) =>
    target.includes(path)
  );
}

export function getCSRFToken(): string | null {
  if (typeof document === 'undefined') return null;
  const prefix = `${CSRF_COOKIE_NAME}=`;
  for (const item of document.cookie.split(';')) {
    const trimmed = item.trim();
    if (trimmed.startsWith(prefix)) {
      return decodeURIComponent(trimmed.slice(prefix.length));
    }
  }
  return null;
}

export function hasBrowserSession(): boolean {
  return getCSRFToken() !== null;
}

export function sessionHeaders(method = 'GET', headers?: HeadersInit): Headers {
  const result = new Headers(headers);
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase())) {
    const csrfToken = getCSRFToken();
    if (csrfToken) result.set('X-CSRF-Token', csrfToken);
  }
  return result;
}

export async function refreshAuthSession(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const csrfToken = getCSRFToken();
    if (!csrfToken) return false;
    try {
      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers: { 'X-CSRF-Token': csrfToken },
      });
      return response.ok;
    } catch {
      return false;
    }
  })().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

export async function authenticatedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
  retryOnUnauthorized = true
): Promise<Response> {
  const method = init.method ?? (input instanceof Request ? input.method : 'GET');
  const isAPIRequest = requestTargetsAPI(input);
  const response = await fetch(input, {
    ...init,
    credentials: isAPIRequest ? 'include' : 'omit',
    cache: init.cache ?? 'no-store',
    headers: isAPIRequest ? sessionHeaders(method, init.headers) : init.headers,
  });
  if (
    isAPIRequest &&
    response.status === 401 &&
    retryOnUnauthorized &&
    !isAuthenticationEntryPoint(input) &&
    (await refreshAuthSession())
  ) {
    return authenticatedFetch(input, init, false);
  }
  return response;
}
