// Log In / Sign Up popup (extends design doc sec 9.3's top-right session
// controls). Mounted into createTopRightControls' slot exactly the way
// createSettingsPopup is mounted into createTopLeftControls' slot - a
// caller-owned panel, non-modal per sec 9.1 (no backdrop, no world pause).
//
// Pure DOM: no Babylon imports, safe under jsdom. Holds no network logic -
// onSubmit is supplied by the caller (createRuntime), which is what actually
// calls runtimeAuth.ts and reloads into the upgraded session on success.

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
  element.className = 'hud-popup';
  element.setAttribute('aria-label', 'Account');
  element.hidden = true;

  const header = document.createElement('header');
  header.className = 'hud-popup__header';
  const title = document.createElement('h2');
  title.className = 'hud-popup__title';
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'hud-button hud-button--quiet';
  closeButton.dataset.authClose = 'true';
  closeButton.textContent = 'Close';
  header.append(title, closeButton);
  element.appendChild(header);

  const form = document.createElement('form');
  form.className = 'hud-auth-form';
  form.noValidate = true;

  const usernameInput = createField(form, 'text', 'username', 'Username');
  const passwordInput = createField(form, 'password', 'password', 'Password');
  const emailRow = createFieldRow('email', 'email', 'Email (optional)');
  const emailInput = emailRow.input as HTMLInputElement;
  emailInput.type = 'email';
  form.appendChild(emailRow.row);

  const termsRow = createCheckboxRow('accept-terms', 'I accept the Terms of Service');
  const privacyRow = createCheckboxRow('accept-privacy', 'I accept the Privacy Policy');
  form.append(termsRow.row, privacyRow.row);

  const error = document.createElement('p');
  error.className = 'hud-auth-error';
  error.dataset.authError = 'true';
  error.hidden = true;
  form.appendChild(error);

  const submitButton = document.createElement('button');
  submitButton.type = 'submit';
  submitButton.className = 'hud-button hud-button--wide';
  submitButton.dataset.authSubmit = 'true';
  form.appendChild(submitButton);

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'hud-button hud-button--quiet hud-button--wide';
  toggle.dataset.authToggle = 'true';
  form.appendChild(toggle);

  element.appendChild(form);

  let mode: AuthMode = 'login';
  let open = false;
  let submitting = false;

  const render = () => {
    const isLogin = mode === 'login';
    title.textContent = isLogin ? 'Log In' : 'Sign Up';
    emailRow.row.hidden = isLogin;
    termsRow.row.hidden = isLogin;
    privacyRow.row.hidden = isLogin;
    submitButton.textContent = submitting ? 'Please wait...' : isLogin ? 'Log In' : 'Create Account';
    submitButton.disabled = submitting;
    toggle.textContent = isLogin ? "Need an account? Sign Up" : 'Already have an account? Log In';
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

  const resetFields = () => {
    form.reset();
    clearError();
  };

  const handleToggle = () => {
    mode = mode === 'login' ? 'signup' : 'login';
    resetFields();
    render();
  };
  toggle.addEventListener('click', handleToggle);

  const handleClose = () => {
    close();
    options.onRequestClose?.();
  };
  closeButton.addEventListener('click', handleClose);

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
      // On success the caller navigates away to the upgraded session - there
      // is nothing further to render here.
    } finally {
      submitting = false;
      render();
    }
  };
  form.addEventListener('submit', handleSubmit);

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !open) {
      return;
    }
    handleClose();
  };
  document.addEventListener('keydown', handleKeyDown);

  function close() {
    if (!open) {
      return;
    }
    open = false;
    element.hidden = true;
    resetFields();
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
      document.removeEventListener('keydown', handleKeyDown);
      toggle.removeEventListener('click', handleToggle);
      closeButton.removeEventListener('click', handleClose);
      form.removeEventListener('submit', handleSubmit);
      element.remove();
    },
  };
}

function createFieldRow(control: string, autocomplete: string, label: string) {
  const row = document.createElement('div');
  row.className = 'hud-row hud-row--stacked';
  const rowLabel = document.createElement('label');
  rowLabel.className = 'hud-row__label';
  rowLabel.textContent = label;
  const input = document.createElement('input');
  input.className = 'hud-select hud-auth-input';
  input.setAttribute('autocomplete', autocomplete);
  input.dataset.authField = control;
  const id = `omnirave-auth-${control}`;
  input.id = id;
  rowLabel.htmlFor = id;
  row.append(rowLabel, input);
  return { row, input };
}

function createField(form: HTMLFormElement, type: string, control: string, label: string): HTMLInputElement {
  const { row, input } = createFieldRow(control, control, label);
  input.type = type;
  input.required = true;
  form.appendChild(row);
  return input;
}

function createCheckboxRow(control: string, label: string) {
  const row = document.createElement('div');
  row.className = 'hud-row';
  const rowLabel = document.createElement('label');
  rowLabel.className = 'hud-row__label';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.dataset.authField = control;
  rowLabel.append(input, document.createTextNode(` ${label}`));
  row.appendChild(rowLabel);
  return { row, input };
}
