import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStageMediaPlayer, type StagePlayerBackend } from '../stageMediaPlayer';
import type { ZoneMediaState } from '../../network/worldSocket';

function createFakeBackend(overrides: Partial<StagePlayerBackend> = {}): StagePlayerBackend {
  return {
    load: vi.fn(),
    play: vi.fn(),
    pause: vi.fn(),
    seek: vi.fn(),
    getCurrentTime: vi.fn(() => 0),
    getDuration: vi.fn(() => 0),
    isPaused: vi.fn(() => true),
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
    playlistIndex: 0,
    playheadSeconds: 10,
    ...overrides,
  };
}

describe('createStageMediaPlayer', () => {
  it('stashes applyMedia calls made before unlock and applies them on unlock', () => {
    const backend = createFakeBackend();
    const player = createStageMediaPlayer({ backendFactory: () => backend });

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
    const player = createStageMediaPlayer({ backendFactory: () => backend });
    player.unlock();

    player.applyMedia(media({ trackId: 'track-a', playheadSeconds: 5 }));
    expect(backend.load).toHaveBeenCalledWith('track-a', 5);

    player.applyMedia(media({ trackId: 'track-b', playheadSeconds: 20 }));
    expect(backend.load).toHaveBeenCalledWith('track-b', 20);
    expect(backend.load).toHaveBeenCalledTimes(2);
  });

  it('loads and seeks to the playhead when only the playlistIndex changes', () => {
    const backend = createFakeBackend();
    const player = createStageMediaPlayer({ backendFactory: () => backend });
    player.unlock();

    player.applyMedia(media({ trackId: 'track-a', playlistIndex: 0, playheadSeconds: 5 }));
    player.applyMedia(media({ trackId: 'track-a', playlistIndex: 1, playheadSeconds: 40 }));

    expect(backend.load).toHaveBeenNthCalledWith(2, 'track-a', 40);
  });

  it('does not re-seek the same track when drift is within threshold', () => {
    const backend = createFakeBackend({ getCurrentTime: vi.fn(() => 11) });
    const player = createStageMediaPlayer({ backendFactory: () => backend });
    player.unlock();

    player.applyMedia(media({ playheadSeconds: 10 }));
    (backend.load as ReturnType<typeof vi.fn>).mockClear();

    // Server playhead advanced a bit; local time (11s) is within 2.5s of it.
    player.applyMedia(media({ playheadSeconds: 12 }));

    expect(backend.load).not.toHaveBeenCalled();
    expect(backend.seek).not.toHaveBeenCalled();
  });

  it('seeks the same track when drift exceeds the threshold', () => {
    const backend = createFakeBackend({ getCurrentTime: vi.fn(() => 5) });
    const player = createStageMediaPlayer({ backendFactory: () => backend });
    player.unlock();

    player.applyMedia(media({ playheadSeconds: 10 }));
    (backend.load as ReturnType<typeof vi.fn>).mockClear();

    // Local time (5s) drifted more than 2.5s from the reported playhead (30s).
    player.applyMedia(media({ playheadSeconds: 30 }));

    expect(backend.load).not.toHaveBeenCalled();
    expect(backend.seek).toHaveBeenCalledWith(30);
  });

  it('pauses on null media', () => {
    const backend = createFakeBackend();
    const player = createStageMediaPlayer({ backendFactory: () => backend });
    player.unlock();

    player.applyMedia(media());
    player.applyMedia(null);

    expect(backend.pause).toHaveBeenCalledTimes(1);
  });

  it('re-loads if the same track returns after a null gap', () => {
    const backend = createFakeBackend();
    const player = createStageMediaPlayer({ backendFactory: () => backend });
    player.unlock();

    player.applyMedia(media());
    player.applyMedia(null);
    (backend.load as ReturnType<typeof vi.fn>).mockClear();
    player.applyMedia(media());

    expect(backend.load).toHaveBeenCalledWith('main-stage-set-01', 10);
  });

  it('disposes the backend cleanly and is a no-op afterwards', () => {
    const backend = createFakeBackend();
    const player = createStageMediaPlayer({ backendFactory: () => backend });
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
    const player = createStageMediaPlayer({ backendFactory: () => backend });

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
    const player = createStageMediaPlayer({ backendFactory });

    expect(() => player.applyMedia(media())).not.toThrow();
    expect(backendFactory).not.toHaveBeenCalled();

    player.dispose();
  });

  describe('dev control surface', () => {
    it('delegates getDuration and isPaused to the backend after unlock', () => {
      const backend = createFakeBackend({
        getDuration: vi.fn(() => 180),
        isPaused: vi.fn(() => false),
      });
      const player = createStageMediaPlayer({ backendFactory: () => backend });
      player.unlock();

      expect(player.getDuration()).toBe(180);
      expect(player.isPaused()).toBe(false);
    });

    it('reports safe defaults and does not create a backend before unlock', () => {
      const backendFactory = vi.fn(() => createFakeBackend());
      const player = createStageMediaPlayer({ backendFactory });

      expect(player.getDuration()).toBe(0);
      expect(player.getCurrentTime()).toBe(0);
      expect(player.isPaused()).toBe(true);
      // seekTo before unlock is a safe no-op (no backend to seek).
      expect(() => player.seekTo(30)).not.toThrow();
      expect(backendFactory).not.toHaveBeenCalled();
    });

    it('setManualOverride(true) suppresses drift-correction on a drifted snapshot', () => {
      const backend = createFakeBackend({ getCurrentTime: vi.fn(() => 5) });
      const player = createStageMediaPlayer({ backendFactory: () => backend });
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
      const backend = createFakeBackend({ getCurrentTime: vi.fn(() => 5) });
      const player = createStageMediaPlayer({ backendFactory: () => backend });
      player.unlock();

      player.applyMedia(media({ playheadSeconds: 10 }));
      player.setManualOverride(true);
      player.applyMedia(media({ playheadSeconds: 40 }));
      (backend.seek as ReturnType<typeof vi.fn>).mockClear();

      player.setManualOverride(false);
      expect(player.isManualOverride()).toBe(false);

      // Drift exceeds threshold and override is off -> drift-correct.
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
        vi.fn(() => {
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
      vi.stubGlobal('Audio', vi.fn(() => fakeAudio));

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
