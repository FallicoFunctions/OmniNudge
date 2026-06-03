import type { RuntimeSession } from '../lib/session';
import { zoneDisplayName } from '../lib/zones';

export function Hud({ session }: { session: RuntimeSession }) {
  return (
    <section className="hud-panel">
      <p className="hud-kicker">In the crowd</p>
      <h1>{session.playerName}</h1>
      <p>Current stage: {zoneDisplayName(session.activeZone)}</p>
    </section>
  );
}
