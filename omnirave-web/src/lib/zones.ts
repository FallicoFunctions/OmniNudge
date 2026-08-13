import type { RuntimePoint, RuntimeSession, RuntimeZoneID, RuntimeZoneMedia } from './session';
import type { YouTubePlayerHandle } from './youtube';
import {
  MAIN_STAGE_SPAWN,
  PLURR_PARTAY_SPAWN,
  UNDERGROUND_SPAWN,
  isPlurrBoundaryPoint,
  isUndergroundBoundaryPoint,
  zoneBounds,
  zoneForPoint,
  zoneSpawn,
  ZONE_BOUNDS,
  ZONE_SPAWNS,
} from './layout';

export type ZoneID = RuntimeZoneID;
export {
  MAIN_STAGE_SPAWN,
  PLURR_PARTAY_SPAWN,
  UNDERGROUND_SPAWN,
  isPlurrBoundaryPoint,
  isUndergroundBoundaryPoint,
  zoneBounds,
  zoneForPoint,
  zoneSpawn,
  ZONE_BOUNDS,
  ZONE_SPAWNS,
};

const ZONE_LABELS: Record<ZoneID, string> = {
  main_stage: 'Main Stage',
  underground: 'The Underground',
  plurr_partay: 'P.L.U.R.R. Partay',
};

const ZONE_TAGLINES: Record<ZoneID, string> = {
  main_stage: 'Big-room energy, open floor, and the loudest drop in the venue.',
  underground: 'A darker room with tighter pressure, harder rhythm, and a relentless pulse.',
  plurr_partay: 'A brighter late-night pocket for color, bounce, and playful chaos.',
};

export const ZONE_ORDER: ZoneID[] = ['main_stage', 'underground', 'plurr_partay'];

export function activeStageForZone(zone: ZoneID): ZoneID {
  return zone;
}

export function syncStagePlayers(currentZone: ZoneID, players: Record<ZoneID, YouTubePlayerHandle>) {
  (Object.entries(players) as Array<[ZoneID, YouTubePlayerHandle]>).forEach(([zone, player]) => {
    if (zone === currentZone) {
      player.unmute();
      player.play();
    } else {
      player.mute();
    }
  });
}

export function zoneMediaForStage(session: RuntimeSession, zone: ZoneID): RuntimeZoneMedia | undefined {
  return session.zoneMedia?.find((entry) => entry.zoneId === zone);
}

export function zoneMoveTarget(zone: ZoneID): RuntimePoint {
  return zoneSpawn(zone);
}

export function zoneDisplayName(zone: ZoneID): string {
  return ZONE_LABELS[zone];
}

export function zoneTagline(zone: ZoneID): string {
  return ZONE_TAGLINES[zone];
}
