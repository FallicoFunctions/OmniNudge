// DEV-ONLY compact audio scrubber + play/pause for the synced stage music.
// Gated behind ?debug=1 in createRuntime and only constructed when a
// stageMediaPlayer exists (the world/music path). Follows the same
// append-to-host, return-{element, update, dispose} idiom as the other small
// fixed-position overlays (createPerfOverlay / createEnterOmniRaveOverlay).
//
// Scrubbing or pausing flips the player into MANUAL OVERRIDE, so the dev's
// position sticks instead of being yanked back to the server playhead.

// The subset of StageMediaPlayer this control drives. Kept structural so tests
// can pass a tiny fake without the full player.
export interface StageAudioDevControlsPlayer {
  getCurrentTime: () => number;
  getDuration: () => number;
  isPaused: () => boolean;
  play: () => void;
  pause: () => void;
  seekTo: (seconds: number) => void;
  setManualOverride: (active: boolean) => void;
}

export interface StageAudioDevControls {
  element: HTMLElement;
  update: () => void;
  dispose: () => void;
}

// Slider resolution: an integer range mapped to a 0..1 fraction of duration.
const SLIDER_MAX = 1000;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    seconds = 0;
  }
  const whole = Math.floor(seconds);
  const mins = Math.floor(whole / 60);
  const secs = whole % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function createStageAudioDevControls(
  host: HTMLElement,
  player: StageAudioDevControlsPlayer,
): StageAudioDevControls {
  const bar = document.createElement('div');
  bar.dataset.testid = 'stage-audio-dev-controls';
  bar.className = 'stage-audio-dev-controls';

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.dataset.testid = 'stage-audio-dev-toggle';
  toggle.className = 'stage-audio-dev-controls__toggle';
  toggle.textContent = '▶';

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0';
  slider.max = String(SLIDER_MAX);
  slider.value = '0';
  slider.dataset.testid = 'stage-audio-dev-scrubber';
  slider.className = 'stage-audio-dev-controls__scrubber';

  const label = document.createElement('span');
  label.dataset.testid = 'stage-audio-dev-time';
  label.className = 'stage-audio-dev-controls__time';
  label.textContent = '0:00 / 0:00';

  bar.append(toggle, slider, label);
  host.appendChild(bar);

  // True while the user is actively dragging the slider, so update() doesn't
  // fight the drag by writing the value back from the (now stale) playhead.
  let dragging = false;

  const handleToggle = () => {
    // Entering manual control either way so the server can't force-resume.
    player.setManualOverride(true);
    if (player.isPaused()) {
      player.play();
    } else {
      player.pause();
    }
  };

  const handleInput = () => {
    dragging = true;
    player.setManualOverride(true);
    const duration = player.getDuration();
    const fraction = Number(slider.value) / SLIDER_MAX;
    player.seekTo(fraction * duration);
  };

  const handleChange = () => {
    const duration = player.getDuration();
    const fraction = Number(slider.value) / SLIDER_MAX;
    player.seekTo(fraction * duration);
    // Keep override ON: the dev is now scrubbed to a manual position.
    dragging = false;
  };

  // Keep arrow-key scrubbing (and any other keys) from leaking into WASD/game
  // movement while the control has focus.
  const stopKeys = (event: KeyboardEvent) => {
    event.stopPropagation();
  };

  toggle.addEventListener('click', handleToggle);
  slider.addEventListener('input', handleInput);
  slider.addEventListener('change', handleChange);
  bar.addEventListener('keydown', stopKeys);
  bar.addEventListener('keyup', stopKeys);

  function update(): void {
    const duration = player.getDuration();
    const current = player.getCurrentTime();

    // Reflect play/pause state on the button every frame.
    toggle.textContent = player.isPaused() ? '▶' : '⏸';

    if (duration <= 0) {
      // No track loaded yet: neutral, disabled.
      slider.disabled = true;
      slider.value = '0';
      label.textContent = '0:00 / 0:00';
      return;
    }

    slider.disabled = false;
    if (!dragging) {
      const fraction = Math.min(1, Math.max(0, current / duration));
      slider.value = String(Math.round(fraction * SLIDER_MAX));
      label.textContent = `${formatTime(current)} / ${formatTime(duration)}`;
    }
  }

  update();

  return {
    element: bar,
    update,
    dispose() {
      toggle.removeEventListener('click', handleToggle);
      slider.removeEventListener('input', handleInput);
      slider.removeEventListener('change', handleChange);
      bar.removeEventListener('keydown', stopKeys);
      bar.removeEventListener('keyup', stopKeys);
      bar.remove();
    },
  };
}
