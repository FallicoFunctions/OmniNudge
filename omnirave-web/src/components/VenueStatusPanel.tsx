import type { RuntimeSession, RuntimeZoneID } from '../lib/session';
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

function venuePlayersForZone(session: RuntimeSession, zone: RuntimeZoneID, pendingVenue?: RuntimeZoneID | null) {
  const players = session.players ?? [];
  const currentPlayer = players.find((player) => player.id === session.playerId);
  const currentVenueCount = players.filter((player) => player.zone === zone).length;

  if (!pendingVenue || pendingVenue === zone || currentPlayer?.zone !== pendingVenue) {
    return currentVenueCount;
  }

  return currentVenueCount + 1;
}

export function VenueStatusPanel(props: { session: RuntimeSession; pendingVenue?: RuntimeZoneID | null }) {
  const { session, pendingVenue = null } = props;
  const totalPlayers = session.venueStatus?.totalPlayers ?? session.players?.length ?? 0;
  const venuePlayers =
    pendingVenue === null
      ? session.venueStatus?.venuePlayers ?? venuePlayersForZone(session, session.activeZone, pendingVenue)
      : venuePlayersForZone(session, session.activeZone, pendingVenue);
  const audienceLabel = session.venueStatus?.audienceLabel ?? venueAudienceLabel(session.activeZone);
  const currentTrackLabel = session.venueStatus?.currentTrackLabel ?? 'Track metadata pending';

  return (
    <section className="venue-status-panel">
      <p className="venue-status-kicker">Current Venue</p>
      <h2>{zoneDisplayName(session.activeZone)}</h2>
      <p className="venue-status-track">{currentTrackLabel}</p>
      {pendingVenue ? <p className="venue-status-transition">Crossing into {zoneDisplayName(pendingVenue)}</p> : null}
      <div className="venue-status-stats">
        <p>OmniRavers: {totalPlayers}</p>
        <p>
          {audienceLabel}: {venuePlayers}
        </p>
      </div>
    </section>
  );
}
