// A small note that stage audio is waiting for the player's first click, tap
// or key press. Browsers will not play sound on a page before that gesture;
// the world, the show and the HUD do not wait for it. The prompt itself is
// a real button; a gesture elsewhere can also start sound.
//
// Follows the same append-to-host, return-{element,dispose} pattern as
// createRuntimeLoadingOverlay.ts.

export interface SoundHint {
  element: HTMLElement;
  dispose: () => void;
}

import { MOBILE_HUD_QUERY } from './createMobileHudControls';

export function createSoundHint(host: HTMLElement, options: { onActivate?: () => void } = {}): SoundHint {
  const hint = document.createElement('button');
  hint.type = 'button';
  hint.dataset.testid = 'sound-hint';
  hint.className = 'hud-button sound-hint';
  const mobile = window.matchMedia?.(MOBILE_HUD_QUERY).matches ?? false;
  hint.textContent = mobile ? 'Tap for sound' : 'Click or press any key for sound';
  const activate = () => options.onActivate?.();
  hint.addEventListener('click', activate);
  host.appendChild(hint);

  return {
    element: hint,
    dispose() {
      hint.removeEventListener('click', activate);
      hint.remove();
    },
  };
}
