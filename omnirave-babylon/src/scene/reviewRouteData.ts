export interface ReviewCameraFocusOffset {
  x: number;
  y: number;
  z: number;
}

export interface ReviewCheckpointCamera {
  alpha: number;
  beta: number;
  radius: number;
  focusOffset: ReviewCameraFocusOffset;
  positionOffset?: ReviewCameraFocusOffset;
}

export interface ReviewCheckpoint {
  id: string;
  x: number;
  y: number;
  z: number;
  camera: ReviewCheckpointCamera;
}

export const BACK_PLAZA_SPAWN = { x: 0, y: 1.7, z: -48 } as const;

export const MAIN_STAGE_REVIEW_ROUTE: readonly ReviewCheckpoint[] = [
  {
    id: 'spawn_reveal',
    x: 0,
    y: 1.7,
    z: -48,
    camera: {
      alpha: -Math.PI / 2,
      beta: 1.08,
      radius: 60,
      focusOffset: { x: 0, y: 12.3, z: 60 },
      positionOffset: { x: 0, y: 26.3, z: -57 },
    },
  },
  {
    id: 'promenade_mid',
    x: 0,
    y: 1.7,
    z: -30,
    camera: {
      alpha: -Math.PI / 2,
      beta: 1.06,
      radius: 52,
      // Offsets ride the player root, which now stands 0.79 higher on the
      // foreground deck - drop them so the absolute framing is unchanged.
      focusOffset: { x: 0, y: 9.5, z: 18 },
      positionOffset: { x: 10, y: 19.5, z: -66 },
    },
  },
  {
    // Faces the right flank pocket's tiered cascade court. Runtime maps to
    // blender as x=X, z=-Y, so the cascade (blender X31..67 Y17..40) sits at
    // runtime x31..67 z-17..-40; stand inboard of it and look outward. Placed
    // here to keep the route's z values ascending (between promenade and pit).
    id: 'cascade_court',
    // 24,-22 is verified clear of the basin lantern stems, which now carry
    // real collision (a stem stands at ~21.5,-21 - the old 22,-20 teleport
    // wedged the player against it).
    x: 24,
    y: 1.7,
    z: -22,
    camera: {
      alpha: 0,
      beta: 1.1,
      radius: 36,
      // Offsets compensate the player nudge (+2x, -2z) so the absolute
      // camera framing of the cascade is unchanged.
      focusOffset: { x: 12, y: 3.5, z: -5 },
      positionOffset: { x: 34, y: 16, z: -32 },
    },
  },
  {
    id: 'crowd_pit',
    x: 6,
    y: 1.7,
    z: -16,
    camera: {
      alpha: -Math.PI / 2,
      beta: 1.35,
      radius: 26,
      // Pull the approval camera back off the LED panels and aim through the
      // mid-stage band so the crown canopy frames the view instead of filling it.
      focusOffset: { x: -6, y: 14, z: 4 },
      positionOffset: { x: -6, y: 7, z: -50 },
    },
  },
  {
    id: 'basin_edge',
    x: 0,
    y: 1.7,
    z: 0,
    camera: {
      alpha: -Math.PI / 2,
      beta: 1.02,
      radius: 50,
      focusOffset: { x: 0, y: 10.3, z: 20 },
      positionOffset: { x: 14, y: 18.3, z: -70 },
    },
  },
  {
    // The VIP forecourt: the walkable apron behind the right wing shell,
    // under its gold sail canopies, beside the garden planters. The old spot
    // (32, 8.5, 4) hung in mid-air - the elevated terrace has no walkable
    // floor this milestone - so the player fell to unlit ground and the
    // approval capture read pitch black. Ground-level spawn plus a close,
    // low framing keeps the avatar, the lantern warmth, and the planters in
    // frame (verified in-engine).
    id: 'vip_terrace',
    x: 32,
    y: 1.7,
    z: 2,
    camera: {
      alpha: -2.8,
      beta: 1.2,
      radius: 8,
      focusOffset: { x: 0, y: 0.8, z: 3 },
      positionOffset: { x: 1.5, y: 0.9, z: -5.5 },
    },
  },
] as const;
