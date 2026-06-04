export type RuntimeMode = 'account' | 'guest';
export type RuntimeZoneID = 'main_stage' | 'underground' | 'plurr_partay';

import { normalizeRuntimeSettings, type RuntimeSettings } from './settings';

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
  payload: RuntimeLoginRequest | RuntimeSignupRequest | Record<string, never>;
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
  } as RuntimeSession;
}

export async function runtimeLogin(input: {
  session: RuntimeSession;
  credentials: RuntimeLoginRequest;
  fetcher?: typeof fetch;
  apiBaseUrl?: string;
}): Promise<RuntimeSession> {
  return exchangeRuntimeAuth({
    endpoint: 'login',
    session: input.session,
    payload: input.credentials,
    fetcher: input.fetcher,
    apiBaseUrl: input.apiBaseUrl,
  });
}

export async function runtimeSignup(input: {
  session: RuntimeSession;
  signup: RuntimeSignupRequest;
  fetcher?: typeof fetch;
  apiBaseUrl?: string;
}): Promise<RuntimeSession> {
  return exchangeRuntimeAuth({
    endpoint: 'signup',
    session: input.session,
    payload: input.signup,
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
