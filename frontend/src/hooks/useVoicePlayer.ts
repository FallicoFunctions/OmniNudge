import { useState, useRef, useCallback, useEffect } from 'react';
import { authenticatedFetch } from '../services/authSession';

// Global singleton — only one voice message plays at a time.
const globalAudioRef: { current: HTMLAudioElement | null; stopCallback: (() => void) | null } = {
  current: null,
  stopCallback: null,
};

export type PlaybackState = 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error';

export interface UseVoicePlayerReturn {
  state: PlaybackState;
  currentTime: number;
  duration: number;
  progress: number;
  playbackRate: number;
  error: string | null;
  play: (url: string) => void;
  pause: () => void;
  seek: (progress: number) => void;
  setPlaybackRate: (rate: number) => void;
}

export function useVoicePlayer(): UseVoicePlayerReturn {
  const [state, setState] = useState<PlaybackState>('idle');
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRateState] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastUpdateRef = useRef(0);
  const mountedRef = useRef(true);
  const playRequestRef = useRef(0);

  const releaseAudio = useCallback((audio: HTMLAudioElement) => {
    const source = audio.src;
    audio.pause();
    audio.src = '';
    if (source.startsWith('blob:')) URL.revokeObjectURL(source);
  }, []);

  const stopCurrent = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      releaseAudio(audio);
      audioRef.current = null;
    }
    if (mountedRef.current) {
      setState('idle');
      setCurrentTime(0);
      setDuration(0);
    }
  }, [releaseAudio]);

  // Keep a stable ref so the cleanup effect can compare without causing re-runs
  const stopCurrentRef = useRef(stopCurrent);

  useEffect(() => {
    stopCurrentRef.current = stopCurrent;
  }, [stopCurrent]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // Stop and release audio on unmount
      const audio = audioRef.current;
      if (audio) {
        releaseAudio(audio);
        audioRef.current = null;
      }
      if (globalAudioRef.stopCallback === stopCurrentRef.current) {
        globalAudioRef.stopCallback = null;
      }
    };
  }, [releaseAudio]);

  const play = useCallback(
    (url: string) => {
      const requestID = ++playRequestRef.current;
      // Stop any currently playing audio globally.
      if (globalAudioRef.stopCallback) {
        globalAudioRef.stopCallback();
      }

      if (mountedRef.current) {
        setState('loading');
        setError(null);
        setCurrentTime(0);
      }

      void (async () => {
        let playableURL = url;
        try {
          // Playback routes are authenticated endpoints. Fetch the bytes with
          // the session cookie, then hand the browser an ephemeral blob URL;
          // HTMLAudioElement cannot attach credentials to an API request.
          if (url.includes('/api/v1/voice/')) {
            const response = await authenticatedFetch(url);
            if (!response.ok) throw new Error(`voice playback failed (${response.status})`);
            playableURL = URL.createObjectURL(await response.blob());
          }
          if (requestID !== playRequestRef.current || !mountedRef.current) {
            if (playableURL.startsWith('blob:')) URL.revokeObjectURL(playableURL);
            return;
          }
        } catch {
          if (requestID === playRequestRef.current && mountedRef.current) {
            setError('Could not play voice message.');
            setState('error');
          }
          return;
        }

        const audio = new Audio(playableURL);
        audioRef.current = audio;
        globalAudioRef.current = audio;
        globalAudioRef.stopCallback = stopCurrentRef.current;
        audio.playbackRate = playbackRate;

        audio.addEventListener('loadedmetadata', () => {
          if (mountedRef.current) setDuration(audio.duration);
        });

        audio.addEventListener('timeupdate', () => {
          const now = Date.now();
          if (now - lastUpdateRef.current < 250) return;
          lastUpdateRef.current = now;
          if (mountedRef.current) setCurrentTime(audio.currentTime);
        });

        audio.addEventListener('playing', () => {
          if (mountedRef.current) setState('playing');
        });

        audio.addEventListener('pause', () => {
          if (!audio.ended && mountedRef.current) setState('paused');
        });

        audio.addEventListener('ended', () => {
          if (mountedRef.current) {
            setState('ended');
            setCurrentTime(audio.duration);
          }
          globalAudioRef.stopCallback = null;
          releaseAudio(audio);
        });

        audio.addEventListener('error', () => {
          if (mountedRef.current) {
            setError('Could not play voice message.');
            setState('error');
          }
          globalAudioRef.stopCallback = null;
        });

        audio.play().catch(() => {
          if (mountedRef.current) {
            setError('Could not play voice message.');
            setState('error');
          }
        });
      })();
    },
    [playbackRate, releaseAudio]
  );

  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  const seek = useCallback((progress: number) => {
    const audio = audioRef.current;
    if (audio && audio.duration) {
      audio.currentTime = progress * audio.duration;
      if (mountedRef.current) setCurrentTime(audio.currentTime);
    }
  }, []);

  const setPlaybackRate = useCallback((rate: number) => {
    setPlaybackRateState(rate);
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
    }
  }, []);

  const progress = duration > 0 ? currentTime / duration : 0;

  return {
    state,
    currentTime,
    duration,
    progress,
    playbackRate,
    error,
    play,
    pause,
    seek,
    setPlaybackRate,
  };
}
