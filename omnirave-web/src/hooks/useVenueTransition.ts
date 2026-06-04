import { useEffect, useRef, useState } from 'react';
import type { RuntimeZoneID } from '../lib/session';
import { VENUE_TRANSITION_MS } from '../lib/traversal';

type SyncOptions = {
  immediate?: boolean;
};

export function useVenueTransition(initialVenue: RuntimeZoneID) {
  const [committedVenue, setCommittedVenue] = useState<RuntimeZoneID>(initialVenue);
  const [pendingVenue, setPendingVenue] = useState<RuntimeZoneID | null>(null);
  const timerRef = useRef<number | null>(null);

  function clearTimer() {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function cancelTransition() {
    clearTimer();
    setPendingVenue(null);
  }

  function syncAuthoritativeVenue(nextVenue: RuntimeZoneID, options?: SyncOptions) {
    if (options?.immediate) {
      clearTimer();
      setPendingVenue(null);
      setCommittedVenue(nextVenue);
      return;
    }

    if (nextVenue === committedVenue) {
      cancelTransition();
      return;
    }

    if (pendingVenue === nextVenue) {
      return;
    }

    setPendingVenue(nextVenue);
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      setCommittedVenue(nextVenue);
      setPendingVenue(null);
      timerRef.current = null;
    }, VENUE_TRANSITION_MS);
  }

  useEffect(() => () => clearTimer(), []);

  return {
    committedVenue,
    pendingVenue,
    beginTransition: (nextVenue: RuntimeZoneID) => syncAuthoritativeVenue(nextVenue),
    cancelTransition,
    isTransitioning: pendingVenue !== null,
    syncAuthoritativeVenue,
  };
}
