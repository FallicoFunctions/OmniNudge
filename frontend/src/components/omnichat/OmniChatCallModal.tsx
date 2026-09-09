import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Mic, MicOff, PhoneOff, Send, Video } from 'lucide-react';
import { Room, RoomEvent, Track } from 'livekit-client';
import PersonaAvatar from './PersonaAvatar';
import {
  createOmniChatRequestId,
  omnichatService,
  waitForOmniChatReply,
} from '../../services/omnichatService';
import type { BotMessage, BotPersona, OmniChatCallSession } from '../../types/omnichat';
import { speakOmniChatMessage, stopOmniChatSpeech } from './OmniChatSpeakButton';
import {
  openMicrophone,
  recordUtterance,
  type CallMicrophone,
  type RecorderHandle,
} from './callRecorder';
import { useDialogFocus } from '../../hooks/useDialogFocus';

export function isTrustedOmniChatCallUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (
      url.protocol !== 'wss:' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      host === 'localhost' ||
      host.endsWith('.local') ||
      /^(10\.|127\.|169\.254\.|192\.168\.)/.test(host)
    ) {
      return false;
    }
    const configuredHosts = String(import.meta.env.VITE_LIVEKIT_HOSTS ?? '')
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean);
    return (
      configuredHosts.includes(host) ||
      host === 'livekit.omninudge.com' ||
      host.endsWith('.omninudge.com')
    );
  } catch {
    return false;
  }
}

/**
 * Says which failure happened, because four of them used to read the same.
 *
 * "That could not be transcribed" sends whoever reads it nowhere: a recording
 * the server could not parse, a transcoder that is not installed, and a
 * provider outage need three different things done about them.
 */
export function transcriptionFailureNotice(code?: string): string {
  switch (code) {
    case 'recording_invalid':
      return 'What the browser recorded was not audio the server could read. Reload the page and try the call again.';
    case 'recording_unreadable':
      return 'The recording arrived damaged and could not be decoded. Reload the page and try the call again.';
    case 'transcoder_unavailable':
      return 'The server cannot convert audio right now, so nothing can be transcribed. You can type below.';
    case 'transcription_failed':
      return 'The transcription service could not be reached. You can type below and try speaking again shortly.';
    default:
      return 'That could not be transcribed. You can type below instead.';
  }
}

export default function OmniChatCallModal({
  persona,
  conversationId,
  mode,
  onClose,
  onAssistant,
  onPaymentRequired,
}: {
  persona: BotPersona;
  conversationId: number;
  mode: 'voice' | 'video';
  onClose: () => void;
  onAssistant: (message: BotMessage) => void;
  onPaymentRequired?: () => void;
}) {
  const [listeningNotice, setListeningNotice] = useState('');
  // A call listens by itself. Pressing the phone is what starts it, and she
  // keeps listening between turns -- pressing a second button to be heard is
  // not how a phone call works.
  const [handsFree, setHandsFree] = useState(true);
  // One failure stops the automatic restart. Without this a recogniser that
  // ends immediately would be restarted immediately, forever, which is a hot
  // loop wearing the costume of a feature.
  const autoListenBlockedRef = useRef(false);
  const [status, setStatus] = useState<
    'connecting' | 'ready' | 'listening' | 'thinking' | 'speaking' | 'error'
  >('connecting');
  const [transcript, setTranscript] = useState('');
  const [manualText, setManualText] = useState('');
  const [liveVideoURL, setLiveVideoURL] = useState('');
  const [liveVideoConnected, setLiveVideoConnected] = useState(false);
  const recorderRef = useRef<RecorderHandle | null>(null);
  // One microphone for the whole call. Asking per sentence prompts for
  // permission per sentence, which no other site does.
  const microphoneRef = useRef<CallMicrophone | null>(null);
  const [heardLevel, setHeardLevel] = useState(0);
  const [microphoneReady, setMicrophoneReady] = useState(false);
  const [startFailure, setStartFailure] = useState('');
  const sessionRef = useRef<OmniChatCallSession | null>(null);
  const liveKitRoomRef = useRef<Room | null>(null);
  const liveVideoTokenRef = useRef('');
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLDivElement | null>(null);
  const turnAbortRef = useRef<AbortController | null>(null);
  const closedRef = useRef(false);
  const startedRef = useRef(false);
  const callEpochRef = useRef(0);
  const onCloseRef = useRef(onClose);
  const onPaymentRequiredRef = useRef(onPaymentRequired);
  onCloseRef.current = onClose;
  onPaymentRequiredRef.current = onPaymentRequired;
  const dialogRef = useDialogFocus({
    isActive: true,
    onEscape: () => {
      void endCall();
    },
  });

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    // One start per mount, whatever React does with the effect.
    //
    // In development the effect is invoked twice on purpose, and each
    // invocation started a call: two sessions milliseconds apart in the
    // database, every attempt, and two of the ten hourly starts spent on one
    // press of the phone. It was visible three separate times before anybody
    // read it as a bug rather than as noise.
    if (startedRef.current) return;
    startedRef.current = true;
    let active = true;
    closedRef.current = false;
    const callEpoch = ++callEpochRef.current;
    void omnichatService
      .startCall(conversationId, mode)
      .then((created) => {
        if (active && !closedRef.current && callEpochRef.current === callEpoch) {
          if (
            mode === 'video' &&
            created.live_video_url &&
            !isTrustedOmniChatCallUrl(created.live_video_url)
          ) {
            void omnichatService.endCall(created.id).catch(() => undefined);
            setStatus('error');
            return;
          }
          sessionRef.current = created;
          setLiveVideoURL(created.live_video_url ?? '');
          liveVideoTokenRef.current = created.live_video_token ?? '';
          setStatus('ready');
        } else {
          void omnichatService.endCall(created.id).catch(() => undefined);
        }
      })
      .catch((error: unknown) => {
        if (!active || closedRef.current || callEpochRef.current !== callEpoch) return;
        if (
          mode === 'video' &&
          (error as Error & { status?: number }).status === 402 &&
          onPaymentRequiredRef.current
        ) {
          onPaymentRequiredRef.current();
          onCloseRef.current();
          return;
        }
        // A start that never happened, retried, is a start that never happens.
        startedRef.current = false;
        // "Could not be connected" for a rate limit sends whoever reads it
        // looking at the network, when the answer is simply to wait. It cost
        // an evening once.
        if ((error as Error & { status?: number }).status === 429) {
          setStartFailure('Too many calls started recently. Wait a few minutes and try again.');
        }
        setStatus('error');
      });
    return () => {
      active = false;
      if (callEpochRef.current === callEpoch) {
        closedRef.current = true;
        callEpochRef.current += 1;
      }
      recorderRef.current?.cancel();
      turnAbortRef.current?.abort(
        new DOMException('The call ended before the AI turn completed', 'AbortError')
      );
      turnAbortRef.current = null;
      stopOmniChatSpeech();
      const currentSession = sessionRef.current;
      sessionRef.current = null;
      liveVideoTokenRef.current = '';
      if (currentSession?.status === 'active')
        void omnichatService.endCall(currentSession.id).catch(() => undefined);
    };
  }, [conversationId, mode]);

  useEffect(() => {
    if (mode !== 'video' || !liveVideoURL || !liveVideoTokenRef.current) return;
    let active = true;
    const room = new Room({ adaptiveStream: true, dynacast: true });
    const videoElement = remoteVideoRef.current;
    const audioElement = remoteAudioRef.current;
    liveKitRoomRef.current = room;

    const clearTrack = (track: Track) => {
      const detached = track.detach();
      (Array.isArray(detached) ? detached : [detached]).forEach((element) => element.remove());
      if (track.kind === Track.Kind.Video && videoElement) {
        videoElement.srcObject = null;
        setLiveVideoConnected(false);
      }
    };
    const handleTrack = (track: Track) => {
      if (track.kind === Track.Kind.Video && videoElement) {
        track.attach(videoElement);
        videoElement.autoplay = true;
        videoElement.playsInline = true;
        setLiveVideoConnected(true);
        return;
      }
      if (track.kind === Track.Kind.Audio && audioElement) {
        const attached = track.attach();
        (Array.isArray(attached) ? attached : [attached]).forEach((element: HTMLMediaElement) => {
          element.autoplay = true;
          audioElement.appendChild(element);
        });
      }
    };
    room.on(RoomEvent.TrackSubscribed, handleTrack);
    room.on(RoomEvent.TrackUnsubscribed, clearTrack);
    room.on(RoomEvent.Disconnected, () => {
      if (active) setLiveVideoConnected(false);
    });
    void room
      .connect(liveVideoURL, liveVideoTokenRef.current)
      .then(async () => {
        if (!active) return;
        await room.localParticipant.setMicrophoneEnabled(true);
        await room.localParticipant.setCameraEnabled(true);
      })
      .catch(() => {
        if (active) setStatus('error');
      });
    return () => {
      active = false;
      room.removeAllListeners();
      room.disconnect();
      liveKitRoomRef.current = null;
      setLiveVideoConnected(false);
      if (videoElement) videoElement.srcObject = null;
      audioElement?.replaceChildren();
    };
  }, [liveVideoURL, mode]);

  useEffect(() => {
    if (mode !== 'video' || !liveVideoURL) return;
    const callID = sessionRef.current?.id;
    if (!callID) return;
    const tokenTTLSeconds = sessionRef.current?.live_video_token_ttl_seconds ?? 600;
    // Refresh at half-life, with a conservative upper bound so a long call
    // never depends on a single ten-minute token. The lower bound also keeps
    // deliberately short staging TTLs from expiring before the refresh runs.
    const refreshEveryMs = Math.max(15_000, Math.min(Math.max(tokenTTLSeconds, 30) * 500, 240_000));
    let active = true;
    const refresh = async () => {
      try {
        const token = await omnichatService.refreshCallToken(callID);
        if (!active || closedRef.current) return;
        liveVideoTokenRef.current = token;
        const room = liveKitRoomRef.current;
        if (room?.state === 'connected') {
          // The browser SDK accepts a token during connect, but does not
          // expose a public in-place token setter. Reconnect the same room
          // with the refreshed token so the active Pod and its media tracks
          // remain intact while the participant credential rolls over.
          // Keep the existing browser capture tracks while rotating the
          // participant credential; disconnect() stops them by default and
          // would force a fresh permission prompt on every refresh.
          await room.disconnect(false);
          if (!active || closedRef.current) return;
          await room.connect(liveVideoURL, token);
          await room.localParticipant.setMicrophoneEnabled(true);
          await room.localParticipant.setCameraEnabled(true);
        }
      } catch {
        if (active && !closedRef.current) setStatus('error');
      }
    };
    const timer = window.setInterval(() => void refresh(), refreshEveryMs);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [liveVideoURL, mode]);

  const sendTranscript = async (content: string) => {
    content = content.trim();
    if (!content || status === 'thinking') return;
    const callEpoch = callEpochRef.current;
    turnAbortRef.current?.abort();
    const turnController = new AbortController();
    turnAbortRef.current = turnController;
    setTranscript(content);
    setManualText('');
    setStatus('thinking');
    try {
      // Listen first: the reply can land before the send call settles.
      const replyArrived = waitForOmniChatReply(conversationId, turnController.signal);
      // If the send itself fails, nothing below ever awaits this one, and an
      // unobserved rejection is an unhandled promise rejection.
      void replyArrived.catch(() => undefined);
      await omnichatService.sendMessage(
        conversationId,
        content,
        createOmniChatRequestId(),
        turnController.signal
      );
      const assistant = await replyArrived;
      if (closedRef.current || callEpochRef.current !== callEpoch) return;
      onAssistant(assistant);
      let avatarHandledSpeech = false;
      const liveKitRoom = liveKitRoomRef.current;
      if (mode === 'video' && liveKitRoom?.state === 'connected') {
        try {
          const payload = new TextEncoder().encode(
            JSON.stringify({
              type: 'assistant_text',
              text: assistant.content,
              message_id: assistant.id,
            })
          );
          await liveKitRoom.localParticipant.publishData(payload, {
            reliable: true,
            topic: 'omnichat.assistant',
          });
          avatarHandledSpeech = true;
          setStatus('ready');
        } catch {
          // If the avatar room drops while a turn is completing, preserve the
          // usable call experience by falling back to local speech.
        }
      }
      const activeSession = sessionRef.current;
      if (activeSession)
        void omnichatService.recordCallTurn(activeSession.id).catch(() => undefined);
      if (!avatarHandledSpeech) {
        try {
          await speakOmniChatMessage({
            personaId: persona.id,
            conversationId,
            messageId: assistant.id,
            text: assistant.content,
            // Her voice goes through the call's own audio graph, which was
            // unlocked when the call started and is still allowed to make
            // sound. A fresh Audio element is not, by the time she has been
            // transcribed, answered and synthesised.
            play: microphoneRef.current?.play,
            onState: (speaking) => {
              if (!closedRef.current && callEpochRef.current === callEpoch)
                setStatus(speaking ? 'speaking' : 'ready');
            },
          });
        } catch {
          // Her words are already in the conversation. Losing the audio is not
          // losing the call, and ending it here threw away a working
          // conversation over a speaker.
          if (!closedRef.current && callEpochRef.current === callEpoch) {
            setListeningNotice('Her voice could not be played, but she replied in the chat.');
            setStatus('ready');
          }
        }
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') return;
      if (!closedRef.current && callEpochRef.current === callEpoch) setStatus('error');
    } finally {
      if (turnAbortRef.current === turnController) turnAbortRef.current = null;
    }
  };

  const startListeningRef = useRef<() => void>(() => {});
  const startListening = () => {
    const microphone = microphoneRef.current;
    if (!microphone) {
      // Not open YET is not the same as cannot open. Opening it is asynchronous
      // and the call reaches 'ready' first, so latching here stopped the
      // automatic start for the whole call -- which is why the microphone
      // button had to be pressed twice to begin talking. The effect below
      // starts listening the moment it arrives.
      setStatus('ready');
      return;
    }
    recorderRef.current?.cancel();
    setListeningNotice('');
    setStatus('listening');
    const callEpoch = callEpochRef.current;
    void recordUtterance(microphone, {
      onListening: () => {
        if (closedRef.current || callEpochRef.current !== callEpoch) return;
        setStatus('listening');
      },
      onNothingHeard: (reason) => {
        if (closedRef.current || callEpochRef.current !== callEpoch) return;
        // One quiet attempt should not stop the call listening; a broken one
        // should. Anything beyond "I didn't catch that" is the second kind.
        autoListenBlockedRef.current = !reason.startsWith("I didn't catch");
        setListeningNotice(reason);
        setStatus('ready');
      },
      onUtterance: (recording) => {
        if (closedRef.current || callEpochRef.current !== callEpoch) return;
        const activeSession = sessionRef.current;
        if (!activeSession) return;
        setStatus('thinking');
        void omnichatService
          .transcribeCallTurn(activeSession.id, recording)
          .then((text) => {
            if (closedRef.current || callEpochRef.current !== callEpoch) return;
            if (!text) {
              setListeningNotice("I didn't catch that.");
              setStatus('ready');
              return;
            }
            autoListenBlockedRef.current = false;
            setListeningNotice('');
            void sendTranscript(text);
          })
          .catch((error: Error & { code?: string }) => {
            if (closedRef.current || callEpochRef.current !== callEpoch) return;
            autoListenBlockedRef.current = true;
            setListeningNotice(transcriptionFailureNotice(error.code));
            setStatus('ready');
          });
      },
    }).then((handle) => {
      if (closedRef.current || callEpochRef.current !== callEpoch) {
        handle.cancel();
        return;
      }
      recorderRef.current = handle;
    });
  };

  startListeningRef.current = startListening;

  // The microphone is opened once, when the call connects, and held until it
  // ends. Opening it per sentence prompted for permission per sentence.
  useEffect(() => {
    let released = false;
    void openMicrophone().then((result) => {
      if (typeof result === 'string') {
        autoListenBlockedRef.current = true;
        setListeningNotice(result);
        return;
      }
      if (released || closedRef.current) {
        result.release();
        return;
      }
      microphoneRef.current = result;
      // The call is already 'ready' by now, so the effect that starts
      // listening has been and gone. Start it here instead of waiting for the
      // next thing to change.
      setMicrophoneReady(true);
    });
    return () => {
      released = true;
      microphoneRef.current?.release();
      microphoneRef.current = null;
    };
  }, []);

  // A live meter while listening. Somebody can see they are being heard
  // immediately, instead of finding out from a message thirty seconds later
  // -- which is what made three separate faults look like one silence.
  useEffect(() => {
    if (status !== 'listening') {
      setHeardLevel(0);
      return;
    }
    let frame = 0;
    const sample = () => {
      const level = microphoneRef.current?.level() ?? 0;
      setHeardLevel(level < 0 ? -1 : level);
      frame = requestAnimationFrame(sample);
    };
    frame = requestAnimationFrame(sample);
    return () => cancelAnimationFrame(frame);
  }, [status]);

  // Pressing the phone starts the call, and the call starts listening. Nothing
  // else should have to be pressed: she listens on connect and again after
  // every turn she takes, which is what a phone call is.
  //
  // Only from 'ready', so it cannot interrupt her while she is speaking or
  // thinking, and never after a failed attempt -- that latch is what keeps a
  // recogniser which ends instantly from being restarted instantly, forever.
  useEffect(() => {
    if (status !== 'ready' || !handsFree || closedRef.current) return;
    if (!microphoneReady || autoListenBlockedRef.current) return;
    const timer = window.setTimeout(() => {
      if (!closedRef.current) startListeningRef.current();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [status, handsFree, microphoneReady]);

  function endCall() {
    if (closedRef.current) return;
    closedRef.current = true;
    callEpochRef.current += 1;
    recorderRef.current?.cancel();
    turnAbortRef.current?.abort(
      new DOMException('The call ended before the AI turn completed', 'AbortError')
    );
    turnAbortRef.current = null;
    stopOmniChatSpeech();
    const activeSession = sessionRef.current;
    sessionRef.current = null;
    setLiveVideoURL('');
    liveVideoTokenRef.current = '';
    liveKitRoomRef.current?.disconnect();
    liveKitRoomRef.current = null;
    if (activeSession) void omnichatService.endCall(activeSession.id).catch(() => undefined);
    onClose();
  }
  const callIdentity = (
    <header data-testid="omnichat-call-identity" className="relative z-10 px-6 text-center">
      <p className="text-2xl font-semibold">{persona.name}</p>
      <p className="mt-1 text-sm capitalize text-white/55">
        {status === 'connecting'
          ? 'Connecting…'
          : status === 'thinking'
            ? 'Thinking…'
            : status === 'speaking'
              ? 'Speaking'
              : status === 'listening'
                ? 'Listening…'
                : status === 'error'
                  ? 'Connection needs attention'
                  : `${mode} call`}
      </p>
    </header>
  );
  return createPortal(
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={`${mode === 'video' ? 'Video' : 'Voice'} call with ${persona.name}`}
      className="omnichat-theme fixed inset-0 z-[100] flex flex-col overflow-hidden bg-[#07080c] text-white outline-none"
    >
      <div className="absolute inset-0">
        {mode === 'video' && liveVideoURL ? (
          <div className="relative flex h-full w-full items-center justify-center bg-black">
            <video
              ref={remoteVideoRef}
              title={`Live avatar video call with ${persona.name}`}
              autoPlay
              playsInline
              className={`h-full w-full object-cover ${liveVideoConnected ? 'opacity-100' : 'opacity-0'}`}
            />
            <div ref={remoteAudioRef} className="hidden" aria-hidden="true" />
            {!liveVideoConnected && (
              <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(circle_at_50%_40%,rgba(99,102,241,0.34),transparent_38%),#08090d]">
                <PersonaAvatar
                  persona={persona}
                  className="h-48 w-48 rounded-full sm:h-72 sm:w-72"
                />
              </div>
            )}
          </div>
        ) : (
          <div
            data-testid="omnichat-call-visual-group"
            className="flex h-full flex-col items-center justify-center gap-6 bg-[radial-gradient(circle_at_50%_40%,rgba(99,102,241,0.34),transparent_38%),#08090d]"
          >
            {callIdentity}
            <div
              className={`rounded-full shadow-[0_0_100px_rgba(99,102,241,0.35)] transition-transform duration-300 ${status === 'speaking' ? 'scale-105 animate-pulse' : ''}`}
            >
              <PersonaAvatar persona={persona} className="h-48 w-48 rounded-full sm:h-72 sm:w-72" />
            </div>
          </div>
        )}
      </div>
      <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-transparent to-black/80" />
      {mode === 'video' && liveVideoURL && (
        <div
          className="absolute inset-x-0 z-10"
          style={{ top: 'calc(env(safe-area-inset-top, 0px) + 2rem)' }}
        >
          {callIdentity}
        </div>
      )}
      <div className="relative z-10 mt-auto p-5 sm:p-8">
        <div className="mx-auto max-w-xl">
          {transcript && (
            <p className="mb-4 rounded-2xl bg-black/40 px-4 py-3 text-center text-sm text-white/70 backdrop-blur">
              “{transcript}”
            </p>
          )}
          {status === 'listening' && (
            <div
              data-testid="omnichat-call-level"
              className="mb-4 flex items-center justify-center gap-3 text-xs text-white/45"
            >
              <span className="h-1.5 w-40 overflow-hidden rounded-full bg-white/10">
                <span
                  className={`block h-full rounded-full transition-[width] duration-75 ${heardLevel < 0 ? 'bg-rose-400' : 'bg-emerald-400'}`}
                  style={{ width: `${heardLevel < 0 ? 100 : Math.min(100, heardLevel * 900)}%` }}
                />
              </span>
              {heardLevel < 0
                ? 'the microphone is not being measured'
                : heardLevel > 0.002
                  ? 'hearing you'
                  : `no sound from ${microphoneRef.current?.describeInput() ?? 'the microphone'}`}
            </div>
          )}
          {listeningNotice && status !== 'error' && (
            <p
              role="status"
              data-testid="omnichat-call-listening-notice"
              className="mb-5 rounded-2xl bg-amber-500/15 px-4 py-3 text-center text-sm text-amber-100 backdrop-blur"
            >
              {listeningNotice}
            </p>
          )}
          {status === 'error' && (
            <p
              role="alert"
              className="mb-5 rounded-2xl bg-rose-500/15 px-4 py-3 text-center text-sm text-rose-100 backdrop-blur"
            >
              {startFailure || 'The call could not be connected. End the call and try again.'}
            </p>
          )}
          {status !== 'error' && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void sendTranscript(manualText);
              }}
              className="mb-5 flex gap-2"
            >
              <input
                aria-label="Type during call"
                value={manualText}
                onChange={(event) => setManualText(event.target.value)}
                placeholder="Type if you prefer…"
                className="min-w-0 flex-1 rounded-full border border-white/15 bg-black/35 px-5 py-3 text-sm text-white outline-none backdrop-blur"
              />
              <button
                aria-label="Send during call"
                disabled={!manualText.trim() || status === 'thinking'}
                className="flex h-12 w-12 items-center justify-center rounded-full bg-white/15"
              >
                <Send size={17} />
              </button>
            </form>
          )}
          <div className="flex items-center justify-center gap-5">
            {status !== 'error' && (
              <button
                type="button"
                onClick={() => {
                  // The call listens by itself, so this is mute -- and the way
                  // back after a recogniser that failed, because pressing it
                  // deliberately clears the latch that stopped the automatic
                  // restart.
                  if (handsFree) {
                    setHandsFree(false);
                    recorderRef.current?.cancel();
                    return;
                  }
                  autoListenBlockedRef.current = false;
                  setListeningNotice('');
                  setHandsFree(true);
                }}
                disabled={status === 'connecting' || status === 'thinking' || status === 'speaking'}
                aria-label={handsFree ? 'Mute the microphone' : 'Unmute the microphone'}
                className={`flex h-16 w-16 items-center justify-center rounded-full ${!handsFree ? 'bg-white/15 backdrop-blur' : status === 'listening' ? 'bg-white text-black' : 'bg-white/25 backdrop-blur'} disabled:opacity-40`}
              >
                {status === 'thinking' ? (
                  <Loader2 className="animate-spin" />
                ) : status === 'listening' ? (
                  <MicOff />
                ) : (
                  <Mic />
                )}
              </button>
            )}
            {status !== 'error' && mode === 'video' && (
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/15 backdrop-blur">
                <Video />
              </span>
            )}
            <button
              type="button"
              onClick={() => void endCall()}
              aria-label="End call"
              className="flex h-16 w-16 items-center justify-center rounded-full bg-rose-500"
            >
              <PhoneOff />
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
