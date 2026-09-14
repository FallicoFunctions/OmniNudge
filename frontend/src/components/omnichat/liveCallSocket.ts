import { API_BASE_URL, api } from '../../lib/api';

/**
 * The browser's end of a live call: microphone audio out, her voice and the
 * running transcript back, over one socket per call.
 */

export type LiveCallSocketEvent =
  | { type: 'heard'; text: string }
  | { type: 'said'; text: string }
  | { type: 'interrupted' }
  | { type: 'turn_complete' }
  // A minute could not be paid: nothing crosses the call until it is.
  | { type: 'paused' }
  | { type: 'resumed' };

export type LiveCallSocketClose = { code: number; reason: string; clean: boolean };

export type LiveCallSocketHandlers = {
  onAudio: (pcm: ArrayBuffer) => void;
  onEvent: (event: LiveCallSocketEvent) => void;
  onClose: (close: LiveCallSocketClose) => void;
};

export type LiveCallSocket = {
  sendAudio: (pcm: ArrayBuffer) => void;
  /** Asks the server to pay for a minute and carry on after a pause. */
  resume: () => void;
  close: () => void;
};

/**
 * Past this much unsent audio the network is not keeping up, and more would
 * only arrive later and later. Dropping it keeps the call live; queueing it
 * would make her answer something said half a minute ago.
 */
const MAX_BUFFERED_BYTES = 256 * 1024;

export function liveCallSocketUrl(callId: string, token: string, base: string = API_BASE_URL): string {
  const url = new URL(base);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = `${url.pathname.replace(/\/$/, '')}/omnichat/calls/${encodeURIComponent(callId)}/live`;
  url.search = '';
  url.searchParams.set('token', token);
  return url.toString();
}

function parseEvent(data: string): LiveCallSocketEvent | null {
  let value: unknown;
  try {
    value = JSON.parse(data);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  const { type, text } = value as { type?: unknown; text?: unknown };
  switch (type) {
    case 'heard':
    case 'said':
      return typeof text === 'string' ? { type, text } : null;
    case 'interrupted':
    case 'turn_complete':
    case 'paused':
    case 'resumed':
      return { type };
    default:
      return null;
  }
}

type SocketDeps = {
  fetchToken?: () => Promise<string>;
  createSocket?: (url: string) => WebSocket;
  base?: string;
};

const fetchWebSocketToken = async () =>
  (await api.post<{ ws_token: string }>('/auth/ws-token')).ws_token;

/**
 * Opens the socket for an active call and resolves once it is open. It
 * rejects if the server refuses it -- a call that is not the caller's, already
 * connected elsewhere, or not a voice call.
 */
export async function openLiveCallSocket(
  callId: string,
  handlers: LiveCallSocketHandlers,
  deps: SocketDeps = {}
): Promise<LiveCallSocket> {
  const token = await (deps.fetchToken ?? fetchWebSocketToken)();
  const url = liveCallSocketUrl(callId, token, deps.base);
  const socket = (deps.createSocket ?? ((target) => new WebSocket(target)))(url);
  socket.binaryType = 'arraybuffer';

  return new Promise<LiveCallSocket>((resolve, reject) => {
    let opened = false;
    socket.onopen = () => {
      opened = true;
      resolve({
        sendAudio: (pcm) => {
          if (socket.readyState !== WebSocket.OPEN) return;
          if (socket.bufferedAmount > MAX_BUFFERED_BYTES) return;
          socket.send(pcm);
        },
        resume: () => {
          if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'resume' }));
        },
        close: () => {
          if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
            socket.close(1000);
          }
        },
      });
    };
    socket.onmessage = (message: MessageEvent) => {
      if (message.data instanceof ArrayBuffer) {
        handlers.onAudio(message.data);
        return;
      }
      if (typeof message.data === 'string') {
        const event = parseEvent(message.data);
        if (event) handlers.onEvent(event);
      }
    };
    socket.onerror = () => {
      if (!opened) reject(new Error('The call could not be connected.'));
    };
    socket.onclose = (event: CloseEvent) => {
      if (!opened) {
        reject(new Error('The call could not be connected.'));
        return;
      }
      handlers.onClose({ code: event.code, reason: event.reason, clean: event.wasClean });
    };
  });
}
