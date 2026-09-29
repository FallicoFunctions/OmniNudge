// A small note that stage audio is waiting for the player's first click, tap
// or key press. Browsers will not play sound on a page before that gesture;
// the world, the show and the HUD do not wait for it. It never takes input:
// the gesture it asks for can land anywhere.
//
// Follows the same append-to-host, return-{element,dispose} pattern as
// createRuntimeLoadingOverlay.ts.

export interface SoundHint {
  element: HTMLElement;
  dispose: () => void;
}

export function createSoundHint(host: HTMLElement): SoundHint {
  const hint = document.createElement('p');
  hint.dataset.testid = 'sound-hint';
  hint.className = 'sound-hint';
  hint.setAttribute('role', 'status');
  hint.textContent = 'Click or press any key for sound';
  host.appendChild(hint);

  return {
    element: hint,
    dispose() {
      hint.remove();
    },
  };
}
