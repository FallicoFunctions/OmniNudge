export type OmniGameSlug = 'omnirave';

export type OmniGameLaunchMode = 'account' | 'guest';

export interface GameCatalogEntry {
  slug: OmniGameSlug;
  name: string;
  summary: string;
  runtimeUrl: string;
  hero: string;
  supportsGuestLaunch: boolean;
  signedInDescription: string;
  guestDescription: string;
}

export interface OmniGameLaunchRequest {
  mode: OmniGameLaunchMode;
}

export interface OmniGameLaunchResponse {
  launch_url: string;
}
