import { describe, expect, it } from 'vitest';
import {
  createPlayerHud,
  formatCommunityLabel,
  formatGlobalPlayerCount,
  formatNowPlaying,
  formatPlayerHudElapsedRemaining,
  formatPlayerHudTime,
  formatVenueName,
  formatVenuePlayerCount,
  resolvePlayerCounts,
  type PlayerHudState,
} from '../createPlayerHud';

function state(overrides: Partial<PlayerHudState> = {}): PlayerHudState {
  return {
    venueName: 'Main Stage',
    artist: 'Fallico',
    title: "Nick's Mix Vol. 13",
    elapsedSeconds: 724,
    durationSeconds: 7827,
    ...overrides,
  };
}

describe('formatPlayerHudTime', () => {
  it('formats sub-hour durations as m:ss', () => {
    expect(formatPlayerHudTime(0)).toBe('0:00');
    expect(formatPlayerHudTime(9)).toBe('0:09');
    expect(formatPlayerHudTime(724)).toBe('12:04');
    expect(formatPlayerHudTime(3599)).toBe('59:59');
  });

  it('formats hour-long durations as h:mm:ss', () => {
    expect(formatPlayerHudTime(3600)).toBe('1:00:00');
    expect(formatPlayerHudTime(7827)).toBe('2:10:27');
  });

  it('clamps negative and non-finite input to zero', () => {
    expect(formatPlayerHudTime(-42)).toBe('0:00');
    expect(formatPlayerHudTime(Number.NaN)).toBe('0:00');
    expect(formatPlayerHudTime(Number.POSITIVE_INFINITY)).toBe('0:00');
  });
});

describe('formatPlayerHudElapsedRemaining', () => {
  it('renders elapsed plus negative remaining', () => {
    expect(formatPlayerHudElapsedRemaining(724, 7827)).toBe('12:04 / -1:58:23');
  });

  it('renders a zero remaining at the end of the track', () => {
    expect(formatPlayerHudElapsedRemaining(7827, 7827)).toBe('2:10:27 / -0:00');
  });

  it('clamps elapsed past the duration', () => {
    expect(formatPlayerHudElapsedRemaining(9000, 7827)).toBe('2:10:27 / -0:00');
  });

  it('drops the remaining side when the duration is unknown', () => {
    expect(formatPlayerHudElapsedRemaining(65, 0)).toBe('1:05');
    expect(formatPlayerHudElapsedRemaining(0, 0)).toBe('0:00');
  });
});

describe('formatNowPlaying', () => {
  it('joins artist and title with a dash', () => {
    expect(formatNowPlaying('Fallico', "Nick's Mix Vol. 13")).toBe("Fallico - Nick's Mix Vol. 13");
  });

  it('falls back to whichever half is present', () => {
    expect(formatNowPlaying('', 'Main Stage Set 02')).toBe('Main Stage Set 02');
    expect(formatNowPlaying('OmniRave', '  ')).toBe('OmniRave');
  });

  it('reports no track when both halves are empty', () => {
    expect(formatNowPlaying('', '')).toBe('No track playing');
  });
});

describe('formatVenueName', () => {
  it('maps known zone ids to venue names', () => {
    expect(formatVenueName('main_stage')).toBe('Main Stage');
    expect(formatVenueName('underground')).toBe('The Underground');
    expect(formatVenueName('plurr_partay')).toBe('P.L.U.R.R. Partay');
  });

  it('falls back to the raw id for unknown zones', () => {
    expect(formatVenueName('secret_room')).toBe('secret_room');
  });
});

describe('createPlayerHud', () => {
  it('renders the panel into the host', () => {
    const host = document.createElement('div');
    const hud = createPlayerHud(host);

    expect(host.querySelector('[data-testid="player-hud"]')).toBe(hud.element);
    expect(host.querySelector('[data-testid="player-hud-track"]')?.textContent).toBe(
      'No track playing',
    );
    expect(host.querySelector('[data-testid="player-hud-time"]')?.textContent).toBe('0:00');
  });

  it('offsets above the perf pill only when the debug chrome is present', () => {
    const host = document.createElement('div');
    expect(createPlayerHud(host).element.className.includes('player-hud--debug-offset')).toBe(false);
    expect(
      createPlayerHud(host, { debugChromePresent: true }).element.className.includes(
        'player-hud--debug-offset',
      ),
    ).toBe(true);
  });

  it('update() writes the venue, artist - title and elapsed/remaining time', () => {
    const host = document.createElement('div');
    const hud = createPlayerHud(host);

    hud.update(state());

    expect(host.querySelector('[data-testid="player-hud-venue"]')?.textContent).toBe('Main Stage');
    expect(host.querySelector('[data-testid="player-hud-track"]')?.textContent).toBe(
      "Fallico - Nick's Mix Vol. 13",
    );
    expect(host.querySelector('[data-testid="player-hud-time"]')?.textContent).toBe(
      '12:04 / -1:58:23',
    );
  });

  it('update() re-renders when the track and venue change', () => {
    const host = document.createElement('div');
    const hud = createPlayerHud(host);

    hud.update(state());
    hud.update(
      state({
        venueName: 'The Underground',
        artist: 'OmniRave',
        title: 'Techno Room Set 01',
        elapsedSeconds: 61,
        durationSeconds: 1440,
      }),
    );

    expect(host.querySelector('[data-testid="player-hud-venue"]')?.textContent).toBe(
      'The Underground',
    );
    expect(host.querySelector('[data-testid="player-hud-track"]')?.textContent).toBe(
      'OmniRave - Techno Room Set 01',
    );
    expect(host.querySelector('[data-testid="player-hud-time"]')?.textContent).toBe(
      '1:01 / -22:59',
    );
  });

  it('shows the venue with no track when there is no world connection', () => {
    const host = document.createElement('div');
    const hud = createPlayerHud(host);

    hud.update(state({ artist: '', title: '', elapsedSeconds: 0, durationSeconds: 0 }));

    expect(host.querySelector('[data-testid="player-hud-venue"]')?.textContent).toBe('Main Stage');
    expect(host.querySelector('[data-testid="player-hud-track"]')?.textContent).toBe(
      'No track playing',
    );
    expect(host.querySelector('[data-testid="player-hud-time"]')?.textContent).toBe('0:00');
  });

  it('dispose() removes the panel from the host', () => {
    const host = document.createElement('div');
    const hud = createPlayerHud(host);

    hud.dispose();

    expect(host.querySelector('[data-testid="player-hud"]')).toBe(null);
  });

  it('renders the venue block in the spec order: venue, now playing, global, venue count', () => {
    const host = document.createElement('div');
    const hud = createPlayerHud(host);

    hud.update(state({ zoneId: 'main_stage', globalPlayerCount: 12, venuePlayerCount: 5 }));

    const order = Array.from(host.querySelectorAll<HTMLElement>('[data-testid^="player-hud-"]'))
      .map((node) => node.dataset.testid)
      .filter((id) => id !== 'player-hud');

    expect(order.join(',')).toBe(
      'player-hud-venue,player-hud-track,player-hud-time,player-hud-global-count,player-hud-venue-count',
    );
  });

  it('renders both counts with the venue community label', () => {
    const host = document.createElement('div');
    const hud = createPlayerHud(host);

    hud.update(state({ zoneId: 'underground', globalPlayerCount: 1204, venuePlayerCount: 48 }));

    expect(host.querySelector('[data-testid="player-hud-global-count"]')?.textContent).toBe(
      '1,204 ravers online',
    );
    expect(host.querySelector('[data-testid="player-hud-venue-count"]')?.textContent).toBe(
      '48 Undergrounders',
    );
    expect(
      host.querySelector<HTMLElement>('[data-testid="player-hud-venue-count"]')?.hidden,
    ).toBe(false);
  });

  it('hides both counts when there is no world connection', () => {
    const host = document.createElement('div');
    const hud = createPlayerHud(host);

    hud.update(state());

    expect(
      host.querySelector<HTMLElement>('[data-testid="player-hud-global-count"]')?.hidden,
    ).toBe(true);
    expect(
      host.querySelector<HTMLElement>('[data-testid="player-hud-venue-count"]')?.hidden,
    ).toBe(true);
  });
});

describe('venue player counts', () => {
  it('uses the spec community labels', () => {
    expect(formatCommunityLabel('main_stage')).toBe('Main Stagers');
    expect(formatCommunityLabel('underground')).toBe('Undergrounders');
    expect(formatCommunityLabel('plurr_partay')).toBe('P.L.U.R.R. Partiers');
    expect(formatCommunityLabel('unknown_zone')).toBe('Ravers');
  });

  it('singularizes a count of one', () => {
    expect(formatVenuePlayerCount('main_stage', 1)).toBe('1 Main Stager');
    expect(formatVenuePlayerCount('main_stage', 2)).toBe('2 Main Stagers');
    expect(formatVenuePlayerCount('plurr_partay', 1)).toBe('1 P.L.U.R.R. Partier');
    expect(formatVenuePlayerCount('underground', 0)).toBe('0 Undergrounders');
    expect(formatVenuePlayerCount('main_stage', 2048)).toBe('2,048 Main Stagers');
  });

  it('singularizes the global count too', () => {
    expect(formatGlobalPlayerCount(1)).toBe('1 raver online');
    expect(formatGlobalPlayerCount(0)).toBe('0 ravers online');
    expect(formatGlobalPlayerCount(1204)).toBe('1,204 ravers online');
    expect(formatGlobalPlayerCount(Number.NaN)).toBe('0 ravers online');
  });

  it('counts the whole snapshot globally and the active zone locally (local player included)', () => {
    const players = [
      { zone: 'main_stage' },
      { zone: 'main_stage' },
      { zone: 'underground' },
      { zone: 'plurr_partay' },
    ];

    const mainStage = resolvePlayerCounts(players, 'main_stage');
    expect(mainStage.globalPlayerCount).toBe(4);
    expect(mainStage.venuePlayerCount).toBe(2);

    const underground = resolvePlayerCounts(players, 'underground');
    expect(underground.globalPlayerCount).toBe(4);
    expect(underground.venuePlayerCount).toBe(1);

    const empty = resolvePlayerCounts([], 'main_stage');
    expect(empty.globalPlayerCount).toBe(0);
    expect(empty.venuePlayerCount).toBe(0);
  });
});
