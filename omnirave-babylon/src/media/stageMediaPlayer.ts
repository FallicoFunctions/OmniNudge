// Synchronized stage-music player: the SERVER owns the playhead (see
// docs/superpowers/specs/2026-06-01-omnirave-design.md §7), this module just
// keeps the local YouTube IFrame player following it.
//
// Framework-free, no Babylon imports. AUDIO-FIRST: this only manages an
// (effectively hidden) YouTube IFrame player. The on-stage video SCREEN
// rendering is a separate future slice.
//
// Like worldSocket.ts injects `webSocketFactory`, the real YouTube player is
// hidden behind an injected `backendFactory` so this module is testable
// under Vitest with a hand-rolled FakeBackend and never touches real
// YouTube / the browser network.

import type { ZoneMediaState } from '../network/worldSocket';

// Minimal ambient shape of the real YouTube IFrame API — just enough of the
// surface this module uses. There's no official @types package; this is
// intentionally narrow rather than pulling in a full third-party typing.
declare global {
  namespace YT {
    interface Player {
      destroy(): void;
      getCurrentTime(): number;
      loadVideoById(videoId: string, startSeconds?: number): void;
      mute(): void;
      pauseVideo(): void;
      playVideo(): void;
      seekTo(seconds: number, allowSeekAhead: boolean): void;
      unMute(): void;
    }

    const Player: {
      new (
        element: HTMLElement,
        options: {
          height: string;
          width: string;
          events?: { onReady?: () => void };
        },
      ): Player;
    };
  }

  interface Window {
    YT?: typeof YT;
    onYouTubeIframeAPIReady?: () => void;
  }
}

// If the server-reported playhead and our local playback position drift by
// more than this, snap to the server position. Below this we just let
// playback run: YouTube's own clock is close enough moment-to-moment that
// reseeking on every ~1s snapshot would audibly stutter the track for no
// audible sync benefit.
const DRIFT_THRESHOLD_SECONDS = 2.5;

export interface StagePlayerBackend {
  load(videoId: string, startSeconds: number): void;
  play(): void;
  pause(): void;
  seek(seconds: number): void;
  getCurrentTime(): number;
  setMuted(muted: boolean): void;
  dispose(): void;
}

export interface StageMediaPlayerOptions {
  backendFactory?: () => StagePlayerBackend;
}

export interface StageMediaPlayer {
  unlock: () => void;
  applyMedia: (media: ZoneMediaState | null) => void;
  dispose: () => void;
}

// A backend that does nothing, used when the real YouTube API can't be
// reached (blocked script, missing global, etc). Degrading to this instead
// of throwing keeps a blocked video player from taking down the whole
// runtime over background music.
function createNoopBackend(): StagePlayerBackend {
  return {
    load() {},
    play() {},
    pause() {},
    seek() {},
    getCurrentTime() {
      return 0;
    },
    setMuted() {},
    dispose() {},
  };
}

type YoutubeApi = typeof YT | undefined;

let youtubeApiPromise: Promise<YoutubeApi> | null = null;

// Loads the YouTube IFrame API script exactly once per page, however many
// stage players get created/disposed across it. Never rejects: a blocked or
// failed script load resolves to `undefined` so callers can fall back to the
// no-op backend instead of throwing.
function loadYoutubeApi(): Promise<YoutubeApi> {
  if (youtubeApiPromise) {
    return youtubeApiPromise;
  }

  youtubeApiPromise = new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve(undefined);
      return;
    }
    if (window.YT?.Player) {
      resolve(window.YT);
      return;
    }

    const previousReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      resolve(window.YT);
    };

    const existing = document.querySelector<HTMLScriptElement>('script[data-omnirave-youtube-api]');
    if (existing) {
      return;
    }

    const script = document.createElement('script');
    script.dataset.omniraveYoutubeApi = 'true';
    script.src = 'https://www.youtube.com/iframe_api';
    script.onerror = () => resolve(undefined);
    document.head.appendChild(script);
  });

  return youtubeApiPromise;
}

function createYoutubeBackend(): StagePlayerBackend {
  const container = document.createElement('div');
  container.dataset.testid = 'stage-media-player';
  // Audio-first: the iframe is present (YouTube requires a rendered target)
  // but visually collapsed. The on-stage video screen is a future slice.
  container.style.position = 'fixed';
  container.style.width = '1px';
  container.style.height = '1px';
  container.style.overflow = 'hidden';
  container.style.opacity = '0';
  container.style.pointerEvents = 'none';
  document.body.appendChild(container);

  let player: YT.Player | undefined;
  let disposed = false;
  let pendingVideoId: string | undefined;
  let pendingStartSeconds = 0;

  void loadYoutubeApi().then((youtubeApi) => {
    if (disposed) return;
    if (!youtubeApi?.Player) {
      console.warn('[stageMediaPlayer] YouTube IFrame API unavailable; stage audio disabled.');
      container.remove();
      return;
    }

    player = new youtubeApi.Player(container, {
      height: '1',
      width: '1',
      events: {
        onReady: () => {
          if (disposed) return;
          if (pendingVideoId) {
            player?.loadVideoById(pendingVideoId, pendingStartSeconds);
          }
        },
      },
    });
  });

  return {
    load(videoId, startSeconds) {
      pendingVideoId = videoId;
      pendingStartSeconds = startSeconds;
      if (player) {
        player.loadVideoById(videoId, startSeconds);
      }
    },
    play() {
      player?.playVideo();
    },
    pause() {
      player?.pauseVideo();
    },
    seek(seconds) {
      player?.seekTo(seconds, true);
    },
    getCurrentTime() {
      return player?.getCurrentTime?.() ?? 0;
    },
    setMuted(muted) {
      if (!player) return;
      if (muted) {
        player.mute();
      } else {
        player.unMute();
      }
    },
    dispose() {
      disposed = true;
      try {
        player?.destroy();
      } catch {
        // Best-effort teardown; the container removal below is what matters.
      }
      container.remove();
    },
  };
}

export function createStageMediaPlayer(options: StageMediaPlayerOptions = {}): StageMediaPlayer {
  const createBackend = options.backendFactory ?? createYoutubeBackend;

  let backend: StagePlayerBackend | undefined;
  let unlocked = false;
  let disposed = false;

  // The desired media, tracked independently of the backend so applyMedia()
  // calls before unlock() are stashed and applied once unlocked instead of
  // being dropped.
  let desiredMedia: ZoneMediaState | null = null;
  let currentVideoId: string | undefined;
  let currentPlaylistIndex: number | undefined;

  function ensureBackend(): StagePlayerBackend {
    if (!backend) {
      backend = createBackend();
    }
    return backend;
  }

  function playMedia(media: ZoneMediaState): void {
    const activeBackend = ensureBackend();
    const isNewTrack =
      media.videoId !== currentVideoId || media.playlistIndex !== currentPlaylistIndex;

    if (isNewTrack) {
      currentVideoId = media.videoId;
      currentPlaylistIndex = media.playlistIndex;
      activeBackend.load(media.videoId, media.playheadSeconds);
      activeBackend.setMuted(false);
      activeBackend.play();
      return;
    }

    // Same track: drift-correct only, don't restart/reseek on every
    // snapshot or playback will audibly stutter.
    const drift = Math.abs(activeBackend.getCurrentTime() - media.playheadSeconds);
    if (drift > DRIFT_THRESHOLD_SECONDS) {
      activeBackend.seek(media.playheadSeconds);
    }
  }

  function applyMedia(media: ZoneMediaState | null): void {
    if (disposed) return;
    desiredMedia = media;

    if (!unlocked) {
      // Stashed; will be applied by unlock().
      return;
    }

    if (!media) {
      currentVideoId = undefined;
      currentPlaylistIndex = undefined;
      backend?.pause();
      return;
    }

    playMedia(media);
  }

  function unlock(): void {
    if (disposed || unlocked) return;
    unlocked = true;
    ensureBackend();
    if (desiredMedia) {
      playMedia(desiredMedia);
    }
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    backend?.dispose();
    backend = undefined;
  }

  return {
    unlock,
    applyMedia,
    dispose,
  };
}
