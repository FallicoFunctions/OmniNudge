/**
 * The same rule the server applies to her name, applied before the flow ends.
 *
 * Her name is interpolated into the first line of her system prompt, so nothing
 * in it may terminate a sentence or open a line. The server is the authority --
 * this is not a second opinion, it is the same rule stated early so somebody
 * finds out on the screen where they typed the name rather than ten screens
 * later when the character is refused.
 *
 * Keep it in step with normalizeOmniAIName in
 * backend/internal/services/omnichat_omniai_creation.go.
 */

export const NAME_LIMIT = 40;

/** A phone keyboard writes the curly forms. They are not a different name. */
const TYPOGRAPHY: Array<[RegExp, string]> = [
  [/[‘’ʼ]/g, "'"],
  [/[‐‑‒–—−]/g, '-'],
];

const SHAPE = /^[\p{L}\p{N}][\p{L}\p{N}'-]*(?: [\p{L}\p{N}][\p{L}\p{N}'-]*)*$/u;

export type NameProblem = 'required' | 'too_long' | 'invalid' | null;

/**
 * Folds what can be folded and reports what cannot.
 *
 * Spaces and tabs collapse; a line break does not, because a line break in a
 * name is never a typo.
 */
export function normalizeOmniAIName(raw: string): { name: string; problem: NameProblem } {
  let name = raw;
  for (const [pattern, replacement] of TYPOGRAPHY) name = name.replace(pattern, replacement);
  name = name.replace(/[ \t]+/g, ' ').trim();

  // A refused name comes back empty, the way the server's does. There is no
  // half-accepted name to hand on, and returning one invites a caller to use
  // it.
  if (name === '') return { name: '', problem: 'required' };
  if ([...name].length > NAME_LIMIT) return { name: '', problem: 'too_long' };
  if (!SHAPE.test(name)) return { name: '', problem: 'invalid' };
  return { name, problem: null };
}
