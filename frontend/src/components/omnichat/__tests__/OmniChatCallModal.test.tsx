import { StrictMode } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import OmniChatCallModal, { isTrustedOmniChatCallUrl } from '../OmniChatCallModal';
import { omnichatService } from '../../../services/omnichatService';
import { speakOmniChatMessage } from '../OmniChatSpeakButton';
import { openLiveCallSocket, type LiveCallSocketHandlers } from '../liveCallSocket';
import type { BotPersona, OmniChatCallSession } from '../../../types/omnichat';

const roomMock = vi.hoisted(() => ({
  localParticipant: {
    setMicrophoneEnabled: vi.fn().mockResolvedValue(undefined),
    setCameraEnabled: vi.fn().mockResolvedValue(undefined),
    publishData: vi.fn().mockResolvedValue(undefined),
  },
  state: 'connected',
  on: vi.fn(),
  removeAllListeners: vi.fn(),
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn(),
}));

vi.mock('livekit-client', () => ({
  Room: class MockRoom {
    constructor() {
      return roomMock;
    }
  },
  RoomEvent: {
    TrackSubscribed: 'trackSubscribed',
    TrackUnsubscribed: 'trackUnsubscribed',
    Disconnected: 'disconnected',
  },
  Track: { Kind: { Video: 'video', Audio: 'audio' } },
}));

vi.mock('../../../services/omnichatService', async (importOriginal) => ({
  createOmniChatRequestId: () => '123e4567-e89b-42d3-a456-426614174000',
  // Real, not stubbed: waiting for the reply is the behaviour under test in the
  // call path now that sending no longer returns one.
  waitForOmniChatReply: (await importOriginal<typeof import('../../../services/omnichatService')>())
    .waitForOmniChatReply,
  omnichatService: {
    startCall: vi.fn(),
    endCall: vi.fn(),
    refreshCallToken: vi.fn(),
    sendMessage: vi.fn(),
    recordCallTurn: vi.fn(),
  },
}));

vi.mock('../OmniChatSpeakButton', () => ({
  speakOmniChatMessage: vi.fn(),
  stopOmniChatSpeech: vi.fn(),
}));

// The live connection and its audio, with a hand on each end: what the
// microphone produces, what the socket delivers, and when she starts and stops.
const live = vi.hoisted(() => ({
  socket: { sendAudio: vi.fn(), close: vi.fn(), resume: vi.fn() },
  capture: { stop: vi.fn() },
  player: { enqueue: vi.fn(), clear: vi.fn(), isPlaying: vi.fn(() => false) },
  handlers: null as null | LiveCallSocketHandlers,
  onChunk: null as null | ((pcm: ArrayBuffer) => void),
  onPlaying: null as null | ((playing: boolean) => void),
}));

vi.mock('../liveCallSocket', () => ({
  openLiveCallSocket: vi.fn(async (_callId: string, handlers: LiveCallSocketHandlers) => {
    live.handlers = handlers;
    return live.socket;
  }),
}));

// The credits screen has its own tests; here it is only what a pause opens.
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

vi.mock('../liveCallAudio', () => ({
  startLiveCallCapture: vi.fn(
    async (_context: AudioContext, _stream: MediaStream, onChunk: (pcm: ArrayBuffer) => void) => {
      live.onChunk = onChunk;
      return live.capture;
    }
  ),
  createLivePcmPlayer: vi.fn((_context: AudioContext, onPlaying: (playing: boolean) => void) => {
    live.onPlaying = onPlaying;
    return live.player;
  }),
}));

const persona: BotPersona = {
  id: 9,
  slug: 'sadie',
  name: 'Sadie',
  description: '',
  category: 'original',
  is_nsfw: false,
  is_active: true,
  created_at: '',
  updated_at: '',
};
const call: OmniChatCallSession = {
  id: 'call-1',
  user_id: 1,
  persona_id: 9,
  conversation_id: 12,
  mode: 'voice',
  status: 'active',
  recording_enabled: false,
  turn_count: 0,
  started_at: '',
  last_activity_at: '',
};

describe('OmniChatCallModal', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('renders above the OmniChat shell and keeps call status away from the top edge', () => {
    vi.mocked(omnichatService.startCall).mockReturnValue(new Promise(() => undefined));
    const view = render(
      <div className="relative z-10">
        <OmniChatCallModal
          persona={persona}
          conversationId={12}
          mode="voice"
          onClose={vi.fn()}
          onAssistant={vi.fn()}
        />
      </div>
    );

    const dialog = screen.getByRole('dialog', { name: 'Voice call with Sadie' });
    expect(dialog.parentElement).toBe(document.body);
    const visualGroup = screen.getByTestId('omnichat-call-visual-group');
    expect(visualGroup).toHaveClass('flex-col', 'items-center', 'justify-center', 'gap-6');
    expect(visualGroup).toContainElement(screen.getByTestId('omnichat-call-identity'));
    expect(visualGroup.querySelector('[data-persona-avatar="true"]')).toBeInTheDocument();
    view.unmount();
  });

  it('ends the server call session when the modal unmounts', async () => {
    vi.mocked(omnichatService.startCall).mockResolvedValue(call);
    vi.mocked(omnichatService.endCall).mockResolvedValue(undefined);
    const view = render(
      <OmniChatCallModal
        persona={persona}
        conversationId={12}
        mode="voice"
        onClose={vi.fn()}
        onAssistant={vi.fn()}
      />
    );
    await waitFor(() => expect(omnichatService.startCall).toHaveBeenCalled());
    await act(async () => {
      view.unmount();
    });
    await waitFor(() => expect(omnichatService.endCall).toHaveBeenCalledWith('call-1'));
  });

  it('closes a late-created call session after unmount', async () => {
    let resolveStart!: (value: typeof call) => void;
    vi.mocked(omnichatService.startCall).mockReturnValue(
      new Promise((resolve) => {
        resolveStart = resolve;
      })
    );
    vi.mocked(omnichatService.endCall).mockResolvedValue(undefined);
    const view = render(
      <OmniChatCallModal
        persona={persona}
        conversationId={12}
        mode="voice"
        onClose={vi.fn()}
        onAssistant={vi.fn()}
      />
    );
    view.unmount();
    await act(async () => {
      resolveStart(call);
    });
    await waitFor(() => expect(omnichatService.endCall).toHaveBeenCalledWith('call-1'));
  });

  it('ends the call when Escape is pressed', async () => {
    vi.mocked(omnichatService.startCall).mockResolvedValue(call);
    vi.mocked(omnichatService.endCall).mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(
      <OmniChatCallModal
        persona={persona}
        conversationId={12}
        mode="voice"
        onClose={onClose}
        onAssistant={vi.fn()}
      />
    );
    await waitFor(() => expect(omnichatService.startCall).toHaveBeenCalled());
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(omnichatService.endCall).toHaveBeenCalledWith('call-1'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('connects to a private LiveKit room for provider-backed video calls', async () => {
    vi.mocked(omnichatService.startCall).mockResolvedValue({
      ...call,
      mode: 'video',
      live_video_url: 'wss://livekit.omninudge.com',
      live_video_token: 'short-lived-token',
    });
    render(
      <OmniChatCallModal
        persona={persona}
        conversationId={12}
        mode="video"
        onClose={vi.fn()}
        onAssistant={vi.fn()}
      />
    );

    const video = await screen.findByTitle('Live avatar video call with Sadie');
    expect(video).toHaveAttribute('autoplay');
    await waitFor(() =>
      expect(roomMock.connect).toHaveBeenCalledWith(
        'wss://livekit.omninudge.com',
        'short-lived-token'
      )
    );
    expect(screen.getByLabelText('Type during call')).toBeInTheDocument();
  });

  it('refreshes the LiveKit participant token by reconnecting the same room', async () => {
    vi.useFakeTimers();
    vi.mocked(omnichatService.startCall).mockResolvedValue({
      ...call,
      mode: 'video',
      live_video_url: 'wss://livekit.omninudge.com',
      live_video_token: 'short-lived-token',
      live_video_token_ttl_seconds: 30,
    });
    vi.mocked(omnichatService.refreshCallToken).mockResolvedValue('refreshed-token');
    render(
      <OmniChatCallModal
        persona={persona}
        conversationId={12}
        mode="video"
        onClose={vi.fn()}
        onAssistant={vi.fn()}
      />
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(roomMock.connect).toHaveBeenCalledWith(
      'wss://livekit.omninudge.com',
      'short-lived-token'
    );
    await act(async () => {
      vi.advanceTimersByTime(15_000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(omnichatService.refreshCallToken).toHaveBeenCalledWith('call-1');
    expect(roomMock.disconnect).toHaveBeenCalledWith(false);
    expect(roomMock.connect).toHaveBeenCalledWith('wss://livekit.omninudge.com', 'refreshed-token');
    expect(roomMock.connect).toHaveBeenCalledTimes(2);
  });

  it('rejects an untrusted call URL before it can receive camera or microphone permission', async () => {
    vi.mocked(omnichatService.startCall).mockResolvedValue({
      ...call,
      mode: 'video',
      live_video_url: 'wss://attacker.example/call',
      live_video_token: 'short-lived-token',
    });
    vi.mocked(omnichatService.endCall).mockResolvedValue(undefined);
    render(
      <OmniChatCallModal
        persona={persona}
        conversationId={12}
        mode="video"
        onClose={vi.fn()}
        onAssistant={vi.fn()}
      />
    );

    expect(await screen.findByText('Connection needs attention')).toBeInTheDocument();
    expect(screen.queryByTitle('Live avatar video call with Sadie')).not.toBeInTheDocument();
    expect(omnichatService.endCall).toHaveBeenCalledWith('call-1');
  });

  it('accepts only configured secure LiveKit room origins', () => {
    expect(isTrustedOmniChatCallUrl('wss://livekit.omninudge.com/call-1')).toBe(true);
    expect(isTrustedOmniChatCallUrl('wss://attacker.example/call-1')).toBe(false);
    expect(isTrustedOmniChatCallUrl('https://livekit.omninudge.com/call-1')).toBe(false);
    expect(isTrustedOmniChatCallUrl('http://livekit.omninudge.com/call-1')).toBe(false);
    expect(isTrustedOmniChatCallUrl('javascript:alert(1)')).toBe(false);
  });

  // Sending only records the turn now; the reply reaches the modal over the
  // websocket, which the app surfaces as this window event.
  const deliverReply = (message: {
    id: number;
    conversation_id: number;
    role: 'assistant';
    content: string;
    failed: boolean;
    created_at: string;
  }) => {
    window.dispatchEvent(new CustomEvent('omnichat-message-complete', { detail: message }));
  };

  it('uses the avatar worker for video speech without duplicating it in the browser', async () => {
    vi.mocked(omnichatService.startCall).mockResolvedValue({
      ...call,
      mode: 'video',
      live_video_url: 'wss://livekit.omninudge.com',
      live_video_token: 'short-lived-token',
    });
    vi.mocked(omnichatService.sendMessage).mockResolvedValue({ accepted: true });
    render(
      <OmniChatCallModal
        persona={persona}
        conversationId={12}
        mode="video"
        onClose={vi.fn()}
        onAssistant={vi.fn()}
      />
    );
    await waitFor(() => expect(roomMock.connect).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText('Type during call'), { target: { value: 'Hi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send during call' }));
    await waitFor(() => expect(omnichatService.sendMessage).toHaveBeenCalled());
    deliverReply({
      id: 99,
      conversation_id: 12,
      role: 'assistant',
      content: 'Hello from the avatar.',
      failed: false,
      created_at: '',
    });
    await waitFor(() => expect(roomMock.localParticipant.publishData).toHaveBeenCalled());
    expect(speakOmniChatMessage).not.toHaveBeenCalled();
  });

  it('does not start late speech after the user ends a thinking call', async () => {
    vi.mocked(omnichatService.startCall).mockResolvedValue(call);
    vi.mocked(omnichatService.endCall).mockResolvedValue(undefined);
    vi.mocked(omnichatService.sendMessage).mockResolvedValue({ accepted: true });
    const onAssistant = vi.fn();
    render(
      <OmniChatCallModal
        persona={persona}
        conversationId={12}
        mode="video"
        onClose={vi.fn()}
        onAssistant={onAssistant}
      />
    );
    await waitFor(() => expect(omnichatService.startCall).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText('Type during call'), { target: { value: 'Hello' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send during call' }));
    fireEvent.click(screen.getByRole('button', { name: 'End call' }));
    // The reply lands after the call is over, which is the whole point: it must
    // not be spoken into a call the user has already left.
    await act(async () => {
      deliverReply({
        id: 99,
        conversation_id: 12,
        role: 'assistant',
        content: 'Hi',
        failed: false,
        created_at: '',
      });
    });

    expect(onAssistant).not.toHaveBeenCalled();
    expect(speakOmniChatMessage).not.toHaveBeenCalled();
  });

  it('aborts an in-flight AI turn when the user ends the call', async () => {
    vi.mocked(omnichatService.startCall).mockResolvedValue(call);
    vi.mocked(omnichatService.endCall).mockResolvedValue(undefined);
    let requestSignal: AbortSignal | undefined;
    vi.mocked(omnichatService.sendMessage).mockImplementation(
      (_conversationId: number, _content: string, _requestId: string, signal?: AbortSignal) => {
        requestSignal = signal;
        return new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
        });
      }
    );

    render(
      <OmniChatCallModal
        persona={persona}
        conversationId={12}
        mode="video"
        onClose={vi.fn()}
        onAssistant={vi.fn()}
      />
    );
    await waitFor(() => expect(omnichatService.startCall).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText('Type during call'), { target: { value: 'Hello' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send during call' }));
    await waitFor(() => expect(requestSignal).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'End call' }));

    expect(requestSignal?.aborted).toBe(true);
  });

  it('does not expose fake call controls when session creation fails', async () => {
    vi.mocked(omnichatService.startCall).mockRejectedValue(new Error('provider unavailable'));
    render(
      <OmniChatCallModal
        persona={persona}
        conversationId={12}
        mode="video"
        onClose={vi.fn()}
        onAssistant={vi.fn()}
      />
    );

    expect(await screen.findByText('Connection needs attention')).toBeInTheDocument();
    expect(screen.queryByLabelText('Type during call')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Talk' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'End call' })).toBeInTheDocument();
  });

  // A voice call is paid by the minute, so a caller who cannot pay for the first
  // one is offered credits, not told the connection failed.
  it('routes a voice-call 402 to the paywall too', async () => {
    const error = Object.assign(new Error('payment required'), { status: 402 });
    vi.mocked(omnichatService.startCall).mockRejectedValue(error);
    const onPaymentRequired = vi.fn();
    const onClose = vi.fn();

    render(
      <OmniChatCallModal
        persona={persona}
        conversationId={12}
        mode="voice"
        onClose={onClose}
        onAssistant={vi.fn()}
        onPaymentRequired={onPaymentRequired}
      />
    );

    await waitFor(() => expect(onPaymentRequired).toHaveBeenCalledOnce());
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.queryByText('Connection needs attention')).not.toBeInTheDocument();
  });

  it('routes a video-call 402 to the paywall instead of a generic connection error', async () => {
    const error = Object.assign(new Error('payment required'), { status: 402 });
    vi.mocked(omnichatService.startCall).mockRejectedValue(error);
    const onPaymentRequired = vi.fn();
    const onClose = vi.fn();

    render(
      <OmniChatCallModal
        persona={persona}
        conversationId={12}
        mode="video"
        onClose={onClose}
        onAssistant={vi.fn()}
        onPaymentRequired={onPaymentRequired}
      />
    );

    await waitFor(() => expect(onPaymentRequired).toHaveBeenCalledOnce());
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.queryByText('Connection needs attention')).not.toBeInTheDocument();
  });

  // Pressing the phone is what starts a call. Nothing else should have to be
  // pressed to be heard.
  //
  // Reported as "the call starts and I speak but she is not hearing me": the
  // only caller of startListening was the microphone button, so a call sat
  // silently until somebody found and pressed a second control. Three call
  // sessions in the database, every one turn_count 0, and no user message ever
  // written.
  // Pressing the phone is what starts a call. Nothing else should have to be
  // pressed to be heard.
  //
  // Reported as "the call starts and I speak but she is not hearing me": the
  // only caller of startListening was the microphone button, so a call sat
  // silently until somebody found and pressed a second control. Three call
  // sessions in the database, every one turn_count 0, and no user message ever
  // written.
  describe('hands free', () => {
    const getUserMedia = vi.fn();

    class FakeRecorder {
      static instances: FakeRecorder[] = [];
      static isTypeSupported = () => true;
      state = 'inactive';
      mimeType = 'audio/webm';
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      constructor() {
        FakeRecorder.instances.push(this);
      }
      start() {
        this.state = 'recording';
      }
      stop() {
        this.state = 'inactive';
      }
    }

    beforeEach(() => {
      FakeRecorder.instances = [];
      live.handlers = null;
      live.onChunk = null;
      live.onPlaying = null;
      // Configured here rather than inherited. Without it these tests pass
      // only when something earlier in the file has set it, which is a test
      // that proves nothing on its own -- and a control built on one proves
      // less than nothing.
      vi.mocked(omnichatService.endCall).mockResolvedValue(undefined);
      getUserMedia.mockResolvedValue({
        getTracks: () => [{ stop: vi.fn() }],
        getAudioTracks: () => [
          { label: 'Fake input', muted: false, enabled: true, readyState: 'live' },
        ],
      });
      vi.stubGlobal('MediaRecorder', FakeRecorder);
      vi.stubGlobal('navigator', { ...navigator, mediaDevices: { getUserMedia } });
      vi.stubGlobal(
        'AudioContext',
        class {
          state = 'running';
          destination = {};
          resume() {
            return Promise.resolve();
          }
          createAnalyser() {
            return {
              fftSize: 2048,
              getFloatTimeDomainData: () => {},
              connect: () => {},
              disconnect: () => {},
            };
          }
          createMediaStreamSource() {
            return { connect: () => {}, disconnect: () => {} };
          }
          // The silent path that keeps the graph live. A stub without it hid a
          // real call from its own tests.
          createGain() {
            return { gain: { value: 0 }, connect: () => {}, disconnect: () => {} };
          }
          close() {
            return Promise.resolve();
          }
        }
      );
      vi.stubGlobal('requestAnimationFrame', () => 0);
      vi.stubGlobal('cancelAnimationFrame', () => {});
    });
    afterEach(() => vi.unstubAllGlobals());

    // The level meter names the input device it is listening to, which means the
    // RENDER has to see the microphone. It used to read it out of a ref while
    // rendering: a ref changing does not re-render, so that line showed whatever
    // was true at some earlier, unrelated render. Nothing covered this line at
    // all -- the meter had no test of any kind.
    it('names the real input device while listening', async () => {
      vi.mocked(omnichatService.startCall).mockResolvedValue(call);

      const view = render(
        <OmniChatCallModal
          persona={persona}
          conversationId={12}
          mode="voice"
          onClose={vi.fn()}
          onAssistant={vi.fn()}
        />
      );

      const meter = await waitFor(() => screen.getByTestId('omnichat-call-level'));
      // 'Fake input' is the label on the stubbed audio track, and ', live' is
      // its readyState, so this is the microphone that was actually opened
      // rather than the generic fallback wording.
      expect(meter.textContent).toContain('Fake input');
      expect(meter.textContent).not.toContain('no sound from the microphone');
      // The live socket opens after the meter shows. Left open, it closed during
      // whichever test ran next, and one that asserts the socket stays open
      // failed or passed depending on what happened to run between them.
      await waitFor(() => expect(openLiveCallSocket).toHaveBeenCalled());
      view.unmount();
    });

    // She speaks once, not twice.
    //
    const renderVoiceCall = async () => {
      vi.mocked(omnichatService.startCall).mockResolvedValue(call);
      const view = render(
        <OmniChatCallModal
          persona={persona}
          conversationId={12}
          mode="voice"
          onClose={vi.fn()}
          onAssistant={vi.fn()}
        />
      );
      await waitFor(
        () => expect(openLiveCallSocket).toHaveBeenCalledWith('call-1', expect.anything()),
        {
          timeout: 3000,
        }
      );
      await waitFor(() => expect(live.onChunk).not.toBeNull());
      return view;
    };

    const renderVoiceCallWith = async (
      props: Partial<Parameters<typeof OmniChatCallModal>[0]> = {}
    ) => {
      vi.mocked(omnichatService.startCall).mockResolvedValue(call);
      const view = render(
        <OmniChatCallModal
          persona={persona}
          conversationId={12}
          mode="voice"
          onClose={vi.fn()}
          onAssistant={vi.fn()}
          {...props}
        />
      );
      await waitFor(
        () => expect(openLiveCallSocket).toHaveBeenCalledWith('call-1', expect.anything()),
        {
          timeout: 3000,
        }
      );
      await waitFor(() => expect(live.onChunk).not.toBeNull());
      return view;
    };

    // Out of credits is a pause, not a hang-up: her voice stops at once and
    // the credits screen opens over the call.
    it('opens the credits screen over a paused call, and carries on when credits arrive', async () => {
      const onClose = vi.fn();
      const view = await renderVoiceCallWith({ onClose });
      act(() => live.onPlaying?.(true));
      act(() => live.handlers?.onEvent({ type: 'paused' }));

      expect(screen.getByRole('dialog', { name: 'Buy OmniCredits' })).toBeInTheDocument();
      expect(screen.getByText('Paused')).toBeInTheDocument();
      expect(live.player.clear).toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: 'Credits arrived' }));
      expect(live.socket.resume).toHaveBeenCalledOnce();
      expect(onClose).not.toHaveBeenCalled();
      expect(live.socket.close).not.toHaveBeenCalled();

      act(() => live.handlers?.onEvent({ type: 'resumed' }));
      expect(screen.queryByRole('dialog', { name: 'Buy OmniCredits' })).toBeNull();
      expect(screen.getByText('Listening…')).toBeInTheDocument();
      view.unmount();
    });

    it('ends the call when the credits screen is closed', async () => {
      const onClose = vi.fn();
      vi.mocked(omnichatService.endCall).mockResolvedValue(undefined);
      const view = await renderVoiceCallWith({ onClose });
      act(() => live.handlers?.onEvent({ type: 'paused' }));

      // The call screen has its own End call; this is the credits screen's.
      const credits = screen.getByRole('dialog', { name: 'Buy OmniCredits' });
      fireEvent.click(within(credits).getByRole('button', { name: 'End call' }));
      expect(onClose).toHaveBeenCalledOnce();
      expect(omnichatService.endCall).toHaveBeenCalledWith('call-1');
      view.unmount();
    });

    // The call's focus trap listens on the whole document. While paused the
    // keys belong to the credits screen, whose own Escape ends the call once.
    it('leaves the keys to the credits screen while paused', async () => {
      const onClose = vi.fn();
      const view = await renderVoiceCallWith({ onClose });
      act(() => live.handlers?.onEvent({ type: 'paused' }));
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onClose).not.toHaveBeenCalled();
      view.unmount();
    });

    // Pressing the phone is the whole of it: the microphone opens, the live
    // connection opens, and she is heard and heard back with nothing else
    // pressed and nothing recorded, transcribed or sent a turn at a time.
    it('carries a voice call over one live connection', async () => {
      const view = await renderVoiceCall();
      expect(FakeRecorder.instances).toHaveLength(0);
      expect(screen.queryByLabelText('Type during call')).toBeNull();

      const said = new ArrayBuffer(3200);
      act(() => live.onChunk?.(said));
      expect(live.socket.sendAudio).toHaveBeenCalledWith(said);

      const reply = new ArrayBuffer(4800);
      act(() => {
        live.handlers?.onAudio(reply);
        live.onPlaying?.(true);
      });
      expect(live.player.enqueue).toHaveBeenCalledWith(reply);
      expect(screen.getByText('Speaking')).toBeInTheDocument();

      act(() => {
        live.handlers?.onEvent({ type: 'heard', text: 'Wait, ' });
        live.handlers?.onEvent({ type: 'heard', text: 'hold on' });
      });
      expect(screen.getByText('“Wait, hold on”')).toBeInTheDocument();
      act(() => live.handlers?.onEvent({ type: 'interrupted' }));
      expect(live.player.clear).toHaveBeenCalled();

      view.unmount();
      expect(live.socket.close).toHaveBeenCalled();
      expect(live.capture.stop).toHaveBeenCalled();
    });

    // Muting on a phone call is for when she is talking as much as when she
    // is not. The turn-based button was disabled while she spoke.
    it('mutes what goes out, even while she is speaking', async () => {
      const view = await renderVoiceCall();
      act(() => live.onPlaying?.(true));

      fireEvent.click(screen.getByRole('button', { name: 'Mute the microphone' }));
      act(() => live.onChunk?.(new ArrayBuffer(3200)));
      expect(live.socket.sendAudio).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: 'Unmute the microphone' }));
      act(() => live.onChunk?.(new ArrayBuffer(3200)));
      expect(live.socket.sendAudio).toHaveBeenCalledTimes(1);
      view.unmount();
    });

    // Development runs under StrictMode, which invokes an effect, cleans it up
    // and invokes it again. A connection closed in that cleanup is a hang-up to
    // the server, and the server ends the call on a hang-up.
    it('keeps one live connection under StrictMode', async () => {
      vi.mocked(omnichatService.startCall).mockResolvedValue(call);
      const view = render(
        <StrictMode>
          <OmniChatCallModal
            persona={persona}
            conversationId={12}
            mode="voice"
            onClose={vi.fn()}
            onAssistant={vi.fn()}
          />
        </StrictMode>
      );
      await waitFor(() => expect(openLiveCallSocket).toHaveBeenCalled(), { timeout: 3000 });
      await waitFor(() => expect(live.onChunk).not.toBeNull());
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(openLiveCallSocket).toHaveBeenCalledTimes(1);
      expect(live.socket.close).not.toHaveBeenCalled();
      view.unmount();
    });

    it('says the call dropped when the server ends it', async () => {
      const view = await renderVoiceCall();
      act(() => live.handlers?.onClose({ code: 1011, reason: 'The call dropped', clean: true }));
      expect(screen.getByRole('alert')).toHaveTextContent(/call dropped/i);
      view.unmount();
    });

    // Reported as "it asks me for microphone permission every time". Opening
    // the microphone per sentence prompts per sentence, which no other site
    // does -- and every utterance waited on a dialog instead of recording.
    it('asks for the microphone once for the whole call, not once per sentence', async () => {
      vi.mocked(omnichatService.startCall).mockResolvedValue(call);
      const view = render(
        <OmniChatCallModal
          persona={persona}
          conversationId={12}
          mode="video"
          onClose={vi.fn()}
          onAssistant={vi.fn()}
        />
      );

      await waitFor(() => expect(getUserMedia).toHaveBeenCalled(), { timeout: 3000 });
      await waitFor(() => expect(FakeRecorder.instances.length).toBeGreaterThan(0), {
        timeout: 3000,
      });
      // A second listening cycle: the recorder is made again, the microphone
      // is not asked for again.
      await act(async () => {
        FakeRecorder.instances[0].onstop?.();
      });
      await new Promise((resolve) => setTimeout(resolve, 700));

      expect(getUserMedia).toHaveBeenCalledTimes(1);
      view.unmount();
    });

    // One start per press of the phone.
    //
    // The effect is invoked twice in development on purpose, and each
    // invocation started a call: two sessions milliseconds apart in the
    // database, every attempt, spending two of the ten hourly starts on one
    // press. It was visible three separate times before it was read as a bug,
    // and it is what eventually exhausted the limit and made the call fail
    // with an error about the connection.
    it('starts the call once even when the effect runs twice', async () => {
      vi.mocked(omnichatService.startCall).mockResolvedValue(call);
      const view = render(
        <OmniChatCallModal
          persona={persona}
          conversationId={12}
          mode="voice"
          onClose={vi.fn()}
          onAssistant={vi.fn()}
        />
      );

      await waitFor(() => expect(omnichatService.startCall).toHaveBeenCalled());
      // The second invocation React makes in development must not start another.
      view.rerender(
        <OmniChatCallModal
          persona={persona}
          conversationId={12}
          mode="voice"
          onClose={vi.fn()}
          onAssistant={vi.fn()}
        />
      );
      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(omnichatService.startCall).toHaveBeenCalledTimes(1);
      view.unmount();
    });

    // The guard remembers which call it started, not merely that it did.
    //
    // Tied to the mount, it blocks the effect's own re-runs: change the
    // conversation or the mode and the effect fires again, finds the flag set,
    // and starts nothing at all -- silently, for as long as the modal stays
    // open.
    it('starts a new call when the conversation changes', async () => {
      vi.mocked(omnichatService.startCall).mockResolvedValue(call);
      const view = render(
        <OmniChatCallModal
          persona={persona}
          conversationId={12}
          mode="voice"
          onClose={vi.fn()}
          onAssistant={vi.fn()}
        />
      );
      await waitFor(() => expect(omnichatService.startCall).toHaveBeenCalledTimes(1));

      view.rerender(
        <OmniChatCallModal
          persona={persona}
          conversationId={13}
          mode="voice"
          onClose={vi.fn()}
          onAssistant={vi.fn()}
        />
      );

      await waitFor(() => expect(omnichatService.startCall).toHaveBeenCalledTimes(2), {
        timeout: 3000,
      });
      expect(vi.mocked(omnichatService.startCall).mock.calls[1][0]).toBe(13);
      view.unmount();
    });

    // Under StrictMode, which is what production development actually runs.
    //
    // The log said it exactly: POST /calls 201, then DELETE that same call
    // milliseconds later, then nothing. The cleanup between the two effect
    // invocations marked the modal closed and moved the epoch on, so the call
    // arrived looking stale and was torn down -- the screen stayed on
    // Connecting and the end button did nothing, because it returns early when
    // the modal is marked closed.
    it('keeps the call it started when the effect is invoked twice', async () => {
      vi.mocked(omnichatService.startCall).mockResolvedValue(call);
      const view = render(
        <StrictMode>
          <OmniChatCallModal
            persona={persona}
            conversationId={12}
            mode="voice"
            onClose={vi.fn()}
            onAssistant={vi.fn()}
          />
        </StrictMode>
      );

      await waitFor(() => expect(omnichatService.startCall).toHaveBeenCalledTimes(1));
      // Long enough for the start to resolve and be torn down if it were going
      // to be.
      await new Promise((resolve) => setTimeout(resolve, 400));

      expect(omnichatService.endCall).not.toHaveBeenCalled();
      // And it left Connecting, which is the thing that was reported.
      expect(screen.queryByText(/connecting/i)).toBeNull();
      view.unmount();
    });

    // A rate limit is not a connection problem, and saying so sends whoever
    // reads it to the wrong place. It cost an evening once.
    it('says a rate limit is a rate limit', async () => {
      const refused = Object.assign(new Error('too many'), { status: 429 });
      vi.mocked(omnichatService.startCall).mockRejectedValue(refused);
      const view = render(
        <OmniChatCallModal
          persona={persona}
          conversationId={12}
          mode="voice"
          onClose={vi.fn()}
          onAssistant={vi.fn()}
        />
      );

      await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/too many calls/i), {
        timeout: 3000,
      });
      expect(screen.queryByText(/could not be connected/i)).toBeNull();
      view.unmount();
    });

    // A browser that cannot record says so instead of listening forever. This
    // is the whole complaint the recorder replaced: a call that holds the
    // microphone and never answers.
    it('says so when the browser cannot record at all', async () => {
      vi.stubGlobal('MediaRecorder', undefined);
      vi.mocked(omnichatService.startCall).mockResolvedValue(call);
      const view = render(
        <OmniChatCallModal
          persona={persona}
          conversationId={12}
          mode="voice"
          onClose={vi.fn()}
          onAssistant={vi.fn()}
        />
      );

      await waitFor(
        () =>
          expect(screen.getByTestId('omnichat-call-listening-notice')).toHaveTextContent(
            /cannot record audio/i
          ),
        { timeout: 3000 }
      );
      expect(getUserMedia).not.toHaveBeenCalled();
      view.unmount();
    });
  });
});
