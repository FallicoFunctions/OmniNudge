// SHIPPED player-facing HUD (design doc sec 9.4 "Bottom HUD" + sec 13.3 text
// display rules). This is NOT the dev review HUD (createReviewHud.ts) and is
// NOT gated behind ?debug=1.
//
// Bottom-right venue block, in the spec's order:
//   venue name
//   Now Playing -> `Artist Name - Track Title`
//   elapsed + remaining time
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

// Elapsed plus REMAINING (negative-signed), e.g. "12:04 / -1:58:23". With no
// known duration there is no remaining to show, so only the elapsed side is
// rendered.
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
  return `${formatPlayerHudTime(elapsed)} / -${formatPlayerHudTime(duration - elapsed)}`;
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

  panel.append(venue, eyebrow, track, time);
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
  }

  return {
    element: panel,
    update,
    dispose() {
      panel.remove();
    },
  };
}
