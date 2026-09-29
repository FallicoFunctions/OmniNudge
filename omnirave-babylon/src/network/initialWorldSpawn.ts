import type { Vec3, WorldSnapshot } from './worldSocket';

/** Consume the first authoritative join position before publishing local moves. */
export function createInitialWorldSpawn(eyeHeightMeters: number, apply: (position: Vec3) => void) {
  let initialized = false;
  return (snapshot: WorldSnapshot): boolean => {
    if (initialized) return true;
    const position = snapshot.players.find(player => player.id === snapshot.currentPlayerId)?.position;
    if (!position || ![position.x, position.y, position.z].every(Number.isFinite)) return false;
    // Default server spawns use floor y=0; live/saved positions use eye y.
    // Start above that coarse floor and let the local ground collision settle
    // onto the authored surface. Elevated saved positions retain their height.
    apply({ x: position.x, y: Math.max(eyeHeightMeters, position.y), z: position.z });
    initialized = true;
    return true;
  };
}
