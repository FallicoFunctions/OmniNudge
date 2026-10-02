import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMobileMenu } from '../createMobileMenu';
import { createTopLeftControls } from '../createTopLeftControls';
import { createTopRightControls } from '../createTopRightControls';
import { createInputMap } from '../../player/createInputMap';

const cleanups: (() => void)[] = [];
afterEach(() => { cleanups.splice(0).reverse().forEach(cleanup => cleanup()); vi.useRealTimers(); });
function setup(matches = true) {
  const host = document.createElement('div');
  document.body.append(host);
  const settings = document.createElement('section');
  const left = createTopLeftControls(host, { settingsPanel: settings });
  const login = vi.fn(), signup = vi.fn(), logout = vi.fn();
  const right = createTopRightControls(host, { onLogIn: login, onSignUp: signup, onLogout: logout });
  const media = Object.assign(new EventTarget(), { matches }) as MediaQueryList;
  const menu = createMobileMenu(host, { topLeft: left.element, topRight: right.element, media });
  cleanups.push(left.dispose, right.dispose, menu.dispose);
  const toggle = host.querySelector<HTMLButtonElement>('.mobile-menu__toggle')!;
  const content = host.querySelector<HTMLElement>('.mobile-menu__content')!;
  const action = (key: string) => host.querySelector<HTMLButtonElement>(`[data-hud-control="${key}"]`)!;
  const resize = (mobile: boolean) => { Object.assign(media, { matches: mobile }); media.dispatchEvent(new Event('change')); };
  return { host, left, right, settings, menu, content, toggle, action, resize, login, signup, logout };
}

describe('mobile hamburger menu', () => {
  it('starts closed and exposes the original four guest actions and exact Exit destination', () => {
    const { content, toggle, action } = setup();
    expect(content.hidden).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    for (const key of ['settings', 'avatar', 'log-in', 'sign-up']) {
      expect(content.contains(action(key))).toBe(true);
      expect(action(key).hidden).toBe(false);
    }
    expect(action('logout').hidden).toBe(true);
    expect(content.querySelector('a')?.href).toBe('http://omninudge.com/games/omnirave/');
    toggle.click();
    expect(content.hidden).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
  });

  it('opens existing Settings and Avatar panels, closing the menu after a selection', () => {
    const { left, settings, content, toggle, action } = setup();
    toggle.click();
    action('settings').click();
    expect(left.activePanel()).toBe('settings');
    expect(settings.hidden).toBe(false);
    expect(content.hidden).toBe(true);
    toggle.click();
    action('avatar').click();
    expect(left.activePanel()).toBe('avatar');
    expect(content.hidden).toBe(true);
  });

  it('retains login/signup callbacks and reacts to an in-place account upgrade', () => {
    const { right, content, toggle, action, login, signup } = setup();
    toggle.click(); action('log-in').click();
    expect(login).toHaveBeenCalledOnce();
    expect(content.hidden).toBe(true);
    toggle.click(); action('sign-up').click();
    expect(signup).toHaveBeenCalledOnce();
    right.setMode('account');
    expect(action('log-in').hidden).toBe(true);
    expect(action('sign-up').hidden).toBe(true);
    expect(action('logout').hidden).toBe(false);
  });

  it('keeps the menu open for the first logout confirmation, then closes after confirming', () => {
    vi.useFakeTimers();
    const { right, content, toggle, action, logout } = setup();
    right.setMode('account');
    toggle.click(); action('logout').click();
    expect(content.hidden).toBe(false);
    expect(logout).not.toHaveBeenCalled();
    action('logout').click();
    expect(content.hidden).toBe(true);
    expect(logout).toHaveBeenCalledOnce();
  });

  it('closes with Escape or an outside touch and restores focus after Escape', () => {
    const { host, content, toggle } = setup();
    toggle.click();
    content.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(content.hidden).toBe(true);
    expect(document.activeElement).toBe(toggle);
    toggle.click();
    host.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(content.hidden).toBe(true);
  });

  it('keeps menu keyboard activation from triggering player movement or jumps', () => {
    const { toggle, action } = setup();
    const input = createInputMap(window);
    cleanups.push(input.dispose);
    toggle.focus();
    const space = new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true, cancelable: true });
    toggle.dispatchEvent(space);
    expect(space.defaultPrevented).toBe(false);
    expect(input.state.jump).toBe(false);
    const release = new KeyboardEvent('keyup', { key: ' ', code: 'Space', bubbles: true, cancelable: true });
    toggle.dispatchEvent(release);
    expect(release.defaultPrevented).toBe(false);
    toggle.click();
    action('settings').dispatchEvent(new KeyboardEvent('keydown', { key: 'w', code: 'KeyW', bubbles: true }));
    expect(input.state.forward).toBe(false);
  });

  it('restores desktop rows and retains actions through rotation and disposal', () => {
    const { host, left, right, menu, content, action, resize, login } = setup(false);
    expect(left.element.contains(action('settings'))).toBe(true);
    expect(right.element.contains(action('log-in'))).toBe(true);
    resize(true);
    expect(content.contains(action('settings'))).toBe(true);
    resize(false);
    action('log-in').click();
    expect(login).toHaveBeenCalledOnce();
    resize(true);
    menu.dispose(); cleanups.pop();
    resize(false); resize(true);
    expect(host.querySelector('.mobile-menu')).toBeNull();
    expect(left.element.contains(action('settings'))).toBe(true);
    expect(right.element.contains(action('log-in'))).toBe(true);
  });
});
