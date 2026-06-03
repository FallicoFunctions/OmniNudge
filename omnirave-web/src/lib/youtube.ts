import type { RuntimeZoneID, RuntimeZoneMedia } from './session';

export interface YouTubePlayerHandle {
  setVideo: (videoId: string, playheadSeconds: number) => void;
  play: () => void;
  mute: () => void;
  unmute: () => void;
  seekTo: (seconds: number) => void;
}

export function createPassiveYouTubeHandle(): YouTubePlayerHandle {
  return {
    setVideo: () => undefined,
    play: () => undefined,
    mute: () => undefined,
    unmute: () => undefined,
    seekTo: () => undefined,
  };
}

export type StagePlayerMap = Record<RuntimeZoneID, YouTubePlayerHandle>;

const STAGE_ZONES: RuntimeZoneID[] = ['main_stage', 'techno_room', 'neon_room'];

export function createPassiveStagePlayers(): StagePlayerMap {
  return {
    main_stage: createPassiveYouTubeHandle(),
    techno_room: createPassiveYouTubeHandle(),
    neon_room: createPassiveYouTubeHandle(),
  };
}

export function syncAuthoritativeStagePlayback(args: {
  currentZone: RuntimeZoneID;
  unlocked: boolean;
  zoneMedia: RuntimeZoneMedia[];
  players: StagePlayerMap;
}) {
  const mediaByZone = new Map(args.zoneMedia.map((entry) => [entry.zoneId, entry]));

  STAGE_ZONES.forEach((zone) => {
    const player = args.players[zone];
    const media = mediaByZone.get(zone);
    if (media) {
      player.setVideo(media.videoId, media.playheadSeconds);
      player.seekTo(media.playheadSeconds);
      player.play();
    }

    if (args.unlocked && zone === args.currentZone) {
      player.unmute();
      return;
    }

    player.mute();
  });
}

export function buildYouTubeEmbedUrl(videoId: string, playheadSeconds: number): string {
  const params = new URLSearchParams({
    autoplay: '1',
    controls: '0',
    enablejsapi: '1',
    loop: '1',
    modestbranding: '1',
    playsinline: '1',
    rel: '0',
    start: String(Math.max(0, Math.floor(playheadSeconds))),
  });
  return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`;
}

export function createIframeYouTubeHandle(iframe: HTMLIFrameElement): YouTubePlayerHandle {
  let currentVideo = '';

  const postCommand = (func: string, args?: unknown[]) => {
    iframe.contentWindow?.postMessage(
      JSON.stringify({
        event: 'command',
        func,
        args: args ?? [],
      }),
      '*',
    );
  };

  return {
    setVideo(videoId, playheadSeconds) {
      if (videoId === currentVideo && iframe.src) {
        return;
      }

      currentVideo = videoId;
      iframe.src = buildYouTubeEmbedUrl(videoId, playheadSeconds);
    },
    play() {
      postCommand('playVideo');
    },
    mute() {
      postCommand('mute');
    },
    unmute() {
      postCommand('unMute');
    },
    seekTo(seconds) {
      postCommand('seekTo', [Math.max(0, Math.floor(seconds)), true]);
    },
  };
}
