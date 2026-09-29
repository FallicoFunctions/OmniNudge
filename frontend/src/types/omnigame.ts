export type OmniGameSlug = 'omnirave';

export type OmniGameLaunchMode = 'account' | 'guest';

export interface GameCatalogEntry {
  slug: OmniGameSlug;
  name: string;
  summaryKey: string;
  runtimeUrl: string;
  heroKey: string;
}

export interface OmniGameLaunchRequest {
  mode: OmniGameLaunchMode;
}

export interface OmniGameLaunchResponse {
  launch_url: string;
}
