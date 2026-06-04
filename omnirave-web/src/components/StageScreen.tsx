import type { RuntimeSession } from '../lib/session';
import { activeZoneEvent, formatZoneEventBadge, formatZoneEventCopy, formatZoneEventHeadline, formatZoneEventKicker } from '../lib/events';
import { activeStageForZone, zoneDisplayName, zoneTagline, ZONE_ORDER, type ZoneID } from '../lib/zones';

export function StageScreen(props: {
  session: RuntimeSession;
  unlocked: boolean;
  onMoveToZone: (zone: ZoneID) => void;
}) {
  const { session, unlocked, onMoveToZone } = props;
  const zone = activeStageForZone(session.activeZone as ZoneID);
  const zoneEvent = activeZoneEvent(session);
  const eventBadge = formatZoneEventBadge(zoneEvent);
  const eventScreenClassName = zoneEvent
    ? `stage-screen stage-screen-event stage-screen-${zoneEvent.zoneId}`
    : 'stage-screen';

  return (
    <section className={eventScreenClassName} aria-live="polite">
      <div className="stage-card">
        <p className="stage-kicker">{zoneEvent ? formatZoneEventKicker(zoneEvent) : 'Now at'}</p>
        <h2 className="stage-title">{zoneEvent ? formatZoneEventHeadline(zoneEvent) : zoneDisplayName(zone)}</h2>
        {eventBadge ? (
          <p className="stage-copy">
            <strong>{eventBadge}</strong>
          </p>
        ) : null}
        <p className="stage-copy">{zoneEvent ? formatZoneEventCopy(zoneEvent) : zoneTagline(zone)}</p>
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
