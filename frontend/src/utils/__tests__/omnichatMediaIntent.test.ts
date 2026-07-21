import { describe, expect, it } from 'vitest';
import { detectOmniChatMediaIntent } from '../omnichatMediaIntent';

describe('detectOmniChatMediaIntent', () => {
  it.each([
    ['Show me what your outfit looks like today', 'image'],
    ['send me a photo of you at the park', 'image'],
    ['Can you take a selfie?', 'image'],
    ['make a short video of this scene', 'video'],
    ['show me this moment in motion', 'video'],
  ] as const)('recognizes an explicit contextual request: %s', (message, kind) => {
    expect(detectOmniChatMediaIntent(message)).toBe(kind);
  });

  it.each([
    'I watched a video yesterday',
    'That picture frame looks old',
    'What should we do next?',
  ])('does not trigger from incidental media words: %s', (message) => {
    expect(detectOmniChatMediaIntent(message)).toBeNull();
  });
});
