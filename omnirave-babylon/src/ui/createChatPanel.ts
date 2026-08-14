// Player-facing chat panel (design doc sec 9.8 layout/collapse, sec 10.2 scope
// + mute, sec 10.3 input, sec 10.4 display).
//
// Minimal bottom-left rectangle: a header row (collapse + chat-settings), a
// collapsible body (history OR the `Muted Users` view), a rate-limit hint, and
// an input line that NEVER disappears.
//
// COLLAPSED BEHAVIOUR (sec 9.8) is a three-way visibility decision, not a
// single boolean:
//   openPreference   - persisted (playerSettings.chatOpen, guest-scoped
//                      sessionStorage). Default true, so a session with no
//                      saved preference starts open.
//   autoOpen         - a 10s window opened by a SYSTEM announcement or by the
//                      local player sending/echoing a message. Another
//                      relevant message restarts the window. Other players'
//                      normal messages never open it.
//   mutedViewOpen    - the `Muted Users` view is showing; the body has to be
//                      visible for it to be usable.
// Body visible = openPreference || autoOpen || mutedViewOpen.
//
// Clicking inside the history (or scrolling it) promotes the panel to
// PERMANENTLY open - that writes the persisted preference, which is what
// "remains permanently open" means once the 10s window would have lapsed.
// Focusing the input alone deliberately does not.
//
// MUTE SEQUENCING (sec 10.2): guests cannot mute others, and every player is a
// guest until the auth block lands, so the runtime passes `canMute: false`
// today and the hover affordance is not rendered. The mechanism itself is
// complete - filtering, the `Muted Users` view, unmute rows, the empty state -
// and flipping `canMute` (or calling setCanMute(true)) from the auth block is
// the whole change. Guest mutes are session-only: nothing here is persisted.
//
// Pure DOM: no Babylon imports, safe under jsdom. Nothing here runs on the
// render loop, so there is no per-frame allocation to worry about.

import type { WorldChatMessage } from '../network/worldSocket';

/** Sec 10.3: hard input cap. */
export const MAX_CHAT_MESSAGE_LENGTH = 200;
/** Sec 10.3: 1 message per second. */
export const CHAT_SEND_INTERVAL_MS = 1000;
/** Sec 9.8: auto-open window while collapsed. */
export const CHAT_AUTO_OPEN_MS = 10_000;
/** How long the in-panel rate-limit hint stays up. */
export const CHAT_HINT_DURATION_MS = 2500;
export const CHAT_RATE_LIMIT_HINT = 'Slow down - one message per second.';
export const NO_MUTED_USERS_TEXT = 'No muted users';
export const SYSTEM_CHAT_NAME = 'System';
/**
 * Upper bound on retained lines for one venue session. The log is already
 * cleared on every venue transition (sec 10.4); this only stops a marathon
 * session in a single venue from growing the DOM without limit.
 */
export const MAX_CHAT_HISTORY_LINES = 200;

export interface MutedChatUser {
  playerId: string;
  playerName: string;
}

export interface CreateChatPanelOptions {
  /** Local player id, used to tell own messages from other players'. */
  currentPlayerId?: string;
  /**
   * Sec 10.2: guests cannot mute others. False until the auth block lands, and
   * while false the hover mute action is not rendered at all.
   */
  canMute?: boolean;
  /** Persisted open/collapsed preference (playerSettings.chatOpen). */
  open?: boolean;
  /** Called whenever the preference changes, so the caller can persist it. */
  onOpenChange?: (open: boolean) => void;
  /** Sends a message body upstream (worldSocket.sendChat). */
  onSend?: (body: string) => void;
  /**
   * Sec 10.3: typing focus suppresses movement keys. The runtime forwards this
   * to InputMap.setTextEntryActive.
   */
  onTextEntryActiveChange?: (active: boolean) => void;
  /** True when the ?debug=1 dev chrome occupies the bottom-left corner. */
  debugChromePresent?: boolean;
  /** Injected for tests; defaults to Date.now. */
  now?: () => number;
  /** Where the global `Enter` focus shortcut is bound. Defaults to window. */
  keyboardTarget?: Window;
}

export interface ChatPanel {
  element: HTMLElement;
  /** Appends a player message. Returns false when the sender is muted. */
  appendMessage: (message: WorldChatMessage) => boolean;
  appendSystemMessage: (text: string) => void;
  clearHistory: () => void;
  isOpen: () => boolean;
  setOpen: (open: boolean) => void;
  /** True while the body (history or muted view) is on screen. */
  isBodyVisible: () => boolean;
  isHistoryVisible: () => boolean;
  isMutedViewOpen: () => boolean;
  setCurrentPlayerId: (playerId: string) => void;
  setCanMute: (canMute: boolean) => void;
  setMutedUsers: (users: readonly MutedChatUser[]) => void;
  mutedUsers: () => readonly MutedChatUser[];
  isTextEntryActive: () => boolean;
  focusInput: () => void;
  clearDraft: () => void;
  dispose: () => void;
}

/**
 * Sec 10.4 timestamp: 12-hour local time, zero-padded, no space before the
 * meridiem - `05:34:32PM`. Midnight is `12:00:00AM`, noon `12:00:00PM`.
 */
export function formatChatTimestamp(date: Date): string {
  const source = Number.isNaN(date.getTime()) ? new Date() : date;
  const rawHours = source.getHours();
  const meridiem = rawHours >= 12 ? 'PM' : 'AM';
  const hours = rawHours % 12 === 0 ? 12 : rawHours % 12;
  const pad = (value: number) => value.toString().padStart(2, '0');
  return `${pad(hours)}:${pad(source.getMinutes())}:${pad(source.getSeconds())}${meridiem}`;
}

/** Sec 10.3: hard 200-character cap, applied to typing AND paste alike. */
export function clampChatInput(value: string): string {
  return value.length > MAX_CHAT_MESSAGE_LENGTH ? value.slice(0, MAX_CHAT_MESSAGE_LENGTH) : value;
}

function parseChatDate(createdAt: string | undefined, fallbackMs: number): Date {
  if (createdAt) {
    const parsed = new Date(createdAt);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return new Date(fallbackMs);
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    tag === 'BUTTON' ||
    target.isContentEditable
  );
}

interface RenderedLine {
  playerId: string;
  element: HTMLElement;
  muteButton: HTMLButtonElement | null;
}

export function createChatPanel(
  host: HTMLElement,
  options: CreateChatPanelOptions = {},
): ChatPanel {
  const now = options.now ?? (() => Date.now());
  const keyboardTarget = options.keyboardTarget ?? window;

  let currentPlayerId = options.currentPlayerId ?? '';
  let canMute = options.canMute === true;
  let openPreference = options.open !== false;
  let autoOpenActive = false;
  let mutedViewOpen = false;
  let textEntryActive = false;
  let lastSentAt = Number.NEGATIVE_INFINITY;
  let autoOpenTimer: number | undefined;
  let hintTimer: number | undefined;
  let pasteTimer: number | undefined;
  let ignoreNextScroll = false;

  const muted = new Map<string, string>();
  const lines: RenderedLine[] = [];

  // ---- DOM ------------------------------------------------------------
  const element = document.createElement('section');
  element.dataset.testid = 'chat-panel';
  element.className = options.debugChromePresent
    ? 'chat-panel chat-panel--debug-offset'
    : 'chat-panel';
  element.setAttribute('aria-label', 'Chat');

  const header = document.createElement('div');
  header.className = 'chat-panel__header';

  const collapseButton = document.createElement('button');
  collapseButton.type = 'button';
  collapseButton.className = 'chat-panel__icon-button';
  collapseButton.dataset.chatControl = 'collapse';
  collapseButton.setAttribute('aria-expanded', 'true');

  const settingsButton = document.createElement('button');
  settingsButton.type = 'button';
  settingsButton.className = 'chat-panel__icon-button';
  settingsButton.dataset.chatControl = 'chat-settings';
  settingsButton.textContent = 'Muted';
  settingsButton.title = 'Muted Users';
  settingsButton.setAttribute('aria-label', 'Muted Users');

  header.append(collapseButton, settingsButton);

  const body = document.createElement('div');
  body.className = 'chat-panel__body';
  body.dataset.testid = 'chat-panel-body';

  const history = document.createElement('div');
  history.className = 'chat-panel__history';
  history.dataset.testid = 'chat-history';
  history.setAttribute('role', 'log');
  history.tabIndex = 0;

  const mutedView = document.createElement('div');
  mutedView.className = 'chat-panel__muted';
  mutedView.dataset.testid = 'chat-muted-view';
  mutedView.hidden = true;

  const mutedHeader = document.createElement('div');
  mutedHeader.className = 'chat-panel__muted-header';
  const backButton = document.createElement('button');
  backButton.type = 'button';
  backButton.className = 'chat-panel__text-button';
  backButton.dataset.chatControl = 'muted-back';
  backButton.textContent = 'Back';
  const mutedTitle = document.createElement('h3');
  mutedTitle.className = 'chat-panel__muted-title';
  mutedTitle.textContent = 'Muted Users';
  mutedHeader.append(backButton, mutedTitle);

  const mutedList = document.createElement('div');
  mutedList.className = 'chat-panel__muted-list';
  mutedList.dataset.testid = 'chat-muted-list';
  mutedView.append(mutedHeader, mutedList);

  body.append(history, mutedView);

  const hint = document.createElement('p');
  hint.className = 'chat-panel__hint';
  hint.dataset.testid = 'chat-hint';
  hint.setAttribute('role', 'status');
  hint.hidden = true;

  const inputRow = document.createElement('div');
  inputRow.className = 'chat-panel__input-row';
  const input = document.createElement('textarea');
  input.className = 'chat-panel__input';
  input.dataset.testid = 'chat-input';
  input.rows = 1;
  input.maxLength = MAX_CHAT_MESSAGE_LENGTH;
  input.placeholder = 'Press Enter to chat';
  input.setAttribute('aria-label', 'Chat message');
  inputRow.appendChild(input);

  element.append(header, body, hint, inputRow);
  host.appendChild(element);

  // ---- visibility -----------------------------------------------------
  const bodyVisible = () => openPreference || autoOpenActive || mutedViewOpen;

  const render = () => {
    const visible = bodyVisible();
    // Collapsing takes the history away IMMEDIATELY (sec 9.8) - the CSS
    // transition only softens the way it comes back.
    body.hidden = !visible;
    history.hidden = mutedViewOpen;
    mutedView.hidden = !mutedViewOpen;
    collapseButton.textContent = openPreference ? 'Hide' : 'Show';
    collapseButton.title = openPreference ? 'Collapse chat' : 'Open chat';
    collapseButton.setAttribute('aria-label', openPreference ? 'Collapse chat' : 'Open chat');
    collapseButton.setAttribute('aria-expanded', String(visible));
    settingsButton.setAttribute('aria-pressed', String(mutedViewOpen));
    element.dataset.chatOpen = String(visible);
  };

  const clearAutoOpenTimer = () => {
    if (autoOpenTimer !== undefined) {
      window.clearTimeout(autoOpenTimer);
      autoOpenTimer = undefined;
    }
  };

  // Sec 9.8: system announcements and the player's own messages auto-open the
  // window for 10s; each further relevant message RESETS that timer.
  const startAutoOpen = () => {
    if (openPreference) {
      return;
    }
    autoOpenActive = true;
    clearAutoOpenTimer();
    autoOpenTimer = window.setTimeout(() => {
      autoOpenTimer = undefined;
      autoOpenActive = false;
      render();
    }, CHAT_AUTO_OPEN_MS);
    render();
  };

  const setOpen = (open: boolean) => {
    if (openPreference === open) {
      return;
    }
    openPreference = open;
    if (open) {
      // A real open supersedes any auto-open window.
      clearAutoOpenTimer();
      autoOpenActive = false;
    }
    render();
    options.onOpenChange?.(open);
  };

  // Sec 9.8: engaging with the history (click or scroll) makes it stay open
  // permanently, which is exactly the persisted preference.
  const markPermanentlyOpen = () => {
    if (openPreference) {
      return;
    }
    setOpen(true);
  };

  const scrollHistoryToBottom = () => {
    const target = history.scrollHeight - history.clientHeight;
    if (target > 0 && history.scrollTop !== target) {
      // Our own scroll must not be mistaken for the player scrolling.
      ignoreNextScroll = true;
      history.scrollTop = target;
    }
  };

  // ---- hint -----------------------------------------------------------
  const clearHintTimer = () => {
    if (hintTimer !== undefined) {
      window.clearTimeout(hintTimer);
      hintTimer = undefined;
    }
  };

  const showHint = (text: string) => {
    clearHintTimer();
    hint.textContent = text;
    hint.hidden = false;
    hintTimer = window.setTimeout(() => {
      hintTimer = undefined;
      hint.hidden = true;
      hint.textContent = '';
    }, CHAT_HINT_DURATION_MS);
  };

  // ---- muted users ----------------------------------------------------
  const renderMutedList = () => {
    mutedList.textContent = '';
    if (muted.size === 0) {
      const empty = document.createElement('p');
      empty.className = 'chat-panel__muted-empty';
      empty.dataset.testid = 'chat-muted-empty';
      empty.textContent = NO_MUTED_USERS_TEXT;
      mutedList.appendChild(empty);
      return;
    }
    for (const [playerId, playerName] of muted) {
      const row = document.createElement('div');
      row.className = 'chat-panel__muted-row';
      const name = document.createElement('span');
      name.className = 'chat-panel__muted-name';
      // textContent only: player names are player-controlled.
      name.textContent = playerName;
      const unmute = document.createElement('button');
      unmute.type = 'button';
      unmute.className = 'chat-panel__text-button';
      unmute.dataset.chatUnmute = playerId;
      unmute.textContent = 'Unmute';
      row.append(name, unmute);
      mutedList.appendChild(row);
    }
  };

  // Existing lines from a newly muted player keep their place in the log (the
  // spec hides their messages "going forward"), so their hover action has to
  // flip to `Unmute`.
  const refreshMuteButtons = () => {
    for (const line of lines) {
      if (!line.muteButton) {
        continue;
      }
      const isMuted = muted.has(line.playerId);
      line.muteButton.textContent = isMuted ? 'Unmute' : 'Mute';
      line.muteButton.dataset.chatMuteState = isMuted ? 'muted' : 'unmuted';
    }
  };

  const setMutedUsers = (users: readonly MutedChatUser[]) => {
    muted.clear();
    for (const user of users) {
      if (user.playerId) {
        muted.set(user.playerId, user.playerName);
      }
    }
    renderMutedList();
    refreshMuteButtons();
  };

  const toggleMute = (playerId: string, playerName: string) => {
    if (muted.has(playerId)) {
      muted.delete(playerId);
    } else {
      muted.set(playerId, playerName);
    }
    renderMutedList();
    refreshMuteButtons();
  };

  // ---- lines ----------------------------------------------------------
  const trimHistory = () => {
    while (lines.length > MAX_CHAT_HISTORY_LINES) {
      const oldest = lines.shift();
      oldest?.element.remove();
    }
  };

  // Builds `Name HH:MM:SSPM: body` out of separate spans so names/timestamps
  // can be styled apart from the body (sec 10.4) while the line's textContent
  // still reads exactly as the spec formats it.
  const appendLine = (
    playerId: string,
    playerName: string,
    bodyText: string,
    timestamp: Date,
    system: boolean,
  ) => {
    const line = document.createElement('p');
    line.className = system ? 'chat-panel__line chat-panel__line--system' : 'chat-panel__line';
    line.dataset.chatLine = system ? 'system' : 'player';

    const nameEl = document.createElement('span');
    nameEl.className = 'chat-panel__name';
    nameEl.dataset.chatName = playerId;
    nameEl.textContent = playerName;

    const timeEl = document.createElement('span');
    timeEl.className = 'chat-panel__time';
    timeEl.dataset.chatTime = '';
    timeEl.textContent = formatChatTimestamp(timestamp);

    const bodyEl = document.createElement('span');
    bodyEl.className = 'chat-panel__message';
    bodyEl.dataset.chatBody = '';
    bodyEl.textContent = bodyText;

    line.append(nameEl, document.createTextNode(' '), timeEl, document.createTextNode(': '), bodyEl);

    // Sec 10.2: the hover mute action only exists for guests-with-permission,
    // never for system lines or the player's own messages.
    let muteButton: HTMLButtonElement | null = null;
    if (canMute && !system && playerId && playerId !== currentPlayerId) {
      muteButton = document.createElement('button');
      muteButton.type = 'button';
      muteButton.className = 'chat-panel__mute';
      muteButton.dataset.chatMute = playerId;
      muteButton.dataset.chatMuteName = playerName;
      muteButton.textContent = muted.has(playerId) ? 'Unmute' : 'Mute';
      muteButton.dataset.chatMuteState = muted.has(playerId) ? 'muted' : 'unmuted';
      line.appendChild(muteButton);
    }

    history.appendChild(line);
    lines.push({ playerId, element: line, muteButton });
    trimHistory();
    scrollHistoryToBottom();
  };

  const appendMessage = (message: WorldChatMessage): boolean => {
    if (message.playerId && muted.has(message.playerId)) {
      return false;
    }
    appendLine(
      message.playerId,
      message.playerName,
      message.body,
      parseChatDate(message.createdAt, now()),
      false,
    );
    // Other players' normal messages must NOT auto-open the window; the local
    // player's own (echoed) message must.
    if (message.playerId && message.playerId === currentPlayerId) {
      startAutoOpen();
    }
    return true;
  };

  const appendSystemMessage = (text: string) => {
    appendLine('', SYSTEM_CHAT_NAME, text, new Date(now()), true);
    startAutoOpen();
  };

  const clearHistory = () => {
    for (const line of lines) {
      line.element.remove();
    }
    lines.length = 0;
    history.textContent = '';
  };

  // ---- sending --------------------------------------------------------
  const sendCurrentInput = () => {
    const draft = input.value.trim();
    if (!draft) {
      return;
    }
    const timestamp = now();
    if (timestamp - lastSentAt < CHAT_SEND_INTERVAL_MS) {
      // Sec 10.3: the hint lives INSIDE the panel; the draft is kept so the
      // player only has to press Enter again.
      showHint(CHAT_RATE_LIMIT_HINT);
      return;
    }
    lastSentAt = timestamp;
    input.value = '';
    // Sec 9.8: the player sending a message auto-opens the window, without
    // waiting for the server echo.
    startAutoOpen();
    options.onSend?.(clampChatInput(draft));
  };

  // ---- handlers -------------------------------------------------------
  const setTextEntryActive = (active: boolean) => {
    if (textEntryActive === active) {
      return;
    }
    textEntryActive = active;
    options.onTextEntryActiveChange?.(active);
  };

  const handleInput = () => {
    // Covers typing AND paste: a paste fires `input` with the merged value.
    const clamped = clampChatInput(input.value);
    if (clamped !== input.value) {
      input.value = clamped;
    }
  };

  const handlePaste = () => {
    // maxLength already stops oversized pastes in the browser; this re-clamps
    // after the paste has been applied for engines/tests that do not.
    if (pasteTimer !== undefined) {
      window.clearTimeout(pasteTimer);
    }
    pasteTimer = window.setTimeout(() => {
      pasteTimer = undefined;
      handleInput();
    }, 0);
  };

  const handleInputKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter') {
      if (event.shiftKey) {
        // Sec 10.3: Shift+Enter is a newline - let the textarea do it.
        return;
      }
      event.preventDefault();
      sendCurrentInput();
      return;
    }
    if (event.key === 'Escape') {
      // Sec 10.3: exits chat WITHOUT sending. The draft survives; only focus
      // is released, which restores movement.
      event.preventDefault();
      // Scoped: the settings popup also closes on a document-level Esc.
      event.stopPropagation();
      input.blur();
    }
  };

  const handleFocus = () => {
    // Focusing the input alone does NOT open the window (sec 9.8).
    setTextEntryActive(true);
  };

  const handleBlur = () => {
    setTextEntryActive(false);
  };

  const handleGlobalKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Enter' || event.ctrlKey || event.metaKey || event.altKey || event.repeat) {
      return;
    }
    if (event.target === input || isEditableTarget(event.target)) {
      return;
    }
    event.preventDefault();
    input.focus();
  };

  const handleCollapseClick = () => {
    setOpen(!openPreference);
    if (!openPreference) {
      // Collapsing also drops out of the muted view; the input line stays.
      mutedViewOpen = false;
      clearAutoOpenTimer();
      autoOpenActive = false;
      render();
    }
  };

  const handleSettingsClick = () => {
    mutedViewOpen = !mutedViewOpen;
    if (mutedViewOpen) {
      renderMutedList();
    }
    render();
  };

  const handleHistoryClick = (event: MouseEvent) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    const muteTrigger = target?.closest<HTMLButtonElement>('[data-chat-mute]');
    if (muteTrigger) {
      const playerId = muteTrigger.dataset.chatMute ?? '';
      if (playerId) {
        toggleMute(playerId, muteTrigger.dataset.chatMuteName ?? playerId);
      }
    }
    markPermanentlyOpen();
  };

  const handleHistoryScrollGesture = () => {
    markPermanentlyOpen();
  };

  const handleHistoryScroll = () => {
    if (ignoreNextScroll) {
      ignoreNextScroll = false;
      return;
    }
    markPermanentlyOpen();
  };

  const handleMutedViewClick = (event: MouseEvent) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (target?.closest('[data-chat-control="muted-back"]')) {
      mutedViewOpen = false;
      render();
      return;
    }
    const unmute = target?.closest<HTMLButtonElement>('[data-chat-unmute]');
    if (unmute) {
      const playerId = unmute.dataset.chatUnmute ?? '';
      if (playerId) {
        muted.delete(playerId);
        renderMutedList();
        refreshMuteButtons();
      }
    }
  };

  collapseButton.addEventListener('click', handleCollapseClick);
  settingsButton.addEventListener('click', handleSettingsClick);
  history.addEventListener('click', handleHistoryClick);
  history.addEventListener('wheel', handleHistoryScrollGesture);
  history.addEventListener('touchmove', handleHistoryScrollGesture);
  history.addEventListener('scroll', handleHistoryScroll);
  mutedView.addEventListener('click', handleMutedViewClick);
  input.addEventListener('keydown', handleInputKeyDown);
  input.addEventListener('input', handleInput);
  input.addEventListener('paste', handlePaste);
  input.addEventListener('focus', handleFocus);
  input.addEventListener('blur', handleBlur);
  keyboardTarget.addEventListener('keydown', handleGlobalKeyDown);

  renderMutedList();
  render();

  return {
    element,
    appendMessage,
    appendSystemMessage,
    clearHistory,
    isOpen: () => openPreference,
    setOpen,
    isBodyVisible: () => bodyVisible(),
    isHistoryVisible: () => bodyVisible() && !mutedViewOpen,
    isMutedViewOpen: () => mutedViewOpen,
    setCurrentPlayerId(playerId) {
      currentPlayerId = playerId;
    },
    setCanMute(next) {
      canMute = next;
    },
    setMutedUsers,
    mutedUsers: () =>
      Array.from(muted, ([playerId, playerName]) => ({ playerId, playerName })),
    isTextEntryActive: () => textEntryActive,
    focusInput: () => input.focus(),
    // Sec 8.3: manual respawn "clears typed chat input text" - a draft the
    // player never sent should not survive a respawn.
    clearDraft: () => {
      input.value = '';
    },
    dispose() {
      clearAutoOpenTimer();
      clearHintTimer();
      if (pasteTimer !== undefined) {
        window.clearTimeout(pasteTimer);
        pasteTimer = undefined;
      }
      collapseButton.removeEventListener('click', handleCollapseClick);
      settingsButton.removeEventListener('click', handleSettingsClick);
      history.removeEventListener('click', handleHistoryClick);
      history.removeEventListener('wheel', handleHistoryScrollGesture);
      history.removeEventListener('touchmove', handleHistoryScrollGesture);
      history.removeEventListener('scroll', handleHistoryScroll);
      mutedView.removeEventListener('click', handleMutedViewClick);
      input.removeEventListener('keydown', handleInputKeyDown);
      input.removeEventListener('input', handleInput);
      input.removeEventListener('paste', handlePaste);
      input.removeEventListener('focus', handleFocus);
      input.removeEventListener('blur', handleBlur);
      keyboardTarget.removeEventListener('keydown', handleGlobalKeyDown);
      // Releasing focus on teardown must not leave movement suppressed.
      setTextEntryActive(false);
      lines.length = 0;
      muted.clear();
      element.remove();
    },
  };
}
