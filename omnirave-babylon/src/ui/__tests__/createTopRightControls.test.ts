import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LOGOUT_CONFIRM_WINDOW_MS, createTopRightControls } from '../createTopRightControls';

function setup(options: Parameters<typeof createTopRightControls>[1] = {}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const controls = createTopRightControls(host, options);
  const button = (control: string) =>
    host.querySelector<HTMLButtonElement>(`[data-hud-control="${control}"]`)!;
  return { host, controls, button };
}

describe('createTopRightControls', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows Log In and Sign Up for a guest', () => {
    const { button } = setup({ mode: 'guest' });

    expect(button('log-in').hidden).toBe(false);
    expect(button('sign-up').hidden).toBe(false);
    expect(button('logout').hidden).toBe(true);
  });

  it('shows only Logout for an authenticated session', () => {
    const { button } = setup({ mode: 'account' });

    expect(button('log-in').hidden).toBe(true);
    expect(button('sign-up').hidden).toBe(true);
    expect(button('logout').hidden).toBe(false);
    expect(button('logout').textContent).toBe('Logout');
  });

  it('reports Log In / Sign Up clicks to the caller', () => {
    const onLogIn = vi.fn();
    const onSignUp = vi.fn();
    const { button } = setup({ mode: 'guest', onLogIn, onSignUp });

    button('log-in').click();
    button('sign-up').click();

    expect(onLogIn).toHaveBeenCalledTimes(1);
    expect(onSignUp).toHaveBeenCalledTimes(1);
  });

  it('arms a Confirm? label on the first logout click', () => {
    const onLogout = vi.fn();
    const { controls, button } = setup({ mode: 'account', onLogout });

    button('logout').click();

    expect(button('logout').textContent).toBe('Confirm?');
    expect(controls.isConfirmingLogout()).toBe(true);
    expect(onLogout).toHaveBeenCalledTimes(0);
  });

  it('logs out on a second click inside the 3 second window', () => {
    const onLogout = vi.fn();
    const { controls, button } = setup({ mode: 'account', onLogout });

    button('logout').click();
    vi.advanceTimersByTime(LOGOUT_CONFIRM_WINDOW_MS - 1);
    button('logout').click();

    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(button('logout').textContent).toBe('Logout');
    expect(controls.isConfirmingLogout()).toBe(false);
  });

  it('reverts automatically after 3 seconds without logging out', () => {
    const onLogout = vi.fn();
    const { controls, button } = setup({ mode: 'account', onLogout });

    button('logout').click();
    vi.advanceTimersByTime(LOGOUT_CONFIRM_WINDOW_MS);

    expect(button('logout').textContent).toBe('Logout');
    expect(controls.isConfirmingLogout()).toBe(false);
    expect(onLogout).toHaveBeenCalledTimes(0);

    // A later click is a fresh first click, not the confirm.
    button('logout').click();
    expect(onLogout).toHaveBeenCalledTimes(0);
    expect(button('logout').textContent).toBe('Confirm?');
  });

  it('keeps the confirm armed when the player clicks elsewhere - the timer is the only reset', () => {
    const onLogout = vi.fn();
    const { controls, button } = setup({ mode: 'account', onLogout });

    button('logout').click();
    document.body.click();
    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    window.dispatchEvent(new Event('blur'));

    expect(controls.isConfirmingLogout()).toBe(true);
    expect(button('logout').textContent).toBe('Confirm?');

    button('logout').click();
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it('clears an armed confirm when the session mode changes', () => {
    const onLogout = vi.fn();
    const { controls, button } = setup({ mode: 'account', onLogout });

    button('logout').click();
    controls.setMode('guest');

    expect(controls.isConfirmingLogout()).toBe(false);
    expect(button('logout').textContent).toBe('Logout');
    expect(button('log-in').hidden).toBe(false);
  });

  it('dispose() removes the block, drops handlers, and clears the confirm timer', () => {
    const onLogout = vi.fn();
    const { host, controls, button } = setup({ mode: 'account', onLogout });
    const logout = button('logout');

    logout.click();
    controls.dispose();
    vi.advanceTimersByTime(LOGOUT_CONFIRM_WINDOW_MS * 2);
    logout.click();

    expect(host.querySelector('[data-testid="top-right-controls"]')).toBe(null);
    expect(onLogout).toHaveBeenCalledTimes(0);
  });
});
