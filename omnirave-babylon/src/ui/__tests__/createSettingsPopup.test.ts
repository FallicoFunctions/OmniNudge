import { describe, expect, it, vi } from 'vitest';

import { CONTROLS_HELP_LINES, createSettingsPopup } from '../createSettingsPopup';
import { DEFAULT_PLAYER_SETTINGS } from '../playerSettings';

function setup(options: Parameters<typeof createSettingsPopup>[0] = {}) {
  const popup = createSettingsPopup(options);
  document.body.appendChild(popup.element);
  const control = <T extends HTMLElement>(name: string) =>
    popup.element.querySelector<T>(`[data-settings-control="${name}"]`)!;
  const segment = (name: string, value: string) =>
    popup.element.querySelector<HTMLButtonElement>(
      `[data-settings-control="${name}"][data-settings-value="${value}"]`,
    )!;
  return { popup, control, segment };
}

describe('createSettingsPopup', () => {
  it('renders the four spec sections and none of the excluded ones', () => {
    const { popup } = setup();
    const sections = Array.from(
      popup.element.querySelectorAll<HTMLElement>('[data-settings-section]'),
    ).map((section) => section.dataset.settingsSection);

    expect(sections.join(',')).toBe('camera,graphics,interface,controls');
    expect(popup.element.textContent?.includes('Account')).toBe(false);
    expect(popup.element.textContent?.includes('Fullscreen')).toBe(false);
    expect(popup.element.textContent?.includes('Render Distance')).toBe(false);
  });

  it('renders the header with the title and Close', () => {
    const { popup } = setup();
    expect(popup.element.querySelector('.hud-popup__title')?.textContent).toBe('Settings');
    expect(
      popup.element.querySelector<HTMLButtonElement>('[data-settings-close]')?.textContent,
    ).toBe('Close');
  });

  it('renders the controls help list verbatim', () => {
    const { popup } = setup();
    const lines = Array.from(
      popup.element.querySelectorAll<HTMLElement>('[data-testid="controls-help"] li'),
    ).map((item) => item.textContent);

    expect(lines.join('|')).toBe(CONTROLS_HELP_LINES.join('|'));
    expect(lines[0]).toBe('WASD / Arrow Keys: Move');
    expect(lines[lines.length - 1]).toBe('Esc: Exit chat');
  });

  it('closes via the Close button', () => {
    const onRequestClose = vi.fn();
    const { popup } = setup({ onRequestClose });

    popup.element.querySelector<HTMLButtonElement>('[data-settings-close]')!.click();

    expect(onRequestClose).toHaveBeenCalledTimes(1);
  });

  it('closes via Esc only while it is on screen', () => {
    const onRequestClose = vi.fn();
    const { popup } = setup({ onRequestClose });

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onRequestClose).toHaveBeenCalledTimes(1);

    // Hidden (the top-left block closed it): Esc is no longer ours.
    popup.element.hidden = true;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onRequestClose).toHaveBeenCalledTimes(1);

    popup.element.hidden = false;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(onRequestClose).toHaveBeenCalledTimes(1);
  });

  it('applies Camera Follow immediately', () => {
    const onCameraFollowChange = vi.fn();
    const { segment } = setup({ onCameraFollowChange });

    segment('camera-follow', 'free').click();
    expect(onCameraFollowChange).toHaveBeenCalledTimes(1);
    expect(onCameraFollowChange.mock.calls[0][0]).toBe('free');
    expect(segment('camera-follow', 'free').getAttribute('aria-pressed')).toBe('true');
    expect(segment('camera-follow', 'follow').getAttribute('aria-pressed')).toBe('false');

    segment('camera-follow', 'follow').click();
    expect(onCameraFollowChange.mock.calls[1][0]).toBe('follow');
  });

  it('applies the crouch mode immediately', () => {
    const onCrouchModeChange = vi.fn();
    const { segment } = setup({ onCrouchModeChange });

    segment('crouch-mode', 'toggle').click();

    expect(onCrouchModeChange).toHaveBeenCalledTimes(1);
    expect(onCrouchModeChange.mock.calls[0][0]).toBe('toggle');
  });

  it('applies Display Names immediately', () => {
    const onDisplayNamesChange = vi.fn();
    const { control } = setup({ onDisplayNamesChange });
    const checkbox = control<HTMLInputElement>('display-names');

    expect(checkbox.checked).toBe(true);
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change'));

    expect(onDisplayNamesChange).toHaveBeenCalledTimes(1);
    expect(onDisplayNamesChange.mock.calls[0][0]).toBe(false);
  });

  it('applies the UI theme immediately', () => {
    const onUiThemeChange = vi.fn();
    const { control } = setup({ onUiThemeChange });
    const select = control<HTMLSelectElement>('ui-theme');

    expect(select.value).toBe('luminous-panels');
    expect(Array.from(select.options).map((option) => option.value).join(',')).toBe(
      'obsidian-glass,luminous-panels,hybrid-premium',
    );

    select.value = 'obsidian-glass';
    select.dispatchEvent(new Event('change'));

    expect(onUiThemeChange).toHaveBeenCalledTimes(1);
    expect(onUiThemeChange.mock.calls[0][0]).toBe('obsidian-glass');
  });

  it('locks the manual 1-10 slider behind Auto and pins the level when Auto turns off', () => {
    const onGraphicsAutoChange = vi.fn();
    const onGraphicsLevelChange = vi.fn();
    const { control } = setup({ onGraphicsAutoChange, onGraphicsLevelChange });
    const auto = control<HTMLInputElement>('graphics-auto');
    const level = control<HTMLInputElement>('graphics-level');

    expect(auto.checked).toBe(true);
    expect(level.disabled).toBe(true);
    expect(level.min).toBe('1');
    expect(level.max).toBe('10');

    auto.checked = false;
    auto.dispatchEvent(new Event('change'));

    expect(onGraphicsAutoChange.mock.calls[0][0]).toBe(false);
    expect(onGraphicsLevelChange.mock.calls[0][0]).toBe(DEFAULT_PLAYER_SETTINGS.graphicsLevel);
    expect(level.disabled).toBe(false);

    level.value = '9';
    level.dispatchEvent(new Event('input'));

    expect(onGraphicsLevelChange.mock.calls[1][0]).toBe(9);

    auto.checked = true;
    auto.dispatchEvent(new Event('change'));
    expect(onGraphicsAutoChange.mock.calls[1][0]).toBe(true);
    expect(level.disabled).toBe(true);
  });

  it('invokes Respawn with no confirmation step', () => {
    const onRespawn = vi.fn();
    const { control } = setup({ onRespawn });

    control<HTMLButtonElement>('respawn').click();

    expect(onRespawn).toHaveBeenCalledTimes(1);
  });

  it('reports the full settings snapshot after each change, for persistence', () => {
    const onChange = vi.fn();
    const { popup, segment } = setup({ onChange });

    segment('camera-follow', 'free').click();

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].cameraFollow).toBe('free');
    expect(popup.settings().cameraFollow).toBe('free');
  });

  it('renders the settings it was handed on load', () => {
    const { control, segment } = setup({
      settings: {
        ...DEFAULT_PLAYER_SETTINGS,
        uiTheme: 'hybrid-premium',
        cameraFollow: 'free',
        graphicsAuto: false,
        graphicsLevel: 7,
        displayNames: false,
        crouchMode: 'toggle',
      },
    });

    expect(control<HTMLSelectElement>('ui-theme').value).toBe('hybrid-premium');
    expect(segment('camera-follow', 'free').getAttribute('aria-pressed')).toBe('true');
    expect(segment('crouch-mode', 'toggle').getAttribute('aria-pressed')).toBe('true');
    expect(control<HTMLInputElement>('graphics-auto').checked).toBe(false);
    expect(control<HTMLInputElement>('graphics-level').value).toBe('7');
    expect(control<HTMLInputElement>('display-names').checked).toBe(false);
  });

  it('dispose() removes the popup and its document Esc listener', () => {
    const onRequestClose = vi.fn();
    const { popup } = setup({ onRequestClose });

    popup.dispose();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(document.querySelector('[data-testid="settings-popup"]')).toBe(null);
    expect(onRequestClose).toHaveBeenCalledTimes(0);
  });
});
