import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import OmniChatCallModal, { isTrustedOmniChatCallUrl } from '../OmniChatCallModal';
import { omnichatService } from '../../../services/omnichatService';
import { speakOmniChatMessage } from '../OmniChatSpeakButton';
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
  RoomEvent: { TrackSubscribed: 'trackSubscribed', TrackUnsubscribed: 'trackUnsubscribed', Disconnected: 'disconnected' },
  Track: { Kind: { Video: 'video', Audio: 'audio' } },
}));

vi.mock('../../../services/omnichatService', () => ({
  createOmniChatRequestId: () => '123e4567-e89b-42d3-a456-426614174000',
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
    await waitFor(() => expect(roomMock.connect).toHaveBeenCalledWith('wss://livekit.omninudge.com', 'short-lived-token'));
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
    expect(roomMock.connect).toHaveBeenCalledWith('wss://livekit.omninudge.com', 'short-lived-token');
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

  it('uses the avatar worker for video speech without duplicating it in the browser', async () => {
    vi.mocked(omnichatService.startCall).mockResolvedValue({
      ...call,
      mode: 'video',
      live_video_url: 'wss://livekit.omninudge.com',
      live_video_token: 'short-lived-token',
    });
    vi.mocked(omnichatService.sendMessage).mockResolvedValue({
      id: 99,
      conversation_id: 12,
      role: 'assistant',
      content: 'Hello from the avatar.',
      failed: false,
      created_at: '',
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
    await waitFor(() => expect(roomMock.connect).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText('Type during call'), { target: { value: 'Hi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send during call' }));
    await waitFor(() => expect(roomMock.localParticipant.publishData).toHaveBeenCalled());
    expect(speakOmniChatMessage).not.toHaveBeenCalled();
  });

  it('does not start late speech after the user ends a thinking call', async () => {
    vi.mocked(omnichatService.startCall).mockResolvedValue(call);
    vi.mocked(omnichatService.endCall).mockResolvedValue(undefined);
    let resolveMessage!: (message: {
      id: number;
      conversation_id: number;
      role: 'assistant';
      content: string;
      failed: boolean;
      created_at: string;
    }) => void;
    vi.mocked(omnichatService.sendMessage).mockReturnValue(
      new Promise((resolve) => {
        resolveMessage = resolve;
      })
    );
    const onAssistant = vi.fn();
    render(
      <OmniChatCallModal
        persona={persona}
        conversationId={12}
        mode="voice"
        onClose={vi.fn()}
        onAssistant={onAssistant}
      />
    );
    await waitFor(() => expect(omnichatService.startCall).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText('Type during call'), { target: { value: 'Hello' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send during call' }));
    fireEvent.click(screen.getByRole('button', { name: 'End call' }));
    await act(async () =>
      resolveMessage({
        id: 99,
        conversation_id: 12,
        role: 'assistant',
        content: 'Hi',
        failed: false,
        created_at: '',
      })
    );

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
        mode="voice"
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
});
