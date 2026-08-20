import { describe, expect, it } from 'vitest';
import {
  personaHasSceneMedia,
  personaIsSharedWithOthers,
  personaSpeaksFirst,
} from '../omnichatPersonaMode';

describe('personaSpeaksFirst', () => {
  it('withholds a stored greeting from a character who does not speak first', () => {
    expect(
      personaSpeaksFirst({ response_style_profile: 'direct_message', first_message: 'hey!' })
    ).toBe(false);
  });

  it('still opens for a character who has a greeting to give', () => {
    expect(
      personaSpeaksFirst({ response_style_profile: 'lean_narrative', first_message: 'The fire.' })
    ).toBe(true);
    expect(personaSpeaksFirst({ response_style_profile: 'lean_narrative', first_message: '  ' })).toBe(
      false
    );
    expect(personaSpeaksFirst(null)).toBe(false);
  });
});

describe('personaHasSceneMedia', () => {
  it('is off only for a character with no scene', () => {
    expect(personaHasSceneMedia({ response_style_profile: 'direct_message' })).toBe(false);
    expect(personaHasSceneMedia({ response_style_profile: 'lean_narrative' })).toBe(true);
    // An unknown or absent profile must keep the existing behaviour.
    expect(personaHasSceneMedia({ response_style_profile: undefined })).toBe(true);
    expect(personaHasSceneMedia(null)).toBe(true);
  });
});

describe('personaIsSharedWithOthers', () => {
  it('is false only for a character nobody else can reach', () => {
    expect(personaIsSharedWithOthers({ visibility: 'private' })).toBe(false);
    expect(personaIsSharedWithOthers({ visibility: 'public' })).toBe(true);
    expect(personaIsSharedWithOthers({ visibility: 'unlisted' })).toBe(true);
  });

  it('warns rather than reassures when visibility is unknown', () => {
    expect(personaIsSharedWithOthers({ visibility: undefined })).toBe(true);
    expect(personaIsSharedWithOthers(null)).toBe(true);
  });
});
