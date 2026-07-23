import { describe, expect, it, vi } from 'vitest';
import { createStageMediaPlayer, type StagePlayerBackend } from '../stageMediaPlayer';
import type { ZoneMediaState } from '../../network/worldSocket';

function createFakeBackend(overrides: Partial<StagePlayerBackend> = {}): StagePlayerBackend {
  return {
    load: vi.fn(),
    play: vi.fn(),
    pause: vi.fn(),
    seek: vi.fn(),
    getCurrentTime: vi.fn(() => 0),
    setMuted: vi.fn(),
    dispose: vi.fn(),
    ...overrides,
  };
}

function media(overrides: Partial<ZoneMediaState> = {}): ZoneMediaState {
  return {
    zoneId: 'main-stage',
    videoId: 'main-stage-youtube',
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
    expect(backend.load).toHaveBeenCalledWith('main-stage-youtube', 10);
    expect(backend.setMuted).toHaveBeenCalledWith(false);
    expect(backend.play).toHaveBeenCalledTimes(1);
  });

  it('loads and seeks to the playhead when the videoId changes', () => {
    const backend = createFakeBackend();
    const player = createStageMediaPlayer({ backendFactory: () => backend });
    player.unlock();

    player.applyMedia(media({ videoId: 'track-a', playheadSeconds: 5 }));
    expect(backend.load).toHaveBeenCalledWith('track-a', 5);

    player.applyMedia(media({ videoId: 'track-b', playheadSeconds: 20 }));
    expect(backend.load).toHaveBeenCalledWith('track-b', 20);
    expect(backend.load).toHaveBeenCalledTimes(2);
  });

  it('loads and seeks to the playhead when only the playlistIndex changes', () => {
    const backend = createFakeBackend();
    const player = createStageMediaPlayer({ backendFactory: () => backend });
    player.unlock();

    player.applyMedia(media({ videoId: 'track-a', playlistIndex: 0, playheadSeconds: 5 }));
    player.applyMedia(media({ videoId: 'track-a', playlistIndex: 1, playheadSeconds: 40 }));

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

    expect(backend.load).toHaveBeenCalledWith('main-stage-youtube', 10);
  });

  it('disposes the backend cleanly and is a no-op afterwards', () => {
    const backend = createFakeBackend();
    const player = createStageMediaPlayer({ backendFactory: () => backend });
    player.unlock();
    player.applyMedia(media());

    player.dispose();
    expect(backend.dispose).toHaveBeenCalledTimes(1);

    (backend.load as ReturnType<typeof vi.fn>).mockClear();
    player.applyMedia(media({ videoId: 'ignored-after-dispose' }));
    player.unlock();
    expect(backend.load).not.toHaveBeenCalled();
  });

  it('does not create a backend or throw before unlock even if applyMedia is called', () => {
    const backendFactory = vi.fn(() => createFakeBackend());
    const player = createStageMediaPlayer({ backendFactory });

    expect(() => player.applyMedia(media())).not.toThrow();
    expect(backendFactory).not.toHaveBeenCalled();

    player.dispose();
  });

  it('degrades without throwing when the default backend cannot reach the YouTube API', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    document.body.innerHTML = '';
    // No window.YT global present, and no script tag will ever call
    // onYouTubeIframeAPIReady in this test environment - the default backend
    // must degrade to a no-op instead of throwing.
    const player = createStageMediaPlayer();

    expect(() => player.unlock()).not.toThrow();
    expect(() => player.applyMedia(media())).not.toThrow();
    expect(() => player.dispose()).not.toThrow();

    warnSpy.mockRestore();
  });
});
