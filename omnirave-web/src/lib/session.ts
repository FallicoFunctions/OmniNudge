export type RuntimeMode = 'account' | 'guest';
export type RuntimeZoneID = 'main_stage' | 'underground' | 'plurr_partay';

export interface RuntimePoint {
  x: number;
  y: number;
  z: number;
}

export interface RuntimePlayer {
  id: string;
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

export interface RuntimeSession {
  playerId: string;
  playerName: string;
  sessionToken?: string;
  worldSessionToken?: string;
  worldSocketUrl: string;
  mode: RuntimeMode;
  activeZone: RuntimeZoneID;
  loadout?: Record<string, string>;
  zoneMedia?: RuntimeZoneMedia[];
  returnPoint?: RuntimePoint;
  players?: RuntimePlayer[];
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

  return (await response.json()) as RuntimeSession;
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
