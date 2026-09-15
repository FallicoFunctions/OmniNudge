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
import { DEFAULT_KDF_ITERATIONS, deriveLoginKey, newKdfSalt } from './loginKey';

const OMNIGAME_API_URL = import.meta.env.VITE_OMNIGAME_API_URL || 'http://localhost:8091/api/v1';

// The same minimum the main app's sign-up checks; with a login key the server
// never sees the password, so the client enforces it.
const MIN_PASSWORD_LENGTH = 8;

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

async function requestRuntimeAuth(path: string, body: unknown): Promise<Record<string, unknown> | null> {
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
  return data;
}

async function postRuntimeAuth(path: string, body: unknown): Promise<RuntimeAuthSession> {
  const data = await requestRuntimeAuth(path, body);
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

// What proves the account, as the main app's signInSecret decides it: the
// login key for an account on the login-key scheme, the password only for one
// still on the old scheme. A login-key answer without its settings never falls
// back to the password.
async function accountSecret(username: string, password: string): Promise<{ password: string } | { loginKey: string }> {
  const pre = await requestRuntimeAuth('prelogin', { username });
  if (pre?.scheme === 1) {
    return { password };
  }
  if (pre?.scheme !== 2 || typeof pre.kdf_salt !== 'string' || typeof pre.kdf_iterations !== 'number') {
    throw new RuntimeAuthError('Unexpected response from the server.');
  }
  return { loginKey: await deriveLoginKey(password, pre.kdf_salt, pre.kdf_iterations) };
}

export async function runtimeLogin(fields: RuntimeLoginFields): Promise<RuntimeAuthSession> {
  const secret = await accountSecret(fields.username, fields.password);
  return postRuntimeAuth('login', {
    username: fields.username,
    ...secret,
    currentVenue: fields.currentVenue,
    currentLoadout: fields.currentLoadout,
  });
}

// A new account signs in with a login key from the start: the server gets the
// key and its settings, never the password.
export async function runtimeSignup(fields: RuntimeSignupFields): Promise<RuntimeAuthSession> {
  if (fields.password.length < MIN_PASSWORD_LENGTH) {
    throw new RuntimeAuthError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  const kdfSalt = newKdfSalt();
  const loginKey = await deriveLoginKey(fields.password, kdfSalt, DEFAULT_KDF_ITERATIONS);
  return postRuntimeAuth('signup', {
    username: fields.username,
    loginKey,
    kdfSalt,
    kdfIterations: DEFAULT_KDF_ITERATIONS,
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
