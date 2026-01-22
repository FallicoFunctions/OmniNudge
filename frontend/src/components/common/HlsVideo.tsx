import { useEffect, useRef, forwardRef, useImperativeHandle, useCallback } from 'react';
import { loadHls, type HlsInstance } from '../../utils/hlsLoader';

interface HlsVideoProps extends React.VideoHTMLAttributes<HTMLVideoElement> {
  src: string;
  autoStartLoad?: boolean;
  maxBufferLength?: number;
}

export interface HlsVideoHandle {
  video: HTMLVideoElement | null;
  startLoad: (startPosition?: number) => void;
  stopLoad: () => void;
}

/**
 * Video component with HLS.js support for non-Safari browsers.
 * Safari supports HLS natively, other browsers need HLS.js library.
 * This allows Reddit videos (which use HLS streaming) to play with audio on all browsers.
 */
export const HlsVideo = forwardRef<HlsVideoHandle, HlsVideoProps>(function HlsVideo(
  { src, autoStartLoad = true, maxBufferLength, ...props },
  ref
) {
  const internalRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<HlsInstance | null>(null);
  const pendingStartLoadRef = useRef<number | null>(null);

  // Merge internal ref with forwarded ref
  const setRefs = (el: HTMLVideoElement | null) => {
    internalRef.current = el;
  };

  // Detect if browser supports native HLS (Safari)
  const canNativeHls =
    typeof document !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    navigator.vendor === 'Apple Computer, Inc.' &&
    /Safari/.test(navigator.userAgent) &&
    !/Chrome|Chromium|Edg|OPR|Firefox|Android/i.test(navigator.userAgent) &&
    Boolean(document.createElement('video').canPlayType('application/vnd.apple.mpegurl'));

  const isHlsUrl = src.includes('.m3u8') || src.includes('/HLSPlaylist.m3u8');

  const startLoad = useCallback((startPosition = -1) => {
    if (!isHlsUrl || canNativeHls) {
      return;
    }
    if (hlsRef.current) {
      hlsRef.current.startLoad?.(startPosition);
      pendingStartLoadRef.current = null;
    } else {
      pendingStartLoadRef.current = startPosition;
    }
  }, [isHlsUrl, canNativeHls]);

  const stopLoad = useCallback(() => {
    if (hlsRef.current) {
      hlsRef.current.stopLoad?.();
    }
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      get video() {
        return internalRef.current;
      },
      startLoad,
      stopLoad,
    }),
    [startLoad, stopLoad]
  );

  useEffect(() => {
    const videoEl = internalRef.current;
    if (!videoEl || !isHlsUrl || canNativeHls) return;

    // Load HLS.js for non-Safari browsers with HLS URLs
    let mounted = true;
    (async () => {
      try {
        const Hls = await loadHls();
        if (!mounted || !Hls?.isSupported || !Hls.isSupported()) return;

        const hls = new Hls({
          autoStartLoad,
          ...(typeof maxBufferLength === 'number' ? { maxBufferLength } : {}),
        });
        hls.loadSource(src);
        hls.attachMedia(videoEl);
        hlsRef.current = hls;
        if (pendingStartLoadRef.current !== null) {
          hls.startLoad?.(pendingStartLoadRef.current);
          pendingStartLoadRef.current = null;
        }
      } catch (err) {
        console.error('Failed to load HLS player', err);
      }
    })();

    return () => {
      mounted = false;
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [src, isHlsUrl, canNativeHls, autoStartLoad, maxBufferLength]);

  return <video ref={setRefs} {...props} src={canNativeHls || !isHlsUrl ? src : undefined} />;
});
