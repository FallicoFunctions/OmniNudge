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
import { publicUrl } from '../app/publicUrl';
import type { StageBeat, TrackBeats } from './trackBeats';
import type { TrackSpectrum } from './trackSpectrum';

// The served audio file extension. A single named constant so switching the
// whole setlist to a different container (e.g. .m4a) is a one-line change.
const AUDIO_FILE_EXTENSION = '.mp3';

// Resolves a server-reported trackId to the URL of its self-hosted audio file.
function resolveTrackUrl(trackId: string): string {
  return publicUrl(`/audio/${trackId}${AUDIO_FILE_EXTENSION}`);
}

// Every player must hear the same moment of the track at the same time.
// The player compares its audio position with the server's playhead, moved
// forward to "now" on the server's clock (see serverClock.ts). When it is
// more than SEEK_THRESHOLD off on SEEK_AFTER_READINGS readings in a row, it
// seeks. A seek stalls while the new part downloads, so the player learns
// that stall and seeks that far ahead the next time.
//
// It never changes the playback speed. Small speed changes (up to 3%) kept
// the players within a few milliseconds, but Safari made a short gap in the
// sound at each change, and the larger ones could be heard as the music
// speeding up. One reading over the threshold is not enough to seek, so a
// single late or jittery position reading does not cut the music.
const SEEK_THRESHOLD_SECONDS = 0.3;
const SEEK_AFTER_READINGS = 2;
const MAX_SEEK_LEAD_SECONDS = 3;
// The lights see a bass hit this long before the player hears it, so their
// brightness (which takes about this long to rise) peaks on the hit.
const BEAT_LEAD_SECONDS = 0.04;
// A longer step than this between two beat readings is a seek or a stalled
// tab, not playback; the hits in between are not replayed.
const MAX_BEAT_STEP_SECONDS = 0.5;

export interface StagePlayerBackend {
  load(trackId: string, startSeconds: number): void;
  play(): void;
  pause(): void;
  seek(seconds: number): void;
  getCurrentTime(): number;
  // Track length in seconds (0 when unknown, e.g. before metadata loads).
  getDuration(): number;
  // Whether playback is currently paused.
  isPaused(): boolean;
  // True when playback runs without a stall: not seeking, and enough audio
  // is downloaded to continue.
  isReady(): boolean;
  // Seconds from the decoded position to the speakers (0 when unknown).
  outputLatencySeconds(): number;
  setMuted(muted: boolean): void;
  // Fills `target` with the current byte frequency spectrum (0..255 per bin,
  // low frequencies first). No-op / leaves the caller's zeros in place when no
  // AnalyserNode exists yet (before unlock, or where Web Audio is unavailable).
  getFrequencyData(target: Uint8Array): void;
  dispose(): void;
}

export interface StageMediaPlayerOptions {
  backendFactory?: () => StagePlayerBackend;
  // The world server's clock. Without it (before the first clock ping), the
  // player counts from the time each playhead arrived.
  serverClock?: { now(): number | undefined };
  // Precomputed spectrum of each track. The lights read it at the position
  // this player hears, so they do not depend on this tab's audio output.
  spectrum?: TrackSpectrum;
  // The hits of each track, found ahead of time (see trackBeats.ts).
  beats?: TrackBeats;
  // Local time in milliseconds (tests replace it).
  now?: () => number;
}

export interface StageMediaPlayer {
  // Starts playback of the synced track. Safe to call before any user gesture:
  // if the browser blocks the attempt, a later call (from a gesture) retries at
  // the server's latest playhead.
  unlock: () => void;
  // True while the track is actually playing (the browser allowed it).
  isAudible: () => boolean;
  applyMedia: (media: ZoneMediaState | null) => void;
  // Fills `target` with the byte frequency spectrum of the synced track at the
  // moment this player hears. It reads the track's precomputed spectrum, so
  // every player's lights show the same thing for the same moment of the
  // music, also when this tab is muted or blocked. Without that data it falls
  // back to the live analysis of this tab's audio. Never throws.
  getFrequencyData: (target: Uint8Array) => void;
  // Fills `out` with the hits the player heard since the previous call. False
  // when the track has no beat list (or it is not downloaded yet): the lights
  // then detect hits themselves. One reader: each call moves the window on.
  readBeat: (out: StageBeat) => boolean;
  // Dev control surface (used by the debug-only audio scrubber). All safe
  // no-ops before unlock, when there is no backend yet.
  getCurrentTime: () => number;
  getDuration: () => number;
  isPaused: () => boolean;
  play: () => void;
  pause: () => void;
  seekTo: (seconds: number) => void;
  // While manual override is active, applyMedia() is a full no-op (it only
  // stashes desiredMedia): no auto-switch, no drift-correction. This lets a dev
  // scrub/pause stick instead of being yanked back by the server playhead.
  setManualOverride: (active: boolean) => void;
  isManualOverride: () => boolean;
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
    getDuration() {
      return 0;
    },
    isPaused() {
      return true;
    },
    isReady() {
      return false;
    },
    outputLatencySeconds() {
      return 0;
    },
    setMuted() {},
    getFrequencyData(target) {
      target.fill(0);
    },
    dispose() {},
  };
}

// A launch from omninudge.com's Play button hands over an audio element and an
// AudioContext it started inside that click (see the frontend's
// omniraveInPageLaunch.ts). Safari lets those play later without another
// click; a new element or context would stay silent until the player clicks.
interface PrimedGameAudio {
  element: HTMLAudioElement;
  context?: AudioContext;
}

function takePrimedAudio(): PrimedGameAudio | undefined {
  if (typeof window === 'undefined') return undefined;
  const holder = window as { __omniravePrimedAudio?: PrimedGameAudio };
  const primed = holder.__omniravePrimedAudio;
  delete holder.__omniravePrimedAudio;
  return primed;
}

// The real backend: wraps an HTMLAudioElement pointed at the self-hosted file.
function createAudioBackend(): StagePlayerBackend {
  const primed = takePrimedAudio();
  let audio: HTMLAudioElement;
  try {
    audio = primed?.element ?? new Audio();
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
  // playback attempt. That attempt may come before any user gesture; the
  // context then starts suspended and the gesture's retry resumes it. Graph
  // shape:
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
      const context = primed?.context ?? new AudioContextCtor();
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
    // Build the AudioContext + analyser tap on the first attempt. A context
    // created before a user gesture starts suspended; every attempt resumes
    // it, and the attempt made from a gesture succeeds. The promise is ignored.
    ensureAudioGraph();
    if (audioContext && audioContext.state === 'suspended') {
      const resumeResult = audioContext.resume();
      if (resumeResult && typeof resumeResult.catch === 'function') {
        void resumeResult.catch(() => {});
      }
    }
    // play() may reject under the browser autoplay policy; the player's first
    // click, tap or key press retries it. Swallow the rejection — do NOT
    // retry-loop. (Some
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
    getDuration() {
      // HTMLAudioElement.duration is NaN until metadata loads.
      return Number.isNaN(element.duration) ? 0 : element.duration;
    },
    isPaused() {
      return element.paused;
    },
    isReady() {
      // HAVE_FUTURE_DATA (3): playback can continue past the current frame.
      return !element.seeking && element.readyState >= 3;
    },
    outputLatencySeconds() {
      const latency = (audioContext?.baseLatency ?? 0) + (audioContext?.outputLatency ?? 0);
      return Number.isFinite(latency) ? latency : 0;
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
  const localNow = options.now ?? (() => Date.now());

  let backend: StagePlayerBackend | undefined;
  let unlocked = false;
  let disposed = false;
  // Dev-only: while true, applyMedia() ignores server snapshots entirely so a
  // manual scrub/pause is not overridden by the synced playhead.
  let manualOverride = false;

  // The desired media, tracked independently of the backend so applyMedia()
  // calls before unlock() are stashed and applied once unlocked instead of
  // being dropped.
  let desiredMedia: ZoneMediaState | null = null;
  let desiredReceivedAt = 0;
  // How far ahead of the target a seek lands on the target, after the stall.
  let seekLead = 0;
  let measureSeekLead = false;
  let readingsOff = 0;
  let beatTrackId: string | undefined;
  let beatSeconds = 0;
  let currentTrackId: string | undefined;
  let currentPlaylistIndex: number | undefined;

  function ensureBackend(): StagePlayerBackend {
    if (!backend) {
      backend = createBackend();
    }
    return backend;
  }

  // The server's playhead now: the reported position plus the time since
  // the server read it, on the server's clock when it is known.
  function expectedPlayhead(media: ZoneMediaState): number {
    const serverNow = options.serverClock?.now();
    const elapsedMs =
      serverNow !== undefined && typeof media.sampledAtMs === 'number'
        ? serverNow - media.sampledAtMs
        : localNow() - desiredReceivedAt;
    const seconds = media.playheadSeconds + Math.max(0, elapsedMs) / 1000;
    return media.durationSeconds > 0 ? Math.min(seconds, media.durationSeconds) : seconds;
  }

  function playMedia(media: ZoneMediaState): void {
    const activeBackend = ensureBackend();
    const isNewTrack =
      media.trackId !== currentTrackId || media.playlistIndex !== currentPlaylistIndex;

    if (isNewTrack) {
      currentTrackId = media.trackId;
      currentPlaylistIndex = media.playlistIndex;
      measureSeekLead = false;
      readingsOff = 0;
      activeBackend.load(media.trackId, expectedPlayhead(media));
      activeBackend.setMuted(false);
      activeBackend.play();
      return;
    }
    syncPlayback(activeBackend, media);
  }

  function syncPlayback(activeBackend: StagePlayerBackend, media: ZoneMediaState): void {
    // Paused (blocked by the browser) or still downloading: a position read
    // now is not what the player hears.
    if (activeBackend.isPaused() || !activeBackend.isReady()) return;
    const target = expectedPlayhead(media) + activeBackend.outputLatencySeconds();
    const drift = activeBackend.getCurrentTime() - target;
    if (measureSeekLead) {
      // The first reading after a seek shows how far the stall put it behind.
      measureSeekLead = false;
      seekLead = Math.min(MAX_SEEK_LEAD_SECONDS, Math.max(0, seekLead - drift));
    }
    readingsOff = Math.abs(drift) > SEEK_THRESHOLD_SECONDS ? readingsOff + 1 : 0;
    if (readingsOff >= SEEK_AFTER_READINGS) {
      readingsOff = 0;
      activeBackend.seek(target + seekLead);
      measureSeekLead = true;
    }
  }

  // The track position this player hears now.
  function heardSeconds(): number {
    if (backend && manualOverride) return backend.getCurrentTime();
    if (backend && !backend.isPaused() && backend.isReady()) {
      return Math.max(0, backend.getCurrentTime() - backend.outputLatencySeconds());
    }
    return desiredMedia ? expectedPlayhead(desiredMedia) : 0;
  }

  function applyMedia(media: ZoneMediaState | null): void {
    if (disposed) return;
    desiredMedia = media;
    desiredReceivedAt = localNow();

    if (!unlocked) {
      // Stashed; will be applied by unlock().
      return;
    }

    if (manualOverride) {
      // A dev is in manual control: stash the latest desired media (so normal
      // sync can resume when override is turned off) but do not touch the
      // backend — no auto-switch, no drift-correction.
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
    if (disposed) return;
    if (!unlocked) {
      unlocked = true;
      ensureBackend();
      if (desiredMedia) {
        playMedia(desiredMedia);
      }
      return;
    }
    // Already unlocked, but the browser blocked the earlier attempt: retry
    // from the server's latest playhead, not the one the blocked load used.
    if (!manualOverride && desiredMedia && backend?.isPaused()) {
      backend.seek(expectedPlayhead(desiredMedia));
      backend.play();
    }
  }

  function isAudible(): boolean {
    return unlocked && backend !== undefined && !backend.isPaused();
  }

  function getFrequencyData(target: Uint8Array): void {
    const trackId = manualOverride ? currentTrackId : desiredMedia?.trackId;
    if (trackId && options.spectrum?.fill(trackId, heardSeconds(), target)) {
      return;
    }
    if (backend) {
      backend.getFrequencyData(target);
    } else {
      // No backend yet (before unlock): report a silent spectrum.
      target.fill(0);
    }
  }

  function readBeat(out: StageBeat): boolean {
    const trackId = manualOverride ? currentTrackId : desiredMedia?.trackId;
    if (!trackId || !options.beats) return false;
    const until = heardSeconds() + BEAT_LEAD_SECONDS;
    const from = beatSeconds;
    const continues = trackId === beatTrackId && until >= from && until - from <= MAX_BEAT_STEP_SECONDS;
    beatTrackId = trackId;
    beatSeconds = until;
    return options.beats.read(trackId, continues ? from : until, until, out);
  }

  function getCurrentTime(): number {
    // Until the browser lets the track play, report the server's playhead
    // (sent at least once a second) so the HUD shows the room's real time.
    if (backend && (!backend.isPaused() || manualOverride)) {
      return backend.getCurrentTime();
    }
    return desiredMedia ? expectedPlayhead(desiredMedia) : (backend?.getCurrentTime() ?? 0);
  }

  function getDuration(): number {
    return backend ? backend.getDuration() : 0;
  }

  function isPaused(): boolean {
    return backend ? backend.isPaused() : true;
  }

  function play(): void {
    backend?.play();
  }

  function pause(): void {
    backend?.pause();
  }

  function seekTo(seconds: number): void {
    backend?.seek(seconds);
  }

  function setManualOverride(active: boolean): void {
    manualOverride = active;
  }

  function isManualOverride(): boolean {
    return manualOverride;
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    options.spectrum?.dispose();
    options.beats?.dispose();
    backend?.dispose();
    backend = undefined;
  }

  return {
    unlock,
    isAudible,
    applyMedia,
    getFrequencyData,
    readBeat,
    getCurrentTime,
    getDuration,
    isPaused,
    play,
    pause,
    seekTo,
    setManualOverride,
    isManualOverride,
    dispose,
  };
}
