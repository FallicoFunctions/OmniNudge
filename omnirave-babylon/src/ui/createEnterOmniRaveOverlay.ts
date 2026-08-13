// Full-screen "Enter OmniRave" gate. Mobile (and most desktop) autoplay
// policy blocks audio until a user gesture; this overlay's tap IS that
// gesture, wired by the caller to stageMediaPlayer.unlock().
//
// Follows the same append-to-host, return-{element,dispose} pattern as
// createRuntimeLoadingOverlay.ts.

export interface EnterOmniRaveOverlay {
  element: HTMLElement;
  dispose: () => void;
}

export function createEnterOmniRaveOverlay(
  host: HTMLElement,
  onEnter: () => void,
): EnterOmniRaveOverlay {
  const overlay = document.createElement('section');
  overlay.dataset.testid = 'enter-omnirave-overlay';
  overlay.className = 'enter-omnirave-overlay';

  const eyebrow = document.createElement('p');
  eyebrow.className = 'enter-omnirave-overlay__eyebrow';
  eyebrow.textContent = 'Main Stage';

  const title = document.createElement('h1');
  title.className = 'enter-omnirave-overlay__title';
  title.textContent = 'Enter OmniRave';

  const copy = document.createElement('p');
  copy.className = 'enter-omnirave-overlay__copy';
  copy.textContent = 'Tap to unlock synchronized stage audio.';

  const enter = document.createElement('button');
  enter.type = 'button';
  enter.dataset.testid = 'enter-omnirave-button';
  enter.className = 'enter-omnirave-overlay__enter';
  enter.textContent = 'Enter OmniRave';
  enter.addEventListener('click', onEnter, { once: true });

  overlay.append(eyebrow, title, copy, enter);
  host.appendChild(overlay);

  return {
    element: overlay,
    dispose() {
      overlay.remove();
    },
  };
}
