export type OmniGameSlug = 'omnirave';

export type OmniGameLaunchMode = 'account' | 'guest';

export interface GameGalleryEntry {
  titleKey: string;
  captionKey: string;
}

export interface GameCatalogEntry {
  slug: OmniGameSlug;
  name: string;
  summaryKey: string;
  runtimeUrl: string;
  heroKey: string;
  descriptionKeys: string[];
  highlightKeys: string[];
  gallery: GameGalleryEntry[];
}

export interface OmniGameLaunchRequest {
  mode: OmniGameLaunchMode;
}

export interface OmniGameLaunchResponse {
  launch_url: string;
}
