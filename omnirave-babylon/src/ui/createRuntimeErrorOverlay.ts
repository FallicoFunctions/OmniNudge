export function createRuntimeErrorOverlay(host: HTMLElement, onRetry: () => void) {
  const overlay = document.createElement('section');
  overlay.dataset.testid = 'runtime-error-overlay';
  overlay.className = 'runtime-error-overlay';
  overlay.setAttribute('role', 'alert');

  const eyebrow = document.createElement('p');
  eyebrow.className = 'runtime-error-overlay__eyebrow';
  eyebrow.textContent = 'Main Stage Boot';

  const title = document.createElement('h1');
  title.className = 'runtime-error-overlay__title';
  title.textContent = 'Main Stage could not start';

  const copy = document.createElement('p');
  copy.className = 'runtime-error-overlay__copy';
  copy.textContent = 'The failed renderer was safely closed. Retry after checking the browser console for diagnostics.';

  const retry = document.createElement('button');
  retry.type = 'button';
  retry.dataset.testid = 'runtime-retry';
  retry.className = 'runtime-error-overlay__retry';
  retry.textContent = 'Retry Main Stage';
  retry.addEventListener('click', onRetry, { once: true });

  overlay.append(eyebrow, title, copy, retry);
  host.appendChild(overlay);
  return overlay;
}
