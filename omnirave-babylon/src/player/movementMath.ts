export interface MovementInput {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
  sprint: boolean;
  up: boolean;
  down: boolean;
  // Set by the input map (sec 9.6 crouch `Hold` / `Toggle`). Optional so the
  // many hand-built MovementInput literals in tests and callers stay valid.
  crouch?: boolean;
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

export const SPRINT_SPEED_MULTIPLIER = 1.55;
// Sec 7.5: "crouched movement is reduced-speed movement, not immobility."
// Half speed reads as a deliberate duck-walk without being punishing.
export const CROUCH_SPEED_MULTIPLIER = 0.5;

/**
 * Crouch overrides sprint when both are held: crouch is a deliberate,
 * grounded slow-down (sec 7.5) and stamina has no say in it, so there is no
 * "crouch-sprint" combined speed. Callers that gate sprint on stamina (see
 * `stepStamina` below) should pass the STAMINA-ALLOWED sprint flag here, not
 * the raw held key.
 */
export function resolvePlayerSpeed(
  baseSpeedMetersPerSecond: number,
  sprint: boolean,
  crouch = false,
): number {
  if (crouch) {
    return baseSpeedMetersPerSecond * CROUCH_SPEED_MULTIPLIER;
  }
  return sprint ? baseSpeedMetersPerSecond * SPRINT_SPEED_MULTIPLIER : baseSpeedMetersPerSecond;
}

/** -1 (descend), 0, or +1 (rise) from the held vertical review-flight keys. */
export function resolveVerticalDirection(input: MovementInput): number {
  return Number(input.up) - Number(input.down);
}

// --- Sprint stamina (sec 7.4) ---------------------------------------------
//
// A first-pass, easy-to-retune budget: 0..1 unit meter that drains while
// sprinting and recovers whenever the player is not sprinting (walking,
// idle, or crouched - crouch cannot sprint at all, see resolvePlayerSpeed
// above). When it hits empty, sprint is forcibly disallowed until it climbs
// back above STAMINA_RESUME_THRESHOLD - that gap (rather than allowing
// sprint again at the exact instant it ticks past 0) is the hysteresis band
// that stops speed flickering right at the empty/recover boundary.

/** Full stamina meter, 4 seconds of continuous sprint to drain from here. */
export const STAMINA_MAX = 1;
export const STAMINA_SPRINT_DRAIN_PER_SECOND = 0.25;
/** ~6.7s from empty to full at rest. */
export const STAMINA_RECOVERY_PER_SECOND = 0.15;
/** Hysteresis floor: must climb back above 15% before sprint re-engages. */
export const STAMINA_RESUME_THRESHOLD = 0.15;

export interface StaminaState {
  stamina: number;
  /** True from the instant stamina hits 0 until it clears the resume threshold. */
  depleted: boolean;
}

export function createStaminaState(): StaminaState {
  return { stamina: STAMINA_MAX, depleted: false };
}

/**
 * Advances a stamina meter in place (no allocation - safe to call every
 * render frame) and returns whether sprint is actually allowed this frame.
 * `sprintRequested` should be the raw held-sprint input; crouch/guest gating
 * happens at the call site, not here.
 */
export function stepStamina(
  state: StaminaState,
  sprintRequested: boolean,
  deltaSeconds: number,
): boolean {
  const sprintingNow = sprintRequested && !state.depleted;
  if (sprintingNow) {
    state.stamina = Math.max(0, state.stamina - STAMINA_SPRINT_DRAIN_PER_SECOND * deltaSeconds);
  } else {
    state.stamina = Math.min(STAMINA_MAX, state.stamina + STAMINA_RECOVERY_PER_SECOND * deltaSeconds);
  }

  if (state.stamina <= 0) {
    state.depleted = true;
  } else if (state.depleted && state.stamina >= STAMINA_RESUME_THRESHOLD) {
    state.depleted = false;
  }

  return sprintRequested && !state.depleted;
}
