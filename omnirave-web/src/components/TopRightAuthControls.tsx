import type { RuntimeSession } from '../lib/session';

export function TopRightAuthControls({ session }: { session: RuntimeSession }) {
  return (
    <div className="top-right-auth-controls">
      {session.mode === 'guest' ? (
        <>
          <button type="button" className="hud-button">
            Log In
          </button>
          <button type="button" className="hud-button hud-button-accent">
            Sign Up
          </button>
        </>
      ) : (
        <button type="button" className="hud-button">
          Logout
        </button>
      )}
    </div>
  );
}
