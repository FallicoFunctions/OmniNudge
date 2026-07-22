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
  webgl: boolean;
  debug: boolean;
}

export function parsePerfFlags(search: string): PerfFlags {
  const params = new URLSearchParams(search);
  const raw = params.get('perf') ?? '';
  const tokens = new Set(
    raw
      .split(',')
      .map((token) => token.trim().toLowerCase())
      .filter(Boolean),
  );

  // The dev chrome flag lives outside the `perf=` isolation-flag list (it
  // gates DOM overlays, not render configuration) but mirrors the same
  // "explicit opt-in only" spirit: `?debug=1` and bare `?debug` both read as
  // true, `?debug=0` (or the param absent) reads as false. `perf=debug` is
  // also accepted so it composes with the other perf tokens on one query.
  const debugParam = params.get('debug');

  return {
    noShadows: tokens.has('noshadows'),
    noPost: tokens.has('nopost'),
    minimalLights: tokens.has('minimallights'),
    webgpu: tokens.has('webgpu'),
    webgl: tokens.has('webgl'),
    debug: tokens.has('debug') || debugParam === '1' || debugParam === '',
  };
}
