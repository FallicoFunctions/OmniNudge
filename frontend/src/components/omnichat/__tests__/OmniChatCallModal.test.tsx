import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import OmniChatCallModal, { isTrustedOmniChatCallUrl } from '../OmniChatCallModal';
import { omnichatService } from '../../../services/omnichatService';
import { speakOmniChatMessage } from '../OmniChatSpeakButton';
import type { BotPersona, OmniChatCallSession } from '../../../types/omnichat';

vi.mock('../../../services/omnichatService', () => ({
  omnichatService: {
    startCall: vi.fn(),
    endCall: vi.fn(),
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
  afterEach(() => vi.clearAllMocks());

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

  it('embeds a private realtime avatar room for provider-backed video calls', async () => {
    vi.mocked(omnichatService.startCall).mockResolvedValue({
      ...call,
      mode: 'video',
      live_video_url: 'https://room.daily.co/call-1?t=short-lived-token',
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

    const frame = await screen.findByTitle('Live avatar video call with Sadie');
    expect(frame).toHaveAttribute('src', 'https://room.daily.co/call-1?t=short-lived-token');
    expect(frame).toHaveAttribute('allow', expect.stringContaining('camera'));
    expect(screen.queryByLabelText('Type during call')).not.toBeInTheDocument();
  });

  it('rejects a non-Daily call URL before it can receive camera or microphone permission', async () => {
    vi.mocked(omnichatService.startCall).mockResolvedValue({
      ...call,
      mode: 'video',
      live_video_url: 'https://attacker.example/call',
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

  it('accepts only HTTPS Daily room origins', () => {
    expect(isTrustedOmniChatCallUrl('https://room.daily.co/call-1')).toBe(true);
    expect(isTrustedOmniChatCallUrl('https://daily.co.evil.example/call-1')).toBe(false);
    expect(isTrustedOmniChatCallUrl('http://room.daily.co/call-1')).toBe(false);
    expect(isTrustedOmniChatCallUrl('javascript:alert(1)')).toBe(false);
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
});
