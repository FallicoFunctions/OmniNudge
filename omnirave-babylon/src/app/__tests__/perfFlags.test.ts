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
      debug: false,
    });
  });

  it('defaults everything off without the param', () => {
    expect(parsePerfFlags('')).toEqual({
      noShadows: false,
      noPost: false,
      minimalLights: false,
      webgpu: false,
      webgl: false,
      debug: false,
    });
  });

  it('enables debug via debug=1', () => {
    expect(parsePerfFlags('?debug=1').debug).toBe(true);
  });

  it('enables debug via bare ?debug presence', () => {
    expect(parsePerfFlags('?debug').debug).toBe(true);
  });

  it('enables debug via perf=debug', () => {
    expect(parsePerfFlags('?perf=debug').debug).toBe(true);
  });

  it('ignores debug=0', () => {
    expect(parsePerfFlags('?debug=0').debug).toBe(false);
  });
});
