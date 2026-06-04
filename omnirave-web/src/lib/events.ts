import type { RuntimeSession, RuntimeZoneEvent } from './session';
import { activeStageForZone, type ZoneID } from './zones';

export function activeZoneEvent(session: Pick<RuntimeSession, 'activeZone' | 'zoneEvents'>): RuntimeZoneEvent | undefined {
  const zone = activeStageForZone(session.activeZone as ZoneID);
  return session.zoneEvents?.find((event) => event.zoneId === zone && event.phase !== 'none');
}

export function formatZoneEventKicker(event: RuntimeZoneEvent | undefined): string {
  if (!event) {
    return 'Now at';
  }

  switch (event.phase) {
    case 'lead_in':
      return 'Lead-in';
    case 'active':
      return 'Live event';
    case 'recovery':
      return 'Recovery';
    default:
      return 'Now at';
  }
}

export function formatZoneEventHeadline(event: RuntimeZoneEvent | undefined): string {
  if (!event) {
    return '';
  }

  if (event.zoneId === 'main_stage') {
    switch (event.phase) {
      case 'lead_in':
        return 'Fireworks begin in';
      case 'active':
        return 'Main Stage fireworks live';
      case 'recovery':
        return 'Main Stage + OmniRave';
    }
  }

  if (event.zoneId === 'underground') {
    switch (event.phase) {
      case 'active':
        return 'Collapse in motion';
      case 'recovery':
        return 'The tunnel is settling';
      default:
        return 'Structural pressure rising';
    }
  }

  if (event.zoneId === 'plurr_partay') {
    switch (event.phase) {
      case 'lead_in':
        return 'PLURR rising';
      case 'active':
        return 'Unity peak in motion';
      case 'recovery':
        return 'PLURR / OMNIRAVE';
    }
  }

  return event.eventName;
}

export function formatZoneEventCopy(event: RuntimeZoneEvent | undefined): string {
  if (!event) {
    return '';
  }

  if (event.zoneId === 'main_stage') {
    switch (event.phase) {
      case 'lead_in':
        return 'The crowd is cresting. Stay ready for the hour mark.';
      case 'active':
        return `Luxury fireworks and stage pyro are synchronized across Main Stage. Minute ${event.activeMinute ?? 1} is live now.`;
      case 'recovery':
        return 'The finale has passed. The screen is settling back into the normal Main Stage visualizer.';
    }
  }

  if (event.zoneId === 'underground') {
    switch (event.phase) {
      case 'lead_in':
        return 'The tunnel pressure is building beneath the surface.';
      case 'active':
        return `The collapse sequence is underway. Minute ${event.activeMinute ?? 1} is hitting the room right now.`;
      case 'recovery':
        return 'The room is unnaturally healing itself. Debris and damage are phasing back out.';
    }
  }

  if (event.zoneId === 'plurr_partay') {
    switch (event.phase) {
      case 'lead_in':
        return 'The warehouse is swelling toward its unity peak. Lights, glow, and decor are starting to lift.';
      case 'active':
        return `The PLURR event is live. Minute ${event.activeMinute ?? 1} is unfolding through the room.`;
      case 'recovery':
        return 'The euphoric peak has ended. The warehouse is drifting back down over the recovery tail.';
    }
  }

  return '';
}

export function formatZoneEventBadge(event: RuntimeZoneEvent | undefined): string | null {
  if (!event) {
    return null;
  }

  if (event.phase === 'lead_in' && typeof event.countdownSeconds === 'number') {
    return String(event.countdownSeconds);
  }

  if (event.phase === 'active' && typeof event.activeMinute === 'number') {
    return `Minute ${event.activeMinute}`;
  }

  if (event.phase === 'recovery' && typeof event.recoverySeconds === 'number') {
    return `${event.recoverySeconds}s`;
  }

  return null;
}
