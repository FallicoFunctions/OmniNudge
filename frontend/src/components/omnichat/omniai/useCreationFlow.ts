import { useCallback, useMemo, useState } from 'react';
import type { OmniAIOptions, OmniAIAppearanceAnswers } from '../../../types/omnichat';
import { NAME_LIMIT, normalizeOmniAIName } from './name';

/**
 * The answers, and the rules about which of them are still valid.
 *
 * Kept apart from the rendering because the interesting part is not the markup:
 * it is that answering one question can invalidate a later one. Picking anime,
 * choosing violet eyes, then going back and picking realistic leaves an eye
 * colour the server will silently drop -- so it is cleared here, the moment the
 * answer it depended on changes.
 */
export interface CreationAnswers {
  style: string;
  gender: string;
  age: number;
  heightInches: number;
  ethnicity: string;
  hairLength: string;
  hairTexture: string;
  hairStyle: string;
  hairColour: string;
  eyes: string;
  build: string;
  temperaments: string[];
  interests: string[];
  feeling: string;
  relationship: string;
  name: string;
  /** How she dresses, in the creator's own words. Optional, and the only free
   *  text on a form that is otherwise all picked from lists. */
  styleNote: string;
}

/**
 * The screens by name.
 *
 * They were bare numbers, and every one of them appeared in a `step === 4` in
 * the markup, the rail and the tests. Adding a screen at the front meant
 * renumbering all of them by hand and hoping. Now inserting one is an edit to
 * this table.
 */
export const STEP = {
  intro: 1,
  basics: 2,
  look: 3,
  face: 4,
  build: 5,
  style: 6,
  traits: 7,
  interests: 8,
  you: 9,
  name: 10,
  review: 11,
} as const;

/** omniAIStyleMaxNoteRunes on the server. Counted in code points like the name,
 *  so a note written outside the basic plane is not cut early. */
export const STYLE_NOTE_LIMIT = 300;

export const TOTAL_STEPS = STEP.review;

/** omniChatOmniAINameRunes on the server. Counted in code points, not UTF-16 units,
 *  so a name written in characters outside the basic plane is not cut early.
 *  Declared with the rest of the name rule and re-exported here, because two
 *  copies of a limit are two limits. */
export { NAME_LIMIT };

/**
 * Where the two sliders start.
 *
 * Chosen rather than computed. An earlier version put the age at a third of the
 * sum of the bounds, which lands on 39 by accident and reads as if somebody
 * meant it. Both are clamped into whatever range the server actually serves, so
 * a bound moving on the server moves these with it.
 */
const DEFAULT_AGE = 27;
const DEFAULT_HEIGHT_INCHES = 66;

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

function emptyAnswers(options: OmniAIOptions | undefined): CreationAnswers {
  return {
    style: '',
    gender: '',
    age: options ? clamp(DEFAULT_AGE, options.minimum_age, options.maximum_age) : DEFAULT_AGE,
    heightInches: options
      ? clamp(DEFAULT_HEIGHT_INCHES, options.minimum_height_inches, options.maximum_height_inches)
      : DEFAULT_HEIGHT_INCHES,
    ethnicity: '',
    hairLength: '',
    hairTexture: '',
    hairStyle: '',
    hairColour: '',
    eyes: '',
    build: '',
    temperaments: [],
    interests: [],
    feeling: '',
    // Friendship is the honest default rather than an unanswered state, and it
    // is what the column carries. Nobody is handed a romance they did not pick.
    relationship: 'friend',
    name: '',
    styleNote: '',
  };
}

/** What this character's eyes may be, given the drawing style. */
export function eyeChoices(options: OmniAIOptions | undefined, style: string): string[] {
  return options?.eyes?.[style] ?? options?.eyes?.realistic ?? [];
}

/** The silhouettes offered for this gender. */
export function buildChoices(options: OmniAIOptions | undefined, gender: string): string[] {
  return options?.builds?.[gender] ?? [];
}

/**
 * The shapes this hair can wear. Length is deliberately not an input: a bun
 * above a buzz cut is an ordinary haircut, and the server takes the same view.
 */
export function hairStyleChoices(
  options: OmniAIOptions | undefined,
  style: string,
  gender: string,
  texture: string
): string[] {
  const byStyle = options?.hair_styles?.[style] ?? options?.hair_styles?.realistic;
  const byGender = byStyle?.[gender];
  if (!byGender) return [];
  if (texture) return byGender[texture] ?? [];

  // No texture answered yet, so nothing is ruled out by one. The server applies
  // its texture rule only when a texture is given, and falling back to the
  // first texture's list here made the client stricter than the server -- it
  // hid an afro before anybody had said whether the hair was straight.
  const everything: string[] = [];
  Object.keys(byGender).forEach((key) => {
    byGender[key].forEach((shape) => {
      if (!everything.includes(shape)) everything.push(shape);
    });
  });
  return everything;
}

export function useCreationFlow(options: OmniAIOptions | undefined) {
  const [step, setStep] = useState(1);
  const [answers, setAnswers] = useState<CreationAnswers>(() => emptyAnswers(options));

  /** Clear anything that no longer fits what it depended on. */
  const prune = useCallback(
    (next: CreationAnswers): CreationAnswers => {
      const pruned = { ...next };
      if (pruned.eyes && !eyeChoices(options, pruned.style).includes(pruned.eyes)) {
        pruned.eyes = '';
      }
      if (pruned.build && !buildChoices(options, pruned.gender).includes(pruned.build)) {
        pruned.build = '';
      }
      const shapes = hairStyleChoices(options, pruned.style, pruned.gender, pruned.hairTexture);
      if (pruned.hairStyle && !shapes.includes(pruned.hairStyle)) {
        pruned.hairStyle = '';
      }
      return pruned;
    },
    [options]
  );

  const answer = useCallback(
    <K extends keyof CreationAnswers>(field: K, value: CreationAnswers[K]) => {
      setAnswers((current) => prune({ ...current, [field]: value }));
    },
    [prune]
  );

  /**
   * The one field somebody types into.
   *
   * Cut at the cap rather than refused at the end. The server rejects a name
   * over this length, and a form that accepts forty-one characters and fails on
   * submit is a form arguing with itself two screens later.
   */
  const setStyleNote = useCallback((value: string) => {
    setAnswers((current) => ({
      ...current,
      styleNote: [...value].slice(0, STYLE_NOTE_LIMIT).join(''),
    }));
  }, []);

  const setName = useCallback((value: string) => {
    setAnswers((current) => ({ ...current, name: [...value].slice(0, NAME_LIMIT).join('') }));
  }, []);

  /** Add or remove one of a capped set. Picking past the cap does nothing. */
  const toggle = useCallback((field: 'temperaments' | 'interests', key: string, cap: number) => {
    setAnswers((current) => {
      const chosen = current[field];
      if (chosen.includes(key)) {
        return { ...current, [field]: chosen.filter((entry) => entry !== key) };
      }
      if (chosen.length >= cap) return current;
      return { ...current, [field]: [...chosen, key] };
    });
  }, []);

  const ready = useMemo(() => {
    switch (step) {
      case STEP.basics:
        return Boolean(answers.gender);
      case STEP.look:
        return Boolean(answers.style);
      // Three is a ceiling rather than a quota: forcing a third pick makes
      // somebody choose filler, and filler becomes personality she carries.
      case STEP.traits:
        return answers.temperaments.length >= 1;
      case STEP.you:
        return Boolean(answers.feeling);
      // The same rule the server applies, so a name it will refuse cannot be
      // carried through the rest of the flow and refused at the end.
      case STEP.name:
        return normalizeOmniAIName(answers.name).problem === null;
      // The intro asks nothing, and the screens with no required answer let
      // somebody through without one on purpose.
      default:
        return true;
    }
  }, [step, answers]);

  const goBack = useCallback(() => setStep((current) => Math.max(1, current - 1)), []);
  const goForward = useCallback(() => setStep((current) => Math.min(TOTAL_STEPS, current + 1)), []);
  /** The rail goes back to answered screens and never skips ahead. */
  const jumpTo = useCallback((target: number) => {
    setStep((current) => (target <= current ? target : current));
  }, []);

  const appearance = useMemo((): OmniAIAppearanceAnswers => {
    const payload: OmniAIAppearanceAnswers = { age: answers.age, height_inches: answers.heightInches };
    if (answers.style) payload.style = answers.style;
    if (answers.gender) payload.gender = answers.gender;
    if (answers.ethnicity) payload.ethnicity = answers.ethnicity;
    if (answers.hairLength) payload.hair_length = answers.hairLength;
    if (answers.hairTexture) payload.hair_texture = answers.hairTexture;
    if (answers.hairStyle) payload.hair_style = answers.hairStyle;
    if (answers.hairColour) payload.hair_colour = answers.hairColour;
    if (answers.eyes) payload.eyes = answers.eyes;
    if (answers.build) payload.build = answers.build;
    return payload;
  }, [answers]);

  return {
    step,
    answers,
    setAnswers,
    answer,
    setName,
    setStyleNote,
    toggle,
    ready,
    goBack,
    goForward,
    jumpTo,
    appearance,
  };
}
