import { sessionHeaders } from './authSession';
import type {
  GameCatalogEntry,
  OmniGameLaunchMode,
  OmniGameLaunchResponse,
} from '../types/omnigame';

const OMNIRAVE_RUNTIME_URL =
  import.meta.env.VITE_OMNIRAVE_RUNTIME_URL || 'http://localhost:4173/omnirave';
const OMNIGAME_API_URL = import.meta.env.VITE_OMNIGAME_API_URL || 'http://localhost:8091/api/v1';

const gameCatalog: GameCatalogEntry[] = [
  {
    slug: 'omnirave',
    name: 'OmniRave',
    summaryKey: 'games.omnirave.summary',
    runtimeUrl: OMNIRAVE_RUNTIME_URL,
    heroKey: 'games.omnirave.hero',
    descriptionKeys: ['games.omnirave.description.0', 'games.omnirave.description.1'],
    highlightKeys: [
      'games.omnirave.highlights.0',
      'games.omnirave.highlights.1',
      'games.omnirave.highlights.2',
    ],
    gallery: [
      {
        titleKey: 'games.omnirave.gallery.0.title',
        captionKey: 'games.omnirave.gallery.0.caption',
      },
      {
        titleKey: 'games.omnirave.gallery.1.title',
        captionKey: 'games.omnirave.gallery.1.caption',
      },
      {
        titleKey: 'games.omnirave.gallery.2.title',
        captionKey: 'games.omnirave.gallery.2.caption',
      },
    ],
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
    // Site auth moved to httpOnly cookies, so there is no token to read and
    // attach here. The cookie rides along instead; OmniGame is a different port
    // on the same host, which is same-site for cookie purposes.
    //
    // The CSRF header is not optional. AuthOptional refuses to attach a cookie
    // identity to a state-changing request without it and then continues
    // anonymously rather than failing, so omitting it does not raise an error:
    // it quietly turns an account launch into a guest one.
    const headers = sessionHeaders('POST');
    headers.set('Content-Type', 'application/json');

    const response = await fetch(`${OMNIGAME_API_URL}/omnigame/launch/omnirave`, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify({ mode }),
    });

    if (!response.ok) {
      throw new Error(`OmniGame launch failed with ${response.status}`);
    }

    return (await response.json()) as OmniGameLaunchResponse;
  },
};
