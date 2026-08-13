// SHIPPED player-facing HUD (design doc sec 9.4 "Bottom HUD" + sec 13.3 text
// display rules). This is NOT the dev review HUD (createReviewHud.ts) and is
// NOT gated behind ?debug=1.
//
// Bottom-right venue block, in the spec's order:
//   venue name
//   Now Playing -> `Artist Name - Track Title` (+ elapsed / remaining time)
//   global player count
//   current venue player count (sec 9.4 community labels)
//
// The dev perf pill (createPerfOverlay) also anchors bottom-right, so when the
// debug chrome is present the caller passes `debugChromePresent: true` and the
// block lifts above the pill instead of sitting under it. The spec anchor is
// kept in both cases - only the offset changes.
//
// Pure DOM: no Babylon imports, safe under jsdom. Updated once per second by
// the runtime, not per frame.

export interface PlayerHudState {
  venueName: string;
  artist: string;
  title: string;
  elapsedSeconds: number;
  durationSeconds: number;
  // Zone id (not the display name) for the community label. Defaults to
  // main_stage when the caller has no zone yet.
  zoneId?: string;
  // Counts from the latest world snapshot. Undefined on the dev/review path
  // (no world connection), where both count lines are hidden instead of lying.
  globalPlayerCount?: number;
  venuePlayerCount?: number;
}

export interface PlayerHud {
  element: HTMLElement;
  update: (state: PlayerHudState) => void;
  dispose: () => void;
}

export interface CreatePlayerHudOptions {
  // True when ?debug=1 chrome (the bottom-right perf pill) is on screen.
  debugChromePresent?: boolean;
}

const NO_TRACK_LABEL = 'No track playing';

const VENUE_NAMES: Record<string, string> = {
  main_stage: 'Main Stage',
  underground: 'The Underground',
  plurr_partay: 'P.L.U.R.R. Partay',
};

// Maps a server zone id onto the player-facing venue name. Unknown ids fall
// back to the raw id so a new zone shows *something* rather than blanking.
export function formatVenueName(zoneId: string): string {
  return VENUE_NAMES[zoneId] ?? zoneId;
}

// `m:ss` under an hour, `h:mm:ss` at or above it (7827 -> "2:10:27").
export function formatPlayerHudTime(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

export function formatNowPlaying(artist: string, title: string): string {
  const cleanArtist = artist.trim();
  const cleanTitle = title.trim();
  if (cleanArtist && cleanTitle) {
    return `${cleanArtist} - ${cleanTitle}`;
  }
  return cleanTitle || cleanArtist || NO_TRACK_LABEL;
}

// Elapsed plus an explicitly labelled REMAINING value, e.g.
// "12:04 / 1:58:23 left". A bare negative timestamp looks like invalid media
// metadata when the track has just started. With no known duration there is
// no remaining value to show, so only the elapsed side is rendered.
export function formatPlayerHudElapsedRemaining(
  elapsedSeconds: number,
  durationSeconds: number,
): string {
  const duration = Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : 0;
  const rawElapsed = Number.isFinite(elapsedSeconds) && elapsedSeconds > 0 ? elapsedSeconds : 0;
  if (duration <= 0) {
    return formatPlayerHudTime(rawElapsed);
  }
  const elapsed = Math.min(rawElapsed, duration);
  return `${formatPlayerHudTime(elapsed)} / ${formatPlayerHudTime(duration - elapsed)} left`;
}

// Community labels, verbatim from sec 9.4. Unknown zones fall back to a
// neutral "Ravers" so a new venue still renders a count.
const COMMUNITY_LABELS: Record<string, string> = {
  main_stage: 'Main Stagers',
  underground: 'Undergrounders',
  plurr_partay: 'P.L.U.R.R. Partiers',
};

const DEFAULT_COMMUNITY_LABEL = 'Ravers';

export function formatCommunityLabel(zoneId: string): string {
  return COMMUNITY_LABELS[zoneId] ?? DEFAULT_COMMUNITY_LABEL;
}

// All the labels are regular plurals ("Main Stagers" -> "Main Stager"), so a
// single count of 1 just drops the trailing "s".
function singularize(label: string): string {
  return label.endsWith('s') ? label.slice(0, -1) : label;
}

function formatCount(count: number): string {
  const safe = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  return safe.toLocaleString('en-US');
}

/** e.g. "1 raver online" / "1,204 ravers online". */
export function formatGlobalPlayerCount(count: number): string {
  const safe = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  return `${formatCount(safe)} ${safe === 1 ? 'raver' : 'ravers'} online`;
}

/** e.g. "1 Main Stager" / "48 Main Stagers". */
export function formatVenuePlayerCount(zoneId: string, count: number): string {
  const safe = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  const label = formatCommunityLabel(zoneId);
  return `${formatCount(safe)} ${safe === 1 ? singularize(label) : label}`;
}

// Global = every player in the snapshot (the local player included); venue =
// those whose zone matches the active zone.
export function resolvePlayerCounts(
  players: readonly { zone: string }[],
  activeZone: string,
): { globalPlayerCount: number; venuePlayerCount: number } {
  let venuePlayerCount = 0;
  for (const player of players) {
    if (player.zone === activeZone) {
      venuePlayerCount += 1;
    }
  }
  return { globalPlayerCount: players.length, venuePlayerCount };
}

export function createPlayerHud(
  host: HTMLElement,
  options: CreatePlayerHudOptions = {},
): PlayerHud {
  const panel = document.createElement('aside');
  panel.dataset.testid = 'player-hud';
  panel.className = options.debugChromePresent
    ? 'player-hud player-hud--debug-offset'
    : 'player-hud';
  panel.setAttribute('aria-label', 'Now playing');

  const venue = document.createElement('p');
  venue.dataset.testid = 'player-hud-venue';
  venue.className = 'player-hud__venue';
  venue.textContent = '';

  const eyebrow = document.createElement('p');
  eyebrow.className = 'player-hud__eyebrow';
  eyebrow.textContent = 'Now Playing';

  const track = document.createElement('p');
  track.dataset.testid = 'player-hud-track';
  track.className = 'player-hud__track';
  track.textContent = NO_TRACK_LABEL;

  const time = document.createElement('p');
  time.dataset.testid = 'player-hud-time';
  time.className = 'player-hud__time';
  time.textContent = '0:00';

  const globalCount = document.createElement('p');
  globalCount.dataset.testid = 'player-hud-global-count';
  globalCount.className = 'player-hud__count';
  globalCount.hidden = true;

  const venueCount = document.createElement('p');
  venueCount.dataset.testid = 'player-hud-venue-count';
  venueCount.className = 'player-hud__count';
  venueCount.hidden = true;

  panel.append(venue, eyebrow, track, time, globalCount, venueCount);
  host.appendChild(panel);

  function update(state: PlayerHudState): void {
    // Only touch the DOM when the rendered text actually changed - this runs
    // on a timer next to a live render loop.
    const venueText = state.venueName.trim();
    if (venue.textContent !== venueText) {
      venue.textContent = venueText;
    }

    const trackText = formatNowPlaying(state.artist, state.title);
    if (track.textContent !== trackText) {
      track.textContent = trackText;
    }

    const timeText = formatPlayerHudElapsedRemaining(state.elapsedSeconds, state.durationSeconds);
    if (time.textContent !== timeText) {
      time.textContent = timeText;
    }

    // No snapshot (no world connection) -> no counts to show. Hiding
    // beats inventing a number.
    const zoneId = state.zoneId ?? 'main_stage';
    if (state.globalPlayerCount === undefined) {
      globalCount.hidden = true;
    } else {
      const globalText = formatGlobalPlayerCount(state.globalPlayerCount);
      if (globalCount.textContent !== globalText) {
        globalCount.textContent = globalText;
      }
      globalCount.hidden = false;
    }

    if (state.venuePlayerCount === undefined) {
      venueCount.hidden = true;
    } else {
      const venueCountText = formatVenuePlayerCount(zoneId, state.venuePlayerCount);
      if (venueCount.textContent !== venueCountText) {
        venueCount.textContent = venueCountText;
      }
      venueCount.hidden = false;
    }
  }

  return {
    element: panel,
    update,
    dispose() {
      panel.remove();
    },
  };
}
