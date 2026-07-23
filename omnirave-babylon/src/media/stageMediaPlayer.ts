// Synchronized stage-music player: the SERVER owns the playhead (see
// docs/superpowers/specs/2026-06-01-omnirave-design.md §7), this module just
// keeps the local audio player following it.
//
// Framework-free, no Babylon imports. The audio is SELF-HOSTED: the game
// serves its own audio files (Vite serves public/ at the web root, so a file
// at public/audio/<trackId>.mp3 is reachable at /audio/<trackId>.mp3). There
// is no YouTube / third-party embed.
//
// Like worldSocket.ts injects `webSocketFactory`, the real HTMLAudioElement is
// hidden behind an injected `backendFactory` so this module is testable under
// Vitest with a hand-rolled FakeBackend and never touches the DOM / network.

import type { ZoneMediaState } from '../network/worldSocket';

// The served audio file extension. A single named constant so switching the
// whole setlist to a different container (e.g. .m4a) is a one-line change.
const AUDIO_FILE_EXTENSION = '.mp3';

// Resolves a server-reported trackId to the URL of its self-hosted audio file.
function resolveTrackUrl(trackId: string): string {
  return `/audio/${trackId}${AUDIO_FILE_EXTENSION}`;
}

// If the server-reported playhead and our local playback position drift by
// more than this, snap to the server position. Below this we just let
// playback run: the browser's own audio clock is close enough moment-to-moment
// that reseeking on every ~1s snapshot would audibly stutter the track for no
// audible sync benefit.
const DRIFT_THRESHOLD_SECONDS = 2.5;

export interface StagePlayerBackend {
  load(trackId: string, startSeconds: number): void;
  play(): void;
  pause(): void;
  seek(seconds: number): void;
  getCurrentTime(): number;
  setMuted(muted: boolean): void;
  // Fills `target` with the current byte frequency spectrum (0..255 per bin,
  // low frequencies first). No-op / leaves the caller's zeros in place when no
  // AnalyserNode exists yet (before unlock, or where Web Audio is unavailable).
  getFrequencyData(target: Uint8Array): void;
  dispose(): void;
}

export interface StageMediaPlayerOptions {
  backendFactory?: () => StagePlayerBackend;
}

export interface StageMediaPlayer {
  unlock: () => void;
  applyMedia: (media: ZoneMediaState | null) => void;
  // Fills `target` with the live byte frequency spectrum of the synced track.
  // Fills zeros before unlock, when no track is playing, or where Web Audio is
  // unavailable — always safe, never throws. Because every client plays the
  // same server-synced track, each client's spectrum is ~identical, so the
  // visualizer can be driven purely from this local analysis (no server push).
  getFrequencyData: (target: Uint8Array) => void;
  dispose: () => void;
}

// A backend that does nothing, used when a real HTMLAudioElement can't be
// constructed (non-browser env, blocked audio, etc). Degrading to this instead
// of throwing keeps a broken audio element from taking down the whole runtime
// over background music.
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
    getFrequencyData(target) {
      target.fill(0);
    },
    dispose() {},
  };
}

// The real backend: wraps an HTMLAudioElement pointed at the self-hosted file.
function createAudioBackend(): StagePlayerBackend {
  let audio: HTMLAudioElement;
  try {
    audio = new Audio();
    // Not a UI element; keep it out of layout. It is never appended to the DOM.
    audio.preload = 'auto';
  } catch {
    console.warn('[stageMediaPlayer] HTMLAudioElement unavailable; stage audio disabled.');
    return createNoopBackend();
  }

  const element = audio;
  let playing = false;
  // Pending seek target held until metadata loads: HTMLAudioElement ignores
  // currentTime writes before it knows the track's duration.
  let pendingSeekHandler: (() => void) | null = null;

  // Web Audio analysis tap. The AudioContext is created lazily on the FIRST
  // playback (which only ever happens after the unlock gesture — the player
  // stashes media until unlock), satisfying the autoplay policy that forbids
  // creating an AudioContext before a user gesture. Graph shape:
  //   AudioContext -> MediaElementAudioSourceNode(element) -> Analyser -> destination
  // The analyser sits INLINE (source -> analyser -> destination) so the track
  // still reaches the speakers. We only ever attempt the build once: a
  // MediaElementSource can be created for a given element exactly once, and if
  // Web Audio is unavailable we degrade to silence (zeros) rather than throw.
  let audioContext: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let audioGraphAttempted = false;

  function ensureAudioGraph(): void {
    if (audioGraphAttempted) {
      return;
    }
    audioGraphAttempted = true;
    try {
      const AudioContextCtor =
        typeof window !== 'undefined'
          ? window.AudioContext ??
            (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
          : undefined;
      if (!AudioContextCtor) {
        return;
      }
      const context = new AudioContextCtor();
      const source = context.createMediaElementSource(element);
      const node = context.createAnalyser();
      // 256-point FFT -> 128 frequency bins: enough spectral detail for a
      // reactive visualizer without wasting work no one can see.
      node.fftSize = 256;
      node.smoothingTimeConstant = 0.8;
      source.connect(node);
      node.connect(context.destination);
      audioContext = context;
      analyser = node;
    } catch {
      // No Web Audio (or the element was already tapped): the visualizer just
      // reads zeros. Background music is never worth taking down the runtime.
      audioContext = null;
      analyser = null;
    }
  }

  function clearPendingSeek(): void {
    if (pendingSeekHandler) {
      element.removeEventListener('loadedmetadata', pendingSeekHandler);
      pendingSeekHandler = null;
    }
  }

  function applySeek(seconds: number): void {
    clearPendingSeek();
    // HAVE_METADATA (1) or better means duration is known and currentTime sticks.
    if (element.readyState >= 1) {
      element.currentTime = seconds;
      return;
    }
    const handler = () => {
      element.removeEventListener('loadedmetadata', handler);
      pendingSeekHandler = null;
      element.currentTime = seconds;
    };
    pendingSeekHandler = handler;
    element.addEventListener('loadedmetadata', handler);
  }

  function startPlayback(): void {
    playing = true;
    // First playback runs inside the unlock gesture: safe to build the
    // AudioContext + analyser tap now. A suspended context (some browsers
    // start suspended) is resumed here too; the returned promise is ignored.
    ensureAudioGraph();
    if (audioContext && audioContext.state === 'suspended') {
      const resumeResult = audioContext.resume();
      if (resumeResult && typeof resumeResult.catch === 'function') {
        void resumeResult.catch(() => {});
      }
    }
    // play() may reject under the browser autoplay policy; the Enter-OmniRave
    // gesture unlocks it. Swallow the rejection — do NOT retry-loop. (Some
    // environments return undefined rather than a promise; guard for that.)
    const result = element.play();
    if (result && typeof result.catch === 'function') {
      void result.catch(() => {});
    }
  }

  return {
    load(trackId, startSeconds) {
      element.src = resolveTrackUrl(trackId);
      applySeek(startSeconds);
      if (playing) {
        startPlayback();
      }
    },
    play() {
      startPlayback();
    },
    pause() {
      playing = false;
      element.pause();
    },
    seek(seconds) {
      applySeek(seconds);
    },
    getCurrentTime() {
      return element.currentTime;
    },
    setMuted(muted) {
      element.muted = muted;
    },
    getFrequencyData(target) {
      if (analyser) {
        analyser.getByteFrequencyData(target as Uint8Array<ArrayBuffer>);
      } else {
        target.fill(0);
      }
    },
    dispose() {
      clearPendingSeek();
      element.pause();
      element.removeAttribute('src');
      analyser = null;
      if (audioContext) {
        const closeResult = audioContext.close();
        if (closeResult && typeof closeResult.catch === 'function') {
          void closeResult.catch(() => {});
        }
        audioContext = null;
      }
    },
  };
}

export function createStageMediaPlayer(options: StageMediaPlayerOptions = {}): StageMediaPlayer {
  const createBackend = options.backendFactory ?? createAudioBackend;

  let backend: StagePlayerBackend | undefined;
  let unlocked = false;
  let disposed = false;

  // The desired media, tracked independently of the backend so applyMedia()
  // calls before unlock() are stashed and applied once unlocked instead of
  // being dropped.
  let desiredMedia: ZoneMediaState | null = null;
  let currentTrackId: string | undefined;
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
      media.trackId !== currentTrackId || media.playlistIndex !== currentPlaylistIndex;

    if (isNewTrack) {
      currentTrackId = media.trackId;
      currentPlaylistIndex = media.playlistIndex;
      activeBackend.load(media.trackId, media.playheadSeconds);
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
      currentTrackId = undefined;
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

  function getFrequencyData(target: Uint8Array): void {
    if (backend) {
      backend.getFrequencyData(target);
    } else {
      // No backend yet (before unlock): report a silent spectrum.
      target.fill(0);
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
    getFrequencyData,
    dispose,
  };
}
