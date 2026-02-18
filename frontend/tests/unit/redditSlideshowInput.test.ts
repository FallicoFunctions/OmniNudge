import { describe, expect, it } from 'vitest';
import {
  formatRedditSlideshowInput,
  parseRedditSlideshowInput,
} from '../../src/utils/redditSlideshowInput';

describe('redditSlideshowInput helpers', () => {
  it('parses canonical hub/subreddit prefixes', () => {
    expect(parseRedditSlideshowInput('h/gaming', 'h/', 'r/')).toEqual({
      isHub: true,
      name: 'gaming',
    });
    expect(parseRedditSlideshowInput('r/pics', 'h/', 'r/')).toEqual({
      isHub: false,
      name: 'pics',
    });
  });

  it('parses localized prefixes and bare names', () => {
    expect(parseRedditSlideshowInput('مج/arabic', 'مج/', 'رد/')).toEqual({
      isHub: true,
      name: 'arabic',
    });
    expect(parseRedditSlideshowInput('رد/funny', 'مج/', 'رد/')).toEqual({
      isHub: false,
      name: 'funny',
    });
    expect(parseRedditSlideshowInput('askreddit', 'h/', 'r/')).toEqual({
      isHub: false,
      name: 'askreddit',
    });
  });

  it('formats input with the correct prefix', () => {
    expect(formatRedditSlideshowInput('hub', 'space', 'h/', 'r/')).toBe('h/space');
    expect(formatRedditSlideshowInput('subreddit', 'cats', 'h/', 'r/')).toBe('r/cats');
    expect(formatRedditSlideshowInput('hub', 'tech', 'مج/', 'رد/')).toBe('مج/tech');
  });
});

