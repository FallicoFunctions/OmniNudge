import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CHAT_AUTO_OPEN_MS,
  CHAT_HINT_DURATION_MS,
  CHAT_RATE_LIMIT_HINT,
  CHAT_SEND_INTERVAL_MS,
  MAX_CHAT_MESSAGE_LENGTH,
  NO_MUTED_USERS_TEXT,
  clampChatInput,
  createChatPanel,
  formatChatTimestamp,
} from '../createChatPanel';
import type { CreateChatPanelOptions } from '../createChatPanel';
import type { WorldChatMessage } from '../../network/worldSocket';

const LOCAL_ID = 'player-local';
const OTHER_ID = 'player-other';

function chat(overrides: Partial<WorldChatMessage> = {}): WorldChatMessage {
  return {
    playerId: OTHER_ID,
    playerName: 'Guest4242',
    body: 'hello',
    createdAt: '',
    ...overrides,
  };
}

function setup(options: CreateChatPanelOptions = {}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const panel = createChatPanel(host, { currentPlayerId: LOCAL_ID, ...options });
  const query = <T extends HTMLElement>(testid: string) =>
    host.querySelector<T>(`[data-testid="${testid}"]`)!;
  const input = query<HTMLTextAreaElement>('chat-input');
  const body = query<HTMLElement>('chat-panel-body');
  const history = query<HTMLElement>('chat-history');
  const control = (name: string) =>
    host.querySelector<HTMLButtonElement>(`[data-chat-control="${name}"]`)!;
  const lines = () => Array.from(host.querySelectorAll<HTMLElement>('[data-chat-line]'));
  return { host, panel, query, input, body, history, control, lines };
}

describe('createChatPanel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 4, 17, 34, 32));
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.textContent = '';
  });

  describe('open / collapse (sec 9.8)', () => {
    it('defaults to open when no saved preference exists', () => {
      const { panel, body } = setup();

      expect(panel.isOpen()).toBe(true);
      expect(panel.isBodyVisible()).toBe(true);
      expect(body.hidden).toBe(false);
    });

    it('respects a persisted collapsed preference', () => {
      const { panel, body, input } = setup({ open: false });

      expect(panel.isOpen()).toBe(false);
      expect(panel.isBodyVisible()).toBe(false);
      expect(body.hidden).toBe(true);
      // The input line never disappears.
      expect(input.isConnected).toBe(true);
      expect(input.hidden).toBe(false);
    });

    it('collapsing hides the history immediately and reports the preference', () => {
      const onOpenChange = vi.fn();
      const { panel, body, input, control } = setup({ onOpenChange });

      control('collapse').click();

      expect(body.hidden).toBe(true);
      expect(panel.isOpen()).toBe(false);
      expect(input.isConnected).toBe(true);
      expect(onOpenChange).toHaveBeenCalledTimes(1);
      expect(onOpenChange).toHaveBeenCalledWith(false);

      control('collapse').click();
      expect(body.hidden).toBe(false);
      expect(onOpenChange).toHaveBeenLastCalledWith(true);
    });
  });

  describe('collapsed auto-open (sec 9.8)', () => {
    it('auto-opens for a system announcement', () => {
      const { panel, body } = setup({ open: false });

      panel.appendSystemMessage('Entered Main Stage');

      expect(panel.isBodyVisible()).toBe(true);
      expect(body.hidden).toBe(false);
      // Auto-open is not the persisted preference.
      expect(panel.isOpen()).toBe(false);
    });

    it('does NOT auto-open for another player message', () => {
      const { panel, body } = setup({ open: false });

      panel.appendMessage(chat());

      expect(panel.isBodyVisible()).toBe(false);
      expect(body.hidden).toBe(true);
    });

    it('auto-opens when the local player sends', () => {
      const onSend = vi.fn();
      const { panel, input } = setup({ open: false, onSend });

      input.value = 'oi';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

      expect(onSend).toHaveBeenCalledWith('oi');
      expect(panel.isBodyVisible()).toBe(true);
    });

    it('auto-opens on the local player echo from the server', () => {
      const { panel } = setup({ open: false });

      panel.appendMessage(chat({ playerId: LOCAL_ID, playerName: 'Guest0001' }));

      expect(panel.isBodyVisible()).toBe(true);
    });

    it('closes again after the 10 second window', () => {
      const { panel, body } = setup({ open: false });

      panel.appendSystemMessage('Entered Main Stage');
      vi.advanceTimersByTime(CHAT_AUTO_OPEN_MS - 1);
      expect(panel.isBodyVisible()).toBe(true);

      vi.advanceTimersByTime(1);
      expect(panel.isBodyVisible()).toBe(false);
      expect(body.hidden).toBe(true);
    });

    it('resets the 10 second window on a further relevant message', () => {
      const { panel } = setup({ open: false });

      panel.appendSystemMessage('Entered Main Stage');
      vi.advanceTimersByTime(CHAT_AUTO_OPEN_MS - 1000);
      panel.appendSystemMessage('The set starts in 5 minutes');

      // Past the ORIGINAL deadline, still open because the timer restarted.
      vi.advanceTimersByTime(1001);
      expect(panel.isBodyVisible()).toBe(true);

      vi.advanceTimersByTime(CHAT_AUTO_OPEN_MS);
      expect(panel.isBodyVisible()).toBe(false);
    });

    it('an irrelevant message does not extend the window', () => {
      const { panel } = setup({ open: false });

      panel.appendSystemMessage('Entered Main Stage');
      vi.advanceTimersByTime(CHAT_AUTO_OPEN_MS - 100);
      panel.appendMessage(chat());
      vi.advanceTimersByTime(100);

      expect(panel.isBodyVisible()).toBe(false);
    });

    it('clicking inside the history makes it permanently open', () => {
      const onOpenChange = vi.fn();
      const { panel, history } = setup({ open: false, onOpenChange });

      panel.appendSystemMessage('Entered Main Stage');
      history.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      vi.advanceTimersByTime(CHAT_AUTO_OPEN_MS * 2);

      expect(panel.isOpen()).toBe(true);
      expect(panel.isBodyVisible()).toBe(true);
      expect(onOpenChange).toHaveBeenCalledWith(true);
    });

    it('scrolling the history makes it permanently open', () => {
      const { panel, history } = setup({ open: false });

      panel.appendSystemMessage('Entered Main Stage');
      history.dispatchEvent(new Event('scroll'));
      vi.advanceTimersByTime(CHAT_AUTO_OPEN_MS * 2);

      expect(panel.isOpen()).toBe(true);
    });

    it('a wheel gesture over the history also makes it permanently open', () => {
      const { panel, history } = setup({ open: false });

      history.dispatchEvent(new Event('wheel'));

      expect(panel.isOpen()).toBe(true);
    });

    it('focusing the input alone does NOT open it', () => {
      const { panel, input } = setup({ open: false });

      input.focus();

      expect(panel.isTextEntryActive()).toBe(true);
      expect(panel.isOpen()).toBe(false);
      expect(panel.isBodyVisible()).toBe(false);
    });
  });

  describe('input (sec 10.3)', () => {
    it('Enter focuses the chat input from the world', () => {
      const { panel, input } = setup();

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

      expect(document.activeElement === input).toBe(true);
      expect(panel.isTextEntryActive()).toBe(true);
    });

    it('Enter sends and clears, Shift+Enter does not', () => {
      const onSend = vi.fn();
      const { input } = setup({ onSend });

      input.value = 'first line';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }));
      expect(onSend).toHaveBeenCalledTimes(0);
      expect(input.value).toBe('first line');

      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      expect(onSend).toHaveBeenCalledTimes(1);
      expect(onSend).toHaveBeenCalledWith('first line');
      expect(input.value).toBe('');
    });

    it('never sends a whitespace-only draft', () => {
      const onSend = vi.fn();
      const { input } = setup({ onSend });

      input.value = '   \n  ';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

      expect(onSend).toHaveBeenCalledTimes(0);
    });

    it('Esc exits chat without sending and restores movement', () => {
      const onSend = vi.fn();
      const onTextEntryActiveChange = vi.fn();
      const { panel, input } = setup({ onSend, onTextEntryActiveChange });

      input.focus();
      input.value = 'unsent';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

      expect(onSend).toHaveBeenCalledTimes(0);
      expect(document.activeElement === input).toBe(false);
      expect(panel.isTextEntryActive()).toBe(false);
      expect(onTextEntryActiveChange).toHaveBeenLastCalledWith(false);
    });

    it('clamps typing and pasting to 200 characters', () => {
      const { input } = setup();

      expect(input.maxLength).toBe(MAX_CHAT_MESSAGE_LENGTH);
      expect(clampChatInput('x'.repeat(500)).length).toBe(MAX_CHAT_MESSAGE_LENGTH);

      // A paste lands as a value change followed by an `input` event.
      input.value = 'y'.repeat(500);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      expect(input.value.length).toBe(MAX_CHAT_MESSAGE_LENGTH);

      // The explicit paste path re-clamps on the next tick too.
      input.value = 'z'.repeat(400);
      input.dispatchEvent(new Event('paste', { bubbles: true }));
      vi.advanceTimersByTime(1);
      expect(input.value.length).toBe(MAX_CHAT_MESSAGE_LENGTH);
    });

    it('enforces one message per second and shows the hint inside the panel', () => {
      const onSend = vi.fn();
      const { input, query } = setup({ onSend });
      const hint = query<HTMLElement>('chat-hint');

      input.value = 'one';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      expect(onSend).toHaveBeenCalledTimes(1);
      expect(hint.hidden).toBe(true);

      input.value = 'two';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      expect(onSend).toHaveBeenCalledTimes(1);
      expect(hint.hidden).toBe(false);
      expect(hint.textContent).toBe(CHAT_RATE_LIMIT_HINT);
      // The draft is preserved so a retry is one keypress.
      expect(input.value).toBe('two');
      // The hint is rendered INSIDE the panel.
      expect(hint.closest('[data-testid="chat-panel"]') !== null).toBe(true);

      vi.advanceTimersByTime(CHAT_HINT_DURATION_MS);
      expect(hint.hidden).toBe(true);

      vi.advanceTimersByTime(CHAT_SEND_INTERVAL_MS);
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      expect(onSend).toHaveBeenCalledTimes(2);
      expect(onSend).toHaveBeenLastCalledWith('two');
    });

    it('reports text entry focus so the caller can suppress movement', () => {
      const onTextEntryActiveChange = vi.fn();
      const { panel, input } = setup({ onTextEntryActiveChange });

      input.focus();
      expect(onTextEntryActiveChange).toHaveBeenLastCalledWith(true);
      expect(panel.isTextEntryActive()).toBe(true);

      input.blur();
      expect(onTextEntryActiveChange).toHaveBeenLastCalledWith(false);
      expect(panel.isTextEntryActive()).toBe(false);
    });
  });

  describe('display (sec 10.4)', () => {
    it('formats 12-hour timestamps including the midnight and noon edges', () => {
      expect(formatChatTimestamp(new Date(2026, 5, 4, 17, 34, 32))).toBe('05:34:32PM');
      expect(formatChatTimestamp(new Date(2026, 5, 4, 0, 0, 0))).toBe('12:00:00AM');
      expect(formatChatTimestamp(new Date(2026, 5, 4, 12, 0, 0))).toBe('12:00:00PM');
      expect(formatChatTimestamp(new Date(2026, 5, 4, 0, 9, 5))).toBe('12:09:05AM');
      expect(formatChatTimestamp(new Date(2026, 5, 4, 23, 59, 59))).toBe('11:59:59PM');
      expect(formatChatTimestamp(new Date(2026, 5, 4, 9, 5, 7))).toBe('09:05:07AM');
    });

    it('renders `Name HH:MM:SSPM: body` with name/time/body as distinct elements', () => {
      const { panel, lines } = setup();

      panel.appendMessage(chat({ playerName: 'Guest4242', body: 'hello' }));

      const line = lines()[0];
      expect(line.textContent).toBe('Guest4242 05:34:32PM: hello');
      expect(line.querySelector('.chat-panel__name')!.textContent).toBe('Guest4242');
      expect(line.querySelector('.chat-panel__time')!.textContent).toBe('05:34:32PM');
      expect(line.querySelector('.chat-panel__message')!.textContent).toBe('hello');
      // Three distinct elements, so they can be styled apart.
      expect(line.querySelector('.chat-panel__name') === line.querySelector('.chat-panel__message')).toBe(false);
    });

    it('uses the message createdAt timestamp when the server supplies one', () => {
      const { panel, lines } = setup();

      panel.appendMessage(chat({ createdAt: new Date(2026, 5, 4, 13, 2, 3).toISOString() }));

      expect(lines()[0].querySelector('.chat-panel__time')!.textContent).toBe('01:02:03PM');
    });

    it('styles system messages distinctly in the same timestamped format', () => {
      const { panel, lines } = setup();

      panel.appendSystemMessage('Entered Main Stage');

      const line = lines()[0];
      expect(line.dataset.chatLine).toBe('system');
      expect(line.classList.contains('chat-panel__line--system')).toBe(true);
      expect(line.textContent).toBe('System 05:34:32PM: Entered Main Stage');
    });

    it('keeps text selectable (no user-select:none on the history)', () => {
      const { history } = setup();

      expect(history.style.userSelect).toBe('');
    });

    it('clearHistory empties the log for a venue transition and the fresh log opens with Entered [Venue]', () => {
      const { panel, lines } = setup();

      panel.appendMessage(chat());
      panel.appendMessage(chat({ body: 'again' }));
      expect(lines().length).toBe(2);

      panel.clearHistory();
      expect(lines().length).toBe(0);

      panel.appendSystemMessage('Entered The Underground');
      expect(lines().length).toBe(1);
      expect(lines()[0].textContent).toBe('System 05:34:32PM: Entered The Underground');
    });

    it('escapes hostile names and bodies instead of injecting HTML', () => {
      const { panel, host, lines } = setup();

      panel.appendMessage(
        chat({
          playerName: '<img src=x onerror="alert(1)">',
          body: '<script>alert(2)</script><b>bold</b>',
        }),
      );

      expect(host.querySelector('img')).toBe(null);
      expect(host.querySelector('script')).toBe(null);
      expect(host.querySelector('b')).toBe(null);
      expect(lines()[0].querySelector('.chat-panel__name')!.textContent).toBe(
        '<img src=x onerror="alert(1)">',
      );
      expect(lines()[0].querySelector('.chat-panel__message')!.textContent).toBe(
        '<script>alert(2)</script><b>bold</b>',
      );
    });
  });

  describe('mute (sec 10.2)', () => {
    it('renders no hover mute action for guests (canMute false)', () => {
      const { panel, host } = setup({ canMute: false });

      panel.appendMessage(chat());

      expect(host.querySelector('[data-chat-mute]')).toBe(null);
    });

    it('renders the hover mute action only for other players when canMute is true', () => {
      const { panel, host, lines } = setup({ canMute: true });

      panel.appendMessage(chat());
      panel.appendMessage(chat({ playerId: LOCAL_ID, playerName: 'Guest0001' }));
      panel.appendSystemMessage('Entered Main Stage');

      expect(lines()[0].querySelector('[data-chat-mute]') !== null).toBe(true);
      expect(lines()[1].querySelector('[data-chat-mute]')).toBe(null);
      expect(lines()[2].querySelector('[data-chat-mute]')).toBe(null);
      expect(host.querySelectorAll('[data-chat-mute]').length).toBe(1);
    });

    it('muting hides that player\'s later messages and flips the action label', () => {
      const { panel, host, lines } = setup({ canMute: true });

      panel.appendMessage(chat({ body: 'before' }));
      host.querySelector<HTMLButtonElement>('[data-chat-mute]')!.click();

      expect(panel.mutedUsers().length).toBe(1);
      expect(panel.mutedUsers()[0].playerId).toBe(OTHER_ID);
      expect(panel.mutedUsers()[0].playerName).toBe('Guest4242');
      expect(lines()[0].querySelector('[data-chat-mute]')!.textContent).toBe('Unmute');

      const accepted = panel.appendMessage(chat({ body: 'after' }));
      expect(accepted).toBe(false);
      expect(lines().length).toBe(1);

      // Someone else still gets through.
      expect(panel.appendMessage(chat({ playerId: 'player-third', playerName: 'Guest7777' }))).toBe(true);
      expect(lines().length).toBe(2);
    });

    it('setMutedUsers seeds the filter and mutedUsers reports it', () => {
      const { panel, lines } = setup({ canMute: true });

      panel.setMutedUsers([{ playerId: OTHER_ID, playerName: 'Guest4242' }]);

      expect(panel.appendMessage(chat())).toBe(false);
      expect(lines().length).toBe(0);
      expect(panel.mutedUsers().length).toBe(1);
    });

    it('the Muted Users view replaces the history, Back returns, and Unmute works', () => {
      const { panel, host, query, history, control } = setup({ canMute: true });
      const mutedView = query<HTMLElement>('chat-muted-view');

      panel.setMutedUsers([{ playerId: OTHER_ID, playerName: 'Guest4242' }]);
      host.querySelector<HTMLButtonElement>('[data-chat-control="chat-settings"]')!.click();

      expect(panel.isMutedViewOpen()).toBe(true);
      expect(mutedView.hidden).toBe(false);
      expect(history.hidden).toBe(true);
      expect(panel.isHistoryVisible()).toBe(false);
      expect(query<HTMLElement>('chat-muted-list').textContent).toBe('Guest4242Unmute');

      host.querySelector<HTMLButtonElement>('[data-chat-unmute]')!.click();
      expect(panel.mutedUsers().length).toBe(0);
      expect(query<HTMLElement>('chat-muted-empty').textContent).toBe(NO_MUTED_USERS_TEXT);

      control('muted-back').click();
      expect(panel.isMutedViewOpen()).toBe(false);
      expect(mutedView.hidden).toBe(true);
      expect(history.hidden).toBe(false);

      // Unmuted: messages flow again.
      expect(panel.appendMessage(chat())).toBe(true);
    });

    it('shows the empty state when nobody is muted', () => {
      const { host, query } = setup({ canMute: true });

      host.querySelector<HTMLButtonElement>('[data-chat-control="chat-settings"]')!.click();

      expect(query<HTMLElement>('chat-muted-empty').textContent).toBe(NO_MUTED_USERS_TEXT);
    });

    it('opens the Muted Users view even while the panel is collapsed', () => {
      const { panel, host, body } = setup({ canMute: true, open: false });

      host.querySelector<HTMLButtonElement>('[data-chat-control="chat-settings"]')!.click();

      expect(body.hidden).toBe(false);
      expect(panel.isBodyVisible()).toBe(true);
      // Still collapsed as a preference.
      expect(panel.isOpen()).toBe(false);
    });

    it('setCanMute(true) is all the auth block needs to expose the affordance', () => {
      const { panel, host } = setup({ canMute: false });

      panel.setCanMute(true);
      panel.appendMessage(chat());

      expect(host.querySelector('[data-chat-mute]') !== null).toBe(true);
    });
  });

  describe('dispose', () => {
    it('removes the panel, every listener, and every timer', () => {
      const onSend = vi.fn();
      const onOpenChange = vi.fn();
      const onTextEntryActiveChange = vi.fn();
      const { panel, host, input, history, control } = setup({
        open: false,
        onSend,
        onOpenChange,
        onTextEntryActiveChange,
      });
      const collapse = control('collapse');

      panel.appendSystemMessage('Entered Main Stage');
      input.focus();
      expect(onTextEntryActiveChange).toHaveBeenLastCalledWith(true);

      panel.dispose();

      expect(host.querySelector('[data-testid="chat-panel"]')).toBe(null);
      // The suppression hook is released so movement is never left disabled.
      expect(onTextEntryActiveChange).toHaveBeenLastCalledWith(false);
      expect(panel.isTextEntryActive()).toBe(false);

      // No pending timer can fire into a torn-down panel.
      vi.advanceTimersByTime(CHAT_AUTO_OPEN_MS * 3);

      // Detached controls and the global Enter shortcut are inert.
      collapse.click();
      history.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      history.dispatchEvent(new Event('scroll'));
      input.value = 'ghost';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

      expect(onSend).toHaveBeenCalledTimes(0);
      expect(onOpenChange).toHaveBeenCalledTimes(0);
      expect(document.activeElement === input).toBe(false);
    });
  });
});
