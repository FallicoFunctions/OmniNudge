// Resolves the real launch flow: the omnigame-api backend redirects a player
// into this runtime with `?mode=<account|guest>&handoff=<one-time token>`
// (see backend/internal/omnigame/service/session_service.go's BuildLaunchURL)
// - NOT with a world socket URL/token directly. Those only exist after this
// module exchanges the handoff for them via POST /omnigame/session/exchange.
//
// CROSS-ORIGIN by design, not same-origin: the omnigame-api's own CORS
// middleware (backend/internal/api/middleware/auth.go) explicitly allowlists
// https://omninudge.com / www.omninudge.com / play.omninudge.com as callers -
// that only makes sense if the API is genuinely on a different origin than
// wherever the game runtime is served, in production too. VITE_OMNIGAME_API_URL
// mirrors the exact same env var + default the main OmniNudge frontend already
// uses for this identical problem (frontend/src/services/omnigameService.ts),
// so both apps agree on where the API lives without a reverse-proxy assumption.
const OMNIGAME_API_URL = import.meta.env.VITE_OMNIGAME_API_URL || 'http://localhost:8091/api/v1';
//
// Field names mirror model.SessionExchangeResponse exactly - do not rename
// without checking that struct.
export interface ExchangedSession {
  playerId: string;
  playerName: string;
  worldSocketUrl: string;
  worldSessionToken: string;
  activeZone: string;
  // 'account' when the handoff came from an already-authenticated
  // omninudge.com session (see GameDetailPage.tsx's handleLaunch('account')),
  // 'guest' otherwise. createRuntime.ts uses this to boot the top-right
  // controls straight into the right mode - an SSO'd account player must never
  // flash a Log In / Sign Up prompt they don't need.
  mode: string;
  // The account's saved appearance (empty for a guest handoff, or an account
  // with nothing saved yet). createRuntime.ts applies this instead of
  // generating a random guest avatar when present - an SSO'd account player
  // must see their own saved look on boot, not a random one, same reasoning
  // as runtimeAuth.ts's RuntimeAuthSession.loadout for the in-game login path.
  loadout: Record<string, string>;
}

export interface SessionExchangeParams {
  mode: string;
  handoff: string;
}

/** Reads `?mode=&handoff=` from a location.search string, or null if either is absent. */
export function parseSessionExchangeParams(search: string): SessionExchangeParams | null {
  const params = new URLSearchParams(search);
  const mode = params.get('mode');
  const handoff = params.get('handoff');
  if (!mode || !handoff) {
    return null;
  }
  return { mode, handoff };
}

/**
 * Exchanges a one-time handoff token for a live world connection. Returns
 * null on ANY failure (network error, non-2xx, missing fields, malformed
 * JSON) rather than throwing - a failed exchange must not crash boot, it
 * should fall back to the no-world-connection dev/review path the same way
 * an absent handoff already does.
 */
export async function exchangeLaunchSession(
  params: SessionExchangeParams,
): Promise<ExchangedSession | null> {
  try {
    const response = await fetch(`${OMNIGAME_API_URL}/omnigame/session/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // No cookies needed: identity comes entirely from the one-time handoff
      // token in the body, and this is a genuine cross-origin call (see the
      // module comment above) where 'same-origin' credentials would be a
      // no-op at best and a misleading label at worst.
      body: JSON.stringify({ handoff: params.handoff, mode: params.mode }),
    });
    if (!response.ok) {
      return null;
    }
    const data = (await response.json()) as Partial<ExchangedSession>;
    if (
      typeof data.worldSocketUrl !== 'string' ||
      !data.worldSocketUrl ||
      typeof data.worldSessionToken !== 'string' ||
      !data.worldSessionToken ||
      typeof data.playerId !== 'string' ||
      typeof data.playerName !== 'string' ||
      typeof data.activeZone !== 'string'
    ) {
      return null;
    }
    return {
      playerId: data.playerId,
      playerName: data.playerName,
      worldSocketUrl: data.worldSocketUrl,
      worldSessionToken: data.worldSessionToken,
      activeZone: data.activeZone,
      // Falls back to the mode this exchange was requested with (the `mode`
      // param GameDetailPage.tsx's handoff URL already carries) if the
      // response ever omits it - display-only, so a defensive fallback beats
      // failing the whole exchange over a missing field.
      mode: typeof data.mode === 'string' && data.mode ? data.mode : params.mode,
      loadout: isStringRecord(data.loadout) ? data.loadout : {},
    };
  } catch {
    return null;
  }
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((entry) => typeof entry === 'string')
  );
}
