export interface HlsInstance {
  loadSource: (url: string) => void;
  attachMedia: (media: HTMLMediaElement) => void;
  destroy: () => void;
  startLoad?: (startPosition?: number) => void;
  stopLoad?: () => void;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
}

export interface HlsConfig {
  autoStartLoad?: boolean;
  maxBufferLength?: number;
}

export interface HlsConstructor {
  new (config?: HlsConfig): HlsInstance;
  isSupported: () => boolean;
}

const HLS_CDN_URL = 'https://cdn.jsdelivr.net/npm/hls.js@1.6.15/dist/hls.min.js';
const HLS_SCRIPT_ID = 'hls-js-cdn';

let hlsLoaderPromise: Promise<HlsConstructor | null> | null = null;

const getGlobalHls = () => {
  if (typeof window === 'undefined') {
    return null;
  }
  return (window as { Hls?: HlsConstructor }).Hls ?? null;
};

export const loadHls = async (): Promise<HlsConstructor | null> => {
  const existing = getGlobalHls();
  if (existing) {
    return existing;
  }
  if (typeof document === 'undefined') {
    return null;
  }
  if (hlsLoaderPromise) {
    return hlsLoaderPromise;
  }

  hlsLoaderPromise = new Promise((resolve) => {
    const script = document.getElementById(HLS_SCRIPT_ID) as HTMLScriptElement | null;
    if (script) {
      const onLoad = () => resolve(getGlobalHls());
      const onError = () => resolve(null);
      script.addEventListener('load', onLoad, { once: true });
      script.addEventListener('error', onError, { once: true });
      return;
    }

    const nextScript = document.createElement('script');
    nextScript.id = HLS_SCRIPT_ID;
    nextScript.src = HLS_CDN_URL;
    nextScript.async = true;
    nextScript.onload = () => resolve(getGlobalHls());
    nextScript.onerror = () => resolve(null);
    document.head.appendChild(nextScript);
  });

  return hlsLoaderPromise;
};
