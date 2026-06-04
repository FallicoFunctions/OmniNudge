import { describe, expect, it, vi } from 'vitest';
import { buildYouTubeEmbedUrl, createIframeYouTubeHandle, syncAuthoritativeStagePlayback } from '../youtube';

function createPlayerDouble() {
  return {
    setVideo: vi.fn(),
    play: vi.fn(),
    mute: vi.fn(),
    unmute: vi.fn(),
    seekTo: vi.fn(),
  };
}

describe('youtube playback sync', () => {
  it('joins each stage at the authoritative playhead and leaves only the active zone audible after unlock', () => {
    const mainStage = createPlayerDouble();
    const underground = createPlayerDouble();
    const plurrPartay = createPlayerDouble();

    syncAuthoritativeStagePlayback({
      currentZone: 'underground',
      unlocked: true,
      zoneMedia: [
        { zoneId: 'main_stage', videoId: 'main-stage-youtube', playlistIndex: 0, playheadSeconds: 14 },
        { zoneId: 'underground', videoId: 'techno-room-youtube', playlistIndex: 1, playheadSeconds: 32 },
        { zoneId: 'plurr_partay', videoId: 'neon-room-youtube', playlistIndex: 2, playheadSeconds: 48 },
      ],
      players: {
        main_stage: mainStage,
        underground,
        plurr_partay: plurrPartay,
      },
    });

    expect(mainStage.setVideo).toHaveBeenCalledWith('main-stage-youtube', 14);
    expect(underground.setVideo).toHaveBeenCalledWith('techno-room-youtube', 32);
    expect(plurrPartay.setVideo).toHaveBeenCalledWith('neon-room-youtube', 48);
    expect(mainStage.seekTo).toHaveBeenCalledWith(14);
    expect(underground.seekTo).toHaveBeenCalledWith(32);
    expect(plurrPartay.seekTo).toHaveBeenCalledWith(48);
    expect(mainStage.mute).toHaveBeenCalledTimes(1);
    expect(plurrPartay.mute).toHaveBeenCalledTimes(1);
    expect(underground.unmute).toHaveBeenCalledTimes(1);
    expect(underground.play).toHaveBeenCalledTimes(1);
  });

  it('keeps all zones muted until explicit media unlock', () => {
    const mainStage = createPlayerDouble();
    const underground = createPlayerDouble();
    const plurrPartay = createPlayerDouble();

    syncAuthoritativeStagePlayback({
      currentZone: 'main_stage',
      unlocked: false,
      zoneMedia: [{ zoneId: 'main_stage', videoId: 'main-stage-youtube', playlistIndex: 0, playheadSeconds: 8 }],
      players: {
        main_stage: mainStage,
        underground,
        plurr_partay: plurrPartay,
      },
    });

    expect(mainStage.setVideo).toHaveBeenCalledWith('main-stage-youtube', 8);
    expect(mainStage.seekTo).toHaveBeenCalledWith(8);
    expect(mainStage.unmute).not.toHaveBeenCalled();
    expect(mainStage.mute).toHaveBeenCalledTimes(1);
    expect(underground.mute).toHaveBeenCalledTimes(1);
    expect(plurrPartay.mute).toHaveBeenCalledTimes(1);
  });

  it('builds a YouTube embed URL with JS API and autoplay parameters', () => {
    const url = buildYouTubeEmbedUrl('main-stage-youtube', 18);

    expect(url).toContain('youtube-nocookie.com/embed/main-stage-youtube');
    expect(url).toContain('enablejsapi=1');
    expect(url).toContain('autoplay=1');
    expect(url).toContain('start=18');
  });

  it('drives an iframe-backed handle through postMessage commands', () => {
    const postMessage = vi.fn();
    const iframe = {
      src: '',
      contentWindow: { postMessage },
    } as unknown as HTMLIFrameElement;

    const handle = createIframeYouTubeHandle(iframe);
    handle.setVideo('techno-room-youtube', 32);
    handle.seekTo(45);
    handle.mute();
    handle.unmute();
    handle.play();

    expect(iframe.src).toContain('techno-room-youtube');
    expect(iframe.src).toContain('start=32');
    expect(postMessage).toHaveBeenCalledWith(expect.stringContaining('"seekTo"'), '*');
    expect(postMessage).toHaveBeenCalledWith(expect.stringContaining('"mute"'), '*');
    expect(postMessage).toHaveBeenCalledWith(expect.stringContaining('"unMute"'), '*');
    expect(postMessage).toHaveBeenCalledWith(expect.stringContaining('"playVideo"'), '*');
  });
});
