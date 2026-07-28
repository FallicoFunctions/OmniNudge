import { describe, expect, it, vi } from 'vitest';

import { createTopLeftControls } from '../createTopLeftControls';
import type { AvatarColorway } from '../../player/avatarColorways';

const COLORWAYS: readonly AvatarColorway[] = [
  { id: 'aurora', label: 'Aurora', primaryHex: '#ffffff', accentHex: '#68d8ff', emissiveHex: '#49b9ff' },
  { id: 'signal', label: 'Signal', primaryHex: '#1f2430', accentHex: '#f2c15b', emissiveHex: '#ffd36f' },
];

function setup(options: Parameters<typeof createTopLeftControls>[1] = {}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const settingsPanel = document.createElement('section');
  settingsPanel.dataset.testid = 'settings-popup';
  const controls = createTopLeftControls(host, {
    settingsPanel,
    avatarColorways: COLORWAYS,
    selectedAvatarColorwayId: 'aurora',
    ...options,
  });
  const button = (panel: string) =>
    host.querySelector<HTMLButtonElement>(`[data-hud-control="${panel}"]`)!;
  return { host, controls, settingsPanel, button };
}

describe('createTopLeftControls', () => {
  it('renders always-visible Settings and Avatar buttons with both popups closed', () => {
    const { host, button, settingsPanel } = setup();

    expect(button('settings').textContent).toBe('Settings');
    expect(button('avatar').textContent).toBe('Avatar');
    expect(button('settings').hidden).toBe(false);
    expect(button('avatar').hidden).toBe(false);
    expect(settingsPanel.hidden).toBe(true);
    expect(host.querySelector<HTMLElement>('[data-testid="avatar-popup"]')?.hidden).toBe(true);
  });

  it('opens a popup below the buttons, closes on a repeat click, and swaps to the other', () => {
    const { host, controls, button, settingsPanel } = setup();
    const avatarPanel = host.querySelector<HTMLElement>('[data-testid="avatar-popup"]')!;

    button('settings').click();
    expect(controls.activePanel()).toBe('settings');
    expect(settingsPanel.hidden).toBe(false);
    expect(avatarPanel.hidden).toBe(true);
    expect(button('settings').getAttribute('aria-expanded')).toBe('true');

    // Popups render inside the slot that follows the button row.
    expect(settingsPanel.parentElement?.className).toBe('hud-controls__slot');
    expect(settingsPanel.parentElement?.previousElementSibling?.className).toBe('hud-controls__row');

    button('avatar').click();
    expect(controls.activePanel()).toBe('avatar');
    expect(settingsPanel.hidden).toBe(true);
    expect(avatarPanel.hidden).toBe(false);

    button('avatar').click();
    expect(controls.activePanel()).toBe(null);
    expect(avatarPanel.hidden).toBe(true);

    // Buttons never disappear, whatever the popup state.
    expect(button('settings').hidden).toBe(false);
    expect(button('avatar').hidden).toBe(false);
  });

  it('is non-modal: it adds no backdrop and nothing outside the block', () => {
    const { host } = setup();
    host.querySelector<HTMLButtonElement>('[data-hud-control="settings"]')!.click();

    expect(host.children.length).toBe(1);
    expect(host.querySelector('.hud-backdrop')).toBe(null);
  });

  it('reports panel changes to the caller', () => {
    const onPanelChange = vi.fn();
    const { button } = setup({ onPanelChange });

    button('settings').click();
    button('avatar').click();
    button('avatar').click();

    expect(onPanelChange.mock.calls.map((call) => String(call[0])).join(',')).toBe(
      'settings,avatar,null',
    );
  });

  it('applies an avatar colorway immediately and highlights the selection', () => {
    const onSelectAvatarColorway = vi.fn();
    const { host, button } = setup({ onSelectAvatarColorway });

    button('avatar').click();
    const swatches = host.querySelectorAll<HTMLButtonElement>('[data-avatar-colorway]');
    expect(swatches.length).toBe(2);
    expect(swatches[0].getAttribute('aria-pressed')).toBe('true');

    swatches[1].click();

    expect(onSelectAvatarColorway).toHaveBeenCalledTimes(1);
    expect(onSelectAvatarColorway.mock.calls[0][0].id).toBe('signal');
    expect(swatches[0].getAttribute('aria-pressed')).toBe('false');
    expect(swatches[1].getAttribute('aria-pressed')).toBe('true');
  });

  it('offsets clear of the dev review HUD under ?debug=1', () => {
    const { host } = setup({ debugChromePresent: true });
    expect(
      host
        .querySelector<HTMLElement>('[data-testid="top-left-controls"]')!
        .classList.contains('hud-controls--debug-offset'),
    ).toBe(true);
  });

  it('dispose() removes the block and stops responding to clicks', () => {
    const onSelectAvatarColorway = vi.fn();
    const { host, controls } = setup({ onSelectAvatarColorway });
    const swatch = host.querySelector<HTMLButtonElement>('[data-avatar-colorway="signal"]')!;

    controls.dispose();
    swatch.click();

    expect(host.querySelector('[data-testid="top-left-controls"]')).toBe(null);
    expect(onSelectAvatarColorway).toHaveBeenCalledTimes(0);
  });
});
