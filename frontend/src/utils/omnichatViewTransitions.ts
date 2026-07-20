export const OMNICHAT_PERSONA_TRANSITION_NAME = 'omnichat-persona-shared';

type BrowserViewTransition = {
  finished: Promise<void>;
};

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => BrowserViewTransition;
};

type SharedElementTransitionOptions = {
  source: HTMLElement | null;
  update: () => void;
  sourceState: 'old' | 'new';
  disabled?: boolean;
  counterpart?: () => HTMLElement | null;
};

function isVisible(element: HTMLElement): boolean {
  if (!element.isConnected) return false;
  const bounds = element.getBoundingClientRect();
  return (
    bounds.width > 0 &&
    bounds.height > 0 &&
    bounds.bottom > 0 &&
    bounds.right > 0 &&
    bounds.top < window.innerHeight &&
    bounds.left < window.innerWidth
  );
}

function setTransitionName(element: HTMLElement, value: string): void {
  element.style.setProperty('view-transition-name', value);
}

function createFallbackClone(element: HTMLElement): HTMLElement {
  const bounds = element.getBoundingClientRect();
  const clone = element.cloneNode(true) as HTMLElement;
  clone.removeAttribute('id');
  clone.querySelectorAll('[id]').forEach((descendant) => descendant.removeAttribute('id'));
  clone.querySelectorAll('video').forEach((video) => video.remove());
  clone.setAttribute('aria-hidden', 'true');
  clone.dataset.omnichatSharedClone = 'true';
  clone.style.cssText = [
    'position:fixed',
    `left:${bounds.left}px`,
    `top:${bounds.top}px`,
    `width:${bounds.width}px`,
    `height:${bounds.height}px`,
    'margin:0',
    'pointer-events:none',
    'transform-origin:top left',
    'z-index:140',
  ].join(';');
  document.body.appendChild(clone);
  return clone;
}

function runFallbackTransition(
  oldElement: HTMLElement | null,
  update: () => void,
  getNewElement: () => HTMLElement | null
): void {
  if (!oldElement || !isVisible(oldElement)) {
    update();
    return;
  }

  const oldBounds = oldElement.getBoundingClientRect();
  const oldRadius = window.getComputedStyle(oldElement).borderRadius;
  const clone = createFallbackClone(oldElement);
  update();

  clone.style.borderRadius = oldRadius;
  clone.style.transition =
    'transform 440ms cubic-bezier(0.22, 1, 0.36, 1), border-radius 440ms cubic-bezier(0.22, 1, 0.36, 1)';

  let attempts = 0;
  const beginAnimation = () => {
    const newElement = getNewElement();
    if (!newElement || !isVisible(newElement)) {
      attempts += 1;
      if (attempts < 3) {
        requestAnimationFrame(beginAnimation);
      } else {
        clone.remove();
      }
      return;
    }

    const newBounds = newElement.getBoundingClientRect();
    const newRadius = window.getComputedStyle(newElement).borderRadius;
    const translateX = newBounds.left - oldBounds.left;
    const translateY = newBounds.top - oldBounds.top;
    const scaleX = newBounds.width / oldBounds.width;
    const scaleY = newBounds.height / oldBounds.height;
    newElement.style.opacity = '0';

    requestAnimationFrame(() => {
      clone.style.transform =
        `translate3d(${translateX}px, ${translateY}px, 0) scale(${scaleX}, ${scaleY})`;
      clone.style.borderRadius = newRadius;
    });
    window.setTimeout(() => {
      clone.remove();
      newElement.style.opacity = '';
    }, 460);
  };

  requestAnimationFrame(beginAnimation);
}

export function findPersonaTransitionElement(trigger: HTMLElement | null): HTMLElement | null {
  if (!trigger) return null;
  if (trigger.dataset.personaAvatar === 'true') return trigger;
  return trigger.querySelector<HTMLElement>('[data-persona-avatar="true"]');
}

/**
 * Runs a same-document shared-element transition while keeping the originating
 * DOM node unnamed in the state where the dialog avatar is present. This
 * avoids duplicate view-transition names when a card remains mounted behind
 * the Quick Chat dialog.
 */
export function runPersonaSharedElementTransition({
  source,
  update,
  sourceState,
  disabled = false,
  counterpart,
}: SharedElementTransitionOptions): BrowserViewTransition | null {
  const transitionDocument = document as ViewTransitionDocument;
  if (disabled || !source || !isVisible(source)) {
    update();
    return null;
  }

  if (!transitionDocument.startViewTransition) {
    const oldElement = sourceState === 'old' ? source : counterpart?.() ?? null;
    runFallbackTransition(
      oldElement,
      update,
      () => (sourceState === 'new' ? source : counterpart?.() ?? null)
    );
    return null;
  }

  if (sourceState === 'old') {
    setTransitionName(source, OMNICHAT_PERSONA_TRANSITION_NAME);
  }
  document.documentElement.classList.add('omnichat-shared-transition');

  try {
    const transition = transitionDocument.startViewTransition(() => {
      setTransitionName(
        source,
        sourceState === 'new' ? OMNICHAT_PERSONA_TRANSITION_NAME : ''
      );
      update();
    });

    const cleanup = () => {
      setTransitionName(source, '');
      document.documentElement.classList.remove('omnichat-shared-transition');
    };
    void transition.finished.then(cleanup, cleanup);
    return transition;
  } catch {
    setTransitionName(source, '');
    document.documentElement.classList.remove('omnichat-shared-transition');
    update();
    return null;
  }
}
