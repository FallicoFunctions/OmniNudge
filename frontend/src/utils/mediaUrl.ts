import { API_BASE_URL } from '../lib/api';

const API_ORIGIN = new URL(API_BASE_URL).origin;

function appendVersion(url: string, version?: string | null): string {
  if (!version) {
    return url;
  }

  if (url.startsWith('http://') || url.startsWith('https://')) {
    try {
      const parsed = new URL(url);
      parsed.searchParams.set('v', version);
      return parsed.toString();
    } catch {
      return url;
    }
  }

  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}v=${encodeURIComponent(version)}`;
}

export function resolveMediaUrl(url?: string | null, version?: string | null): string | undefined {
  if (!url) return undefined;
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return appendVersion(url, version);
  }
  // Media metadata is server-controlled, but never render active data URLs
  // from it. Local previews use blob URLs directly and do not need this helper.
  if (url.trim().toLowerCase().startsWith('data:') || url.startsWith('//') || url.includes('\\')) {
    return undefined;
  }
  // Uploads are fetched through the API's own path. The session cookie is
  // scoped to /api/, so a request to /uploads/ -- same-origin or through the dev
  // proxy -- arrives anonymous, and every private file answered 404.
  if (url.startsWith('/uploads/') || url.startsWith('uploads/')) {
    return appendVersion(`${API_BASE_URL}/${url.replace(/^\//, '')}`, version);
  }
  // Public frontend-bundled OmniChat assets are served by the frontend host.
  if (url.startsWith('/omnichat/')) return appendVersion(url, version);
  return appendVersion(`${API_ORIGIN}${url.startsWith('/') ? '' : '/'}${url}`, version);
}
