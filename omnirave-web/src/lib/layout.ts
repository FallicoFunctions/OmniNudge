import type { RuntimePoint, RuntimeZoneID } from './session';

export type ZoneBounds = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

export const MAIN_STAGE_SPAWN: RuntimePoint = { x: 0, y: 0, z: 0 };
export const UNDERGROUND_SPAWN: RuntimePoint = { x: 42, y: 0, z: 9 };
export const PLURR_PARTAY_SPAWN: RuntimePoint = { x: -34, y: 0, z: 11 };

export const ZONE_SPAWNS: Record<RuntimeZoneID, RuntimePoint> = {
  main_stage: MAIN_STAGE_SPAWN,
  underground: UNDERGROUND_SPAWN,
  plurr_partay: PLURR_PARTAY_SPAWN,
};

export const LAYOUT_ZONE_ORDER: RuntimeZoneID[] = ['underground', 'plurr_partay', 'main_stage'];

export const ZONE_BOUNDS: Record<RuntimeZoneID, ZoneBounds> = {
  main_stage: { minX: -24, maxX: 24, minZ: -24, maxZ: 24 },
  underground: { minX: 18, maxX: 60, minZ: -4, maxZ: 20 },
  plurr_partay: { minX: -52, maxX: -18, minZ: -4, maxZ: 22 },
};

export function zoneBounds(zone: RuntimeZoneID): ZoneBounds {
  return ZONE_BOUNDS[zone];
}

export function zoneSpawn(zone: RuntimeZoneID): RuntimePoint {
  return ZONE_SPAWNS[zone];
}

export function zoneForPoint(point: RuntimePoint): RuntimeZoneID {
  for (const zone of LAYOUT_ZONE_ORDER) {
    const bounds = ZONE_BOUNDS[zone];
    if (
      point.x >= bounds.minX &&
      point.x <= bounds.maxX &&
      point.z >= bounds.minZ &&
      point.z <= bounds.maxZ
    ) {
      return zone;
    }
  }

  return 'main_stage';
}

export function isUndergroundBoundaryPoint(point: RuntimePoint): boolean {
  return point.x >= 17 && point.x <= 19 && point.z >= 4 && point.z <= 8;
}

export function isPlurrBoundaryPoint(point: RuntimePoint): boolean {
  return point.x >= -19 && point.x <= -17 && point.z >= 2 && point.z <= 6;
}
