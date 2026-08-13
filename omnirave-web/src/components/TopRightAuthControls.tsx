import { useEffect, useState } from 'react';
import type { RuntimeMode } from '../lib/session';

export function TopRightAuthControls(props: {
  mode: RuntimeMode;
  onOpenLogin: () => void;
  onOpenSignup: () => void;
  onLogout: () => void;
}) {
  const [confirmingLogout, setConfirmingLogout] = useState(false);

  useEffect(() => {
    if (!confirmingLogout) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setConfirmingLogout(false);
    }, 3000);

    return () => window.clearTimeout(timeoutId);
  }, [confirmingLogout]);

  useEffect(() => {
    if (props.mode !== 'account') {
      setConfirmingLogout(false);
    }
  }, [props.mode]);

  function handleLogoutClick() {
    if (!confirmingLogout) {
      setConfirmingLogout(true);
      return;
    }

    setConfirmingLogout(false);
    props.onLogout();
  }

  return (
    <div className="top-right-auth-controls">
      {props.mode === 'guest' ? (
        <>
          <button type="button" className="hud-button" onClick={props.onOpenLogin}>
            Log In
          </button>
          <button type="button" className="hud-button hud-button-accent" onClick={props.onOpenSignup}>
            Sign Up
          </button>
        </>
      ) : (
        <button type="button" className="hud-button" onClick={handleLogoutClick}>
          {confirmingLogout ? 'Confirm?' : 'Logout'}
        </button>
      )}
    </div>
  );
}
