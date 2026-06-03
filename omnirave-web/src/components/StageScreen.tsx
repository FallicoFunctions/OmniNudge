import type { RuntimeSession } from '../lib/session';
import { activeStageForZone, zoneDisplayName, zoneTagline, ZONE_ORDER, type ZoneID } from '../lib/zones';

export function StageScreen(props: {
  session: RuntimeSession;
  unlocked: boolean;
  onMoveToZone: (zone: ZoneID) => void;
}) {
  const { session, unlocked, onMoveToZone } = props;
  const zone = activeStageForZone(session.activeZone as ZoneID);

  return (
    <section className="stage-screen">
      <div className="stage-card">
        <p className="stage-kicker">Now at</p>
        <h2 className="stage-title">{zoneDisplayName(zone)}</h2>
        <p className="stage-copy">{zoneTagline(zone)}</p>
        {!unlocked ? <p className="stage-lock-hint">Tap Enter OmniRave to bring the room to life.</p> : null}
      </div>
      <div className="zone-jump-grid">
        {ZONE_ORDER.map((targetZone) => (
          <button
            key={targetZone}
            type="button"
            className="zone-jump-button"
            onClick={() => onMoveToZone(targetZone)}
          >
            Travel to {zoneDisplayName(targetZone)}
          </button>
        ))}
      </div>
    </section>
  );
}
