import type { RuntimePoint, RuntimeSession, RuntimeZoneID, RuntimeZoneMedia } from './session';
import type { YouTubePlayerHandle } from './youtube';

export type ZoneID = RuntimeZoneID;

const ZONE_LABELS: Record<ZoneID, string> = {
  main_stage: 'Main Stage',
  techno_room: 'The Underground',
  neon_room: 'P.L.U.R.R. Partay',
};

const ZONE_TAGLINES: Record<ZoneID, string> = {
  main_stage: 'Big-room energy, open floor, and the loudest drop in the venue.',
  techno_room: 'A darker room with tighter pressure, harder rhythm, and a relentless pulse.',
  neon_room: 'A brighter late-night pocket for color, bounce, and playful chaos.',
};

const ZONE_MOVE_TARGETS: Record<ZoneID, RuntimePoint> = {
  main_stage: { x: 0, y: 0, z: 0 },
  techno_room: { x: 42, y: 0, z: 9 },
  neon_room: { x: -34, y: 0, z: 11 },
};

export const ZONE_ORDER: ZoneID[] = ['main_stage', 'techno_room', 'neon_room'];

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
  return ZONE_MOVE_TARGETS[zone];
}

export function zoneDisplayName(zone: ZoneID): string {
  return ZONE_LABELS[zone];
}

export function zoneTagline(zone: ZoneID): string {
  return ZONE_TAGLINES[zone];
}
