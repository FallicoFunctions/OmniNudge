import { useEffect, useRef, useState } from 'react';
import type { RuntimeLoginRequest, RuntimeSignupRequest } from '../lib/session';

export function AuthPopup(props: {
  mode: 'login' | 'signup';
  isOpen: boolean;
  error: string;
  isSubmitting: boolean;
  onClose: () => void;
  onSwitchMode: (mode: 'login' | 'signup') => void;
  onLogin: (credentials: RuntimeLoginRequest) => Promise<void>;
  onSignup: (signup: RuntimeSignupRequest) => Promise<void>;
}) {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [acceptPrivacyPolicy, setAcceptPrivacyPolicy] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const usernameInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!props.isOpen) {
      setUsername('');
      setEmail('');
      setPassword('');
      setTurnstileToken('');
      setAcceptPrivacyPolicy(false);
      setAcceptTerms(false);
      return;
    }

    usernameInputRef.current?.focus();
  }, [props.isOpen]);

  if (!props.isOpen) {
    return null;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (props.mode === 'login') {
      await props.onLogin({ username, password });
      return;
    }

    await props.onSignup({
      username,
      email,
      password,
      turnstileToken,
      acceptPrivacyPolicy,
      acceptTerms,
    });
  }

  return (
    <section className="settings-panel auth-popup-shell" aria-label="Runtime authentication">
      <div className="settings-panel-header">
        <div>
          <p className="settings-panel-kicker">OmniRave access</p>
          <h2>{props.mode === 'login' ? 'Log in in place' : 'Create your account in place'}</h2>
        </div>
        <button type="button" className="hud-button" onClick={props.onClose}>
          Close
        </button>
      </div>

      <form className="settings-panel-grid" onSubmit={handleSubmit}>
        <div>
          <dt>
            <label htmlFor="runtime-auth-username">Username</label>
          </dt>
          <dd>
            <input
              id="runtime-auth-username"
              type="text"
              ref={usernameInputRef}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </dd>
        </div>

        {props.mode === 'signup' ? (
          <div>
            <dt>
              <label htmlFor="runtime-auth-email">Email</label>
            </dt>
            <dd>
              <input
                id="runtime-auth-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </dd>
          </div>
        ) : null}

        <div>
          <dt>
            <label htmlFor="runtime-auth-password">Password</label>
          </dt>
          <dd>
            <input
              id="runtime-auth-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </dd>
        </div>

        {props.mode === 'signup' ? (
          <>
            <div>
              <dt>
                <label htmlFor="runtime-auth-turnstile">Turnstile token</label>
              </dt>
              <dd>
                <input
                  id="runtime-auth-turnstile"
                  type="text"
                  value={turnstileToken}
                  onChange={(event) => setTurnstileToken(event.target.value)}
                />
              </dd>
            </div>
            <div>
              <dt>
                <label htmlFor="runtime-auth-privacy">
                  <input
                    id="runtime-auth-privacy"
                    type="checkbox"
                    checked={acceptPrivacyPolicy}
                    onChange={(event) => setAcceptPrivacyPolicy(event.target.checked)}
                  />{' '}
                  Accept Privacy Policy
                </label>
              </dt>
            </div>
            <div>
              <dt>
                <label htmlFor="runtime-auth-terms">
                  <input
                    id="runtime-auth-terms"
                    type="checkbox"
                    checked={acceptTerms}
                    onChange={(event) => setAcceptTerms(event.target.checked)}
                  />{' '}
                  Accept Terms of Service
                </label>
              </dt>
            </div>
          </>
        ) : null}

        {props.error ? <p className="settings-panel-note">{props.error}</p> : null}

        <div className="settings-panel-actions">
          <button type="submit" className="hud-button hud-button-accent" disabled={props.isSubmitting}>
            {props.mode === 'login'
              ? props.isSubmitting
                ? 'Logging in...'
                : 'Log In'
              : props.isSubmitting
                ? 'Creating account...'
                : 'Create account'}
          </button>
          <button
            type="button"
            className="hud-button"
            onClick={() => props.onSwitchMode(props.mode === 'login' ? 'signup' : 'login')}
          >
            {props.mode === 'login' ? 'Need an account?' : 'Already have an account?'}
          </button>
        </div>
      </form>
    </section>
  );
}
