import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStageMediaPlayer, type StagePlayerBackend } from '../stageMediaPlayer';
import type { ZoneMediaState } from '../../network/worldSocket';
import { createStageBeat, type StageBeat } from '../trackBeats';

// Vitest 5 cannot call a mock built on an arrow function with `new`, and the
// runtime constructs Babylon's engines and the browser's Audio with `new`. A
// regular function can be constructed, returns what make() returns, and the
// mock still records every argument.
function constructible<A extends unknown[], R>(make: (...args: A) => R) {
  return vi.fn(function (...args: A) {
    return make(...args);
  });
}

function createFakeBackend(overrides: Partial<StagePlayerBackend> = {}): StagePlayerBackend {
  return {
    load: vi.fn(),
    play: vi.fn(),
    pause: vi.fn(),
    seek: vi.fn(),
    getCurrentTime: vi.fn(() => 0),
    getDuration: vi.fn(() => 0),
    isPaused: vi.fn(() => true),
    isReady: vi.fn(() => true),
    outputLatencySeconds: vi.fn(() => 0),
    setMuted: vi.fn(),
    getFrequencyData: vi.fn(),
    dispose: vi.fn(),
    ...overrides,
  };
}

function media(overrides: Partial<ZoneMediaState> = {}): ZoneMediaState {
  return {
    zoneId: 'main-stage',
    trackId: 'main-stage-set-01',
    artist: 'Fallico',
    title: "Nick's Mix Vol. 13",
    playlistIndex: 0,
    playheadSeconds: 10,
    durationSeconds: 7827,
    ...overrides,
  };
}

describe('createStageMediaPlayer', () => {
  it('stashes applyMedia calls made before unlock and applies them on unlock', () => {
    const backend = createFakeBackend();
    const player = createStageMediaPlayer({ now: () => 0, backendFactory: () => backend });

    player.applyMedia(media());
    expect(backend.load).not.toHaveBeenCalled();
    expect(backend.play).not.toHaveBeenCalled();

    player.unlock();
    expect(backend.load).toHaveBeenCalledWith('main-stage-set-01', 10);
    expect(backend.setMuted).toHaveBeenCalledWith(false);
    expect(backend.play).toHaveBeenCalledTimes(1);
  });

  it('loads and seeks to the playhead when the trackId changes', () => {
    const backend = createFakeBackend();
    const player = createStageMediaPlayer({ now: () => 0, backendFactory: () => backend });
    player.unlock();

    player.applyMedia(media({ trackId: 'track-a', playheadSeconds: 5 }));
    expect(backend.load).toHaveBeenCalledWith('track-a', 5);

    player.applyMedia(media({ trackId: 'track-b', playheadSeconds: 20 }));
    expect(backend.load).toHaveBeenCalledWith('track-b', 20);
    expect(backend.load).toHaveBeenCalledTimes(2);
  });

  it('loads and seeks to the playhead when only the playlistIndex changes', () => {
    const backend = createFakeBackend();
    const player = createStageMediaPlayer({ now: () => 0, backendFactory: () => backend });
    player.unlock();

    player.applyMedia(media({ trackId: 'track-a', playlistIndex: 0, playheadSeconds: 5 }));
    player.applyMedia(media({ trackId: 'track-a', playlistIndex: 1, playheadSeconds: 40 }));

    expect(backend.load).toHaveBeenNthCalledWith(2, 'track-a', 40);
  });

  it('leaves a small drift alone: no seek, and never a speed change', () => {
    const backend = createFakeBackend({ getCurrentTime: vi.fn(() => 11.8), isPaused: vi.fn(() => false) });
    const player = createStageMediaPlayer({ now: () => 0, backendFactory: () => backend });
    player.unlock();

    player.applyMedia(media({ playheadSeconds: 10 }));
    (backend.load as ReturnType<typeof vi.fn>).mockClear();

    // 0.2 s behind the server, on many readings: under the seek threshold.
    for (let i = 0; i < 5; i++) player.applyMedia(media({ playheadSeconds: 12 }));

    expect(backend.load).not.toHaveBeenCalled();
    expect(backend.seek).not.toHaveBeenCalled();
    // The backend has no speed control at all: Safari cut the sound at each
    // speed change, and large ones sounded like the music speeding up.
    expect('setPlaybackRate' in backend).toBe(false);
  });

  it('does not seek on one late reading, only when the next one is off too', () => {
    let position = 12;
    const backend = createFakeBackend({ getCurrentTime: vi.fn(() => position), isPaused: vi.fn(() => false) });
    const player = createStageMediaPlayer({ now: () => 0, backendFactory: () => backend });
    player.unlock();
    player.applyMedia(media({ playheadSeconds: 12 }));

    position = 12.5; // one jittery reading
    player.applyMedia(media({ playheadSeconds: 12 }));
    position = 12.02;
    player.applyMedia(media({ playheadSeconds: 12 }));
    expect(backend.seek).not.toHaveBeenCalled();

    position = 12.5; // off twice in a row: a real drift
    player.applyMedia(media({ playheadSeconds: 12 }));
    player.applyMedia(media({ playheadSeconds: 12 }));
    expect(backend.seek).toHaveBeenCalledTimes(1);
    expect(backend.seek).toHaveBeenLastCalledWith(12);
  });

  it('seeks the same track when drift exceeds the threshold', () => {
    const backend = createFakeBackend({ getCurrentTime: vi.fn(() => 5), isPaused: vi.fn(() => false) });
    const player = createStageMediaPlayer({ now: () => 0, backendFactory: () => backend });
    player.unlock();

    player.applyMedia(media({ playheadSeconds: 10 }));
    (backend.load as ReturnType<typeof vi.fn>).mockClear();

    // Local time (5s) drifted more than 0.3s from the reported playhead (30s),
    // on two readings in a row.
    player.applyMedia(media({ playheadSeconds: 30 }));
    expect(backend.seek).not.toHaveBeenCalled();
    player.applyMedia(media({ playheadSeconds: 30 }));

    expect(backend.load).not.toHaveBeenCalled();
    expect(backend.seek).toHaveBeenCalledWith(30);
  });

  it('pauses on null media', () => {
    const backend = createFakeBackend();
    const player = createStageMediaPlayer({ now: () => 0, backendFactory: () => backend });
    player.unlock();

    player.applyMedia(media());
    player.applyMedia(null);

    expect(backend.pause).toHaveBeenCalledTimes(1);
  });

  it('re-loads if the same track returns after a null gap', () => {
    const backend = createFakeBackend();
    const player = createStageMediaPlayer({ now: () => 0, backendFactory: () => backend });
    player.unlock();

    player.applyMedia(media());
    player.applyMedia(null);
    (backend.load as ReturnType<typeof vi.fn>).mockClear();
    player.applyMedia(media());

    expect(backend.load).toHaveBeenCalledWith('main-stage-set-01', 10);
  });

  it('disposes the backend cleanly and is a no-op afterwards', () => {
    const backend = createFakeBackend();
    const player = createStageMediaPlayer({ now: () => 0, backendFactory: () => backend });
    player.unlock();
    player.applyMedia(media());

    player.dispose();
    expect(backend.dispose).toHaveBeenCalledTimes(1);

    (backend.load as ReturnType<typeof vi.fn>).mockClear();
    player.applyMedia(media({ trackId: 'ignored-after-dispose' }));
    player.unlock();
    expect(backend.load).not.toHaveBeenCalled();
  });

  it('reports a zero spectrum before unlock and delegates to the backend after unlock', () => {
    const injected = [11, 22, 33, 44];
    const backend = createFakeBackend({
      getFrequencyData: vi.fn((target: Uint8Array) => {
        for (let i = 0; i < target.length; i++) {
          target[i] = injected[i] ?? 0;
        }
      }),
    });
    const player = createStageMediaPlayer({ now: () => 0, backendFactory: () => backend });

    // Before unlock there is no backend at all: the player fills zeros and does
    // not construct one just to read the spectrum.
    const buffer = new Uint8Array(4).fill(99);
    player.getFrequencyData(buffer);
    expect(Array.from(buffer)).toEqual([0, 0, 0, 0]);
    expect(backend.getFrequencyData).not.toHaveBeenCalled();

    // After unlock the backend exists and its (injected) spectrum flows through.
    player.unlock();
    player.getFrequencyData(buffer);
    expect(Array.from(buffer)).toEqual([11, 22, 33, 44]);
  });

  it('does not create a backend or throw before unlock even if applyMedia is called', () => {
    const backendFactory = vi.fn(() => createFakeBackend());
    const player = createStageMediaPlayer({ now: () => 0, backendFactory });

    expect(() => player.applyMedia(media())).not.toThrow();
    expect(backendFactory).not.toHaveBeenCalled();

    player.dispose();
  });

  describe('arriving before the browser allows sound', () => {
    it('retries a blocked start from the latest server playhead on a later unlock', () => {
      let paused = true;
      const backend = createFakeBackend({ isPaused: vi.fn(() => paused) });
      const player = createStageMediaPlayer({ now: () => 0, backendFactory: () => backend });

      player.applyMedia(media({ playheadSeconds: 10 }));
      player.unlock(); // at load, no gesture: the browser blocks play()
      expect(backend.load).toHaveBeenCalledWith('main-stage-set-01', 10);
      expect(player.isAudible()).toBe(false);

      player.applyMedia(media({ playheadSeconds: 95 }));
      (backend.play as ReturnType<typeof vi.fn>).mockClear();
      player.unlock(); // the player's first gesture
      expect(backend.seek).toHaveBeenLastCalledWith(95);
      expect(backend.play).toHaveBeenCalledTimes(1);

      paused = false;
      expect(player.isAudible()).toBe(true);
    });

    it('does not restart a track that is already playing', () => {
      const backend = createFakeBackend({ isPaused: vi.fn(() => false) });
      const player = createStageMediaPlayer({ now: () => 0, backendFactory: () => backend });
      player.applyMedia(media());
      player.unlock();
      (backend.play as ReturnType<typeof vi.fn>).mockClear();

      player.unlock();
      expect(backend.play).not.toHaveBeenCalled();
    });

    it('reports the server playhead while the track cannot play, and the local one once it does', () => {
      let paused = true;
      const backend = createFakeBackend({
        isPaused: vi.fn(() => paused),
        getCurrentTime: vi.fn(() => 3),
      });
      const player = createStageMediaPlayer({ now: () => 0, backendFactory: () => backend });

      player.applyMedia(media({ playheadSeconds: 228 }));
      expect(player.getCurrentTime()).toBe(228);
      player.unlock();
      expect(player.getCurrentTime()).toBe(228);

      paused = false;
      expect(player.getCurrentTime()).toBe(3);
    });
  });

  describe('the same moment for every player', () => {
    it('starts at the server playhead moved forward on the server clock', () => {
      const backend = createFakeBackend();
      const serverClock = { now: () => 1_000_000 + 1500 };
      const player = createStageMediaPlayer({ now: () => 0, serverClock, backendFactory: () => backend });
      player.applyMedia(media({ playheadSeconds: 10, sampledAtMs: 1_000_000 }));
      player.unlock();
      expect(backend.load).toHaveBeenCalledWith('main-stage-set-01', 11.5);
    });

    it('counts from the arrival time before the server clock is known', () => {
      let localMs = 5000;
      const backend = createFakeBackend();
      const player = createStageMediaPlayer({
        now: () => localMs,
        serverClock: { now: () => undefined },
        backendFactory: () => backend,
      });
      player.applyMedia(media({ playheadSeconds: 10, sampledAtMs: 123 }));
      localMs += 2000;
      expect(player.getCurrentTime()).toBe(12);
    });

    it('does not correct while the track downloads or seeks', () => {
      const backend = createFakeBackend({
        getCurrentTime: vi.fn(() => 5),
        isPaused: vi.fn(() => false),
        isReady: vi.fn(() => false),
      });
      const player = createStageMediaPlayer({ now: () => 0, backendFactory: () => backend });
      player.unlock();
      player.applyMedia(media({ playheadSeconds: 10 }));
      player.applyMedia(media({ playheadSeconds: 30 }));
      expect(backend.seek).not.toHaveBeenCalled();
    });

    it('learns how far a seek falls behind and seeks that far ahead next time', () => {
      let position = 5;
      const backend = createFakeBackend({ getCurrentTime: vi.fn(() => position), isPaused: vi.fn(() => false) });
      const player = createStageMediaPlayer({ now: () => 0, backendFactory: () => backend });
      player.unlock();
      player.applyMedia(media({ playheadSeconds: 10 }));

      player.applyMedia(media({ playheadSeconds: 30 }));
      player.applyMedia(media({ playheadSeconds: 30 }));
      expect(backend.seek).toHaveBeenLastCalledWith(30);
      // The seek stalled: once playing again it is 0.4 s behind the server.
      position = 40.6;
      player.applyMedia(media({ playheadSeconds: 41 }));

      position = 50;
      player.applyMedia(media({ playheadSeconds: 60 }));
      player.applyMedia(media({ playheadSeconds: 60 }));
      expect((backend.seek as ReturnType<typeof vi.fn>).mock.lastCall?.[0]).toBeCloseTo(60.4, 5);
    });

    it('aims ahead by the output latency, so the speakers play the server moment', () => {
      const backend = createFakeBackend({
        getCurrentTime: vi.fn(() => 5),
        isPaused: vi.fn(() => false),
        outputLatencySeconds: vi.fn(() => 0.1),
      });
      const player = createStageMediaPlayer({ now: () => 0, backendFactory: () => backend });
      player.unlock();
      player.applyMedia(media({ playheadSeconds: 10 }));
      player.applyMedia(media({ playheadSeconds: 30 }));
      player.applyMedia(media({ playheadSeconds: 30 }));
      expect((backend.seek as ReturnType<typeof vi.fn>).mock.lastCall?.[0]).toBeCloseTo(30.1, 5);
    });

    it('reads the lights from the track spectrum at the heard position, also when muted or blocked', () => {
      const fill = vi.fn((_trackId: string, _seconds: number, target: Uint8Array) => {
        target.fill(7);
        return true;
      });
      const backend = createFakeBackend({ getFrequencyData: vi.fn() });
      const player = createStageMediaPlayer({
        now: () => 0,
        spectrum: { fill, dispose: vi.fn() },
        backendFactory: () => backend,
      });
      player.applyMedia(media({ playheadSeconds: 42 }));
      player.unlock(); // blocked: the element stays paused

      const buffer = new Uint8Array(4);
      player.getFrequencyData(buffer);
      expect(fill).toHaveBeenLastCalledWith('main-stage-set-01', 42, buffer);
      expect(Array.from(buffer)).toEqual([7, 7, 7, 7]);
      expect(backend.getFrequencyData).not.toHaveBeenCalled();
    });

    it('reads the heard position, minus the output latency, while the track plays', () => {
      const fill = vi.fn(() => true);
      const backend = createFakeBackend({
        getCurrentTime: vi.fn(() => 42.3),
        isPaused: vi.fn(() => false),
        outputLatencySeconds: vi.fn(() => 0.3),
      });
      const player = createStageMediaPlayer({ now: () => 0, spectrum: { fill, dispose: vi.fn() }, backendFactory: () => backend });
      player.applyMedia(media({ playheadSeconds: 42 }));
      player.unlock();
      player.getFrequencyData(new Uint8Array(4));
      expect((fill.mock.lastCall as unknown[] | undefined)?.[1]).toBeCloseTo(42, 5);
    });

    it('reads the hits heard since the last reading, a little ahead of the sound', () => {
      let position = 100;
      const read = vi.fn((_trackId: string, _from: number, _to: number, out: StageBeat) => {
        out.bass = 0.8;
        return true;
      });
      const backend = createFakeBackend({ getCurrentTime: vi.fn(() => position), isPaused: vi.fn(() => false) });
      const player = createStageMediaPlayer({
        now: () => 0,
        beats: { read, dispose: vi.fn() },
        backendFactory: () => backend,
      });
      player.applyMedia(media({ playheadSeconds: 100 }));
      player.unlock();
      const out = createStageBeat();

      // The first reading has no earlier one: an empty window, no replay.
      expect(player.readBeat(out)).toBe(true);
      expect(out.bass).toBe(0.8);
      expect(read.mock.lastCall?.slice(0, 3)).toEqual(['main-stage-set-01', 100.04, 100.04]);
      position = 100.016;
      player.readBeat(out);
      expect(read.mock.lastCall?.[1]).toBeCloseTo(100.04, 5);
      expect(read.mock.lastCall?.[2]).toBeCloseTo(100.056, 5);

      // A seek (or a stalled tab): the hits in between are not replayed.
      position = 400;
      player.readBeat(out);
      expect(read.mock.lastCall?.[1]).toBe(read.mock.lastCall?.[2]);
    });

    it('has no beat reading without a beat list, and stops the list when disposed', () => {
      const out = createStageBeat();
      const without = createStageMediaPlayer({ now: () => 0, backendFactory: () => createFakeBackend() });
      without.applyMedia(media());
      expect(without.readBeat(out)).toBe(false);

      const beats = { read: vi.fn(() => false), dispose: vi.fn() };
      const player = createStageMediaPlayer({ now: () => 0, beats, backendFactory: () => createFakeBackend() });
      player.applyMedia(media());
      expect(player.readBeat(out)).toBe(false);
      player.dispose();
      expect(beats.dispose).toHaveBeenCalledTimes(1);
    });

    it('stops the spectrum downloads when the player is disposed', () => {
      const spectrum = { fill: vi.fn(() => false), dispose: vi.fn() };
      const player = createStageMediaPlayer({ now: () => 0, spectrum, backendFactory: () => createFakeBackend() });
      player.dispose();
      expect(spectrum.dispose).toHaveBeenCalledTimes(1);
    });

    it('falls back to the live analysis when the spectrum part is not downloaded', () => {
      const backend = createFakeBackend({ getFrequencyData: vi.fn((target: Uint8Array) => target.fill(3)) });
      const player = createStageMediaPlayer({
        now: () => 0,
        spectrum: { fill: vi.fn(() => false), dispose: vi.fn() },
        backendFactory: () => backend,
      });
      player.applyMedia(media());
      player.unlock();
      const buffer = new Uint8Array(2);
      player.getFrequencyData(buffer);
      expect(Array.from(buffer)).toEqual([3, 3]);
    });
  });

  describe('dev control surface', () => {
    it('delegates getDuration and isPaused to the backend after unlock', () => {
      const backend = createFakeBackend({
        getDuration: vi.fn(() => 180),
        isPaused: vi.fn(() => false),
      });
      const player = createStageMediaPlayer({ now: () => 0, backendFactory: () => backend });
      player.unlock();

      expect(player.getDuration()).toBe(180);
      expect(player.isPaused()).toBe(false);
    });

    it('reports safe defaults and does not create a backend before unlock', () => {
      const backendFactory = vi.fn(() => createFakeBackend());
      const player = createStageMediaPlayer({ now: () => 0, backendFactory });

      expect(player.getDuration()).toBe(0);
      expect(player.getCurrentTime()).toBe(0);
      expect(player.isPaused()).toBe(true);
      // seekTo before unlock is a safe no-op (no backend to seek).
      expect(() => player.seekTo(30)).not.toThrow();
      expect(backendFactory).not.toHaveBeenCalled();
    });

    it('setManualOverride(true) suppresses drift-correction on a drifted snapshot', () => {
      const backend = createFakeBackend({ getCurrentTime: vi.fn(() => 5), isPaused: vi.fn(() => false) });
      const player = createStageMediaPlayer({ now: () => 0, backendFactory: () => backend });
      player.unlock();

      player.applyMedia(media({ playheadSeconds: 10 }));
      (backend.seek as ReturnType<typeof vi.fn>).mockClear();

      player.setManualOverride(true);
      expect(player.isManualOverride()).toBe(true);

      // Local time (5s) is far from the reported playhead (40s), but override
      // is active so applyMedia must NOT re-seek.
      player.applyMedia(media({ playheadSeconds: 40 }));
      expect(backend.seek).not.toHaveBeenCalled();
    });

    it('setManualOverride(false) resumes drift-correction on the next snapshot', () => {
      const backend = createFakeBackend({ getCurrentTime: vi.fn(() => 5), isPaused: vi.fn(() => false) });
      const player = createStageMediaPlayer({ now: () => 0, backendFactory: () => backend });
      player.unlock();

      player.applyMedia(media({ playheadSeconds: 10 }));
      player.setManualOverride(true);
      player.applyMedia(media({ playheadSeconds: 40 }));
      (backend.seek as ReturnType<typeof vi.fn>).mockClear();

      player.setManualOverride(false);
      expect(player.isManualOverride()).toBe(false);

      // Drift exceeds threshold and override is off -> drift-correct.
      player.applyMedia(media({ playheadSeconds: 40 }));
      player.applyMedia(media({ playheadSeconds: 40 }));
      expect(backend.seek).toHaveBeenCalledWith(40);
    });
  });

  describe('default audio backend', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('degrades to a silent no-op with one warning when the audio element cannot be constructed', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      // Simulate a browser where constructing an HTMLAudioElement throws
      // (missing/broken audio): the backend must degrade to a no-op rather
      // than take down the runtime.
      vi.stubGlobal(
        'Audio',
        constructible(() => {
          throw new Error('audio unavailable');
        }),
      );

      const player = createStageMediaPlayer();

      expect(() => player.unlock()).not.toThrow();
      expect(() => player.applyMedia(media())).not.toThrow();
      expect(() => player.dispose()).not.toThrow();
      expect(warnSpy).toHaveBeenCalledTimes(1);

      warnSpy.mockRestore();
    });

    it('resolves trackId to a served /audio/<id>.mp3 URL and seeks after metadata loads', () => {
      // Fake HTMLAudioElement: metadata is NOT yet loaded (readyState 0), so a
      // currentTime write must be deferred to the 'loadedmetadata' event.
      const listeners: Record<string, Array<() => void>> = {};
      const fakeAudio = {
        src: '',
        muted: false,
        preload: '',
        readyState: 0,
        currentTime: 0,
        play: vi.fn(() => Promise.resolve()),
        pause: vi.fn(),
        addEventListener: vi.fn((type: string, cb: () => void) => {
          (listeners[type] ??= []).push(cb);
        }),
        removeEventListener: vi.fn((type: string, cb: () => void) => {
          listeners[type] = (listeners[type] ?? []).filter((fn) => fn !== cb);
        }),
        removeAttribute: vi.fn(),
      };
      vi.stubGlobal('Audio', constructible(() => fakeAudio));

      const player = createStageMediaPlayer();
      player.unlock();
      player.applyMedia(media({ trackId: 'main-stage-set-02', playheadSeconds: 42 }));

      // URL resolution + deferred seek (metadata not yet loaded).
      expect(fakeAudio.src).toBe('/audio/main-stage-set-02.mp3');
      expect(fakeAudio.currentTime).toBe(0);
      expect(fakeAudio.play).toHaveBeenCalled();

      // Metadata arrives -> the stashed seek is applied.
      for (const cb of listeners.loadedmetadata ?? []) cb();
      expect(fakeAudio.currentTime).toBe(42);

      player.dispose();
      expect(fakeAudio.pause).toHaveBeenCalled();
      expect(fakeAudio.removeAttribute).toHaveBeenCalledWith('src');
    });
  });
});
