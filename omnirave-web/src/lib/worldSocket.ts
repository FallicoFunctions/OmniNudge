import type { RuntimePoint, RuntimeSession, RuntimeZoneID } from './session';
import type { WorldChatMessage, WorldSnapshotMessage } from './protocol';
import { zoneMoveTarget } from './zones';

type SocketFactory = (url: string) => WebSocket;

export function applyWorldSnapshot(
  session: RuntimeSession,
  message: WorldSnapshotMessage,
): RuntimeSession {
  return {
    ...session,
    playerId: message.currentPlayerId || session.playerId,
    activeZone: message.activeZone,
    players: message.players,
    zoneMedia: message.zoneMedia,
  };
}

export function buildWorldSocketUrl(session: RuntimeSession): string {
  const url = new URL(session.worldSocketUrl);
  if (session.worldSessionToken) {
    url.searchParams.set('token', session.worldSessionToken);
  }

  return url.toString();
}

export function openWorldSocket(args: {
  session: RuntimeSession;
  onSnapshot: (message: WorldSnapshotMessage) => void;
  onChat: (message: WorldChatMessage) => void;
  onError: (message: string) => void;
  socketFactory?: SocketFactory;
}) {
  const socket = (args.socketFactory ?? ((url) => new WebSocket(url)))(buildWorldSocketUrl(args.session));
  const moveTo = (position: RuntimePoint) => {
    if (socket.readyState !== WebSocket.OPEN) {
      return;
    }

    socket.send(
      JSON.stringify({
        type: 'move',
        moveTo: position,
      }),
    );
  };

  const sendChat = (body: string) => {
    const nextBody = body.trim();
    if (!nextBody || socket.readyState !== WebSocket.OPEN) {
      return;
    }

    socket.send(
      JSON.stringify({
        type: 'chat',
        body: nextBody,
      }),
    );
  };

  socket.addEventListener('message', (event) => {
    try {
      const message = JSON.parse(String(event.data)) as WorldSnapshotMessage | WorldChatMessage;
      if (message.type === 'world_snapshot') {
        args.onSnapshot(message);
      } else if (message.type === 'chat_message') {
        args.onChat(message);
      }
    } catch {
      args.onError('Received invalid world snapshot');
    }
  });

  socket.addEventListener('error', () => {
    args.onError('World socket connection failed');
  });

  return {
    close() {
      socket.close();
    },
    moveTo,
    sendChat,
    moveToZone(zone: RuntimeZoneID) {
      moveTo(zoneMoveTarget(zone));
    },
  };
}
