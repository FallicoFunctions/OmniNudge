/**
 * Records one spoken utterance and stops when the speaking stops.
 *
 * This replaces the browser's SpeechRecognition, which cannot be relied on: in
 * Chromium browsers other than Chrome it holds the microphone and never
 * answers, because the service behind it is keyed to Chrome, and in Safari it
 * needs macOS Dictation switched on. Neither is something to ask somebody to
 * configure before making a phone call.
 *
 * MediaRecorder is on every browser and needs only the microphone permission
 * the call already prompts for. The words are worked out on the server.
 */

/** Below this, the microphone is hearing a room rather than a voice. */
const SILENCE_THRESHOLD = 0.012;
/** Silence this long ends an utterance. Long enough to think mid-sentence. */
const SILENCE_MS = 1400;
/** Nobody is allowed to hold the line open forever. */
const MAX_UTTERANCE_MS = 30_000;
/** Below this there is no utterance, only a button press. */
const MIN_SPEECH_MS = 350;

export type RecorderHandle = {
  /** Stops early. Whatever was captured is still delivered. */
  stop: () => void;
  /** Abandons the recording and releases the microphone. */
  cancel: () => void;
};

export type RecorderCallbacks = {
  /** The recording, once speech has been heard and has stopped. */
  onUtterance: (recording: Blob) => void;
  /** Nothing was said, or nothing could be recorded. */
  onNothingHeard: (reason: string) => void;
  /** Fires once the microphone is live, so the UI can say "listening". */
  onListening?: () => void;
};

/**
 * Picks a container this browser can actually produce.
 *
 * Chrome and Firefox give webm/opus, Safari gives mp4/aac. The server accepts
 * whatever arrives and normalises it, so the only job here is to name
 * something the browser will not refuse.
 */
function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  for (const candidate of [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ]) {
    if (MediaRecorder.isTypeSupported?.(candidate)) return candidate;
  }
  return undefined;
}

export function browserCanRecord(): boolean {
  return (
    typeof MediaRecorder !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  );
}

/**
 * Starts listening and resolves with a handle for stopping.
 *
 * Exactly one of onUtterance or onNothingHeard is called, once. Everything is
 * released either way: a call that leaves a microphone open is a call that
 * leaves the browser's recording indicator on after it ends.
 */
export async function recordUtterance(callbacks: RecorderCallbacks): Promise<RecorderHandle> {
  if (!browserCanRecord()) {
    callbacks.onNothingHeard('This browser cannot record audio. You can type instead.');
    return { stop: () => {}, cancel: () => {} };
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch {
    callbacks.onNothingHeard(
      'The microphone is not available. Allow microphone access for this site, then try again.'
    );
    return { stop: () => {}, cancel: () => {} };
  }

  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks: Blob[] = [];
  let heardSpeech = false;
  let speechStartedAt = 0;
  let finished = false;
  // One holder, because release() closes over these before either is set and
  // a timer assigned exactly once is not a variable worth reassigning.
  const timers: { silence?: number; maximum?: number } = {};
  let frame = 0;

  const audioContext = new AudioContext();
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 2048;
  audioContext.createMediaStreamSource(stream).connect(analyser);
  const samples = new Float32Array(analyser.fftSize);

  const release = () => {
    window.clearTimeout(timers.silence);
    window.clearTimeout(timers.maximum);
    cancelAnimationFrame(frame);
    stream.getTracks().forEach((track) => track.stop());
    void audioContext.close().catch(() => undefined);
  };

  const finish = (deliver: boolean) => {
    if (finished) return;
    finished = true;
    release();
    if (recorder.state !== 'inactive') recorder.stop();
    if (!deliver) return;
    const spokenFor = speechStartedAt ? Date.now() - speechStartedAt : 0;
    if (!heardSpeech || spokenFor < MIN_SPEECH_MS) {
      callbacks.onNothingHeard("I didn't catch that.");
      return;
    }
    // The chunks arrive on the recorder's own stop event, so delivery waits
    // for that rather than for this call.
  };

  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) chunks.push(event.data);
  };
  recorder.onstop = () => {
    const spokenFor = speechStartedAt ? Date.now() - speechStartedAt : 0;
    if (!heardSpeech || spokenFor < MIN_SPEECH_MS || chunks.length === 0) {
      callbacks.onNothingHeard("I didn't catch that.");
      return;
    }
    callbacks.onUtterance(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }));
  };

  // Loudness, measured rather than guessed. An utterance ends when the room
  // goes quiet for long enough, which is what makes this hands free.
  const watchLevel = () => {
    if (finished) return;
    analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    for (const sample of samples) sum += sample * sample;
    const level = Math.sqrt(sum / samples.length);

    if (level > SILENCE_THRESHOLD) {
      if (!heardSpeech) {
        heardSpeech = true;
        speechStartedAt = Date.now();
      }
      window.clearTimeout(timers.silence);
      timers.silence = window.setTimeout(() => finish(true), SILENCE_MS);
    }
    frame = requestAnimationFrame(watchLevel);
  };

  recorder.start();
  callbacks.onListening?.();
  frame = requestAnimationFrame(watchLevel);
  timers.maximum = window.setTimeout(() => finish(true), MAX_UTTERANCE_MS);

  return {
    stop: () => finish(true),
    cancel: () => {
      if (finished) return;
      finished = true;
      release();
      // Silence the delivery handler before stopping, so cancelling never
      // reports an utterance nobody asked for.
      recorder.onstop = null;
      if (recorder.state !== 'inactive') recorder.stop();
    },
  };
}
