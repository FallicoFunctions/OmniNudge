import { useEffect, useRef, forwardRef } from 'react';
import { loadHls } from '../../utils/hlsLoader';

interface HlsVideoProps extends React.VideoHTMLAttributes<HTMLVideoElement> {
  src: string;
}

/**
 * Video component with HLS.js support for non-Safari browsers.
 * Safari supports HLS natively, other browsers need HLS.js library.
 * This allows Reddit videos (which use HLS streaming) to play with audio on all browsers.
 */
export const HlsVideo = forwardRef<HTMLVideoElement, HlsVideoProps>(function HlsVideo({ src, ...props }, ref) {
  const internalRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<{ destroy: () => void } | null>(null);

  // Merge internal ref with forwarded ref
  const setRefs = (el: HTMLVideoElement | null) => {
    internalRef.current = el;
    if (typeof ref === 'function') {
      ref(el);
    } else if (ref) {
      ref.current = el;
    }
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

  useEffect(() => {
    const videoEl = internalRef.current;
    if (!videoEl || !isHlsUrl || canNativeHls) return;

    // Load HLS.js for non-Safari browsers with HLS URLs
    let mounted = true;
    (async () => {
      try {
        const Hls = await loadHls();
        if (!mounted || !Hls?.isSupported || !Hls.isSupported()) return;

        const hls = new Hls();
        hls.loadSource(src);
        hls.attachMedia(videoEl);
        hlsRef.current = hls;
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
  }, [src, isHlsUrl, canNativeHls]);

  return <video ref={setRefs} {...props} src={canNativeHls || !isHlsUrl ? src : undefined} />;
});
