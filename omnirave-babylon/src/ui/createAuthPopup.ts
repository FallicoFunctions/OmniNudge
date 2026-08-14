// The venue auth window (design doc sec 11.1), shared by Log In and Sign Up.
//
// Sec 11.1 spells this window out, and it is deliberately NOT the generic
// top-left/top-right HUD popup shape the settings and avatar panels use:
//   - opens near bottom-CENTER, rising out of the emote HUD area
//   - one fixed size across every venue (never venue-sized, never fluid)
//   - landscape, not the tall stacked form the other popups are
//   - non-modal per sec 9.1: no backdrop dim, clicking outside does nothing
//   - NOT closable with Esc - the top-right Close button is the only way out,
//     which is why this module (unlike createSettingsPopup) binds no document
//     keydown listener at all
//   - username auto-focused on open, Enter submits
//   - switching login <-> signup keeps what the player already typed; CLOSING
//     is what discards it
//
// Sec 9.5 "venue-styled exceptions": this window and the welcome card it
// becomes are venue-FIXED. They consume the `--venue-*` tokens in styles.css
// rather than the `--hud-*` theme tokens, so the player's UI theme selector
// deliberately does not restyle them.
//
// Pure DOM: no Babylon imports, safe under jsdom. Holds no network logic -
// onSubmit is supplied by the caller (createRuntime), which is what actually
// calls runtimeAuth.ts and applies the upgraded session in place.

export type AuthMode = 'login' | 'signup';

export interface AuthSubmitFields {
  username: string;
  password: string;
  email: string;
  acceptTerms: boolean;
  acceptPrivacyPolicy: boolean;
}

export type AuthSubmitResult = { ok: true } | { ok: false; message: string };

export interface CreateAuthPopupOptions {
  onSubmit: (mode: AuthMode, fields: AuthSubmitFields) => Promise<AuthSubmitResult>;
  onRequestClose?: () => void;
  /**
   * Sec 11.1: "focused auth typing suppresses movement keys". Forwarded by the
   * runtime to InputMap.setTextEntryActive, exactly as the chat panel's own
   * option is. Right-click camera look is a pointer gesture and is untouched
   * by it - the spec calls that out, and nothing here binds pointer events.
   */
  onTextEntryActiveChange?: (active: boolean) => void;
}

export interface AuthPopup {
  element: HTMLElement;
  open: (mode: AuthMode) => void;
  close: () => void;
  isOpen: () => boolean;
  dispose: () => void;
}

export function createAuthPopup(options: CreateAuthPopupOptions): AuthPopup {
  const element = document.createElement('section');
  element.dataset.testid = 'auth-popup';
  element.className = 'venue-window venue-window--auth';
  element.setAttribute('aria-label', 'Account');
  element.hidden = true;

  const header = document.createElement('header');
  header.className = 'venue-window__header';
  const title = document.createElement('h2');
  title.className = 'venue-window__title';
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'venue-button venue-button--quiet';
  closeButton.dataset.authClose = 'true';
  closeButton.textContent = 'Close';
  header.append(title, closeButton);
  element.appendChild(header);

  const form = document.createElement('form');
  form.className = 'venue-auth-form';
  form.noValidate = true;

  // Landscape: credentials on the left, everything that varies by mode
  // (email + the two consent checkboxes) on the right, actions under both.
  // One row of the window rather than one column, per sec 11.1.
  const credentials = document.createElement('div');
  credentials.className = 'venue-auth-form__column';
  const secondary = document.createElement('div');
  secondary.className = 'venue-auth-form__column';

  const usernameInput = createField(credentials, 'text', 'username', 'Username');
  usernameInput.required = true;
  const passwordInput = createField(credentials, 'password', 'password', 'Password');
  passwordInput.required = true;

  const emailRow = createFieldRow('email', 'email', 'Email (optional)');
  const emailInput = emailRow.input as HTMLInputElement;
  emailInput.type = 'email';
  secondary.appendChild(emailRow.row);

  const termsRow = createCheckboxRow('accept-terms', 'I accept the Terms of Service');
  const privacyRow = createCheckboxRow('accept-privacy', 'I accept the Privacy Policy');
  secondary.append(termsRow.row, privacyRow.row);

  // Login mode has nothing to put in the second column, so it carries the
  // window's copy instead of leaving a hole in the landscape layout.
  const loginCopy = document.createElement('p');
  loginCopy.className = 'venue-window__copy';
  loginCopy.dataset.authCopy = 'true';
  secondary.appendChild(loginCopy);

  const columns = document.createElement('div');
  columns.className = 'venue-auth-form__columns';
  columns.append(credentials, secondary);
  form.appendChild(columns);

  const error = document.createElement('p');
  error.className = 'venue-auth-error';
  error.dataset.authError = 'true';
  error.hidden = true;
  form.appendChild(error);

  const actions = document.createElement('div');
  actions.className = 'venue-auth-form__actions';
  const submitButton = document.createElement('button');
  submitButton.type = 'submit';
  submitButton.className = 'venue-button venue-button--primary';
  submitButton.dataset.authSubmit = 'true';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'venue-button venue-button--quiet';
  toggle.dataset.authToggle = 'true';
  actions.append(submitButton, toggle);
  form.appendChild(actions);

  element.appendChild(form);

  let mode: AuthMode = 'login';
  let open = false;
  let submitting = false;
  let textEntryActive = false;

  const render = () => {
    const isLogin = mode === 'login';
    title.textContent = isLogin ? 'Log In' : 'Sign Up';
    emailRow.row.hidden = isLogin;
    termsRow.row.hidden = isLogin;
    privacyRow.row.hidden = isLogin;
    loginCopy.hidden = !isLogin;
    loginCopy.textContent = isLogin
      ? 'Log in to unlock VIP areas, avatar editing, and your saved look.'
      : '';
    submitButton.textContent = submitting ? 'Please wait...' : isLogin ? 'Log In' : 'Create Account';
    submitButton.disabled = submitting;
    toggle.textContent = isLogin ? 'Need an account? Sign Up' : 'Already have an account? Log In';
    toggle.disabled = submitting;
  };

  const clearError = () => {
    error.hidden = true;
    error.textContent = '';
  };

  const showError = (message: string) => {
    error.hidden = false;
    error.textContent = message;
  };

  const setTextEntryActive = (active: boolean) => {
    if (active === textEntryActive) {
      return;
    }
    textEntryActive = active;
    options.onTextEntryActiveChange?.(active);
  };

  const resetFields = () => {
    form.reset();
    clearError();
  };

  // Sec 11.1: "switching between login/signup preserves relevant typed fields
  // within the same open session". Only the error is stale after a mode
  // switch - what the player typed is not, and retyping a username because
  // they picked the wrong button first is exactly the friction this avoids.
  const handleToggle = () => {
    mode = mode === 'login' ? 'signup' : 'login';
    clearError();
    render();
  };
  toggle.addEventListener('click', handleToggle);

  const handleClose = () => {
    close();
    options.onRequestClose?.();
  };
  closeButton.addEventListener('click', handleClose);

  // Focus moving BETWEEN two fields inside this window fires focusout then
  // focusin, so the suppression is keyed on where focus landed rather than on
  // the bare events - otherwise a Tab between fields would flicker movement
  // back on for a frame.
  const handleFocusIn = () => setTextEntryActive(true);
  const handleFocusOut = (event: FocusEvent) => {
    const next = event.relatedTarget;
    if (next instanceof Node && element.contains(next)) {
      return;
    }
    setTextEntryActive(false);
  };
  element.addEventListener('focusin', handleFocusIn);
  element.addEventListener('focusout', handleFocusOut);

  const handleSubmit = async (event: SubmitEvent) => {
    event.preventDefault();
    if (submitting) {
      return;
    }
    clearError();

    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    if (!username || !password) {
      showError('Username and password are required.');
      return;
    }
    if (mode === 'signup' && (!termsRow.input.checked || !privacyRow.input.checked)) {
      showError('You must accept the Terms of Service and Privacy Policy.');
      return;
    }

    submitting = true;
    render();
    try {
      const result = await options.onSubmit(mode, {
        username,
        password,
        email: emailInput.value.trim(),
        acceptTerms: termsRow.input.checked,
        acceptPrivacyPolicy: privacyRow.input.checked,
      });
      if (!result.ok) {
        showError(result.message);
      }
      // On success the caller closes this window and raises the welcome card
      // (sec 11.2) - there is nothing further to render here.
    } finally {
      submitting = false;
      render();
    }
  };
  form.addEventListener('submit', handleSubmit);

  function close() {
    if (!open) {
      return;
    }
    open = false;
    element.hidden = true;
    // Sec 11.1: "closing the window discards typed fields".
    resetFields();
    setTextEntryActive(false);
  }

  render();

  return {
    element,
    open(nextMode) {
      mode = nextMode;
      open = true;
      element.hidden = false;
      clearError();
      render();
      usernameInput.focus();
    },
    close,
    isOpen: () => open,
    dispose() {
      toggle.removeEventListener('click', handleToggle);
      closeButton.removeEventListener('click', handleClose);
      form.removeEventListener('submit', handleSubmit);
      element.removeEventListener('focusin', handleFocusIn);
      element.removeEventListener('focusout', handleFocusOut);
      // Tearing the window down while a field held focus must not leave
      // movement suppressed forever.
      setTextEntryActive(false);
      element.remove();
    },
  };
}

function createFieldRow(control: string, autocomplete: string, label: string) {
  const row = document.createElement('div');
  row.className = 'venue-row';
  const rowLabel = document.createElement('label');
  rowLabel.className = 'venue-row__label';
  rowLabel.textContent = label;
  const input = document.createElement('input');
  input.className = 'venue-input';
  input.setAttribute('autocomplete', autocomplete);
  input.dataset.authField = control;
  const id = `omnirave-auth-${control}`;
  input.id = id;
  rowLabel.htmlFor = id;
  row.append(rowLabel, input);
  return { row, input };
}

function createField(column: HTMLElement, type: string, control: string, label: string): HTMLInputElement {
  const { row, input } = createFieldRow(control, control, label);
  input.type = type;
  column.appendChild(row);
  return input;
}

function createCheckboxRow(control: string, label: string) {
  const row = document.createElement('div');
  row.className = 'venue-row venue-row--inline';
  const rowLabel = document.createElement('label');
  rowLabel.className = 'venue-row__label';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.dataset.authField = control;
  rowLabel.append(input, document.createTextNode(` ${label}`));
  row.appendChild(rowLabel);
  return { row, input };
}
