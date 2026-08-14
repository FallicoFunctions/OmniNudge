import { describe, expect, it, vi } from 'vitest';
import {
  createStageAudioDevControls,
  type StageAudioDevControlsPlayer,
} from '../createStageAudioDevControls';

function createFakePlayer(
  overrides: Partial<StageAudioDevControlsPlayer> = {},
): StageAudioDevControlsPlayer {
  return {
    getCurrentTime: vi.fn(() => 0),
    getDuration: vi.fn(() => 0),
    isPaused: vi.fn(() => true),
    play: vi.fn(),
    pause: vi.fn(),
    seekTo: vi.fn(),
    setManualOverride: vi.fn(),
    ...overrides,
  };
}

describe('createStageAudioDevControls', () => {
  it('renders the control bar into the host', () => {
    const host = document.createElement('div');
    const { element } = createStageAudioDevControls(host, createFakePlayer());

    expect(host.querySelector('[data-testid="stage-audio-dev-controls"]')).toBe(element);
    expect(host.querySelector('[data-testid="stage-audio-dev-scrubber"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="stage-audio-dev-toggle"]')).not.toBeNull();
  });

  it('disables the scrubber and shows 0:00 / 0:00 before a track loads', () => {
    const host = document.createElement('div');
    createStageAudioDevControls(host, createFakePlayer({ getDuration: vi.fn(() => 0) }));

    const slider = host.querySelector<HTMLInputElement>('[data-testid="stage-audio-dev-scrubber"]');
    const time = host.querySelector('[data-testid="stage-audio-dev-time"]');
    expect(slider?.disabled).toBe(true);
    expect(time?.textContent).toBe('0:00 / 0:00');
  });

  it('play/pause button plays when paused and takes manual override', () => {
    const host = document.createElement('div');
    const player = createFakePlayer({ isPaused: vi.fn(() => true) });
    createStageAudioDevControls(host, player);

    host.querySelector<HTMLButtonElement>('[data-testid="stage-audio-dev-toggle"]')?.click();

    expect(player.setManualOverride).toHaveBeenCalledWith(true);
    expect(player.play).toHaveBeenCalledTimes(1);
    expect(player.pause).not.toHaveBeenCalled();
  });

  it('play/pause button pauses when playing', () => {
    const host = document.createElement('div');
    const player = createFakePlayer({ isPaused: vi.fn(() => false) });
    createStageAudioDevControls(host, player);

    host.querySelector<HTMLButtonElement>('[data-testid="stage-audio-dev-toggle"]')?.click();

    expect(player.pause).toHaveBeenCalledTimes(1);
    expect(player.play).not.toHaveBeenCalled();
  });

  it('scrubbing seeks to the fraction of duration and takes manual override', () => {
    const host = document.createElement('div');
    const player = createFakePlayer({ getDuration: vi.fn(() => 200) });
    createStageAudioDevControls(host, player);

    const slider = host.querySelector<HTMLInputElement>('[data-testid="stage-audio-dev-scrubber"]')!;
    slider.value = '500'; // half of max (1000)
    slider.dispatchEvent(new Event('input'));

    expect(player.setManualOverride).toHaveBeenCalledWith(true);
    expect(player.seekTo).toHaveBeenCalledWith(100);
  });

  it('update() reflects the live playhead on the slider and label', () => {
    const host = document.createElement('div');
    const player = createFakePlayer({
      getDuration: vi.fn(() => 100),
      getCurrentTime: vi.fn(() => 25),
      isPaused: vi.fn(() => false),
    });
    const { update } = createStageAudioDevControls(host, player);

    update();

    const slider = host.querySelector<HTMLInputElement>('[data-testid="stage-audio-dev-scrubber"]');
    const time = host.querySelector('[data-testid="stage-audio-dev-time"]');
    const toggle = host.querySelector('[data-testid="stage-audio-dev-toggle"]');
    expect(slider?.value).toBe('250'); // 25/100 * 1000
    expect(time?.textContent).toBe('0:25 / 1:40');
    expect(toggle?.textContent).toBe('⏸');
  });

  it('dispose removes the element from the host', () => {
    const host = document.createElement('div');
    const { dispose } = createStageAudioDevControls(host, createFakePlayer());

    expect(host.querySelector('[data-testid="stage-audio-dev-controls"]')).not.toBeNull();
    dispose();
    expect(host.querySelector('[data-testid="stage-audio-dev-controls"]')).toBeNull();
  });
});
