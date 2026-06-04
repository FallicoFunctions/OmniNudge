import type { RuntimeSession } from '../lib/session';
import { zoneDisplayName } from '../lib/zones';

function venueAudienceLabel(zone: RuntimeSession['activeZone']) {
  switch (zone) {
    case 'underground':
      return 'Undergrounders';
    case 'plurr_partay':
      return 'P.L.U.R.R. Partiers';
    case 'main_stage':
    default:
      return 'Main Stagers';
  }
}

export function VenueStatusPanel({ session }: { session: RuntimeSession }) {
  const totalPlayers = session.players?.length ?? 0;
  const venuePlayers = session.players?.filter((player) => player.zone === session.activeZone).length ?? 0;

  return (
    <section className="venue-status-panel">
      <p className="venue-status-kicker">Current Venue</p>
      <h2>{zoneDisplayName(session.activeZone)}</h2>
      <p className="venue-status-track">Track metadata pending</p>
      <div className="venue-status-stats">
        <p>OmniRavers: {totalPlayers}</p>
        <p>
          {venueAudienceLabel(session.activeZone)}: {venuePlayers}
        </p>
      </div>
    </section>
  );
}
