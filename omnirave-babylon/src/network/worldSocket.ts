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
  zone: string;
  loadout: Record<string, string>;
}

export interface ZoneMediaState {
  zoneId: string;
  trackId: string;
  playlistIndex: number;
  playheadSeconds: number;
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
}

export interface WorldSocket {
  connect: () => void;
  dispose: () => void;
  sendMove: (position: Vec3) => void;
  sendRespawn: () => void;
  sendChat: (body: string) => void;
  onSnapshot: (callback: (snapshot: WorldSnapshot) => void) => () => void;
  onChat: (callback: (message: WorldChatMessage) => void) => () => void;
  onStatusChange: (callback: (status: WorldSocketStatus) => void) => () => void;
}

const MOVE_THROTTLE_MS = 100;
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

  let socket: WorldSocketLike | null = null;
  let disposed = false;
  let status: WorldSocketStatus = 'closed';

  let reconnectAttempt = 0;
  let reconnectTimer: number | null = null;

  let lastMoveSentAt = Number.NEGATIVE_INFINITY;
  let pendingMove: Vec3 | null = null;
  let moveTrailingTimer: number | null = null;

  let warnedThisBurst = false;

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

  function flushPendingMove(): void {
    moveTrailingTimer = null;
    if (!pendingMove) {
      return;
    }
    const position = pendingMove;
    pendingMove = null;
    lastMoveSentAt = clock.now();
    send({ type: 'move', moveTo: position });
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
        for (const callback of snapshotCallbacks) {
          callback(snapshot);
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

    setStatus('connecting');
    const connectUrl = buildConnectUrl(options.url, options.token);
    const nextSocket = webSocketFactory(connectUrl);
    socket = nextSocket;

    nextSocket.onopen = () => {
      reconnectAttempt = 0;
      setStatus('open');
    };

    nextSocket.onerror = () => {
      setStatus('error');
    };

    nextSocket.onclose = () => {
      setStatus('closed');
      if (!disposed) {
        scheduleReconnect();
      }
    };

    nextSocket.onmessage = (event) => {
      handleMessage(event.data);
    };
  }

  function dispose(): void {
    disposed = true;
    clearReconnectTimer();

    if (moveTrailingTimer !== null) {
      clock.clearTimeout(moveTrailingTimer);
      moveTrailingTimer = null;
    }
    pendingMove = null;

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

  function sendMove(position: Vec3): void {
    const now = clock.now();
    const elapsed = now - lastMoveSentAt;

    if (elapsed >= MOVE_THROTTLE_MS) {
      lastMoveSentAt = now;
      send({ type: 'move', moveTo: position });
      return;
    }

    pendingMove = position;
    if (moveTrailingTimer === null) {
      moveTrailingTimer = clock.setTimeout(flushPendingMove, MOVE_THROTTLE_MS - elapsed);
    }
  }

  function sendRespawn(): void {
    send({ type: 'respawn' });
  }

  function sendChat(body: string): void {
    send({ type: 'chat', body });
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
    dispose,
    sendMove,
    sendRespawn,
    sendChat,
    onSnapshot,
    onChat,
    onStatusChange,
  };
}

function toWorldSnapshot(message: Record<string, unknown>): WorldSnapshot {
  return {
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
