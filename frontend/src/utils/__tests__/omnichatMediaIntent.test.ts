import { describe, expect, it } from 'vitest';
import { detectOmniChatMediaIntent, parseOmniChatMediaCommand } from '../omnichatMediaIntent';

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

describe('parseOmniChatMediaCommand', () => {
  it.each([
    ['/video you are walking down the stairs in a red dress', 'video', 'you are walking down the stairs in a red dress'],
    ['/photo show me your outfit at the park', 'image', 'show me your outfit at the park'],
    ['  /selfie smiling beside the fountain  ', 'image', 'smiling beside the fountain'],
  ] as const)('parses a direct command: %s', (message, kind, prompt) => {
    expect(parseOmniChatMediaCommand(message)).toEqual({ kind, prompt });
  });

  it.each(['/video', 'please use /video here', 'video of the park'])('does not parse an incomplete or embedded command: %s', (message) => {
    expect(parseOmniChatMediaCommand(message)).toBeNull();
  });
});
