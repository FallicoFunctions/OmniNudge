/**
 * A voice message in a conversation. Nothing loaded a recording before this --
 * the bubble waited for a field no response ever carried -- so no voice message
 * could be played. An encrypted one is played and drawn from the recording this
 * device decrypted, never from the stored ciphertext.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Message, VoiceMessage as VoiceRecord } from '../../../types/messages';
import { VoiceMessage } from '../VoiceMessage';
import { voiceMessagesService } from '../../../services/voiceMessagesService';
import { useDecryptedMedia } from '../../../hooks/useDecryptedMedia';

const seen = vi.hoisted(() => ({
  bubble: null as null | { signed_url: string; waveform_data: number[] | null },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('../../../services/voiceMessagesService', () => ({
  voiceMessagesService: { getVoiceMessage: vi.fn() },
}));
vi.mock('../../../hooks/useDecryptedMedia', () => ({ useDecryptedMedia: vi.fn() }));
vi.mock('../../../utils/waveform', () => ({ waveformOf: vi.fn(async () => [0.2, 0.8]) }));
vi.mock('../VoiceMessageBubble', () => ({
  VoiceMessageBubble: ({ voiceMessage }: { voiceMessage: VoiceRecord }) => {
    seen.bubble = voiceMessage;
    return <div>voice bubble</div>;
  },
}));

const record: VoiceRecord = {
  id: 5,
  message_id: 40,
  duration_seconds: 3,
  waveform_data: [0.5],
  transcription: null,
  signed_url: 'http://localhost:8080/api/v1/voice/5/download',
  mime_type: 'audio/webm',
  file_size: 400,
};
const audioMessage = (over: Partial<Message> = {}) =>
  ({ id: 40, conversation_id: 31, sender_id: 7, message_type: 'audio', ...over }) as Message;
const sealed = { media_encryption_key: 'SEALED', media_encryption_iv: 'IV' };

// The app's own default (main.tsx): one retry, about a second later.
const show = (message: Message) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: 1 } } })}>
      <VoiceMessage message={message} isOwn={false} />
    </QueryClientProvider>
  );

beforeEach(() => {
  vi.clearAllMocks();
  seen.bubble = null;
  vi.mocked(voiceMessagesService.getVoiceMessage).mockResolvedValue(record);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(new Blob(['audio'])))
  );
});

describe('VoiceMessage', () => {
  it('loads the recording of its own message', async () => {
    vi.mocked(useDecryptedMedia).mockReturnValue(null);
    show(audioMessage());
    expect(await screen.findByText('voice bubble')).toBeInTheDocument();
    expect(voiceMessagesService.getVoiceMessage).toHaveBeenCalledWith(40);
  });

  it('plays a plain recording from the server, with the server-drawn waveform', async () => {
    vi.mocked(useDecryptedMedia).mockReturnValue(null);
    show(audioMessage());
    await screen.findByText('voice bubble');
    expect(seen.bubble).toMatchObject({ signed_url: record.signed_url, waveform_data: [0.5] });
  });

  it('decrypts an encrypted recording, as its own audio type, and plays and draws that', async () => {
    vi.mocked(useDecryptedMedia).mockImplementation((message) =>
      message.media_url ? 'blob:decrypted' : null
    );
    show(audioMessage(sealed));
    await screen.findByText('voice bubble');
    await waitFor(() => expect(seen.bubble?.waveform_data).toEqual([0.2, 0.8]));

    const [asked, , options] = vi.mocked(useDecryptedMedia).mock.calls.at(-1)!;
    expect(asked.media_url).toBe(record.signed_url);
    expect(options).toEqual({ mimeType: 'audio/webm' });
    expect(seen.bubble?.signed_url).toBe('blob:decrypted');
  });

  it('never hands the player the ciphertext when the recording cannot be opened', async () => {
    vi.mocked(useDecryptedMedia).mockImplementation((message) => message.media_url ?? null);
    show(audioMessage(sealed));
    expect(await screen.findByText('voice.playbackError')).toBeInTheDocument();
    expect(seen.bubble).toBeNull();
  });
});

// The audio message exists, and is broadcast, before its recording is uploaded
// -- sealing, the upload and the server's virus scan all come after -- so the
// first loads of a new voice message answer 404. With the app's single retry it
// settled on "could not play" and never asked again.
describe('a voice message whose recording is still being uploaded', () => {
  const notYet = () => Object.assign(new Error('Voice message not found'), { status: 404 });

  it('waits for the recording instead of giving up', async () => {
    vi.mocked(useDecryptedMedia).mockReturnValue(null);
    vi.mocked(voiceMessagesService.getVoiceMessage)
      .mockRejectedValueOnce(notYet())
      .mockRejectedValueOnce(notYet())
      .mockRejectedValueOnce(notYet())
      .mockResolvedValue(record);

    show(audioMessage());
    expect(await screen.findByText('voice.processing')).toBeInTheDocument();
    expect(await screen.findByText('voice bubble', {}, { timeout: 8000 })).toBeInTheDocument();
  }, 10000);

  it('does not wait on a refusal that will not change', async () => {
    vi.mocked(useDecryptedMedia).mockReturnValue(null);
    vi.mocked(voiceMessagesService.getVoiceMessage).mockRejectedValue(
      Object.assign(new Error('Forbidden'), { status: 403 })
    );

    show(audioMessage());
    expect(await screen.findByText('voice.playbackError')).toBeInTheDocument();
    expect(voiceMessagesService.getVoiceMessage).toHaveBeenCalledTimes(1);
  });
});
