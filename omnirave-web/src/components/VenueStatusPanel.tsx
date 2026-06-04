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
  const totalPlayers = session.venueStatus?.totalPlayers ?? session.players?.length ?? 0;
  const venuePlayers =
    session.venueStatus?.venuePlayers ?? session.players?.filter((player) => player.zone === session.activeZone).length ?? 0;
  const audienceLabel = session.venueStatus?.audienceLabel ?? venueAudienceLabel(session.activeZone);
  const currentTrackLabel = session.venueStatus?.currentTrackLabel ?? 'Track metadata pending';

  return (
    <section className="venue-status-panel">
      <p className="venue-status-kicker">Current Venue</p>
      <h2>{zoneDisplayName(session.activeZone)}</h2>
      <p className="venue-status-track">{currentTrackLabel}</p>
      <div className="venue-status-stats">
        <p>OmniRavers: {totalPlayers}</p>
        <p>
          {audienceLabel}: {venuePlayers}
        </p>
      </div>
    </section>
  );
}
