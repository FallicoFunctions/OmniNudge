import { zoneDisplayName, ZONE_ORDER, type ZoneID } from '../lib/zones';

export function TouchControls(props: {
  unlocked: boolean;
  onUnlock: () => void;
  onMoveToZone: (zone: ZoneID) => void;
}) {
  if (!props.unlocked) {
    return (
      <button type="button" className="unlock-button" onClick={props.onUnlock}>
        Enter OmniRave
      </button>
    );
  }

  return (
      <div className="touch-controls" data-testid="touch-controls">
        {ZONE_ORDER.map((zone) => (
          <button key={zone} type="button" onClick={() => props.onMoveToZone(zone)}>
            Touch Jump to {zoneDisplayName(zone)}
          </button>
        ))}
        <button type="button">Touch Dance</button>
        <button type="button">Touch Chat</button>
      </div>
    );
  }
