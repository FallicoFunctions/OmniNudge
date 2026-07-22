import type Hls from 'hls.js';

export type HlsInstance = Hls;
export type HlsConstructor = typeof Hls;

let hlsLoaderPromise: Promise<HlsConstructor | null> | null = null;

export const loadHls = async (): Promise<HlsConstructor | null> => {
  if (typeof window === 'undefined') {
    return null;
  }
  if (hlsLoaderPromise) {
    return hlsLoaderPromise;
  }

  hlsLoaderPromise = import('hls.js').then(({ default: HlsPlayer }) => HlsPlayer).catch(() => null);

  return hlsLoaderPromise;
};
