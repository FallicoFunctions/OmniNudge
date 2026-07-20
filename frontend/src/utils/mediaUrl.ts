import { API_BASE_URL } from '../lib/api';

const API_ORIGIN = new URL(API_BASE_URL).origin;

function appendVersion(url: string, version?: string | null): string {
  if (!version || url.startsWith('data:')) {
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
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
    return appendVersion(url, version);
  }
  // /uploads/ paths are served same-origin in prod and via Vite proxy in dev.
  if (url.startsWith('/uploads/')) return appendVersion(url, version);
  // Public frontend-bundled OmniChat assets are served by the frontend host.
  if (url.startsWith('/omnichat/')) return appendVersion(url, version);
  return appendVersion(`${API_ORIGIN}${url.startsWith('/') ? '' : '/'}${url}`, version);
}
