import type { RuntimeSession } from '../lib/session';
import { zoneDisplayName } from '../lib/zones';

export function Hud({ session }: { session: RuntimeSession }) {
  return (
    <section className="hud-panel identity-panel">
      <p className="hud-kicker">{session.mode === 'guest' ? 'Guest pass' : 'OmniNudge account'}</p>
      <h1>{session.playerName}</h1>
      <p>Live in {zoneDisplayName(session.activeZone)}</p>
      <p>{session.mode === 'guest' ? 'Log in to save your look and unlock account perks.' : 'Signed in. Runtime changes persist to your profile.'}</p>
    </section>
  );
}
