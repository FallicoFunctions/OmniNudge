import { useCallback, useEffect, useRef } from 'react';
import type { CallMicrophone } from './callRecorder';
import {
  createLivePcmPlayer,
  startLiveCallCapture,
  type LiveCallCapture,
} from './liveCallAudio';
import { openLiveCallSocket, type LiveCallSocket, type LiveCallSocketClose } from './liveCallSocket';

export type LiveVoiceCallState = 'connecting' | 'listening' | 'speaking' | 'paused';

type LiveVoiceCallOptions = {
  /** The call session, once it exists. Null keeps the call closed. */
  callId: string | null;
  microphone: CallMicrophone | null;
  muted: boolean;
  onState: (state: LiveVoiceCallState) => void;
  /** What the caller has said this turn, as Live transcribes it. */
  onHeard: (text: string) => void;
  onFailed: (message: string) => void;
};

function closeMessage(close: LiveCallSocketClose): string {
  return close.code === 1000
    ? 'The call has ended.'
    : 'The call dropped. End the call and try again.';
}

/**
 * A voice call as one live connection: the microphone streams out, her voice
 * streams back, and there is no turn to wait for and nothing to transcribe.
 *
 * The microphone keeps streaming while she speaks, because that is how she is
 * interrupted: Live hears the caller over her, stops, and says so, and the
 * audio already queued here is dropped at once rather than finishing her
 * sentence over them.
 */
export function useLiveVoiceCall({
  callId,
  microphone,
  muted,
  onState,
  onHeard,
  onFailed,
}: LiveVoiceCallOptions) {
  // Read by callbacks that outlive the render that made them: the microphone
  // chunk handler and the socket's events. Kept current after each render,
  // before the connection effect below can run.
  const mutedRef = useRef(muted);
  const handlersRef = useRef({ onState, onHeard, onFailed });
  const socketRef = useRef<LiveCallSocket | null>(null);
  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);
  useEffect(() => {
    handlersRef.current = { onState, onHeard, onFailed };
  });

  useEffect(() => {
    if (!callId || !microphone) return;
    let disposed = false;
    let socket: LiveCallSocket | null = null;
    let capture: LiveCallCapture | null = null;
    let heard = '';

    const player = createLivePcmPlayer(microphone.context, (playing) => {
      if (!disposed) handlersRef.current.onState(playing ? 'speaking' : 'listening');
    });
    handlersRef.current.onState('connecting');

    void (async () => {
      try {
        const opened = await openLiveCallSocket(callId, {
          onAudio: (pcm) => {
            if (!disposed) player.enqueue(pcm);
          },
          onEvent: (event) => {
            if (disposed) return;
            switch (event.type) {
              case 'heard':
                heard += event.text;
                handlersRef.current.onHeard(heard.trim());
                break;
              case 'interrupted':
                player.clear();
                break;
              case 'turn_complete':
                heard = '';
                break;
              case 'paused':
                // Cleared first: clearing reports that she stopped playing,
                // and the pause is what the call is, not a return to listening.
                player.clear();
                handlersRef.current.onState('paused');
                break;
              case 'resumed':
                handlersRef.current.onState('listening');
                break;
              case 'said':
                break;
            }
          },
          onClose: (close) => {
            if (!disposed) handlersRef.current.onFailed(closeMessage(close));
          },
        });
        if (disposed) {
          opened.close();
          return;
        }
        socket = opened;
        socketRef.current = opened;
        const started = await startLiveCallCapture(microphone.context, microphone.stream, (pcm) => {
          if (!mutedRef.current) opened.sendAudio(pcm);
        });
        if (disposed) {
          started.stop();
          return;
        }
        capture = started;
        handlersRef.current.onState('listening');
      } catch {
        if (!disposed) {
          handlersRef.current.onFailed('The call could not be connected. End the call and try again.');
        }
      }
    })();

    return () => {
      disposed = true;
      capture?.stop();
      player.clear();
      socket?.close();
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [callId, microphone]);

  const resume = useCallback(() => {
    socketRef.current?.resume();
  }, []);

  return { resume };
}
