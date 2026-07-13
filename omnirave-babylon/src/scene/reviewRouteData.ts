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
    x: 22,
    y: 1.7,
    z: -20,
    camera: {
      alpha: 0,
      beta: 1.1,
      radius: 36,
      focusOffset: { x: 14, y: 3.5, z: -7 },
      positionOffset: { x: 36, y: 16, z: -34 },
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
      // Pull the approval camera back off the LED panels and aim at the
      // upper proscenium so the crowd-pit review reads as a full hero stage,
      // not a clipped screen close-up.
      focusOffset: { x: -6, y: 24, z: 8 },
      positionOffset: { x: -6, y: 6, z: -74 },
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
    id: 'vip_terrace',
    x: 24,
    y: 8.5,
    z: 18,
    camera: {
      alpha: -2.8,
      beta: 1,
      radius: 38,
      focusOffset: { x: -20, y: 5, z: -10 },
      positionOffset: { x: -10, y: 15, z: -52 },
    },
  },
] as const;
