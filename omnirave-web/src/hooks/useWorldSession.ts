import { useEffect, useRef, useState } from 'react';
import {
  bootstrapSession,
  type RuntimeChatMessage,
  saveLoadout as persistLoadout,
  saveReturnPoint as persistReturnPoint,
  type RuntimeSession,
} from '../lib/session';
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
  const bootstrapPromiseRef = useRef<Promise<RuntimeSession> | null>(null);
  const worldSocketRef = useRef<ReturnType<typeof openWorldSocket> | null>(null);
  const lastSavedReturnPointRef = useRef('');

  useEffect(() => {
    let cancelled = false;

    if (!bootstrapPromiseRef.current) {
      bootstrapPromiseRef.current = bootstrapSession({ search: window.location.search });
    }

    void bootstrapPromiseRef.current
      .then((nextSession) => {
        if (!cancelled) {
          setSession(nextSession);
          setSettings(nextSession.settings);
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

  function setSettings(nextSettings: RuntimeSettings) {
    baseSetSettings(nextSettings);
    setSession((current) => (current ? { ...current, settings: nextSettings } : current));
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

  return {
    session,
    settings,
    setSettings,
    chatMessages,
    error,
    isLoading,
    hasJoinedWorld,
    isSavingLoadout,
    moveToZone,
    saveLoadout,
    sendChatMessage,
  };
}
