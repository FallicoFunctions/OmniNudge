export interface MovementInput {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
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
