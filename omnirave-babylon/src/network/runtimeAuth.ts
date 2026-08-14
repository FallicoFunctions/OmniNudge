// Runtime login/signup/logout - upgrades or drops the active guest session
// without leaving the venue. Backed by the already-implemented
// backend/internal/omnigame/api/handlers/runtime_auth_handler.go, registered at
// POST /omnigame/runtime/auth/{login,signup,logout}. Same OMNIGAME_API_URL env
// convention as sessionExchange.ts (cross-origin by design - see that module's
// header comment).
//
// Unlike sessionExchange's exchangeLaunchSession (which swallows every failure
// into a silent null, since a failed handoff must fall back to no-world-connection
// boot quietly), these calls are direct user actions from a form submit: a
// failure must surface a real message the popup can show, so failures throw
// RuntimeAuthError instead.
const OMNIGAME_API_URL = import.meta.env.VITE_OMNIGAME_API_URL || 'http://localhost:8091/api/v1';

// Field names mirror model.SessionExchangeResponse (RuntimeAuthResponse is a
// type alias of it server-side) - do not rename without checking that struct.
export interface RuntimeAuthSession {
  playerId: string;
  playerName: string;
  worldSocketUrl: string;
  worldSessionToken: string;
  activeZone: string;
  mode: string;
  // The ACCOUNT's saved appearance (empty for a brand-new account or a guest
  // logout) - see session_service.go's BuildRuntimeAccountSession: if this is
  // empty AND the request carried currentLoadout, the server seeds the
  // account with the guest appearance the player already had instead of
  // handing back nothing. createRuntime.ts applies this live via
  // parseAvatarLoadout + reviewRuntime.setAvatarDefinition - no page reload.
  loadout: Record<string, string>;
}

export interface RuntimeLoginFields {
  username: string;
  password: string;
  currentVenue: string;
  currentLoadout?: Record<string, string>;
}

export interface RuntimeSignupFields {
  username: string;
  password: string;
  email: string;
  acceptTerms: boolean;
  acceptPrivacyPolicy: boolean;
  currentVenue: string;
  currentLoadout?: Record<string, string>;
}

export class RuntimeAuthError extends Error {}

async function postRuntimeAuth(path: string, body: unknown): Promise<RuntimeAuthSession> {
  let response: Response;
  try {
    response = await fetch(`${OMNIGAME_API_URL}/omnigame/runtime/auth/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new RuntimeAuthError('Could not reach the server. Check your connection and try again.');
  }

  let data: Record<string, unknown> | null = null;
  try {
    data = (await response.json()) as Record<string, unknown>;
  } catch {
    data = null;
  }

  if (!response.ok) {
    // backend/internal/utils/response.go's RespondError always sets a flat
    // string `message` field, error status or not.
    const message = typeof data?.message === 'string' ? data.message : 'Something went wrong. Try again.';
    throw new RuntimeAuthError(message);
  }

  if (
    !data ||
    typeof data.worldSocketUrl !== 'string' ||
    !data.worldSocketUrl ||
    typeof data.worldSessionToken !== 'string' ||
    !data.worldSessionToken ||
    typeof data.playerId !== 'string' ||
    typeof data.playerName !== 'string' ||
    typeof data.activeZone !== 'string' ||
    typeof data.mode !== 'string'
  ) {
    throw new RuntimeAuthError('Unexpected response from the server.');
  }

  return {
    playerId: data.playerId,
    playerName: data.playerName,
    worldSocketUrl: data.worldSocketUrl,
    worldSessionToken: data.worldSessionToken,
    activeZone: data.activeZone,
    mode: data.mode,
    loadout: isStringRecord(data.loadout) ? data.loadout : {},
  };
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((entry) => typeof entry === 'string')
  );
}

export function runtimeLogin(fields: RuntimeLoginFields): Promise<RuntimeAuthSession> {
  return postRuntimeAuth('login', {
    username: fields.username,
    password: fields.password,
    currentVenue: fields.currentVenue,
    currentLoadout: fields.currentLoadout,
  });
}

export function runtimeSignup(fields: RuntimeSignupFields): Promise<RuntimeAuthSession> {
  return postRuntimeAuth('signup', {
    username: fields.username,
    password: fields.password,
    email: fields.email,
    acceptTerms: fields.acceptTerms,
    acceptPrivacyPolicy: fields.acceptPrivacyPolicy,
    currentVenue: fields.currentVenue,
    currentLoadout: fields.currentLoadout,
  });
}

export function runtimeLogout(currentVenue: string): Promise<RuntimeAuthSession> {
  return postRuntimeAuth('logout', { currentVenue });
}
