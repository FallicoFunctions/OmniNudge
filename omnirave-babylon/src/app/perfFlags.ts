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
  webgl: boolean;
  debug: boolean;
  // Approval-pack helper: when paired with ?debug=1, keep the review controls
  // operable but visually transparent so browser screenshots contain only the
  // rendered scene. Ignored outside debug mode.
  capture: boolean;
  // World connection override: ?world=<ws url>&wtoken=<world session JWT>.
  // Both must be present to take effect. This is a local dev/review
  // shortcut ONLY - the real shipped launch flow hands off `?mode=&handoff=`
  // instead, which createRuntime.ts exchanges for a world socket URL/token
  // via sessionExchange.ts. Leaving all four params off boots the scene with
  // no world backend at all (solo dev/review), not a supported way to play.
  worldUrl: string | null;
  worldToken: string | null;
  // Set by createAuthPopup's post-login/signup reload (?acct=1) alongside a
  // fresh world/wtoken pair, so the top-right controls boot straight into
  // 'account' mode instead of flashing 'guest' for one frame. Logout's reload
  // omits it, which is what puts the controls back into 'guest' mode.
  accountMode: boolean;
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

  const debug = tokens.has('debug') || debugParam === '1' || debugParam === '';

  return {
    noShadows: tokens.has('noshadows'),
    noPost: tokens.has('nopost'),
    minimalLights: tokens.has('minimallights'),
    webgl: tokens.has('webgl'),
    debug,
    capture: debug && params.get('capture') === '1',
    worldUrl: params.get('world'),
    worldToken: params.get('wtoken'),
    accountMode: params.get('acct') === '1',
  };
}
