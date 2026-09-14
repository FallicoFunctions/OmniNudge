import '@testing-library/jest-dom/vitest';
import { useEffect } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  OmniChatCallPaymentRequired,
  OmniChatCallProvider,
  useOmniChatCall,
  type OmniChatCallContextValue,
} from '../OmniChatCallProvider';
import { omnichatService } from '../../../services/omnichatService';
import { openMicrophone } from '../callRecorder';

vi.mock('../../../services/omnichatService', () => ({
  omnichatQueryKeys: { conversation: (id: number) => ['omnichat', 'conversation', id] },
  omnichatService: { startCall: vi.fn(), endCall: vi.fn() },
}));

vi.mock('../callRecorder', () => ({ openMicrophone: vi.fn() }));

// The connection itself has its own tests; here it is what the provider hands
// it and what it reports back.
const live = vi.hoisted(() => ({
  options: null as null | {
    callId: string | null;
    microphone: unknown;
    muted: boolean;
    onState: (state: 'connecting' | 'listening' | 'speaking' | 'paused') => void;
    onFailed: (message: string) => void;
  },
  resume: vi.fn(),
}));
vi.mock('../useLiveVoiceCall', () => ({
  useLiveVoiceCall: (options: typeof live.options) => {
    live.options = options;
    return { resume: live.resume };
  },
}));

vi.mock('../OmniChatCommerceModal', () => ({
  default: ({
    onClose,
    pausedCall,
  }: {
    onClose: () => void;
    pausedCall?: { onCreditsAdded: () => void };
  }) => (
    <div role="dialog" aria-label="Buy OmniCredits">
      <button type="button" onClick={onClose}>
        End call
      </button>
      <button type="button" onClick={() => pausedCall?.onCreditsAdded()}>
        Credits arrived
      </button>
    </div>
  ),
}));

const sadie = { id: 9, name: 'Sadie' };
const microphone = () => ({ release: vi.fn(), context: {}, stream: {} });

// Written after render, not during it: render has no side effects, and act()
// flushes effects before every assertion.
let calls: OmniChatCallContextValue | null = null;
function Probe() {
  const value = useOmniChatCall();
  useEffect(() => {
    calls = value;
  });
  return null;
}

function renderProvider(queryClient = new QueryClient()) {
  const view = render(
    <QueryClientProvider client={queryClient}>
      <OmniChatCallProvider>
        <Probe />
      </OmniChatCallProvider>
    </QueryClientProvider>
  );
  return { view, queryClient };
}

describe('OmniChatCallProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    calls = null;
    live.options = null;
    vi.mocked(omnichatService.endCall).mockResolvedValue(undefined);
  });

  it('is nothing where no provider is mounted', () => {
    render(<Probe />);
    expect(calls).toBeNull();
  });

  // Pressing the phone opens the microphone and the call together, and the
  // live connection gets both once they are there.
  it('starts a voice call and hands the live connection its session and microphone', async () => {
    const mic = microphone();
    vi.mocked(openMicrophone).mockResolvedValue(mic as never);
    vi.mocked(omnichatService.startCall).mockResolvedValue({ id: 'call-1' } as never);
    renderProvider();

    await act(async () => {
      await calls!.startVoiceCall(12, sadie);
    });

    expect(omnichatService.startCall).toHaveBeenCalledWith(12, 'voice');
    expect(calls!.call).toMatchObject({
      conversationId: 12,
      persona: sadie,
      state: 'connecting',
      muted: false,
    });
    expect(live.options).toMatchObject({ callId: 'call-1', microphone: mic, muted: false });

    act(() => live.options!.onState('listening'));
    expect(calls!.call?.state).toBe('listening');
    act(() => calls!.toggleMute());
    expect(live.options!.muted).toBe(true);
  });

  it('asks the caller to buy credits when the first minute cannot be paid', async () => {
    const mic = microphone();
    vi.mocked(openMicrophone).mockResolvedValue(mic as never);
    vi.mocked(omnichatService.startCall).mockRejectedValue(
      Object.assign(new Error('402'), { status: 402 })
    );
    renderProvider();

    let thrown: unknown;
    await act(async () => {
      thrown = await calls!.startVoiceCall(12, sadie).catch((error: unknown) => error);
    });

    expect(thrown).toBeInstanceOf(OmniChatCallPaymentRequired);
    expect(mic.release).toHaveBeenCalled();
    expect(calls!.call).toBeNull();
    expect(calls!.failure).toBe('');
  });

  it('says to wait, not that the network failed, when calls are rate limited', async () => {
    vi.mocked(openMicrophone).mockResolvedValue(microphone() as never);
    vi.mocked(omnichatService.startCall).mockRejectedValue(
      Object.assign(new Error('429'), { status: 429 })
    );
    renderProvider();

    await act(async () => {
      await calls!.startVoiceCall(12, sadie);
    });
    expect(calls!.failure).toMatch(/too many calls/i);
  });

  it('hangs up: the microphone is released, the call ended and the chat refreshed', async () => {
    const mic = microphone();
    vi.mocked(openMicrophone).mockResolvedValue(mic as never);
    vi.mocked(omnichatService.startCall).mockResolvedValue({ id: 'call-1' } as never);
    const { queryClient } = renderProvider();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    await act(async () => {
      await calls!.startVoiceCall(12, sadie);
    });
    act(() => calls!.endCall());

    expect(mic.release).toHaveBeenCalled();
    expect(omnichatService.endCall).toHaveBeenCalledWith('call-1');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['omnichat', 'conversation', 12] });
    expect(calls!.call).toBeNull();
    expect(live.options!.callId).toBeNull();
  });

  // Hung up before the call existed: it is ended when it arrives, never connected.
  it('ends a call that arrives after the caller hung up', async () => {
    const mic = microphone();
    let arrive!: (value: { id: string }) => void;
    vi.mocked(openMicrophone).mockResolvedValue(mic as never);
    vi.mocked(omnichatService.startCall).mockReturnValue(
      new Promise((resolve) => {
        arrive = resolve;
      }) as never
    );
    renderProvider();

    let starting!: Promise<void>;
    act(() => {
      starting = calls!.startVoiceCall(12, sadie);
    });
    act(() => calls!.endCall());
    await act(async () => {
      arrive({ id: 'late-call' });
      await starting;
    });

    expect(omnichatService.endCall).toHaveBeenCalledWith('late-call');
    expect(mic.release).toHaveBeenCalled();
    expect(live.options!.callId).toBeNull();
  });

  it('ends the call and says why when the microphone is refused', async () => {
    vi.mocked(openMicrophone).mockResolvedValue('The microphone is not available.' as never);
    vi.mocked(omnichatService.startCall).mockResolvedValue({ id: 'call-1' } as never);
    renderProvider();

    await act(async () => {
      await calls!.startVoiceCall(12, sadie);
    });

    expect(omnichatService.endCall).toHaveBeenCalledWith('call-1');
    expect(calls!.call).toBeNull();
    expect(calls!.failure).toBe('The microphone is not available.');
  });

  it('ends the call and says why when the connection drops', async () => {
    vi.mocked(openMicrophone).mockResolvedValue(microphone() as never);
    vi.mocked(omnichatService.startCall).mockResolvedValue({ id: 'call-1' } as never);
    renderProvider();
    await act(async () => {
      await calls!.startVoiceCall(12, sadie);
    });

    act(() => live.options!.onFailed('The call dropped. End the call and try again.'));
    expect(calls!.call).toBeNull();
    expect(calls!.failure).toMatch(/dropped/);
    expect(omnichatService.endCall).toHaveBeenCalledWith('call-1');
  });

  // Out of credits is a pause: the credits screen opens over whatever page the
  // caller is on, and credits arriving carry the call on.
  it('opens the credits screen over the site while paused, and resumes when credits arrive', async () => {
    vi.mocked(openMicrophone).mockResolvedValue(microphone() as never);
    vi.mocked(omnichatService.startCall).mockResolvedValue({ id: 'call-1' } as never);
    renderProvider();
    await act(async () => {
      await calls!.startVoiceCall(12, sadie);
    });

    act(() => live.options!.onState('paused'));
    fireEvent.click(screen.getByRole('button', { name: 'Credits arrived' }));
    expect(live.resume).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole('button', { name: 'End call' }));
    expect(calls!.call).toBeNull();
    expect(screen.queryByRole('dialog', { name: 'Buy OmniCredits' })).toBeNull();
  });

  it('hangs up the current call before calling somebody else, and ignores calling the same one twice', async () => {
    vi.mocked(openMicrophone).mockResolvedValue(microphone() as never);
    vi.mocked(omnichatService.startCall)
      .mockResolvedValueOnce({ id: 'call-1' } as never)
      .mockResolvedValueOnce({ id: 'call-2' } as never);
    renderProvider();

    await act(async () => {
      await calls!.startVoiceCall(12, sadie);
    });
    await act(async () => {
      await calls!.startVoiceCall(12, sadie);
    });
    expect(omnichatService.startCall).toHaveBeenCalledOnce();

    await act(async () => {
      await calls!.startVoiceCall(30, { id: 4, name: 'Mara' });
    });
    expect(omnichatService.endCall).toHaveBeenCalledWith('call-1');
    expect(calls!.call?.persona.name).toBe('Mara');
    expect(live.options!.callId).toBe('call-2');
  });

  it('hangs up when the caller leaves OmniChat', async () => {
    vi.mocked(openMicrophone).mockResolvedValue(microphone() as never);
    vi.mocked(omnichatService.startCall).mockResolvedValue({ id: 'call-1' } as never);
    const { view } = renderProvider();
    await act(async () => {
      await calls!.startVoiceCall(12, sadie);
    });

    view.unmount();
    await waitFor(() => expect(omnichatService.endCall).toHaveBeenCalledWith('call-1'));
  });
});
