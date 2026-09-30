// Keeps a world session alive past its five-minute token. The world ends a
// connection when its token expires (the bound on how long a sanction takes to
// hold), so before that the runtime trades the token for a fresh one at
// /omnigame/session/renew and hands it to the world over the open socket.
// A token that has already expired (a laptop that slept) cannot be renewed;
// then a fresh launch is the way back in, as after a refresh.
import type { WorldSocket } from './worldSocket';
import { exchangeLaunchSession, requestFreshLaunch } from './sessionExchange';

const OMNIGAME_API_URL = import.meta.env.VITE_OMNIGAME_API_URL || 'http://localhost:8091/api/v1';
const CHECK_INTERVAL_MS = 30_000;
const RENEW_BEFORE_EXPIRY_MS = 90_000;

/** Expiry of a JWT in epoch milliseconds, or 0 when it cannot be read. */
export function tokenExpiresAt(token: string): number {
  try {
    const payload = token.split('.')[1] ?? '';
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const exp = (JSON.parse(json) as { exp?: unknown }).exp;
    return typeof exp === 'number' ? exp * 1000 : 0;
  } catch {
    return 0;
  }
}

export async function renewWorldToken(token: string): Promise<string | null> {
  try {
    const response = await fetch(`${OMNIGAME_API_URL}/omnigame/session/renew`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ worldSessionToken: token }),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { worldSessionToken?: unknown };
    return typeof body.worldSessionToken === 'string' && body.worldSessionToken ? body.worldSessionToken : null;
  } catch {
    return null;
  }
}

export function keepWorldSessionAlive(socket: WorldSocket, options: { freshLaunch: boolean }): () => void {
  let busy = false;
  const check = async () => {
    if (busy) return;
    busy = true;
    try {
      const token = socket.currentToken();
      const expiresAt = tokenExpiresAt(token);
      const remaining = expiresAt - Date.now();
      if (expiresAt && remaining > 0 && remaining < RENEW_BEFORE_EXPIRY_MS) {
        const fresh = await renewWorldToken(token);
        if (fresh) socket.renew(fresh);
      } else if (expiresAt && remaining <= 0 && socket.status() !== 'open' && options.freshLaunch) {
        const params = await requestFreshLaunch();
        const exchanged = params ? await exchangeLaunchSession(params) : null;
        if (exchanged) socket.reconnect(exchanged.worldSocketUrl, exchanged.worldSessionToken);
      }
    } finally {
      busy = false;
    }
  };
  const timer = window.setInterval(() => void check(), CHECK_INTERVAL_MS);
  return () => window.clearInterval(timer);
}
