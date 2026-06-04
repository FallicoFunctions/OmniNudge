import type { RuntimeSession } from '../lib/session';

export function TopRightAuthControls({ session }: { session: RuntimeSession }) {
  return (
    <div className="top-right-auth-controls">
      {session.mode === 'guest' ? (
        <>
          <button type="button" className="hud-button" disabled>
            Log In
          </button>
          <button type="button" className="hud-button hud-button-accent" disabled>
            Sign Up
          </button>
        </>
      ) : (
        <button type="button" className="hud-button" disabled>
          Logout
        </button>
      )}
    </div>
  );
}
