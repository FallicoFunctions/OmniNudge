import { API_BASE_URL } from '../lib/api';

const API_ORIGIN = new URL(API_BASE_URL).origin;

export function resolveMediaUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
    return url;
  }
  return `${API_ORIGIN}${url.startsWith('/') ? '' : '/'}${url}`;
}
