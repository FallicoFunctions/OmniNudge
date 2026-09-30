import { isShowState, type ShowState, type ShowCommand, type ShowResult } from '../showControl/showTypes';
import type { ServerClock } from './serverClock';
// World-socket client for the Go world server (gorilla/websocket at /ws?token=<jwt>).
//
// Framework-free: no Babylon imports here. The WebSocket itself is injected via
// `webSocketFactory` so this module is testable under Vitest with a hand-rolled
// fake socket instead of a real browser WebSocket / jsdom polyfill.
//
// Outbound and inbound JSON field names below are mirrored exactly from the Go
// structs in backend/internal/omniraveworld/world/protocol.go, player.go, and
// chat.go (event_schedule.go for ZoneEventState) — do not rename fields without
// re-checking those files.

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type SessionMode = 'account' | 'guest';

export interface WorldPlayer {
  id: string;
  playerName: string;
  mode: SessionMode;
  position: Vec3;
  /** Transient movement posture; absent on older servers means standing. */
  crouched?: boolean;
  showPanel?: string;
  showRevision?: number;
  zone: string;
  loadout: Record<string, string>;
}

export interface ZoneMediaState {
  zoneId: string;
  trackId: string;
  // Display metadata for the "Now Playing" HUD; empty when the zone is not on
  // a known playlist entry.
  artist: string;
  title: string;
  playlistIndex: number;
  playheadSeconds: number;
  // The server time (Unix ms) at which playheadSeconds was read.
  sampledAtMs?: number;
  // 0 when the server has no duration for the current entry.
  durationSeconds: number;
}

export interface ZoneEventState {
  zoneId: string;
  phase: string;
  eventName: string;
  countdownSeconds?: number;
  recoverySeconds?: number;
  activeMinute?: number;
}

export interface WorldSnapshot {
  showControl?: ShowState;
  players: WorldPlayer[];
  zoneMedia: ZoneMediaState[];
  zoneEvents: ZoneEventState[];
  currentPlayerId: string;
  activeZone: string;
}

export interface WorldChatMessage {
  playerId: string;
  playerName: string;
  body: string;
  createdAt: string;
}

export type WorldSocketStatus = 'connecting' | 'open' | 'closed' | 'error';

// The minimal surface of a browser WebSocket this module relies on, so tests
// can supply a fake without needing a real WebSocket implementation.
export interface WorldSocketLike {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: (() => void) | null;
  onclose: ((event: { code?: number; reason?: string }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
}

export interface WorldSocketClock {
  now(): number;
  setTimeout(callback: () => void, delayMs: number): number;
  clearTimeout(handle: number): void;
}

export interface WorldSocketOptions {
  url: string;
  token: string;
  webSocketFactory?: (url: string) => WorldSocketLike;
  clock?: WorldSocketClock;
  // Receives the replies to the socket's clock pings.
  serverClock?: ServerClock;
}

export interface WorldSocket {
  connect: () => void;
  // Swaps the connection to a new url/token (an in-place login/signup/logout
  // identity upgrade - see createRuntime.ts's navigateToSession callers)
  // WITHOUT tearing down this instance: every onSnapshot/onChat/onStatusChange
  // listener already registered stays registered, so callers never need to
  // re-wire chat/media/remote-player-rig plumbing just to change who the
  // local player is. dispose() is deliberately terminal (see its comment) and
  // cannot be reused for this - reconnect is the separate, non-terminal path.
  reconnect: (url: string, token: string) => void;
  // Hands the world a fresh token for this same player over the open socket,
  // moving the session's end to its expiry, and keeps it for any reconnect.
  renew: (token: string) => void;
  currentToken: () => string;
  status: () => WorldSocketStatus;
  dispose: () => void;
  sendMove: (position: Vec3, crouched?: boolean) => void;
  sendRespawn: () => void;
  sendChat: (body: string) => void;
  sendShowCommand: (command:ShowCommand) => void;
  onShowResult: (callback:(result:ShowResult)=>void) => ()=>void;
  sendLoadout: (loadout: Record<string, string>) => void;
  onSnapshot: (callback: (snapshot: WorldSnapshot) => void) => () => void;
  onChat: (callback: (message: WorldChatMessage) => void) => () => void;
  onStatusChange: (callback: (status: WorldSocketStatus) => void) => () => void;
}

const MOVE_THROTTLE_MS = 100;
// Clock pings: a few quick ones after the socket opens, so the stage music
// syncs soon, then a slow one to follow network changes.
const TIME_SYNC_QUICK_PINGS = 4;
const TIME_SYNC_QUICK_MS = 1000;
const TIME_SYNC_SLOW_MS = 15000;
const BACKOFF_SCHEDULE_MS = [1000, 2000, 4000, 8000];

const defaultClock: WorldSocketClock = {
  now: () => Date.now(),
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs) as unknown as number,
  clearTimeout: (handle) => clearTimeout(handle as unknown as ReturnType<typeof setTimeout>),
};

function defaultWebSocketFactory(url: string): WorldSocketLike {
  return new WebSocket(url) as unknown as WorldSocketLike;
}

function buildConnectUrl(url: string, token: string): string {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}token=${encodeURIComponent(token)}`;
}

export function createWorldSocket(options: WorldSocketOptions): WorldSocket {
  const clock = options.clock ?? defaultClock;
  const webSocketFactory = options.webSocketFactory ?? defaultWebSocketFactory;

  // Mutable so reconnect() can swap identity without recreating this closure
  // (and therefore without losing every listener already registered on it).
  let currentUrl = options.url;
  let currentToken = options.token;

  let socket: WorldSocketLike | null = null;
  let disposed = false;
  let status: WorldSocketStatus = 'closed';

  let reconnectAttempt = 0;
  let reconnectTimer: number | null = null;

  let lastMoveSentAt = Number.NEGATIVE_INFINITY;
  let lastMoveSent: Vec3 | null = null;
  let confirmedPosition: Vec3 | null = null;
  let pendingMove: Vec3 | null = null;
  let lastMoveCrouched = false;
  let confirmedCrouched = false;
  let pendingCrouched = false;
  let moveTrailingTimer: number | null = null;

  let warnedThisBurst = false;
  let timeSyncTimer: number | null = null;
  let timeSyncPings = 0;

  const showCallbacks = new Set<(result:ShowResult)=>void>();
  const snapshotCallbacks: Array<(snapshot: WorldSnapshot) => void> = [];
  const chatCallbacks: Array<(message: WorldChatMessage) => void> = [];
  const statusCallbacks: Array<(status: WorldSocketStatus) => void> = [];

  function setStatus(next: WorldSocketStatus): void {
    status = next;
    for (const callback of statusCallbacks) {
      callback(next);
    }
  }

  function send(payload: Record<string, unknown>): void {
    if (!socket || status !== 'open') {
      return;
    }
    socket.send(JSON.stringify(payload));
  }

  function clearPendingMove(): void {
    if (moveTrailingTimer !== null) {
      clock.clearTimeout(moveTrailingTimer);
      moveTrailingTimer = null;
    }
    pendingMove = null;
    pendingCrouched = false;
  }

  function resetMovement(): void {
    clearPendingMove();
    lastMoveSentAt = Number.NEGATIVE_INFINITY;
    lastMoveSent = null;
    confirmedPosition = null;
    lastMoveCrouched = confirmedCrouched = false;
  }

  function samePosition(a: Vec3 | null, b: Vec3): boolean {
    return a !== null && a.x === b.x && a.y === b.y && a.z === b.z;
  }

  function sendPosition(position: Vec3, crouched: boolean): void {
    if (disposed || !socket || status !== 'open') return;
    send({ type: 'move', moveTo: position, ...(crouched ? { crouched: true } : {}) });
    lastMoveSentAt = clock.now();
    lastMoveSent = { ...position };
    lastMoveCrouched = crouched;
  }

  function flushPendingMove(): void {
    moveTrailingTimer = null;
    if (!pendingMove) {
      return;
    }
    const position = pendingMove;
    const crouched = pendingCrouched;
    pendingMove = null;
    sendPosition(position, crouched);
  }

  function stopTimeSync(): void {
    if (timeSyncTimer !== null) {
      clock.clearTimeout(timeSyncTimer);
      timeSyncTimer = null;
    }
  }

  function pingServerClock(): void {
    timeSyncTimer = null;
    if (!options.serverClock || disposed || status !== 'open') return;
    send({ type: 'time_sync', clientTime: clock.now() });
    timeSyncPings += 1;
    timeSyncTimer = clock.setTimeout(
      pingServerClock,
      timeSyncPings < TIME_SYNC_QUICK_PINGS ? TIME_SYNC_QUICK_MS : TIME_SYNC_SLOW_MS,
    );
  }

  function handleMessage(raw: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      warnMalformedOnce(raw);
      return;
    }

    if (!parsed || typeof parsed !== 'object' || typeof (parsed as { type?: unknown }).type !== 'string') {
      warnMalformedOnce(raw);
      return;
    }

    warnedThisBurst = false;
    const message = parsed as Record<string, unknown>;

    switch (message.type) {
      case 'world_snapshot': {
        const snapshot = toWorldSnapshot(message);
        const localPlayer = snapshot.players.find(player => player.id === snapshot.currentPlayerId);
        confirmedPosition = localPlayer ? { ...localPlayer.position } : null;
        confirmedCrouched = localPlayer?.crouched === true;
        if (pendingMove && samePosition(confirmedPosition, pendingMove) && confirmedCrouched === pendingCrouched) clearPendingMove();
        for (const callback of snapshotCallbacks) {
          callback(snapshot);
        }
        break;
      }
      case 'show_result': {
        const result=message.result as ShowResult;
        if(result && typeof result.requestId==='string' && typeof result.ok==='boolean' && typeof result.message==='string') showCallbacks.forEach(cb=>cb(result));
        break;
      }
      case 'time_sync': {
        if (typeof message.clientTime === 'number' && typeof message.serverTime === 'number') {
          options.serverClock?.addSample(message.clientTime, message.serverTime, clock.now());
        }
        break;
      }
      case 'chat_message': {
        const chat = toChatMessage(message);
        for (const callback of chatCallbacks) {
          callback(chat);
        }
        break;
      }
      default:
        // Unknown but well-formed message type: ignore, nothing to warn about.
        break;
    }
  }

  function warnMalformedOnce(raw: string): void {
    if (warnedThisBurst) {
      return;
    }
    warnedThisBurst = true;
    console.warn('[worldSocket] ignoring malformed inbound message', raw);
  }

  function clearReconnectTimer(): void {
    if (reconnectTimer !== null) {
      clock.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function scheduleReconnect(): void {
    if (disposed || reconnectTimer !== null) {
      return;
    }
    const delay = BACKOFF_SCHEDULE_MS[Math.min(reconnectAttempt, BACKOFF_SCHEDULE_MS.length - 1)];
    reconnectAttempt += 1;
    reconnectTimer = clock.setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  }

  function connect(): void {
    if (disposed) {
      return;
    }

    resetMovement();
    setStatus('connecting');
    const connectUrl = buildConnectUrl(currentUrl, currentToken);
    const nextSocket = webSocketFactory(connectUrl);
    socket = nextSocket;

    nextSocket.onopen = () => {
      reconnectAttempt = 0;
      resetMovement();
      setStatus('open');
      stopTimeSync();
      timeSyncPings = 0;
      pingServerClock();
    };

    nextSocket.onerror = () => {
      resetMovement();
      setStatus('error');
    };

    nextSocket.onclose = () => {
      stopTimeSync();
      resetMovement();
      setStatus('closed');
      if (!disposed) {
        scheduleReconnect();
      }
    };

    nextSocket.onmessage = (event) => {
      handleMessage(event.data);
    };
  }

  function reconnect(url: string, token: string): void {
    if (disposed) {
      return;
    }
    currentUrl = url;
    currentToken = token;
    // A fresh identity swap is not a network drop: cancel any pending
    // drop-triggered auto-reconnect and reset its backoff, so this doesn't
    // race a scheduleReconnect() timer that would otherwise fire later and
    // re-open with whatever credentials happened to be current at that time.
    clearReconnectTimer();
    stopTimeSync();
    reconnectAttempt = 0;
    if (socket) {
      // Detach handlers before closing so the old socket's close event does
      // not itself run onclose's scheduleReconnect path with the socket we
      // are intentionally replacing right here.
      socket.onclose = null;
      socket.onerror = null;
      socket.onmessage = null;
      socket.onopen = null;
      socket.close();
      socket = null;
    }
    connect();
  }

  function dispose(): void {
    disposed = true;
    clearReconnectTimer();
    stopTimeSync();

    resetMovement();

    if (socket) {
      socket.onclose = null;
      socket.onerror = null;
      socket.onmessage = null;
      socket.onopen = null;
      socket.close();
      socket = null;
    }

    setStatus('closed');
  }

  function sendMove(position: Vec3, crouched = false): void {
    if (disposed || !socket || status !== 'open') return;
    // Presence and clocks use the server's scheduler. Stop duplicate sends
    // only once the server confirms the position: it may clamp a large step
    // or drop an event, in which case another throttled move must catch up.
    if (samePosition(lastMoveSent, position) && samePosition(confirmedPosition, position)
      && lastMoveCrouched === crouched && confirmedCrouched === crouched) {
      clearPendingMove();
      return;
    }
    const now = clock.now();
    const elapsed = now - lastMoveSentAt;

    if (elapsed >= MOVE_THROTTLE_MS) {
      // A delayed timer may still be queued after this throttle window.
      clearPendingMove();
      sendPosition(position, crouched);
      return;
    }

    pendingMove = { ...position };
    pendingCrouched = crouched;
    if (moveTrailingTimer === null) {
      moveTrailingTimer = clock.setTimeout(flushPendingMove, MOVE_THROTTLE_MS - elapsed);
    }
  }

  function sendRespawn(): void {
    resetMovement();
    send({ type: 'respawn' });
  }

  function sendChat(body: string): void {
    send({ type: 'chat', body });
  }

  function sendLoadout(loadout: Record<string, string>): void {
    send({ type: 'loadout', loadout });
  }

  function onSnapshot(callback: (snapshot: WorldSnapshot) => void): () => void {
    snapshotCallbacks.push(callback);
    return () => {
      const index = snapshotCallbacks.indexOf(callback);
      if (index !== -1) {
        snapshotCallbacks.splice(index, 1);
      }
    };
  }

  function onChat(callback: (message: WorldChatMessage) => void): () => void {
    chatCallbacks.push(callback);
    return () => {
      const index = chatCallbacks.indexOf(callback);
      if (index !== -1) {
        chatCallbacks.splice(index, 1);
      }
    };
  }

  function onStatusChange(callback: (status: WorldSocketStatus) => void): () => void {
    statusCallbacks.push(callback);
    return () => {
      const index = statusCallbacks.indexOf(callback);
      if (index !== -1) {
        statusCallbacks.splice(index, 1);
      }
    };
  }

  return {
    connect,
    reconnect,
    renew(token) {
      currentToken = token;
      send({ type: 'renew', token });
    },
    currentToken: () => currentToken,
    status: () => status,
    dispose,
    sendMove,
    sendRespawn,
    sendChat,
    sendLoadout,
    sendShowCommand(command){send({type:'show_control',show:command});},
    onShowResult(callback){showCallbacks.add(callback);return ()=>{showCallbacks.delete(callback);};},
    onSnapshot,
    onChat,
    onStatusChange,
  };
}

function toWorldSnapshot(message: Record<string, unknown>): WorldSnapshot {
  return {
    ...(isShowState(message.showControl)?{showControl:message.showControl}:{}),
    players: Array.isArray(message.players) ? (message.players as WorldPlayer[]) : [],
    zoneMedia: Array.isArray(message.zoneMedia) ? (message.zoneMedia as ZoneMediaState[]) : [],
    zoneEvents: Array.isArray(message.zoneEvents) ? (message.zoneEvents as ZoneEventState[]) : [],
    currentPlayerId: typeof message.currentPlayerId === 'string' ? message.currentPlayerId : '',
    activeZone: typeof message.activeZone === 'string' ? message.activeZone : '',
  };
}

function toChatMessage(message: Record<string, unknown>): WorldChatMessage {
  return {
    playerId: typeof message.playerId === 'string' ? message.playerId : '',
    playerName: typeof message.playerName === 'string' ? message.playerName : '',
    body: typeof message.body === 'string' ? message.body : '',
    createdAt: typeof message.createdAt === 'string' ? message.createdAt : '',
  };
}
