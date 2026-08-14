import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OmniChatSpeakButton, {
  speakOmniChatMessage,
  stopOmniChatSpeech,
} from '../OmniChatSpeakButton';
import { omnichatService } from '../../../services/omnichatService';

vi.mock('../../../services/omnichatService', () => ({
  omnichatService: { getPersonaVoice: vi.fn(), getMessageSpeech: vi.fn() },
}));

describe('OmniChatSpeakButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(omnichatService.getPersonaVoice).mockResolvedValue({
      persona_id: 42,
      provider: 'browser',
      voice_id: 'browser-2',
      voice_name: 'Character voice 3',
      model_id: 'browser-native',
      stability: 0.5,
      similarity_boost: 0.75,
      style: 0,
      speed: 1,
      pitch: 1.1,
      active: true,
    });
    class Utterance {
      text: string;
      rate = 1;
      pitch = 1;
      voice: SpeechSynthesisVoice | null = null;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(text: string) {
        this.text = text;
      }
    }
    vi.stubGlobal('SpeechSynthesisUtterance', Utterance);
    vi.stubGlobal('speechSynthesis', {
      cancel: vi.fn(),
      speak: vi.fn((utterance: Utterance) => utterance.onend?.()),
      getVoices: vi.fn(() => []),
    });
  });

  it('reads an assistant message with its character voice profile', async () => {
    render(
      <OmniChatSpeakButton
        personaId={42}
        conversationId={7}
        messageId={11}
        text="Meet me at the park."
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Read aloud' }));
    await waitFor(() => expect(window.speechSynthesis.speak).toHaveBeenCalled());
    expect(omnichatService.getPersonaVoice).toHaveBeenCalledWith(42);
  });

  it('releases provider audio when browser playback is rejected', async () => {
    vi.mocked(omnichatService.getPersonaVoice).mockResolvedValue({
      persona_id: 42,
      provider: 'elevenlabs',
      voice_id: 'voice-42',
      voice_name: 'Sadie',
      model_id: 'eleven_multilingual_v2',
      stability: 0.5,
      similarity_boost: 0.75,
      style: 0,
      speed: 1,
      pitch: 1,
      active: true,
    });
    vi.mocked(omnichatService.getMessageSpeech).mockResolvedValue(
      new Blob(['mp3'], { type: 'audio/mpeg' })
    );
    const revoke = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:speech'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revoke });
    class RejectedAudio {
      onended: (() => void) | null = null;
      onerror: (() => void) | null = null;
      currentTime = 0;
      pause = vi.fn();
      play = vi.fn(() => Promise.reject(new Error('autoplay blocked')));
    }
    vi.stubGlobal('Audio', RejectedAudio);
    const onState = vi.fn();

    await expect(
      speakOmniChatMessage({
        personaId: 42,
        conversationId: 7,
        messageId: 11,
        text: 'Hello',
        onState,
      })
    ).rejects.toThrow('autoplay blocked');
    expect(revoke).toHaveBeenCalledWith('blob:speech');
    expect(onState).toHaveBeenLastCalledWith(false);
  });

  it('clears the active browser voice state when speech is stopped externally', async () => {
    vi.mocked(window.speechSynthesis.speak).mockImplementation(() => undefined);
    const onState = vi.fn();
    await speakOmniChatMessage({
      personaId: 42,
      conversationId: 7,
      messageId: 11,
      text: 'Hello',
      onState,
    });
    expect(onState).toHaveBeenLastCalledWith(true);

    stopOmniChatSpeech();

    expect(onState).toHaveBeenLastCalledWith(false);
  });
});
