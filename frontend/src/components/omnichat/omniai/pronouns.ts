/**
 * Her pronouns come from the answer, never from an assumption.
 *
 * Screen one asks woman or man precisely so nothing after it has to guess, and
 * everything before it says "they". An earlier draft of this flow called her
 * "she" on the screen that asked whether she was a woman.
 */
export interface Pronouns {
  subj: string;
  Subj: string;
  obj: string;
  Obj: string;
  poss: string;
  Poss: string;
  /** "is" or "are", so verb agreement survives the unanswered case. */
  is: string;
  /** "s" or "", for third-person singular verbs: start / starts. */
  s: string;
  noun: string;
}

export function pronounsFor(gender: string | undefined): Pronouns {
  if (gender === 'man') {
    return {
      subj: 'he', Subj: 'He', obj: 'him', Obj: 'Him',
      poss: 'his', Poss: 'His', is: 'is', s: 's', noun: 'man',
    };
  }
  if (gender === 'woman') {
    return {
      subj: 'she', Subj: 'She', obj: 'her', Obj: 'Her',
      poss: 'her', Poss: 'Her', is: 'is', s: 's', noun: 'woman',
    };
  }
  return {
    subj: 'they', Subj: 'They', obj: 'them', Obj: 'Them',
    poss: 'their', Poss: 'Their', is: 'are', s: '', noun: 'character',
  };
}

export const feetAndInches = (inches: number): string =>
  `${Math.floor(inches / 12)}'${inches % 12}"`;
