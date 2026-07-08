// Boot-time performance isolation flags, e.g. ?perf=noshadows,nopost
//
// Live-toggling features for cost attribution proved unreliable: every
// toggle triggers shader recompilation storms that poison the measurement.
// These flags strip a feature for the whole session so each configuration
// compiles once and measures at steady state.

export interface PerfFlags {
  noShadows: boolean;
  noPost: boolean;
  minimalLights: boolean;
  webgpu: boolean;
}

export function parsePerfFlags(search: string): PerfFlags {
  const raw = new URLSearchParams(search).get('perf') ?? '';
  const tokens = new Set(
    raw
      .split(',')
      .map((token) => token.trim().toLowerCase())
      .filter(Boolean),
  );
  return {
    noShadows: tokens.has('noshadows'),
    noPost: tokens.has('nopost'),
    minimalLights: tokens.has('minimallights'),
    webgpu: tokens.has('webgpu'),
  };
}
