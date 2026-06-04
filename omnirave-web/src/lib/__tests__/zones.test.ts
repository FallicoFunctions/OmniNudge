import { describe, expect, it, vi } from 'vitest';
import { activeStageForZone, syncStagePlayers, zoneDisplayName, zoneMoveTarget, ZONE_ORDER } from '../zones';

function createPlayerDouble() {
  return {
    setVideo: vi.fn(),
    play: vi.fn(),
    mute: vi.fn(),
    unmute: vi.fn(),
    seekTo: vi.fn(),
  };
}

describe('zones', () => {
  it('uses the approved runtime venue IDs and labels', () => {
    expect(ZONE_ORDER).toEqual(['main_stage', 'underground', 'plurr_partay']);
    expect(zoneDisplayName('underground')).toBe('The Underground');
    expect(zoneDisplayName('plurr_partay')).toBe('P.L.U.R.R. Partay');
    expect(zoneMoveTarget('main_stage')).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('returns the correct active stage for a confirmed zone', () => {
    expect(activeStageForZone('main_stage')).toBe('main_stage');
    expect(activeStageForZone('underground')).toBe('underground');
    expect(activeStageForZone('plurr_partay')).toBe('plurr_partay');
  });

  it('mutes all non-active stages and leaves only the current zone audible', () => {
    const mainStage = createPlayerDouble();
    const underground = createPlayerDouble();
    const plurrPartay = createPlayerDouble();

    syncStagePlayers('underground', {
      main_stage: mainStage,
      underground,
      plurr_partay: plurrPartay,
    });

    expect(underground.unmute).toHaveBeenCalledTimes(1);
    expect(underground.play).toHaveBeenCalledTimes(1);
    expect(mainStage.mute).toHaveBeenCalledTimes(1);
    expect(plurrPartay.mute).toHaveBeenCalledTimes(1);
  });
});
