import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { omnichatQueryKeys, omnichatService } from '../../services/omnichatService';
import { openMicrophone, type CallMicrophone } from './callRecorder';
import OmniChatCommerceModal from './OmniChatCommerceModal';
import { useLiveVoiceCall, type LiveVoiceCallState } from './useLiveVoiceCall';

export type OmniChatCallPersona = { id: number; name: string };

export type OmniChatActiveCall = {
  conversationId: number;
  persona: OmniChatCallPersona;
  /** When the phone was pressed. The timer counts from here, as the first minute does. */
  startedAt: number;
  state: LiveVoiceCallState;
  muted: boolean;
};

/** Thrown by startVoiceCall when the caller cannot pay for the first minute. */
export class OmniChatCallPaymentRequired extends Error {
  constructor() {
    super('Voice calls require OmniCredits');
    this.name = 'OmniChatCallPaymentRequired';
  }
}

export type OmniChatCallContextValue = {
  call: OmniChatActiveCall | null;
  /** Why the last call ended on its own, until it is dismissed. */
  failure: string;
  startVoiceCall: (conversationId: number, persona: OmniChatCallPersona) => Promise<void>;
  endCall: () => void;
  toggleMute: () => void;
  dismissFailure: () => void;
};

export const OmniChatCallContext = createContext<OmniChatCallContextValue | null>(null);

/** The active call, or null where no provider is mounted. */
export function useOmniChatCall(): OmniChatCallContextValue | null {
  return useContext(OmniChatCallContext);
}

const CALL_FAILED = 'The call could not be connected. Try again.';
const CALLS_RATE_LIMITED = 'Too many calls started recently. Wait a few minutes and try again.';

/**
 * A voice call that is not a screen. It lives above the OmniChat pages, so the
 * caller can keep talking while they move around, and ends when they leave
 * OmniChat or hang up.
 */
export function OmniChatCallProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [call, setCall] = useState<OmniChatActiveCall | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [microphone, setMicrophone] = useState<CallMicrophone | null>(null);
  const [failure, setFailure] = useState('');
  // Which start is current. A start that resolves after its call was hung up,
  // or replaced by another, is ended on arrival instead of connected.
  const epochRef = useRef(0);
  const sessionRef = useRef<string | null>(null);
  const microphoneRef = useRef<CallMicrophone | null>(null);
  const conversationRef = useRef<number | null>(null);

  const teardown = useCallback(() => {
    epochRef.current += 1;
    microphoneRef.current?.release();
    microphoneRef.current = null;
    const session = sessionRef.current;
    sessionRef.current = null;
    if (session) void omnichatService.endCall(session).catch(() => undefined);
    const conversationId = conversationRef.current;
    conversationRef.current = null;
    if (conversationId !== null) {
      // Her turns are saved on the server as they are spoken; this is when the
      // chat catches up with the last of them.
      void queryClient.invalidateQueries({
        queryKey: omnichatQueryKeys.conversation(conversationId),
      });
    }
    setSessionId(null);
    setMicrophone(null);
    setCall(null);
  }, [queryClient]);

  const fail = useCallback(
    (message: string) => {
      teardown();
      setFailure(message);
    },
    [teardown]
  );

  const startVoiceCall = useCallback(
    async (conversationId: number, persona: OmniChatCallPersona) => {
      if (conversationRef.current === conversationId) return;
      // One call at a time: calling someone else hangs up first.
      teardown();
      setFailure('');
      const epoch = epochRef.current;
      conversationRef.current = conversationId;
      setCall({
        conversationId,
        persona,
        startedAt: Date.now(),
        state: 'connecting',
        muted: false,
      });

      // Together, and inside the press: Safari lets a page open the microphone
      // and make sound only close to something the person actually did.
      const [opened, started] = await Promise.allSettled([
        openMicrophone(),
        omnichatService.startCall(conversationId, 'voice'),
      ]);
      const mic = opened.status === 'fulfilled' ? opened.value : 'The microphone is not available.';

      if (epochRef.current !== epoch) {
        if (typeof mic !== 'string') mic.release();
        if (started.status === 'fulfilled') {
          void omnichatService.endCall(started.value.id).catch(() => undefined);
        }
        return;
      }
      if (started.status === 'rejected') {
        if (typeof mic !== 'string') mic.release();
        conversationRef.current = null;
        setCall(null);
        const status = (started.reason as { status?: number } | null)?.status;
        if (status === 402) throw new OmniChatCallPaymentRequired();
        setFailure(status === 429 ? CALLS_RATE_LIMITED : CALL_FAILED);
        return;
      }
      sessionRef.current = started.value.id;
      if (typeof mic === 'string') {
        fail(mic);
        return;
      }
      microphoneRef.current = mic;
      setMicrophone(mic);
      setSessionId(started.value.id);
    },
    [teardown, fail]
  );

  const toggleMute = useCallback(() => {
    setCall((current) => current && { ...current, muted: !current.muted });
  }, []);

  const dismissFailure = useCallback(() => setFailure(''), []);

  const { resume } = useLiveVoiceCall({
    callId: sessionId,
    microphone,
    muted: call?.muted ?? false,
    onState: (state) => setCall((current) => current && { ...current, state }),
    onHeard: () => undefined,
    onFailed: fail,
  });

  // Leaving OmniChat is hanging up.
  useEffect(() => () => teardown(), [teardown]);

  const value = useMemo(
    () => ({ call, failure, startVoiceCall, endCall: teardown, toggleMute, dismissFailure }),
    [call, failure, startVoiceCall, teardown, toggleMute, dismissFailure]
  );

  return (
    <OmniChatCallContext.Provider value={value}>
      {children}
      {call?.state === 'paused' && (
        <OmniChatCommerceModal isOpen onClose={teardown} pausedCall={{ onCreditsAdded: resume }} />
      )}
    </OmniChatCallContext.Provider>
  );
}
