import { useEffect, useRef } from 'react';
import type { RuntimeZoneMedia, RuntimeZoneID } from '../lib/session';
import { zoneDisplayName } from '../lib/zones';
import {
  buildYouTubeEmbedUrl,
  createIframeYouTubeHandle,
  createPassiveYouTubeHandle,
  type StagePlayerMap,
} from '../lib/youtube';

const ZONES: RuntimeZoneID[] = ['main_stage', 'underground', 'plurr_partay'];

export function StageAudioDeck(props: {
  zoneMedia?: RuntimeZoneMedia[];
  onPlayersReady: (players: StagePlayerMap) => void;
}) {
  const iframeRefs = useRef<Partial<Record<RuntimeZoneID, HTMLIFrameElement | null>>>({});

  useEffect(() => {
    const players = {
      main_stage: iframeRefs.current.main_stage
        ? createIframeYouTubeHandle(iframeRefs.current.main_stage)
        : createPassiveYouTubeHandle(),
      underground: iframeRefs.current.underground
        ? createIframeYouTubeHandle(iframeRefs.current.underground)
        : createPassiveYouTubeHandle(),
      plurr_partay: iframeRefs.current.plurr_partay
        ? createIframeYouTubeHandle(iframeRefs.current.plurr_partay)
        : createPassiveYouTubeHandle(),
    };

    props.onPlayersReady(players);
  }, [props]);

  const mediaByZone = new Map(props.zoneMedia?.map((entry) => [entry.zoneId, entry]) ?? []);

  return (
    <div className="stage-audio-deck" aria-hidden="true">
      {ZONES.map((zone) => {
        const media = mediaByZone.get(zone);
        return (
          <iframe
            key={zone}
            ref={(node) => {
              iframeRefs.current[zone] = node;
            }}
            className="stage-audio-frame"
            title={`OmniRave ${zoneDisplayName(zone)} player`}
            src={buildYouTubeEmbedUrl(media?.videoId ?? fallbackVideoId(zone), media?.playheadSeconds ?? 0)}
            allow="autoplay; encrypted-media"
          />
        );
      })}
    </div>
  );
}

function fallbackVideoId(zone: RuntimeZoneID) {
  switch (zone) {
    case 'underground':
      return 'techno-room-youtube';
    case 'plurr_partay':
      return 'neon-room-youtube';
    case 'main_stage':
    default:
      return 'main-stage-youtube';
  }
}
