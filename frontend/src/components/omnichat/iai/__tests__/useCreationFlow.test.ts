import { describe, expect, it } from 'vitest';
import { buildChoices, eyeChoices, hairStyleChoices, NAME_LIMIT } from '../useCreationFlow';
import type { IAIOptions } from '../../../../types/omnichat';

/**
 * The rules the server enforces, checked on the client that draws from it.
 *
 * Every one of these was wrong at some point in a way TypeScript could not see:
 * the flow was stricter than the server about an unanswered hair texture, and
 * the name field had no cap at all while the server refused anything over one.
 */
const options = {
  eyes: {
    realistic: ['brown', 'blue', 'amber'],
    anime: ['brown', 'blue', 'amber', 'violet', 'crimson', 'gold'],
  },
  builds: {
    woman: ['slim', 'average', 'athletic', 'curvy', 'muscular', 'plus_size'],
    man: ['slim', 'lean', 'average', 'athletic', 'muscular', 'stocky', 'heavy'],
  },
  hair_styles: {
    realistic: {
      woman: {
        straight: ['natural', 'bob', 'pixie'],
        wavy: ['natural', 'bob', 'pixie'],
        curly: ['natural', 'bob', 'pixie', 'afro'],
        coily: ['natural', 'bob', 'pixie', 'afro'],
      },
      man: { straight: ['natural', 'fade'], wavy: ['natural', 'fade'],
             curly: ['natural', 'fade', 'afro'], coily: ['natural', 'fade', 'afro'] },
    },
    anime: {
      woman: { straight: ['natural', 'bob', 'pixie', 'afro'], wavy: ['natural', 'afro'],
               curly: ['natural', 'afro'], coily: ['natural', 'afro'] },
      man: { straight: ['natural', 'afro'], wavy: ['natural', 'afro'],
             curly: ['natural', 'afro'], coily: ['natural', 'afro'] },
    },
  },
} as unknown as IAIOptions;

describe('what the flow may offer', () => {
  it('offers unnatural eyes to a drawing and not to a person', () => {
    expect(eyeChoices(options, 'anime')).toContain('violet');
    expect(eyeChoices(options, 'realistic')).not.toContain('violet');
  });

  it('treats an unanswered drawing style as the stricter one', () => {
    // The style is answered two screens before the eyes, so a blank here did
    // not come from the form -- and the stricter reading is the safer one.
    expect(eyeChoices(options, '')).not.toContain('violet');
  });

  it('offers each gender its own silhouettes', () => {
    expect(buildChoices(options, 'woman')).toContain('curvy');
    expect(buildChoices(options, 'man')).not.toContain('curvy');
    expect(buildChoices(options, 'man')).toContain('stocky');
  });

  it('rules a hair shape out by texture, on a character drawn as a person', () => {
    expect(hairStyleChoices(options, 'realistic', 'woman', 'coily')).toContain('afro');
    expect(hairStyleChoices(options, 'realistic', 'woman', 'straight')).not.toContain('afro');
  });

  it('does not apply that rule to a drawing', () => {
    expect(hairStyleChoices(options, 'anime', 'woman', 'straight')).toContain('afro');
  });

  it('rules nothing out until a texture has been answered', () => {
    // The bug this replaced: falling back to the first texture's list made the
    // client stricter than the server, hiding an afro before anybody had said
    // whether the hair was straight.
    const anyTexture = hairStyleChoices(options, 'realistic', 'woman', '');
    expect(anyTexture).toContain('afro');
    expect(anyTexture).toContain('bob');
    expect(new Set(anyTexture).size).toBe(anyTexture.length);
  });

  it('caps the name where the server caps it', () => {
    expect(NAME_LIMIT).toBe(40);
  });
});
