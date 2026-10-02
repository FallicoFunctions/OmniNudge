import { afterEach, describe, expect, it, vi } from 'vitest';
import { createChatPanel } from '../createChatPanel';
import { createPlayerHud } from '../createPlayerHud';
import { createMobileHudControls } from '../createMobileHudControls';

const cleanups: (() => void)[] = [];
afterEach(() => { cleanups.splice(0).reverse().forEach(cleanup => cleanup()); });
function setup(matches = true, connected = true) {
  const host = document.createElement('div');
  document.body.append(host);
  const onSend = vi.fn();
  const chat = createChatPanel(host, { onSend, connected });
  const hud = createPlayerHud(host);
  const media = Object.assign(new EventTarget(), { matches }) as MediaQueryList;
  const relayout = vi.fn();
  const controls = createMobileHudControls(host, { chat, nowPlaying: hud.element, media, onLayoutChange: relayout });
  cleanups.push(chat.dispose, hud.dispose, controls.dispose);
  const button = (key: string) => host.querySelector<HTMLButtonElement>(`[data-testid="mobile-toggle-${key}"]`)!;
  const resize = (next: boolean) => { Object.assign(media, { matches: next }); media.dispatchEvent(new Event('change')); };
  return { host, chat, hud, media, controls, onSend, relayout, button, resize };
}

describe('mobile HUD drawers', () => {
  it('starts with entire panels inert and hidden, and toggles mutually exclusive drawers', () => {
    const { chat, hud, button, relayout } = setup();
    expect(chat.element.inert).toBe(true);
    expect(hud.element.getAttribute('aria-hidden')).toBe('true');
    expect(button('now-playing').getAttribute('aria-expanded')).toBe('false');
    expect(hud.element.classList.contains('mobile-panel--hidden')).toBe(true);
    expect(chat.element.classList.contains('mobile-panel--hidden')).toBe(true);
    button('chat').click();
    expect(chat.element.inert).toBe(false);
    expect(button('chat').getAttribute('aria-expanded')).toBe('true');
    button('now-playing').click();
    expect(chat.element.inert).toBe(true);
    expect(hud.element.inert).toBe(false);
    button('now-playing').click();
    expect(hud.element.inert).toBe(true);
    expect(hud.element.getAttribute('aria-hidden')).toBe('true');
    expect(hud.element.classList.contains('mobile-panel--hidden')).toBe(true);
    expect(relayout).toHaveBeenCalledTimes(4);
  });

  it('keeps the Chat toggle available while disconnected, preserving drafts for reconnect', () => {
    const { chat, button, onSend } = setup(true, false);
    button('chat').click();
    expect(chat.element.inert).toBe(false);
    const status = chat.element.querySelector<HTMLElement>('[data-testid="chat-connection-status"]')!;
    const input = chat.element.querySelector<HTMLTextAreaElement>('textarea')!;
    const send = chat.element.querySelector<HTMLButtonElement>('.chat-panel__send')!;
    expect(status.hidden).toBe(false);
    expect(input.disabled).toBe(true);
    expect(send.disabled).toBe(true);
    input.value = 'Keep my draft';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(onSend).not.toHaveBeenCalled();
    expect(input.value).toBe('Keep my draft');
    chat.setConnected(true);
    expect(status.hidden).toBe(true);
    expect(input.disabled).toBe(false);
    chat.focusInput();
    expect(chat.isTextEntryActive()).toBe(true);
    chat.setConnected(false);
    expect(chat.isTextEntryActive()).toBe(false);
    chat.setConnected(true);
    send.click();
    expect(onSend).toHaveBeenCalledWith('Keep my draft');
  });

  it('releases chat focus when hidden and never opens a hidden drawer for announcements or Enter', () => {
    const { chat, button } = setup();
    const input = chat.element.querySelector<HTMLTextAreaElement>('textarea')!;
    chat.appendSystemMessage('Entered Main Stage');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(document.activeElement).not.toBe(input);
    expect(chat.element.inert).toBe(true);
    button('chat').click();
    chat.focusInput();
    expect(chat.isTextEntryActive()).toBe(true);
    button('chat').click();
    expect(document.activeElement).not.toBe(input);
    expect(chat.isTextEntryActive()).toBe(false);
    chat.focusInput();
    expect(document.activeElement).not.toBe(input);
  });

  it('sends chat from its mobile Send button using the existing message path', () => {
    const { chat, button, onSend } = setup();
    button('chat').click();
    const input = chat.element.querySelector<HTMLTextAreaElement>('textarea')!;
    input.value = 'Hello from mobile';
    chat.element.querySelector<HTMLButtonElement>('.chat-panel__send')!.click();
    expect(onSend).toHaveBeenCalledWith('Hello from mobile');
    expect(input.value).toBe('');
  });

  it('uses Tap to chat on mobile and requires input focus instead of the global Enter shortcut', () => {
    const { chat, button, resize } = setup();
    const input = chat.element.querySelector<HTMLTextAreaElement>('textarea')!;
    expect(input.placeholder).toBe('Tap to chat');
    button('chat').click();
    expect(document.activeElement).not.toBe(input);
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    window.dispatchEvent(enter);
    expect(document.activeElement).not.toBe(input);
    expect(enter.defaultPrevented).toBe(false);
    input.focus();
    expect(chat.isTextEntryActive()).toBe(true);
    input.blur();
    resize(false);
    expect(input.placeholder).toBe('Press Enter to chat');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }));
    expect(document.activeElement).toBe(input);
  });

  it('retains the Muted button and its user list in the mobile drawer', () => {
    const { chat, button } = setup();
    chat.setMutedUsers([{ playerId: 'other', playerName: 'Muted Raver' }]);
    button('chat').click();
    const muted = chat.element.querySelector<HTMLButtonElement>('[data-chat-control="chat-settings"]')!;
    expect(muted.textContent).toBe('Muted');
    muted.click();
    expect(chat.isMutedViewOpen()).toBe(true);
    expect(chat.element.querySelector('[data-testid="chat-muted-list"]')?.textContent).toContain('Muted Raver');
    muted.click();
    expect(chat.isMutedViewOpen()).toBe(false);
  });

  it('restores desktop panels without changing the desktop chat preference, including show suppression', () => {
    const { chat, hud, button, resize, host } = setup();
    chat.setOpen(false);
    button('chat').click();
    expect(chat.isBodyVisible()).toBe(true);
    chat.setSuppressed(true);
    resize(false);
    expect(chat.isOpen()).toBe(false);
    expect(chat.isBodyVisible()).toBe(false);
    expect(chat.element.hidden).toBe(true);
    expect(hud.element.inert).toBe(false);
    expect(host.classList.contains('babylon-runtime-host--mobile')).toBe(false);
    resize(true);
    expect(chat.element.hidden).toBe(true);
    chat.setSuppressed(false);
    expect(chat.element.inert).toBe(false);
  });

  it('removes listeners and restores panel accessibility on disposal', () => {
    const { chat, hud, host, controls, resize } = setup();
    controls.dispose();
    cleanups.pop();
    resize(false);
    resize(true);
    expect(chat.element.inert).toBe(false);
    expect(hud.element.getAttribute('aria-hidden')).toBeNull();
    expect(host.querySelector('.mobile-hud-controls')).toBeNull();
  });
});
