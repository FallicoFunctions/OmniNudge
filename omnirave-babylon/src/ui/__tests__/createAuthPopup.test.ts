import { afterEach, describe, expect, it, vi } from 'vitest';

import { createAuthPopup } from '../createAuthPopup';

function field(host: HTMLElement, name: string): HTMLInputElement {
  return host.querySelector<HTMLInputElement>(`[data-auth-field="${name}"]`)!;
}

describe('createAuthPopup', () => {
  let host: HTMLDivElement;

  afterEach(() => {
    host?.remove();
  });

  function mount(onSubmit = vi.fn().mockResolvedValue({ ok: true })) {
    host = document.createElement('div');
    document.body.appendChild(host);
    const popup = createAuthPopup({ onSubmit });
    host.appendChild(popup.element);
    return { popup, onSubmit };
  }

  it('starts hidden and shows the requested mode on open', () => {
    const { popup } = mount();
    expect(popup.element.hidden).toBe(true);

    popup.open('login');
    expect(popup.element.hidden).toBe(false);
    expect(popup.isOpen()).toBe(true);
    expect(popup.element.querySelector('.venue-window__title')?.textContent).toBe('Log In');
    // Signup-only fields stay hidden in login mode.
    expect(popup.element.querySelector('[data-auth-field="email"]')?.closest('.venue-row')).toHaveProperty('hidden', true);
  });

  it('opening in signup mode reveals email + policy checkboxes', () => {
    const { popup } = mount();
    popup.open('signup');
    expect(popup.element.querySelector('.venue-window__title')?.textContent).toBe('Sign Up');
    expect(popup.element.querySelector('[data-auth-field="email"]')?.closest('.venue-row')).toHaveProperty('hidden', false);
    expect(popup.element.querySelector('[data-auth-field="accept-terms"]')?.closest('.venue-row')).toHaveProperty('hidden', false);
  });

  it('toggle switches between login and signup', () => {
    const { popup } = mount();
    popup.open('login');
    const toggle = popup.element.querySelector<HTMLButtonElement>('[data-auth-toggle]')!;
    toggle.click();
    expect(popup.element.querySelector('.venue-window__title')?.textContent).toBe('Sign Up');
    toggle.click();
    expect(popup.element.querySelector('.venue-window__title')?.textContent).toBe('Log In');
  });

  it('close hides the popup and clears fields', () => {
    const { popup } = mount();
    popup.open('login');
    field(popup.element, 'username').value = 'nick';
    popup.close();
    expect(popup.element.hidden).toBe(true);
    expect(popup.isOpen()).toBe(false);
    expect(field(popup.element, 'username').value).toBe('');
  });

  it('rejects an empty submit without calling onSubmit', async () => {
    const { popup, onSubmit } = mount();
    popup.open('login');
    const form = popup.element.querySelector('form')!;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await Promise.resolve();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(popup.element.querySelector('[data-auth-error]')?.textContent).toContain('required');
  });

  it('rejects signup submit without accepting terms/privacy', async () => {
    const { popup, onSubmit } = mount();
    popup.open('signup');
    field(popup.element, 'username').value = 'nick';
    field(popup.element, 'password').value = 'hunter2222';
    const form = popup.element.querySelector('form')!;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await Promise.resolve();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(popup.element.querySelector('[data-auth-error]')?.textContent).toContain('Terms');
  });

  it('submits trimmed login fields and leaves the panel alone on success', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: true });
    const { popup } = mount(onSubmit);
    popup.open('login');
    field(popup.element, 'username').value = '  nick  ';
    field(popup.element, 'password').value = 'hunter2222';
    const form = popup.element.querySelector('form')!;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await Promise.resolve();
    await Promise.resolve();

    expect(onSubmit).toHaveBeenCalledWith('login', expect.objectContaining({ username: 'nick', password: 'hunter2222' }));
  });

  it('shows the returned error message on a failed submit and re-enables the form', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: false, message: 'invalid username or password' });
    const { popup } = mount(onSubmit);
    popup.open('login');
    field(popup.element, 'username').value = 'nick';
    field(popup.element, 'password').value = 'wrong';
    const form = popup.element.querySelector('form')!;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await Promise.resolve();
    await Promise.resolve();

    expect(popup.element.querySelector('[data-auth-error]')?.textContent).toBe('invalid username or password');
    const submitButton = popup.element.querySelector<HTMLButtonElement>('[data-auth-submit]')!;
    expect(submitButton.disabled).toBe(false);
  });

  // Sec 11.1: "switching between login/signup preserves relevant typed fields
  // within the same open session" - and only CLOSING discards them.
  it('keeps typed fields across a mode switch, and discards them on close', () => {
    const { popup } = mount();
    popup.open('login');
    field(popup.element, 'username').value = 'nick';
    field(popup.element, 'password').value = 'hunter2222';

    popup.element.querySelector<HTMLButtonElement>('[data-auth-toggle]')!.click();
    expect(field(popup.element, 'username').value).toBe('nick');
    expect(field(popup.element, 'password').value).toBe('hunter2222');

    popup.close();
    popup.open('signup');
    expect(field(popup.element, 'username').value).toBe('');
  });

  // Sec 11.1: the window is "not closable with `Esc`" - the top-right Close
  // button is the only way out, so this module binds no keydown listener.
  it('ignores Esc', () => {
    const { popup } = mount();
    popup.open('login');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(popup.isOpen()).toBe(true);
    expect(popup.element.hidden).toBe(false);
  });

  it('closes on the Close button and reports it to the caller', () => {
    const onRequestClose = vi.fn();
    host = document.createElement('div');
    document.body.appendChild(host);
    const popup = createAuthPopup({ onSubmit: vi.fn().mockResolvedValue({ ok: true }), onRequestClose });
    host.appendChild(popup.element);

    popup.open('login');
    popup.element.querySelector<HTMLButtonElement>('[data-auth-close]')!.click();
    expect(popup.isOpen()).toBe(false);
    expect(onRequestClose.mock.calls.length).toBe(1);
  });

  // Sec 11.1: "focused auth typing suppresses movement keys". Moving between
  // two fields inside the window must NOT flicker movement back on.
  it('reports text entry while focus is inside the window, and only on the way out', () => {
    const onTextEntryActiveChange = vi.fn();
    host = document.createElement('div');
    document.body.appendChild(host);
    const popup = createAuthPopup({
      onSubmit: vi.fn().mockResolvedValue({ ok: true }),
      onTextEntryActiveChange,
    });
    host.appendChild(popup.element);
    popup.open('login');

    const username = field(popup.element, 'username');
    const password = field(popup.element, 'password');
    username.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    expect(onTextEntryActiveChange.mock.calls).toEqual([[true]]);

    // Tab across to the next field: focusout then focusin, same window.
    username.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: password }));
    password.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    expect(onTextEntryActiveChange.mock.calls).toEqual([[true]]);

    // Focus leaving the window entirely releases the keyboard.
    password.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null }));
    expect(onTextEntryActiveChange.mock.calls).toEqual([[true], [false]]);
  });

  it('releases movement keys when closed or disposed mid-typing', () => {
    const onTextEntryActiveChange = vi.fn();
    host = document.createElement('div');
    document.body.appendChild(host);
    const popup = createAuthPopup({
      onSubmit: vi.fn().mockResolvedValue({ ok: true }),
      onTextEntryActiveChange,
    });
    host.appendChild(popup.element);
    popup.open('login');
    field(popup.element, 'username').dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    popup.close();
    expect(onTextEntryActiveChange.mock.calls).toEqual([[true], [false]]);
  });

  it('dispose removes the element from the DOM', () => {
    const { popup } = mount();
    popup.dispose();
    expect(popup.element.isConnected).toBe(false);
  });
});
