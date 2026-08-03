import { describe, expect, it, vi } from 'vitest';

import { createEmoteBar, EMOTE_SLOTS } from '../createEmoteBar';

function setup(options: Parameters<typeof createEmoteBar>[1] = {}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const bar = createEmoteBar(host, options);
  const slotButton = (id: string) =>
    host.querySelector<HTMLButtonElement>(`[data-emote-slot="${id}"]`)!;
  return { host, bar, slotButton };
}

describe('createEmoteBar', () => {
  it('always renders exactly 10 slots', () => {
    const { host } = setup();
    expect(EMOTE_SLOTS.length).toBe(10);
    expect(host.querySelectorAll('[data-emote-slot]').length).toBe(10);
  });

  it('clicking a slot sets it active and calls onEmoteSelected with its id', () => {
    const onEmoteSelected = vi.fn();
    const { bar, slotButton } = setup({ onEmoteSelected });

    slotButton('wave').click();

    expect(bar.activeEmoteId()).toBe('wave');
    expect(slotButton('wave').classList.contains('hud-emote-slot--active')).toBe(true);
    expect(slotButton('wave').getAttribute('aria-pressed')).toBe('true');
    expect(onEmoteSelected).toHaveBeenCalledTimes(1);
    expect(onEmoteSelected).toHaveBeenCalledWith('wave');
  });

  it('switching to another slot deactivates the previous one', () => {
    const onEmoteSelected = vi.fn();
    const { bar, slotButton } = setup({ onEmoteSelected });

    slotButton('wave').click();
    slotButton('fist-pump').click();

    expect(bar.activeEmoteId()).toBe('fist-pump');
    expect(slotButton('wave').classList.contains('hud-emote-slot--active')).toBe(false);
    expect(slotButton('wave').getAttribute('aria-pressed')).toBe('false');
    expect(slotButton('fist-pump').classList.contains('hud-emote-slot--active')).toBe(true);
    expect(onEmoteSelected).toHaveBeenNthCalledWith(2, 'fist-pump');
  });

  it('clicking an already-active slot toggles it off and calls back with null', () => {
    const onEmoteSelected = vi.fn();
    const { bar, slotButton } = setup({ onEmoteSelected });

    slotButton('wave').click();
    slotButton('wave').click();

    expect(bar.activeEmoteId()).toBe(null);
    expect(slotButton('wave').classList.contains('hud-emote-slot--active')).toBe(false);
    expect(onEmoteSelected).toHaveBeenCalledTimes(2);
    expect(onEmoteSelected).toHaveBeenNthCalledWith(2, null);
  });

  it('shows the emote name on hover via the title attribute', () => {
    const { slotButton } = setup();
    const wave = EMOTE_SLOTS.find((slot) => slot.id === 'wave')!;

    expect(slotButton('wave').title).toBe(wave.label);
  });

  it('renders premium slots with a distinct class/badge and free slots without it', () => {
    const { slotButton, host } = setup();

    const freeSlot = EMOTE_SLOTS.find((slot) => !slot.premium)!;
    const premiumSlot = EMOTE_SLOTS.find((slot) => slot.premium)!;

    expect(slotButton(freeSlot.id).classList.contains('hud-emote-slot--premium')).toBe(false);
    expect(slotButton(freeSlot.id).dataset.premium).toBe('false');
    expect(host.querySelector(`[data-testid="emote-premium-badge-${freeSlot.id}"]`)).toBe(null);

    expect(slotButton(premiumSlot.id).classList.contains('hud-emote-slot--premium')).toBe(true);
    expect(slotButton(premiumSlot.id).dataset.premium).toBe('true');
    expect(host.querySelector(`[data-testid="emote-premium-badge-${premiumSlot.id}"]`)).not.toBe(null);
  });

  it('splits exactly 6 free and 4 premium slots', () => {
    const free = EMOTE_SLOTS.filter((slot) => !slot.premium);
    const premium = EMOTE_SLOTS.filter((slot) => slot.premium);
    expect(free.length).toBe(6);
    expect(premium.length).toBe(4);
  });

  it('dispose removes all owned DOM and listeners', () => {
    const onEmoteSelected = vi.fn();
    const { host, bar, slotButton } = setup({ onEmoteSelected });
    const waveButton = slotButton('wave');

    bar.dispose();

    expect(host.querySelector('[data-testid="emote-bar"]')).toBe(null);
    expect(host.children.length).toBe(0);

    // Listener should be gone: clicking the detached button must not invoke
    // the callback again.
    waveButton.click();
    expect(onEmoteSelected).not.toHaveBeenCalled();
  });
});
