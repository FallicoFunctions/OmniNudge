export interface MovementInput {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
  sprint: boolean;
  up: boolean;
  down: boolean;
}

export interface MoveVector {
  x: number;
  z: number;
  magnitude: number;
}

export function resolveMoveVector(input: MovementInput): MoveVector {
  const x = Number(input.right) - Number(input.left);
  const z = Number(input.forward) - Number(input.backward);

  if (x === 0 && z === 0) {
    return { x: 0, z: 0, magnitude: 0 };
  }

  const magnitude = Math.hypot(x, z);

  return {
    x: x / magnitude,
    z: z / magnitude,
    magnitude: 1,
  };
}

export function resolveCameraRelativeMoveVector(
  input: MovementInput,
  cameraForward: { x: number; z: number },
): MoveVector {
  const local = resolveMoveVector(input);
  if (local.magnitude === 0) {
    return local;
  }

  const forwardLength = Math.hypot(cameraForward.x, cameraForward.z);
  if (forwardLength === 0) {
    return local;
  }

  const forwardX = cameraForward.x / forwardLength;
  const forwardZ = cameraForward.z / forwardLength;
  const rightX = forwardZ;
  const rightZ = -forwardX;
  const x = rightX * local.x + forwardX * local.z;
  const z = rightZ * local.x + forwardZ * local.z;
  const magnitude = Math.hypot(x, z);

  if (magnitude === 0) {
    return { x: 0, z: 0, magnitude: 0 };
  }

  return {
    x: x / magnitude,
    z: z / magnitude,
    magnitude: 1,
  };
}

export function resolvePlayerSpeed(baseSpeedMetersPerSecond: number, sprint: boolean): number {
  return sprint ? baseSpeedMetersPerSecond * 1.55 : baseSpeedMetersPerSecond;
}

/** -1 (descend), 0, or +1 (rise) from the held vertical review-flight keys. */
export function resolveVerticalDirection(input: MovementInput): number {
  return Number(input.up) - Number(input.down);
}
