import { useEffect, useMemo, useRef, useState } from 'react';
import {
  bootstrapSession,
  type RuntimeChatMessage,
  type RuntimeVenueStatus,
  saveLoadout as persistLoadout,
  saveRuntimeSettings as persistRuntimeSettings,
  saveReturnPoint as persistReturnPoint,
  type RuntimeSession,
} from '../lib/session';
import { useVenueTransition } from './useVenueTransition';
import { DEFAULT_RUNTIME_SETTINGS, type RuntimeSettings } from '../lib/settings';
import { applyWorldSnapshot, openWorldSocket } from '../lib/worldSocket';
import type { ZoneID } from '../lib/zones';

export function useWorldSession() {
  const [session, setSession] = useState<RuntimeSession | null>(null);
  const [settings, baseSetSettings] = useState<RuntimeSettings>(DEFAULT_RUNTIME_SETTINGS);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [hasJoinedWorld, setHasJoinedWorld] = useState(false);
  const [isSavingLoadout, setIsSavingLoadout] = useState(false);
  const [chatMessages, setChatMessages] = useState<RuntimeChatMessage[]>([]);
  const [chatComposerResetSignal, setChatComposerResetSignal] = useState(0);
  const [displayedVenueStatus, setDisplayedVenueStatus] = useState<RuntimeVenueStatus | undefined>(undefined);
  const bootstrapPromiseRef = useRef<Promise<RuntimeSession> | null>(null);
  const worldSocketRef = useRef<ReturnType<typeof openWorldSocket> | null>(null);
  const lastSavedReturnPointRef = useRef('');
  const sessionRef = useRef<RuntimeSession | null>(null);
  const lastPersistedSettingsRef = useRef<RuntimeSettings>(DEFAULT_RUNTIME_SETTINGS);
  const settingsSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const latestSettingsVersionRef = useRef(0);
  const venueTransition = useVenueTransition('main_stage');

  function applySettingsLocally(nextSettings: RuntimeSettings) {
    baseSetSettings(nextSettings);
    setSession((current) => {
      if (!current) {
        return current;
      }

      const nextSession = { ...current, settings: nextSettings };
      sessionRef.current = nextSession;
      return nextSession;
    });
  }

  useEffect(() => {
    let cancelled = false;

    if (!bootstrapPromiseRef.current) {
      bootstrapPromiseRef.current = bootstrapSession({ search: window.location.search });
    }

    void bootstrapPromiseRef.current
      .then((nextSession) => {
        if (!cancelled) {
          sessionRef.current = nextSession;
          lastPersistedSettingsRef.current = nextSession.settings;
          venueTransition.syncAuthoritativeVenue(nextSession.activeZone, { immediate: true });
          setDisplayedVenueStatus(nextSession.venueStatus);
          setSession(nextSession);
          baseSetSettings(nextSession.settings);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unable to start OmniRave session');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    if (!session) {
      return;
    }

    venueTransition.syncAuthoritativeVenue(session.activeZone, { immediate: !hasJoinedWorld });
  }, [hasJoinedWorld, session?.activeZone, session?.playerId]);

  useEffect(() => {
    if (!session) {
      return;
    }

    if (session.activeZone === venueTransition.committedVenue) {
      setDisplayedVenueStatus(session.venueStatus);
    }
  }, [session, venueTransition.committedVenue]);

  useEffect(() => {
    if (!session) {
      return undefined;
    }

    setHasJoinedWorld(false);

    const worldSocket = openWorldSocket({
      session,
      onSnapshot: (message) => {
        setHasJoinedWorld(true);
        setSession((current) => (current ? applyWorldSnapshot(current, message) : current));
      },
      onChat: (message) => {
        setChatMessages((current) => [...current.slice(-49), message]);
      },
      onError: (message) => {
        setError(message);
      },
    });
    worldSocketRef.current = worldSocket;

    return () => {
      worldSocket.close();
      if (worldSocketRef.current === worldSocket) {
        worldSocketRef.current = null;
      }
    };
  }, [session?.playerId, session?.worldSocketUrl]);

  function moveToZone(zone: ZoneID) {
    worldSocketRef.current?.moveToZone(zone);
  }

  function updateSettings(nextSettings: RuntimeSettings) {
    applySettingsLocally(nextSettings);

    const currentSession = sessionRef.current;
    if (!currentSession || currentSession.mode !== 'account') {
      return;
    }

    const nextVersion = latestSettingsVersionRef.current + 1;
    latestSettingsVersionRef.current = nextVersion;

    settingsSaveQueueRef.current = settingsSaveQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        try {
          await persistRuntimeSettings({
            session: currentSession,
            settings: nextSettings,
          });
          lastPersistedSettingsRef.current = nextSettings;
        } catch (err) {
          if (latestSettingsVersionRef.current !== nextVersion) {
            return;
          }

          const rollbackSettings = lastPersistedSettingsRef.current;
          applySettingsLocally(rollbackSettings);
          setError(err instanceof Error ? err.message : 'Unable to save runtime settings');
        }
      });
  }

  useEffect(() => {
    if (!session || session.mode !== 'account' || !session.players?.length) {
      return;
    }

    const player = session.players.find((entry) => entry.id === session.playerId);
    if (!player) {
      return;
    }

    const nextKey = JSON.stringify(player.position);
    if (nextKey === lastSavedReturnPointRef.current) {
      return;
    }
    lastSavedReturnPointRef.current = nextKey;

    void persistReturnPoint({ session, point: player.position }).catch((err) => {
      setError(err instanceof Error ? err.message : 'Unable to save return point');
    });
  }, [session]);

  async function saveLoadout(loadout: Record<string, string>) {
    if (!session) {
      return;
    }

    setSession((current) => (current ? { ...current, loadout } : current));

    if (session.mode !== 'account') {
      return;
    }

    setIsSavingLoadout(true);
    try {
      await persistLoadout({ session, loadout });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save loadout');
      throw err;
    } finally {
      setIsSavingLoadout(false);
    }
  }

  function sendChatMessage(body: string) {
    worldSocketRef.current?.sendChat(body);
  }

  function respawn() {
    worldSocketRef.current?.respawn();
    setChatMessages([]);
    setChatComposerResetSignal((current) => current + 1);
  }

  const displayedSession = useMemo(() => {
    if (!session) {
      return null;
    }

    return {
      ...session,
      activeZone: venueTransition.committedVenue,
      venueStatus: displayedVenueStatus ?? session.venueStatus,
    };
  }, [displayedVenueStatus, session, venueTransition.committedVenue]);

  return {
    session: displayedSession,
    settings,
    updateSettings,
    chatMessages,
    error,
    isLoading,
    hasJoinedWorld,
    isSavingLoadout,
    chatComposerResetSignal,
    pendingVenue: venueTransition.pendingVenue,
    isVenueTransitioning: venueTransition.isTransitioning,
    moveToZone,
    respawn,
    saveLoadout,
    sendChatMessage,
  };
}
