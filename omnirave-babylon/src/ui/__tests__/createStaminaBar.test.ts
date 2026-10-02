import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStaminaBar, staminaLift } from '../createStaminaBar';

const box = (left: number, top: number, right: number, bottom: number) => ({ left, top, right, bottom });

describe('staminaLift', () => {
  // A 768 x 1024 window: the 238 px bar centred at the bottom spans 265-503.
  const bar = box(265, 1002, 503, 1024);

  it('keeps the bar on the bottom edge when the panels are beside it', () => {
    expect(staminaLift(bar, [box(0, 925, 250, 1024), box(548, 886, 768, 1024)], 1024)).toBe(0);
  });

  it('lifts the bar just above the tallest panel that reaches under it', () => {
    // The chat panel reaches to 314 px; with a long history it is 280 px tall.
    expect(staminaLift(bar, [box(0, 925, 314, 1024), box(548, 886, 768, 1024)], 1024)).toBe(99 + 8);
    expect(staminaLift(bar, [box(0, 744, 314, 1024), box(400, 886, 768, 1024)], 1024)).toBe(280 + 8);
  });

  it('ignores a hidden panel', () => {
    expect(staminaLift(bar, [box(0, 0, 0, 0)], 1024)).toBe(0);
  });
});

describe('createStaminaBar placement', () => {
  afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });

  it('keeps mobile stamina flush with the bottom while drawers are open, and restores desktop avoidance', () => {
    const host = document.createElement('div');
    host.classList.add('babylon-runtime-host--mobile');
    document.body.append(host);
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(844);
    const chat = document.createElement('section');
    vi.spyOn(chat, 'getBoundingClientRect').mockReturnValue(box(0, 660, 360, 800) as DOMRect);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return (this.dataset.testid === 'stamina-bar' ? box(151, 822, 239, 844) : box(0, 0, 0, 0)) as DOMRect;
    });
    const bar = createStaminaBar(host, { avoid: () => [chat] });
    window.dispatchEvent(new Event('resize'));
    expect(bar.element.style.bottom).toBe('');
    host.classList.remove('babylon-runtime-host--mobile');
    bar.relayout();
    expect(bar.element.style.bottom).toBe('192px');
    bar.dispose();
  });

  it('places itself from the panels it is given, and again on a window resize', () => {
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(1024);
    const chat = document.createElement('div');
    let chatTop = 925;
    vi.spyOn(chat, 'getBoundingClientRect').mockImplementation(() => box(0, chatTop, 314, 1024) as DOMRect);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return (this.dataset.testid === 'stamina-bar' ? box(265, 1002, 503, 1024) : box(0, 0, 0, 0)) as DOMRect;
    });
    const bar = createStaminaBar(document.body, { avoid: () => [chat, null] });
    expect(bar.element.style.bottom).toBe('107px');
    chatTop = 744;
    window.dispatchEvent(new Event('resize'));
    expect(bar.element.style.bottom).toBe('288px');
    chatTop = 1024; // collapsed to nothing
    bar.relayout();
    expect(bar.element.style.bottom).toBe('');
    bar.dispose();
  });

  it('follows a panel that grows, and lets go of the window and the panels when disposed', () => {
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(1024);
    const observed: Element[] = [];
    let onResize: (() => void) | undefined;
    const disconnect = vi.fn();
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: () => void) { onResize = callback; }
      observe(element: Element) { observed.push(element); }
      disconnect() { disconnect(); }
    });
    const chat = document.createElement('div');
    let chatTop = 1024; // empty at first: nothing under the bar
    vi.spyOn(chat, 'getBoundingClientRect').mockImplementation(() => box(0, chatTop, 314, 1024) as DOMRect);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return (this.dataset.testid === 'stamina-bar' ? box(265, 1002, 503, 1024) : box(0, 0, 0, 0)) as DOMRect;
    });
    const bar = createStaminaBar(document.body, { avoid: () => [chat] });
    expect(observed).toEqual([chat]);
    expect(bar.element.style.bottom).toBe('');
    chatTop = 925; // messages arrive: the panel grows under the bar
    onResize!();
    expect(bar.element.style.bottom).toBe('107px');
    bar.dispose();
    expect(disconnect).toHaveBeenCalledTimes(1);
    chatTop = 744;
    window.dispatchEvent(new Event('resize'));
    expect(bar.element.style.bottom).toBe('107px'); // no longer listening
    vi.unstubAllGlobals();
  });
});
