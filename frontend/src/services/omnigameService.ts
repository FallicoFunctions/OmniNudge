import { getStoredAuthToken } from '../lib/api';
import type { GameCatalogEntry, OmniGameLaunchMode, OmniGameLaunchResponse } from '../types/omnigame';

const OMNIRAVE_RUNTIME_URL = import.meta.env.VITE_OMNIRAVE_RUNTIME_URL || 'http://localhost:4173/omnirave';
const OMNIGAME_API_URL = import.meta.env.VITE_OMNIGAME_API_URL || 'http://localhost:8091/api/v1';

const gameCatalog: GameCatalogEntry[] = [
  {
    slug: 'omnirave',
    name: 'OmniRave',
    summary:
      'A shared multiplayer browser rave with one authoritative world, three synced music zones, and explicit guest or signed-in launch flows.',
    runtimeUrl: OMNIRAVE_RUNTIME_URL,
    hero: 'One world. Three stages. Shared playheads.',
    supportsGuestLaunch: true,
    signedInDescription: 'Launch with your OmniNudge identity and keep your loadout plus saved return point.',
    guestDescription: 'Launch instantly as a guest with full access but no saved profile, loadout, or return point.',
  },
];

export const omnigameService = {
  getCatalog(): GameCatalogEntry[] {
    return gameCatalog;
  },

  getGame(slug: GameCatalogEntry['slug']): GameCatalogEntry | undefined {
    return gameCatalog.find((entry) => entry.slug === slug);
  },

  async createOmniRaveLaunch(mode: OmniGameLaunchMode): Promise<OmniGameLaunchResponse> {
    const token = getStoredAuthToken();
    const response = await fetch(`${OMNIGAME_API_URL}/omnigame/launch/omnirave`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ mode }),
    });

    if (!response.ok) {
      throw new Error(`OmniGame launch failed with ${response.status}`);
    }

    return (await response.json()) as OmniGameLaunchResponse;
  },
};
