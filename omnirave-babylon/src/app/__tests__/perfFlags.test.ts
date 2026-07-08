import { describe, expect, it } from 'vitest';

import { parsePerfFlags } from '../perfFlags';

describe('parsePerfFlags', () => {
  it('parses a comma list of perf isolation flags', () => {
    expect(parsePerfFlags('?perf=noshadows,nopost')).toEqual({
      noShadows: true,
      noPost: true,
      minimalLights: false,
      webgpu: false,
      webgl: false,
    });
  });

  it('defaults everything off without the param', () => {
    expect(parsePerfFlags('')).toEqual({ noShadows: false, noPost: false, minimalLights: false, webgpu: false, webgl: false });
  });
});
