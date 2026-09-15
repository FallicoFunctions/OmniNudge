export type RuntimeMode = 'account' | 'guest';
export type RuntimeZoneID = 'main_stage' | 'underground' | 'plurr_partay';
export type RuntimeEventPhase = 'none' | 'lead_in' | 'active' | 'recovery';

import { DEFAULT_KDF_ITERATIONS, deriveLoginKey, newKdfSalt } from './loginKey';
import { normalizeRuntimeSettings, type RuntimeSettings } from './settings';

// The same minimum the main app's sign-up checks; with a login key the server
// never sees the password, so the client enforces it.
const MIN_PASSWORD_LENGTH = 8;

export interface RuntimePoint {
  x: number;
  y: number;
  z: number;
}

export interface RuntimePlayer {
  id: string;
  playerName: string;
  mode: RuntimeMode;
  position: RuntimePoint;
  zone: RuntimeZoneID;
  loadout: Record<string, string>;
}

export interface RuntimeChatMessage {
  playerId: string;
  playerName: string;
  body: string;
  createdAt: string;
}

export interface RuntimeZoneMedia {
  zoneId: RuntimeZoneID;
  videoId: string;
  playlistIndex: number;
  playheadSeconds: number;
}

export interface RuntimeZoneEvent {
  zoneId: RuntimeZoneID;
  phase: RuntimeEventPhase;
  eventName: string;
  countdownSeconds?: number;
  recoverySeconds?: number;
  activeMinute?: number;
}

export interface RuntimeVenueStatus {
  audienceLabel?: string;
  currentTrackLabel?: string;
  totalPlayers?: number;
  venuePlayers?: number;
}

export interface RuntimeSession {
  playerId: string;
  playerName: string;
  sessionToken?: string;
  worldSessionToken?: string;
  worldSocketUrl: string;
  mode: RuntimeMode;
  activeZone: RuntimeZoneID;
  lastVenue: RuntimeZoneID;
  settings: RuntimeSettings;
  loadout?: Record<string, string>;
  zoneMedia?: RuntimeZoneMedia[];
  zoneEvents?: RuntimeZoneEvent[];
  returnPoint?: RuntimePoint;
  players?: RuntimePlayer[];
  venueStatus?: RuntimeVenueStatus;
}

export interface RuntimeLoginRequest {
  username: string;
  password: string;
}

export interface RuntimeSignupRequest {
  username: string;
  email: string;
  password: string;
  turnstileToken: string;
  acceptPrivacyPolicy: boolean;
  acceptTerms: boolean;
}

export async function bootstrapSession(input: {
  search: string;
  fetcher?: typeof fetch;
  apiBaseUrl?: string;
}): Promise<RuntimeSession> {
  const params = new URLSearchParams(input.search);
  const handoff = params.get('handoff');
  const mode = (params.get('mode') ?? 'guest') as RuntimeMode;

  if (!handoff) {
    throw new Error('Missing launch handoff');
  }

  const fetcher = input.fetcher ?? fetch;
  const apiBaseUrl = input.apiBaseUrl ?? import.meta.env.VITE_OMNIGAME_API_URL ?? 'http://localhost:8091';
  const response = await fetcher(`${apiBaseUrl}/api/v1/omnigame/session/exchange`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ handoff, mode }),
  });

  if (!response.ok) {
    throw new Error(`Session exchange failed with ${response.status}`);
  }

  const payload = (await response.json()) as Partial<RuntimeSession>;
  return {
    ...payload,
    activeZone: payload.activeZone ?? 'main_stage',
    lastVenue: payload.lastVenue ?? 'main_stage',
    settings: normalizeRuntimeSettings(payload.settings),
    zoneEvents: payload.zoneEvents ?? [],
  } as RuntimeSession;
}

export async function saveLoadout(input: {
  session: RuntimeSession;
  loadout: Record<string, string>;
  fetcher?: typeof fetch;
  apiBaseUrl?: string;
}): Promise<void> {
  if (input.session.mode !== 'account' || !input.session.sessionToken) {
    return;
  }

  const fetcher = input.fetcher ?? fetch;
  const apiBaseUrl = input.apiBaseUrl ?? import.meta.env.VITE_OMNIGAME_API_URL ?? 'http://localhost:8091';
  const response = await fetcher(`${apiBaseUrl}/api/v1/omnigame/profile/omnirave/loadout`, {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${input.session.sessionToken}`,
    },
    body: JSON.stringify(input.loadout),
  });

  if (!response.ok) {
    throw new Error(`Loadout save failed with ${response.status}`);
  }
}

export async function saveReturnPoint(input: {
  session: RuntimeSession;
  point: RuntimePoint;
  fetcher?: typeof fetch;
  apiBaseUrl?: string;
}): Promise<void> {
  if (input.session.mode !== 'account' || !input.session.sessionToken) {
    return;
  }

  const fetcher = input.fetcher ?? fetch;
  const apiBaseUrl = input.apiBaseUrl ?? import.meta.env.VITE_OMNIGAME_API_URL ?? 'http://localhost:8091';
  const response = await fetcher(`${apiBaseUrl}/api/v1/omnigame/profile/omnirave/return-point`, {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${input.session.sessionToken}`,
    },
    body: JSON.stringify(input.point),
  });

  if (!response.ok) {
    throw new Error(`Return point save failed with ${response.status}`);
  }
}

export async function saveRuntimeSettings(input: {
  session: RuntimeSession;
  settings: RuntimeSettings;
  fetcher?: typeof fetch;
  apiBaseUrl?: string;
}): Promise<void> {
  if (input.session.mode !== 'account' || !input.session.sessionToken) {
    return;
  }

  const fetcher = input.fetcher ?? fetch;
  const apiBaseUrl = input.apiBaseUrl ?? import.meta.env.VITE_OMNIGAME_API_URL ?? 'http://localhost:8091';
  const response = await fetcher(`${apiBaseUrl}/api/v1/omnigame/profile/omnirave/settings`, {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${input.session.sessionToken}`,
    },
    body: JSON.stringify(input.settings),
  });

  if (!response.ok) {
    throw new Error(`Runtime settings save failed with ${response.status}`);
  }
}

async function exchangeRuntimeAuth(input: {
  endpoint: 'login' | 'signup' | 'logout';
  session: RuntimeSession;
  payload: Record<string, unknown>;
  fetcher?: typeof fetch;
  apiBaseUrl?: string;
}): Promise<RuntimeSession> {
  const fetcher = input.fetcher ?? fetch;
  const apiBaseUrl = input.apiBaseUrl ?? import.meta.env.VITE_OMNIGAME_API_URL ?? 'http://localhost:8091';
  const response = await fetcher(`${apiBaseUrl}/api/v1/omnigame/runtime/auth/${input.endpoint}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      ...input.payload,
      currentVenue: input.session.activeZone,
      currentLoadout: input.session.loadout ?? {},
      currentSettings: input.session.settings,
    }),
  });

  if (!response.ok) {
    let errorMessage = `Runtime ${input.endpoint} failed with ${response.status}`;
    try {
      const payload = (await response.json()) as { error?: { message?: string } };
      errorMessage = payload.error?.message ?? errorMessage;
    } catch {
      // Response body may be empty or non-JSON; keep the default status-based message.
    }
    throw new Error(errorMessage);
  }

  const payload = (await response.json()) as Partial<RuntimeSession>;
  return {
    ...payload,
    activeZone: payload.activeZone ?? input.session.activeZone,
    lastVenue: payload.lastVenue ?? payload.activeZone ?? input.session.activeZone,
    settings: normalizeRuntimeSettings(payload.settings),
    zoneEvents: payload.zoneEvents ?? [],
  } as RuntimeSession;
}

// What proves the account, as the main app's signInSecret decides it: the
// login key for an account on the login-key scheme, the password only for one
// still on the old scheme. A login-key answer without its settings never falls
// back to the password.
async function accountSecret(input: {
  username: string;
  password: string;
  fetcher: typeof fetch;
  apiBaseUrl: string;
}): Promise<{ password: string } | { loginKey: string }> {
  const response = await input.fetcher(`${input.apiBaseUrl}/api/v1/omnigame/runtime/auth/prelogin`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: input.username }),
  });
  if (!response.ok) {
    throw new Error(`Runtime login failed with ${response.status}`);
  }
  const pre = (await response.json()) as { scheme?: number; kdf_salt?: unknown; kdf_iterations?: unknown };
  if (pre.scheme === 1) {
    return { password: input.password };
  }
  if (pre.scheme !== 2 || typeof pre.kdf_salt !== 'string' || typeof pre.kdf_iterations !== 'number') {
    throw new Error('Runtime login failed: unexpected sign-in settings');
  }
  return { loginKey: await deriveLoginKey(input.password, pre.kdf_salt, pre.kdf_iterations) };
}

export async function runtimeLogin(input: {
  session: RuntimeSession;
  credentials: RuntimeLoginRequest;
  fetcher?: typeof fetch;
  apiBaseUrl?: string;
}): Promise<RuntimeSession> {
  const fetcher = input.fetcher ?? fetch;
  const apiBaseUrl = input.apiBaseUrl ?? import.meta.env.VITE_OMNIGAME_API_URL ?? 'http://localhost:8091';
  const { password, ...credentials } = input.credentials;
  const secret = await accountSecret({ username: credentials.username, password, fetcher, apiBaseUrl });
  return exchangeRuntimeAuth({
    endpoint: 'login',
    session: input.session,
    payload: { ...credentials, ...secret },
    fetcher,
    apiBaseUrl,
  });
}

// A new account signs in with a login key from the start: the server gets the
// key and its settings, never the password.
export async function runtimeSignup(input: {
  session: RuntimeSession;
  signup: RuntimeSignupRequest;
  fetcher?: typeof fetch;
  apiBaseUrl?: string;
}): Promise<RuntimeSession> {
  const { password, ...signup } = input.signup;
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  const kdfSalt = newKdfSalt();
  const loginKey = await deriveLoginKey(password, kdfSalt, DEFAULT_KDF_ITERATIONS);
  return exchangeRuntimeAuth({
    endpoint: 'signup',
    session: input.session,
    payload: { ...signup, loginKey, kdfSalt, kdfIterations: DEFAULT_KDF_ITERATIONS },
    fetcher: input.fetcher,
    apiBaseUrl: input.apiBaseUrl,
  });
}

export async function runtimeLogout(input: {
  session: RuntimeSession;
  fetcher?: typeof fetch;
  apiBaseUrl?: string;
}): Promise<RuntimeSession> {
  return exchangeRuntimeAuth({
    endpoint: 'logout',
    session: input.session,
    payload: {},
    fetcher: input.fetcher,
    apiBaseUrl: input.apiBaseUrl,
  });
}
