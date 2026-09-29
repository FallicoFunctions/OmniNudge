/** Isolated avatar-review camera checkpoints. Pure module (unit-tested). */

export type ReviewViewId =
  | 'back'
  | 'front'
  | 'front-three-quarter'
  | 'left-profile'
  | 'rear-three-quarter'
  | 'right-profile';

export const REVIEW_VIEW_IDS: readonly ReviewViewId[] = [
  'front',
  'back',
  'left-profile',
  'right-profile',
  'front-three-quarter',
  'rear-three-quarter',
];

export interface ReviewCheckpoint {
  alpha: number;
  beta: number;
  radius: number;
  targetY: number;
}

const FULL_BODY: ReviewCheckpoint = { alpha: Math.PI / 2, beta: 1.45, radius: 3.0, targetY: 0.9 };

const VIEW_ALPHAS: Readonly<Record<ReviewViewId, number>> = {
  // Alpha convention matches the main-stage review framing, where PI/2 faces
  // the authored character's front.
  front: Math.PI / 2,
  back: -Math.PI / 2,
  'left-profile': Math.PI,
  'right-profile': 0,
  'front-three-quarter': Math.PI / 4,
  'rear-three-quarter': -Math.PI / 4,
};

export function resolveReviewCheckpoint(view: string | null): { id: ReviewViewId; checkpoint: ReviewCheckpoint } {
  const id = REVIEW_VIEW_IDS.includes(view as ReviewViewId) ? (view as ReviewViewId) : 'front';
  return { id, checkpoint: { ...FULL_BODY, alpha: VIEW_ALPHAS[id] } };
}

export type ReviewCharacterId = 'female' | 'male';

export function resolveReviewCharacter(character: string | null): ReviewCharacterId {
  return character === 'female' ? 'female' : 'male';
}
