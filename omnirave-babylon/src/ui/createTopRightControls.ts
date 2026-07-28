// Top-right session controls (design doc sec 9.3).
//
// Guest: `Log In` + `Sign Up`. Authenticated: `Logout`.
//
// Logout confirm, exactly as spec'd:
//   first click  -> label becomes `Confirm?`
//   second click within 3 seconds -> logs out
//   otherwise it reverts automatically
//   the timer is the ONLY reset condition
// That last line is why this module deliberately installs NO document-level
// click/blur listener: an unrelated click anywhere else must leave the armed
// confirm alone.
//
// AUTH IS A LATER BLOCK. This component is purely presentational - it never
// calls an auth endpoint and holds no session state; it renders the mode it is
// handed and reports clicks. The runtime currently passes mode 'guest' and
// callbacks that surface a "later update" notice (see createRuntime), so the
// buttons still do something honest rather than being dead controls.
//
// Pure DOM: no Babylon imports, safe under jsdom.

export type SessionMode = 'guest' | 'account';

export const LOGOUT_CONFIRM_WINDOW_MS = 3000;

export interface CreateTopRightControlsOptions {
  mode?: SessionMode;
  onLogIn?: () => void;
  onSignUp?: () => void;
  onLogout?: () => void;
  confirmWindowMs?: number;
  /** Offsets the block clear of the dev debug panel under ?debug=1. */
  debugChromePresent?: boolean;
}

export interface TopRightControls {
  element: HTMLElement;
  mode: () => SessionMode;
  setMode: (mode: SessionMode) => void;
  isConfirmingLogout: () => boolean;
  dispose: () => void;
}

export function createTopRightControls(
  host: HTMLElement,
  options: CreateTopRightControlsOptions = {},
): TopRightControls {
  const confirmWindowMs = options.confirmWindowMs ?? LOGOUT_CONFIRM_WINDOW_MS;
  const element = document.createElement('div');
  element.dataset.testid = 'top-right-controls';
  element.className = options.debugChromePresent
    ? 'hud-controls hud-controls--top-right hud-controls--debug-offset'
    : 'hud-controls hud-controls--top-right';

  const row = document.createElement('div');
  row.className = 'hud-controls__row';

  const logInButton = createButton('Log In', 'log-in');
  const signUpButton = createButton('Sign Up', 'sign-up');
  const logoutButton = createButton('Logout', 'logout');
  row.append(logInButton, signUpButton, logoutButton);
  element.appendChild(row);
  host.appendChild(element);

  let mode: SessionMode = options.mode ?? 'guest';
  let confirmTimer: number | undefined;
  let confirming = false;

  const clearConfirmTimer = () => {
    if (confirmTimer !== undefined) {
      window.clearTimeout(confirmTimer);
      confirmTimer = undefined;
    }
  };

  const resetConfirm = () => {
    clearConfirmTimer();
    confirming = false;
    logoutButton.textContent = 'Logout';
    delete logoutButton.dataset.confirming;
  };

  const render = () => {
    const guest = mode === 'guest';
    logInButton.hidden = !guest;
    signUpButton.hidden = !guest;
    logoutButton.hidden = guest;
  };

  const handleLogIn = () => options.onLogIn?.();
  const handleSignUp = () => options.onSignUp?.();
  const handleLogout = () => {
    if (confirming) {
      resetConfirm();
      options.onLogout?.();
      return;
    }
    confirming = true;
    logoutButton.textContent = 'Confirm?';
    logoutButton.dataset.confirming = 'true';
    confirmTimer = window.setTimeout(resetConfirm, confirmWindowMs);
  };

  logInButton.addEventListener('click', handleLogIn);
  signUpButton.addEventListener('click', handleSignUp);
  logoutButton.addEventListener('click', handleLogout);

  render();

  return {
    element,
    mode: () => mode,
    setMode(next) {
      if (next === mode) {
        return;
      }
      mode = next;
      resetConfirm();
      render();
    },
    isConfirmingLogout: () => confirming,
    dispose() {
      clearConfirmTimer();
      logInButton.removeEventListener('click', handleLogIn);
      signUpButton.removeEventListener('click', handleSignUp);
      logoutButton.removeEventListener('click', handleLogout);
      element.remove();
    },
  };
}

function createButton(label: string, control: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'hud-button';
  button.dataset.hudControl = control;
  button.textContent = label;
  return button;
}
