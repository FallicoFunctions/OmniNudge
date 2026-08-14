import { useState } from 'react';
import { Loader2, Square, Volume2 } from 'lucide-react';
import { omnichatService } from '../../services/omnichatService';
import type { OmniChatPersonaVoice } from '../../types/omnichat';

let activeAudio: HTMLAudioElement | null = null;
let activeAudioCleanup: (() => void) | null = null;
let activeBrowserCleanup: (() => void) | null = null;
let speechRequestVersion = 0;

export function stopOmniChatSpeech() {
  speechRequestVersion += 1;
  window.speechSynthesis?.cancel();
  activeBrowserCleanup?.();
  if (activeAudio) {
    activeAudio.pause();
    activeAudio.currentTime = 0;
  }
  activeAudioCleanup?.();
}

function speakWithBrowser(
  text: string,
  profile: OmniChatPersonaVoice,
  onState: (speaking: boolean) => void
) {
  if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
    throw new Error('Speech synthesis is unavailable in this browser');
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = profile.speed;
  utterance.pitch = profile.pitch;
  if (profile.language_code) utterance.lang = profile.language_code;
  const voices = window.speechSynthesis.getVoices();
  if (voices.length > 0) {
    const preset = Number(profile.voice_id.replace('browser-', '')) || 0;
    utterance.voice = voices[preset % voices.length];
  }
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    if (activeBrowserCleanup === cleanup) activeBrowserCleanup = null;
    onState(false);
  };
  activeBrowserCleanup = cleanup;
  utterance.onend = cleanup;
  utterance.onerror = cleanup;
  onState(true);
  window.speechSynthesis.speak(utterance);
}

export async function speakOmniChatMessage({
  personaId,
  conversationId,
  messageId,
  text,
  onState,
}: {
  personaId: number;
  conversationId: number;
  messageId: number;
  text: string;
  onState: (speaking: boolean) => void;
}) {
  stopOmniChatSpeech();
  const requestVersion = speechRequestVersion;
  const profile = await omnichatService.getPersonaVoice(personaId);
  if (requestVersion !== speechRequestVersion) return;
  if (profile.provider === 'browser') {
    speakWithBrowser(text, profile, onState);
    return;
  }
  const blob = await omnichatService.getMessageSpeech(conversationId, messageId);
  if (requestVersion !== speechRequestVersion) return;
  const objectUrl = URL.createObjectURL(blob);
  const audio = new Audio(objectUrl);
  activeAudio = audio;
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    URL.revokeObjectURL(objectUrl);
    if (activeAudio === audio) activeAudio = null;
    if (activeAudioCleanup === cleanup) activeAudioCleanup = null;
    onState(false);
  };
  activeAudioCleanup = cleanup;
  audio.onended = cleanup;
  audio.onerror = cleanup;
  onState(true);
  try {
    await audio.play();
  } catch (error) {
    cleanup();
    throw error;
  }
}

export default function OmniChatSpeakButton({
  personaId,
  conversationId,
  messageId,
  text,
}: {
  personaId: number;
  conversationId: number;
  messageId: number;
  text: string;
}) {
  const [loading, setLoading] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState(false);
  const play = async () => {
    if (speaking) {
      stopOmniChatSpeech();
      setSpeaking(false);
      return;
    }
    setLoading(true);
    setError(false);
    try {
      await speakOmniChatMessage({
        personaId,
        conversationId,
        messageId,
        text,
        onState: setSpeaking,
      });
    } catch {
      setError(true);
      setSpeaking(false);
    } finally {
      setLoading(false);
    }
  };
  return (
    <button
      type="button"
      onClick={() => void play()}
      aria-label={speaking ? 'Stop reading' : 'Read aloud'}
      title={error ? 'Character voice unavailable' : speaking ? 'Stop reading' : 'Read aloud'}
      className={`flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-[#24242a] transition hover:text-white ${error ? 'text-rose-300' : 'text-white/55'}`}
    >
      {loading ? (
        <Loader2 size={13} className="animate-spin" />
      ) : speaking ? (
        <Square size={11} fill="currentColor" />
      ) : (
        <Volume2 size={14} />
      )}
    </button>
  );
}
