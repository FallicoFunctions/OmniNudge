import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Mic, MicOff, PhoneOff, Send, Video } from 'lucide-react';
import PersonaAvatar from './PersonaAvatar';
import { createOmniChatRequestId, omnichatService } from '../../services/omnichatService';
import type { BotMessage, BotPersona, OmniChatCallSession } from '../../types/omnichat';
import { speakOmniChatMessage, stopOmniChatSpeech } from './OmniChatSpeakButton';
import { useDialogFocus } from '../../hooks/useDialogFocus';

type RecognitionResultEvent = { results: ArrayLike<{ 0: { transcript: string } }> };
type BrowserRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type RecognitionConstructor = new () => BrowserRecognition;

export function isTrustedOmniChatCallUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      (url.hostname === 'daily.co' || url.hostname.endsWith('.daily.co'))
    );
  } catch {
    return false;
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
  const [status, setStatus] = useState<
    'connecting' | 'ready' | 'listening' | 'thinking' | 'speaking' | 'error'
  >('connecting');
  const [transcript, setTranscript] = useState('');
  const [manualText, setManualText] = useState('');
  const [liveVideoURL, setLiveVideoURL] = useState('');
  const recognitionRef = useRef<BrowserRecognition | null>(null);
  const sessionRef = useRef<OmniChatCallSession | null>(null);
  const turnAbortRef = useRef<AbortController | null>(null);
  const closedRef = useRef(false);
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
        setStatus('error');
      });
    return () => {
      active = false;
      if (callEpochRef.current === callEpoch) {
        closedRef.current = true;
        callEpochRef.current += 1;
      }
      recognitionRef.current?.stop();
      turnAbortRef.current?.abort(
        new DOMException('The call ended before the AI turn completed', 'AbortError')
      );
      turnAbortRef.current = null;
      stopOmniChatSpeech();
      const currentSession = sessionRef.current;
      sessionRef.current = null;
      if (currentSession?.status === 'active')
        void omnichatService.endCall(currentSession.id).catch(() => undefined);
    };
  }, [conversationId, mode]);

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
      const assistant = await omnichatService.sendMessage(
        conversationId,
        content,
        createOmniChatRequestId(),
        turnController.signal
      );
      if (closedRef.current || callEpochRef.current !== callEpoch) return;
      onAssistant(assistant);
      const activeSession = sessionRef.current;
      if (activeSession)
        void omnichatService.recordCallTurn(activeSession.id).catch(() => undefined);
      await speakOmniChatMessage({
        personaId: persona.id,
        conversationId,
        messageId: assistant.id,
        text: assistant.content,
        onState: (speaking) => {
          if (!closedRef.current && callEpochRef.current === callEpoch)
            setStatus(speaking ? 'speaking' : 'ready');
        },
      });
    } catch (error) {
      if ((error as Error).name === 'AbortError') return;
      if (!closedRef.current && callEpochRef.current === callEpoch) setStatus('error');
    } finally {
      if (turnAbortRef.current === turnController) turnAbortRef.current = null;
    }
  };

  const startListening = () => {
    const browserWindow = window as Window & {
      SpeechRecognition?: RecognitionConstructor;
      webkitSpeechRecognition?: RecognitionConstructor;
    };
    const Recognition = browserWindow.SpeechRecognition || browserWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setStatus('ready');
      return;
    }
    recognitionRef.current?.stop();
    const recognition = new Recognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = navigator.language || 'en-US';
    recognition.onresult = (event) => {
      const text = event.results[0]?.[0]?.transcript || '';
      void sendTranscript(text);
    };
    recognition.onerror = () => setStatus('error');
    recognition.onend = () => setStatus((current) => (current === 'listening' ? 'ready' : current));
    recognitionRef.current = recognition;
    setStatus('listening');
    recognition.start();
  };
  function endCall() {
    if (closedRef.current) return;
    closedRef.current = true;
    callEpochRef.current += 1;
    recognitionRef.current?.stop();
    turnAbortRef.current?.abort(
      new DOMException('The call ended before the AI turn completed', 'AbortError')
    );
    turnAbortRef.current = null;
    stopOmniChatSpeech();
    const activeSession = sessionRef.current;
    sessionRef.current = null;
    setLiveVideoURL('');
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
          <iframe
            src={liveVideoURL}
            title={`Live avatar video call with ${persona.name}`}
            allow="camera; microphone; fullscreen; display-capture"
            referrerPolicy="no-referrer"
            className="h-full w-full border-0"
          />
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
          {status === 'error' && (
            <p
              role="alert"
              className="mb-5 rounded-2xl bg-rose-500/15 px-4 py-3 text-center text-sm text-rose-100 backdrop-blur"
            >
              The call could not be connected. End the call and try again.
            </p>
          )}
          {status !== 'error' && !liveVideoURL && (
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
            {status !== 'error' && !liveVideoURL && (
              <button
                type="button"
                onClick={() =>
                  status === 'listening' ? recognitionRef.current?.stop() : startListening()
                }
                disabled={status === 'connecting' || status === 'thinking' || status === 'speaking'}
                aria-label={status === 'listening' ? 'Stop listening' : 'Talk'}
                className={`flex h-16 w-16 items-center justify-center rounded-full ${status === 'listening' ? 'bg-white text-black' : 'bg-white/15 backdrop-blur'} disabled:opacity-40`}
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
            {status !== 'error' && mode === 'video' && !liveVideoURL && (
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
