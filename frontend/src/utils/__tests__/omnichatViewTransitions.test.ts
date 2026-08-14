import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  findPersonaTransitionElement,
  OMNICHAT_PERSONA_TRANSITION_NAME,
  runPersonaSharedElementTransition,
} from '../omnichatViewTransitions';

function createVisibleElement(): HTMLDivElement {
  const element = document.createElement('div');
  document.body.appendChild(element);
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
    x: 10,
    y: 10,
    top: 10,
    left: 10,
    right: 110,
    bottom: 110,
    width: 100,
    height: 100,
    toJSON: () => ({}),
  });
  return element;
}

describe('OmniChat shared-element transitions', () => {
  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(document, 'startViewTransition');
    document.documentElement.classList.remove('omnichat-shared-transition');
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('finds the portrait inside a card trigger', () => {
    const card = document.createElement('button');
    const avatar = document.createElement('div');
    avatar.dataset.personaAvatar = 'true';
    card.appendChild(avatar);

    expect(findPersonaTransitionElement(card)).toBe(avatar);
  });

  it('names only the old portrait while opening and cleans up after completion', async () => {
    const source = createVisibleElement();
    let finishTransition: (() => void) | undefined;
    const finished = new Promise<void>((resolve) => {
      finishTransition = resolve;
    });
    let nameBeforeUpdate = '';
    let nameDuringUpdate = '';
    const update = vi.fn(() => {
      nameDuringUpdate = source.style.getPropertyValue('view-transition-name');
    });

    const startViewTransition = vi.fn((transitionUpdate: () => void) => {
      nameBeforeUpdate = source.style.getPropertyValue('view-transition-name');
      transitionUpdate();
      return { finished };
    });
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      value: startViewTransition,
    });

    runPersonaSharedElementTransition({ source, sourceState: 'old', update });

    expect(nameBeforeUpdate).toBe(OMNICHAT_PERSONA_TRANSITION_NAME);
    expect(nameDuringUpdate).toBe('');
    expect(document.documentElement).toHaveClass('omnichat-shared-transition');

    finishTransition?.();
    await finished;
    await Promise.resolve();
    expect(source.style.getPropertyValue('view-transition-name')).toBe('');
    expect(document.documentElement).not.toHaveClass('omnichat-shared-transition');
  });

  it('puts the source portrait in the new snapshot while closing', () => {
    const source = createVisibleElement();
    let nameDuringUpdate = '';
    const startViewTransition = vi.fn((transitionUpdate: () => void) => {
      transitionUpdate();
      return { finished: Promise.resolve() };
    });
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      value: startViewTransition,
    });

    runPersonaSharedElementTransition({
      source,
      sourceState: 'new',
      update: () => {
        nameDuringUpdate = source.style.getPropertyValue('view-transition-name');
      },
    });

    expect(nameDuringUpdate).toBe(OMNICHAT_PERSONA_TRANSITION_NAME);
  });

  it('uses the CSS portrait clone fallback when native view transitions are unavailable', () => {
    vi.useFakeTimers();
    const source = createVisibleElement();
    const target = createVisibleElement();
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    const update = vi.fn();

    runPersonaSharedElementTransition({
      source,
      sourceState: 'old',
      update,
      counterpart: () => target,
    });

    expect(update).toHaveBeenCalledOnce();
    expect(document.querySelector('[data-omnichat-shared-clone="true"]')).not.toBeNull();

    frames.shift()?.(0);
    expect(target.style.opacity).toBe('0');
    frames.shift()?.(16);
    expect(
      document.querySelector<HTMLElement>('[data-omnichat-shared-clone="true"]')?.style.transform
    ).toContain('translate3d');

    vi.advanceTimersByTime(460);
    expect(document.querySelector('[data-omnichat-shared-clone="true"]')).toBeNull();
    expect(target.style.opacity).toBe('');
  });

  it('updates immediately when motion is reduced', () => {
    const source = createVisibleElement();
    const startViewTransition = vi.fn();
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      value: startViewTransition,
    });
    const update = vi.fn();

    const result = runPersonaSharedElementTransition({
      source,
      sourceState: 'old',
      update,
      disabled: true,
    });

    expect(result).toBeNull();
    expect(update).toHaveBeenCalledOnce();
    expect(startViewTransition).not.toHaveBeenCalled();
  });
});
