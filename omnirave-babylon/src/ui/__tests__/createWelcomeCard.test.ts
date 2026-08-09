import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createWelcomeCard, WELCOME_CARD_FADE_MS, WELCOME_CARD_VISIBLE_MS } from '../createWelcomeCard';

// Post-auth welcome card, design doc sec 11.2: same size/position as the auth
// window it replaces, landscape, non-modal, equal focus on `Edit Avatar`
// (clickable) and `Enter VIP` (informational only), auto-dismissing after a
// few seconds with a fade.
describe('createWelcomeCard', () => {
  let host: HTMLDivElement;

  beforeEach(() => {
    vi.useFakeTimers();
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  afterEach(() => {
    vi.useRealTimers();
    host?.remove();
  });

  function mount(options = {}) {
    const card = createWelcomeCard(options);
    host.appendChild(card.element);
    return card;
  }

  it('starts hidden and greets the player by name on show', () => {
    const card = mount();
    expect(card.element.hidden).toBe(true);
    expect(card.isOpen()).toBe(false);

    card.show('nick');
    expect(card.element.hidden).toBe(false);
    expect(card.isOpen()).toBe(true);
    expect(card.element.querySelector('[data-welcome-greeting]')?.textContent).toContain('nick');
  });

  // Sec 11.2: "same size and position as auth window" - both are
  // `.venue-window`, which is what carries that geometry in styles.css.
  it('shares the auth window class, so it lands in the same place', () => {
    const card = mount();
    expect(card.element.classList.contains('venue-window')).toBe(true);
  });

  it('offers Edit Avatar as the only clickable item, with Enter VIP informational', () => {
    const onEditAvatar = vi.fn();
    const card = mount({ onEditAvatar });
    card.show('nick');

    const enterVip = card.element.querySelector('[data-welcome-info="enter-vip"]');
    expect(enterVip?.tagName).toBe('P');
    expect(enterVip?.textContent).toBe('Enter VIP');

    const editAvatar = card.element.querySelector<HTMLButtonElement>('[data-welcome-action="edit-avatar"]')!;
    editAvatar.click();
    expect(onEditAvatar.mock.calls.length).toBe(1);
    // The card gets out of the way of the action it just handed off.
    expect(card.isOpen()).toBe(false);
  });

  it('auto-dismisses with a fade after a few seconds', () => {
    const card = mount();
    card.show('nick');

    vi.advanceTimersByTime(WELCOME_CARD_VISIBLE_MS - 1);
    expect(card.element.classList.contains('venue-window--fading')).toBe(false);
    expect(card.element.hidden).toBe(false);

    vi.advanceTimersByTime(1);
    expect(card.element.classList.contains('venue-window--fading')).toBe(true);
    // Still on screen while it fades.
    expect(card.element.hidden).toBe(false);

    vi.advanceTimersByTime(WELCOME_CARD_FADE_MS);
    expect(card.element.hidden).toBe(true);
    expect(card.isOpen()).toBe(false);
    // The fade class is cleared, so the next show() is not born invisible.
    expect(card.element.classList.contains('venue-window--fading')).toBe(false);
  });

  // Sec 11.2: a direct top-level UI action (Avatar, Settings, ...) closes the
  // card; the action itself proceeds, which is the caller's business.
  it('dismisses on demand and stops its own timers', () => {
    const card = mount();
    card.show('nick');
    card.dismiss();
    expect(card.element.hidden).toBe(true);

    // A dismissed card must not resurface when its old timers would have run.
    vi.advanceTimersByTime(WELCOME_CARD_VISIBLE_MS + WELCOME_CARD_FADE_MS);
    expect(card.element.hidden).toBe(true);
    expect(card.element.classList.contains('venue-window--fading')).toBe(false);
  });

  it('re-showing restarts the dismiss clock', () => {
    const card = mount();
    card.show('nick');
    vi.advanceTimersByTime(WELCOME_CARD_VISIBLE_MS - 100);
    card.show('nick');
    vi.advanceTimersByTime(WELCOME_CARD_VISIBLE_MS - 100);
    expect(card.isOpen()).toBe(true);
    expect(card.element.hidden).toBe(false);
  });

  it('dispose removes the element and cancels pending timers', () => {
    const card = mount();
    card.show('nick');
    card.dispose();
    expect(card.element.isConnected).toBe(false);
    vi.advanceTimersByTime(WELCOME_CARD_VISIBLE_MS + WELCOME_CARD_FADE_MS);
    expect(card.element.classList.contains('venue-window--fading')).toBe(false);
  });
});
