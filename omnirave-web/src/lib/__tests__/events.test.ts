import { describe, expect, it } from 'vitest';
import { activeZoneEvent, formatZoneEventHeadline } from '../events';

describe('events helpers', () => {
  it('selects the active-zone event from the runtime session', () => {
    expect(
      activeZoneEvent({
        playerId: 'guest-42',
        playerName: 'Guest-42',
        worldSocketUrl: 'ws://localhost:8092/ws',
        mode: 'guest',
        activeZone: 'underground',
        lastVenue: 'main_stage',
        settings: {
          uiTheme: 'Luminous Panels',
          graphicsMode: 'auto',
          graphicsLevel: 7,
          displayNames: true,
          chatCollapsed: false,
          crouchMode: 'hold',
          cameraFollow: 'free',
        },
        zoneEvents: [
          { zoneId: 'main_stage', phase: 'active', eventName: 'fireworks', activeMinute: 2 },
          { zoneId: 'underground', phase: 'active', eventName: 'collapse', activeMinute: 1 },
        ],
      }),
    ).toMatchObject({ zoneId: 'underground', eventName: 'collapse' });
  });

  it('formats the main-stage lead-in countdown copy', () => {
    expect(
      formatZoneEventHeadline({
        zoneId: 'main_stage',
        phase: 'lead_in',
        eventName: 'fireworks',
        countdownSeconds: 10,
      }),
    ).toContain('Fireworks begin in');
  });

  it('formats venue-specific copy for underground active events', () => {
    expect(
      formatZoneEventHeadline({
        zoneId: 'underground',
        phase: 'active',
        eventName: 'collapse',
        activeMinute: 1,
      }),
    ).toContain('Collapse in motion');
  });
});
