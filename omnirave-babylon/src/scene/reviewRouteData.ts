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
      focusOffset: { x: 0, y: 10.3, z: 18 },
      positionOffset: { x: 10, y: 20.3, z: -66 },
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
      focusOffset: { x: -2, y: 14, z: 26 },
      positionOffset: { x: 8, y: 2.6, z: -26 },
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
      focusOffset: { x: 4, y: 10.3, z: 20 },
      positionOffset: { x: 34, y: 18.3, z: -70 },
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
      focusOffset: { x: -16, y: 3.5, z: 0 },
      positionOffset: { x: 16, y: 13.5, z: -64 },
    },
  },
] as const;
