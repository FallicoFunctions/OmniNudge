// Post-auth welcome card (design doc sec 11.2).
//
// Sec 11.2: on a successful login or signup "the auth window transforms
// directly into the venue-styled welcome card" - so this is the SAME size,
// the SAME bottom-center position and the same venue-fixed styling as
// createAuthPopup's window (both are `.venue-window`; sec 9.5 keeps the pair
// out of the core UI theme selector). The runtime closes the auth window and
// shows this in its place.
//
// Landscape, non-modal, with EQUAL focus on its two items: `Edit Avatar` is
// clickable, `Enter VIP` is informational only - the spec is explicit that
// the second one is a statement of what the player just unlocked, not a
// button. It is rendered as text rather than a disabled button so nobody
// tries to click it.
//
// Auto-dismisses after a few seconds with a fade. The fade is driven by a
// class plus a timer rather than a `transitionend` listener so the lifecycle
// is deterministic under jsdom (and cannot hang if the transition never
// fires, e.g. prefers-reduced-motion).
//
// Pure DOM: no Babylon imports, safe under jsdom.

/** Sec 11.2 "auto-dismisses after a few seconds". */
export const WELCOME_CARD_VISIBLE_MS = 6000;
/** Matches the `.venue-window--fading` transition in styles.css. */
export const WELCOME_CARD_FADE_MS = 450;

export interface CreateWelcomeCardOptions {
  /** Sec 11.2: the card's one clickable action. */
  onEditAvatar?: () => void;
  visibleMs?: number;
  fadeMs?: number;
}

export interface WelcomeCard {
  element: HTMLElement;
  /** Replaces the auth window with the card for `playerName`. */
  show: (playerName: string) => void;
  /**
   * Sec 11.2: "if user clicks `Avatar` or similar direct top-level UI action
   * while the welcome card is open: welcome card closes, requested action
   * proceeds". Callers invoke this from those actions; it never blocks or
   * defers whatever the player asked for.
   */
  dismiss: () => void;
  isOpen: () => boolean;
  dispose: () => void;
}

export function createWelcomeCard(options: CreateWelcomeCardOptions = {}): WelcomeCard {
  const visibleMs = options.visibleMs ?? WELCOME_CARD_VISIBLE_MS;
  const fadeMs = options.fadeMs ?? WELCOME_CARD_FADE_MS;

  const element = document.createElement('section');
  element.dataset.testid = 'welcome-card';
  element.className = 'venue-window venue-window--welcome';
  element.setAttribute('aria-label', 'Welcome');
  element.hidden = true;

  const header = document.createElement('header');
  header.className = 'venue-window__header';
  const title = document.createElement('h2');
  title.className = 'venue-window__title';
  title.textContent = 'Welcome';
  header.appendChild(title);
  element.appendChild(header);

  const greeting = document.createElement('p');
  greeting.className = 'venue-window__copy';
  greeting.dataset.welcomeGreeting = 'true';
  element.appendChild(greeting);

  // The two items sit in one landscape row with equal weight - neither is
  // the "primary" of a primary/secondary pair.
  const items = document.createElement('div');
  items.className = 'venue-welcome__items';

  const editAvatar = document.createElement('button');
  editAvatar.type = 'button';
  editAvatar.className = 'venue-button venue-welcome__item';
  editAvatar.dataset.welcomeAction = 'edit-avatar';
  editAvatar.textContent = 'Edit Avatar';

  const enterVip = document.createElement('p');
  enterVip.className = 'venue-welcome__item venue-welcome__item--informational';
  enterVip.dataset.welcomeInfo = 'enter-vip';
  enterVip.textContent = 'Enter VIP';

  items.append(editAvatar, enterVip);
  element.appendChild(items);

  let open = false;
  let visibleTimer: number | undefined;
  let fadeTimer: number | undefined;

  const clearTimers = () => {
    if (visibleTimer !== undefined) {
      window.clearTimeout(visibleTimer);
      visibleTimer = undefined;
    }
    if (fadeTimer !== undefined) {
      window.clearTimeout(fadeTimer);
      fadeTimer = undefined;
    }
  };

  const hide = () => {
    clearTimers();
    open = false;
    element.hidden = true;
    element.classList.remove('venue-window--fading');
  };

  const beginFade = () => {
    element.classList.add('venue-window--fading');
    fadeTimer = window.setTimeout(hide, fadeMs);
  };

  const handleEditAvatar = () => {
    // Dismissed FIRST so the action it hands off to (opening the avatar
    // panel) is never racing this card's own fade timers.
    hide();
    options.onEditAvatar?.();
  };
  editAvatar.addEventListener('click', handleEditAvatar);

  return {
    element,
    show(playerName: string) {
      clearTimers();
      greeting.textContent = playerName
        ? `You're in, ${playerName}.`
        : "You're in.";
      open = true;
      element.hidden = false;
      element.classList.remove('venue-window--fading');
      visibleTimer = window.setTimeout(beginFade, visibleMs);
    },
    dismiss() {
      if (!open) {
        return;
      }
      hide();
    },
    isOpen: () => open,
    dispose() {
      clearTimers();
      editAvatar.removeEventListener('click', handleEditAvatar);
      element.remove();
    },
  };
}
