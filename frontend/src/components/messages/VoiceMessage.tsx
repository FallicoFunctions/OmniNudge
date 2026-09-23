import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { Message } from '../../types/messages';
import { voiceMessagesService } from '../../services/voiceMessagesService';
import { useDecryptedMedia } from '../../hooks/useDecryptedMedia';
import { waveformOf } from '../../utils/waveform';
import { VoiceMessageBubble } from './VoiceMessageBubble';

/**
 * A voice message in a conversation.
 *
 * Nothing loaded a message's recording before this: the bubble was only drawn
 * for a voice_message field no response ever carried, so no voice message could
 * be played. An encrypted recording is decrypted on this device, which draws its
 * waveform too -- the server cannot read the audio to draw one.
 */
export function VoiceMessage({ message, isOwn }: { message: Message; isOwn: boolean }) {
  const { t } = useTranslation();
  const { data: voice, isError } = useQuery({
    queryKey: ['voice-message', message.id],
    queryFn: () => voiceMessagesService.getVoiceMessage(message.id),
    staleTime: Infinity,
  });

  const encrypted = Boolean(message.media_encryption_key);
  const opened = useDecryptedMedia(
    { ...message, media_url: encrypted ? voice?.signed_url : undefined },
    isOwn,
    { mimeType: voice?.mime_type }
  );
  // A recording that could not be opened comes back as its stored URL, which
  // is ciphertext; only a blob is the decrypted audio.
  const decrypted = opened?.startsWith('blob:') ? opened : null;

  const [waveform, setWaveform] = useState<number[] | null>(null);
  useEffect(() => {
    if (!decrypted) return;
    let current = true;
    fetch(decrypted)
      .then((response) => response.blob())
      .then(waveformOf)
      .then((bars) => {
        if (current) setWaveform(bars);
      })
      .catch((error: unknown) => console.warn('Could not draw this voice waveform:', error));
    return () => {
      current = false;
    };
  }, [decrypted]);

  const status = (text: string) => (
    <div className="text-xs text-[var(--color-text-secondary)]">{text}</div>
  );
  if (isError || (encrypted && opened && !decrypted)) return status(t('voice.playbackError'));
  if (!voice || (encrypted && !decrypted)) return status(t('voice.processing'));

  return (
    <VoiceMessageBubble
      voiceMessage={
        encrypted ? { ...voice, signed_url: decrypted!, waveform_data: waveform } : voice
      }
      isOwn={isOwn}
    />
  );
}
