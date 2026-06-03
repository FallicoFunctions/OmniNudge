import { describe, expect, it, vi } from 'vitest';
import { activeStageForZone, syncStagePlayers } from '../zones';

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
  it('returns the correct active stage for a confirmed zone', () => {
    expect(activeStageForZone('main_stage')).toBe('main_stage');
    expect(activeStageForZone('techno_room')).toBe('techno_room');
    expect(activeStageForZone('neon_room')).toBe('neon_room');
  });

  it('mutes all non-active stages and leaves only the current zone audible', () => {
    const mainStage = createPlayerDouble();
    const technoRoom = createPlayerDouble();
    const neonRoom = createPlayerDouble();

    syncStagePlayers('techno_room', {
      main_stage: mainStage,
      techno_room: technoRoom,
      neon_room: neonRoom,
    });

    expect(technoRoom.unmute).toHaveBeenCalledTimes(1);
    expect(technoRoom.play).toHaveBeenCalledTimes(1);
    expect(mainStage.mute).toHaveBeenCalledTimes(1);
    expect(neonRoom.mute).toHaveBeenCalledTimes(1);
  });
});
