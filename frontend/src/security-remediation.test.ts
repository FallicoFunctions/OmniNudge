import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function read(rel: string): string {
  return readFileSync(resolve(root, rel), 'utf8');
}

describe('security remediation static checks', () => {
  it('keeps the AI designer preview iframe same-origin isolated', () => {
    const source = read('src/components/hubSettings/HubAIDesignerTab.tsx');
    expect(source).toContain('sandbox="allow-scripts"');
    expect(source).not.toContain('allow-same-origin');
    expect(source).not.toContain('cannot access your account');
  });

  it('loads Firebase config from environment variables only', () => {
    const source = read('src/lib/firebase.ts');
    expect(source).not.toMatch(/AIzaSy[A-Za-z0-9_-]+/);
    expect(source).not.toContain("console.log('FCM Token:'");
    for (const key of [
      'VITE_FIREBASE_API_KEY',
      'VITE_FIREBASE_AUTH_DOMAIN',
      'VITE_FIREBASE_PROJECT_ID',
      'VITE_FIREBASE_STORAGE_BUCKET',
      'VITE_FIREBASE_MESSAGING_SENDER_ID',
      'VITE_FIREBASE_APP_ID',
    ]) {
      expect(source).toContain(`import.meta.env.${key}`);
      expect(read('.env.example')).toContain(key);
    }
  });

  it('does not log encryption key lifecycle events', () => {
    const source = read('src/contexts/AuthContext.tsx');
    expect(source).not.toContain('[AuthContext] Initializing encryption keys');
    expect(source).not.toContain('[AuthContext] Keys initialized');
    expect(source).not.toContain('[AuthContext] Public key base64');
  });

  it('uses session storage for FCM tokens', () => {
    const source = read('src/hooks/usePushNotifications.ts');
    expect(source).toContain("sessionStorage.getItem('fcm_token')");
    expect(source).toContain("sessionStorage.setItem('fcm_token'");
    expect(source).toContain("sessionStorage.removeItem('fcm_token')");
    expect(source).not.toContain("localStorage.getItem('fcm_token')");
    expect(source).not.toContain("localStorage.setItem('fcm_token'");
    expect(source).not.toContain("localStorage.removeItem('fcm_token')");
  });

  it('fetches a short-lived websocket token before connecting', () => {
    const source = read('src/contexts/WebSocketContext.tsx');
    expect(source).toContain("api.post<{ ws_token: string }>('/auth/ws-token')");
    expect(source).toContain("url.searchParams.set('token', wsToken)");
  });

  it('uses DOMPurify for Reddit sidebar and wiki HTML sanitizers', () => {
    expect(read('src/pages/SubredditPage.tsx')).toContain('DOMPurify.sanitize');
    expect(read('src/pages/RedditWikiPage.tsx')).toContain('DOMPurify.sanitize');
  });
});
