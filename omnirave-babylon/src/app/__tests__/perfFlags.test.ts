import { describe, expect, it } from 'vitest';

import { parsePerfFlags } from '../perfFlags';

describe('parsePerfFlags', () => {
  it('parses a comma list of perf isolation flags', () => {
    expect(parsePerfFlags('?perf=noshadows,nopost')).toEqual({
      noShadows: true,
      noPost: true,
      minimalLights: false,
      webgl: false,
      debug: false,
      worldUrl: null,
      worldToken: null,
    });
  });

  it('defaults everything off without the param', () => {
    expect(parsePerfFlags('')).toEqual({
      noShadows: false,
      noPost: false,
      minimalLights: false,
      webgl: false,
      debug: false,
      worldUrl: null,
      worldToken: null,
    });
  });

  it('parses world socket opt-in params', () => {
    const flags = parsePerfFlags('?world=ws%3A%2F%2Flocalhost%3A8090%2Fws&wtoken=abc.def.ghi');
    expect(flags.worldUrl).toBe('ws://localhost:8090/ws');
    expect(flags.worldToken).toBe('abc.def.ghi');
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
