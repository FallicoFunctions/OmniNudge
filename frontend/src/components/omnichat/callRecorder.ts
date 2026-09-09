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
/**
 * Says which kind of nothing was heard.
 *
 * A quiet room, an analyser reading silence while somebody talks, and a
 * recorder producing no data are three different faults with one appearance,
 * and three attempts were spent guessing between them. The numbers are ugly in
 * a call window and worth it: they name the fault in one reading.
 */
export function describeSilence(peak: number, chunks: number, contextState: string): string {
  if (contextState !== 'running') {
    return `The microphone could not be measured (audio ${contextState}). Reload the page and try the call again.`;
  }
  if (chunks === 0) {
    return 'The recorder produced no audio. Reload the page and try the call again.';
  }
  if (peak < SILENCE_THRESHOLD / 4) {
    return `I heard nothing at all (peak ${peak.toFixed(4)}). Check the input device the browser is using.`;
  }
  if (peak < SILENCE_THRESHOLD) {
    return `That was too quiet to make out (peak ${peak.toFixed(4)}). Try speaking a little louder.`;
  }
  return "I didn't catch that.";
}

/**
 * The microphone, held open for a whole call.
 *
 * Asking for it per sentence prompts for permission per sentence, which no
 * other site does and which is the behaviour that was reported. It is also
 * slower and more fragile: every utterance waited on a dialog instead of
 * recording.
 */
export type CallMicrophone = {
  stream: MediaStream;
  /**
   * Plays her voice through the call's own audio graph.
   *
   * A fresh Audio element is refused by Safari once the click that started the
   * call is no longer recent user activation -- and by the time she has been
   * transcribed, answered and synthesised, it is not. This context was created
   * and resumed while the call was starting, so it is already allowed to make
   * sound, and it stays allowed for the whole call.
   */
  play: (audio: Blob) => Promise<void>;
  /** Live loudness, so a caller can see they are being heard immediately. */
  level: () => number;
  /** Which input the browser actually opened, for when the level stays flat. */
  describeInput: () => string;
  release: () => void;
};

/** Opens the microphone once. The caller keeps it until the call ends. */
export async function openMicrophone(): Promise<CallMicrophone | string> {
  if (!browserCanRecord()) {
    return 'This browser cannot record audio. You can type instead.';
  }
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch {
    return 'The microphone is not available. Allow microphone access for this site, then try again.';
  }

  const audioContext = new AudioContext();
  // Created after an await, so the gesture that opened the call may be out of
  // scope -- Safari starts a context suspended in that case, and a suspended
  // analyser reads pure silence however loudly anybody talks.
  if (audioContext.state === 'suspended') {
    await audioContext.resume().catch(() => undefined);
  }
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 2048;

  // The source node is kept, and that is the whole point of this line.
  //
  // Written as createMediaStreamSource(stream).connect(analyser) it has no
  // JavaScript reference, and WebKit collects it -- after which the analyser
  // reads exactly zero for ever while the context still reports "running".
  // That is indistinguishable from a silent room and is what a call looked
  // like: listening, meter flat, nothing ever heard.
  const source = audioContext.createMediaStreamSource(stream);
  source.connect(analyser);

  // An analyser on a graph that reaches no destination is not guaranteed to be
  // pulled. Silence is routed to the speakers so the graph is live, at a gain
  // of zero so nobody hears their own microphone.
  const silent = audioContext.createGain();
  silent.gain.value = 0;
  analyser.connect(silent);
  silent.connect(audioContext.destination);

  const samples = new Float32Array(analyser.fftSize);

  let playing: AudioBufferSourceNode | null = null;

  return {
    stream,
    play: async (blob: Blob) => {
      playing?.stop();
      playing = null;
      const buffer = await audioContext.decodeAudioData(await blob.arrayBuffer());
      await new Promise<void>((resolve, reject) => {
        const node = audioContext.createBufferSource();
        node.buffer = buffer;
        node.connect(audioContext.destination);
        node.onended = () => {
          if (playing === node) playing = null;
          resolve();
        };
        playing = node;
        try {
          node.start();
        } catch (error) {
          playing = null;
          reject(error instanceof Error ? error : new Error('playback failed'));
        }
      });
    },
    level: () => {
      if (audioContext.state !== 'running') return -1;
      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (const sample of samples) sum += sample * sample;
      return Math.sqrt(sum / samples.length);
    },
    describeInput: () => {
      const track = stream.getAudioTracks()[0];
      if (!track) return 'no audio track';
      return `${track.label || 'unnamed input'}${track.muted ? ', muted' : ''}${
        track.enabled ? '' : ', disabled'
      }, ${track.readyState}`;
    },
    release: () => {
      playing?.stop();
      playing = null;
      // Kept alive until here, so nothing in this graph can be collected while
      // the call is still using it.
      source.disconnect();
      analyser.disconnect();
      silent.disconnect();
      stream.getTracks().forEach((track) => track.stop());
      void audioContext.close().catch(() => undefined);
    },
  };
}

export async function recordUtterance(
  microphone: CallMicrophone,
  callbacks: RecorderCallbacks
): Promise<RecorderHandle> {
  const stream = microphone.stream;
  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks: Blob[] = [];
  let heardSpeech = false;
  let speechStartedAt = 0;
  // The loudest thing the microphone heard. Reported when nothing was
  // understood, because "the room was silent" and "the analyser was reading
  // silence while somebody talked" look identical from the outside and need
  // completely different fixes. Three attempts were spent guessing between
  // them.
  let peakLevel = 0;
  let contextState = 'running';
  let finished = false;
  // One holder, because release() closes over these before either is set and
  // a timer assigned exactly once is not a variable worth reassigning.
  const timers: { silence?: number; maximum?: number } = {};
  let frame = 0;

  // Everything except the microphone, which belongs to the call rather than to
  // this sentence. A MediaRecorder whose tracks have already been stopped can
  // emit no final chunk, and the microphone must outlive this recording anyway.
  const releaseWatchers = () => {
    window.clearTimeout(timers.silence);
    window.clearTimeout(timers.maximum);
    cancelAnimationFrame(frame);
  };

  // Stops. It does not report: onstop is the single place that decides whether
  // an utterance happened, so a stop can never announce one answer while the
  // recorder announces another.
  const finish = () => {
    if (finished) return;
    finished = true;
    releaseWatchers();
    if (recorder.state === 'inactive') {
      callbacks.onNothingHeard(describeSilence(peakLevel, chunks.length, contextState));
      return;
    }
    recorder.stop();
  };

  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) chunks.push(event.data);
  };
  recorder.onstop = () => {
    const spokenFor = speechStartedAt ? Date.now() - speechStartedAt : 0;
    if (!heardSpeech || spokenFor < MIN_SPEECH_MS || chunks.length === 0) {
      callbacks.onNothingHeard(describeSilence(peakLevel, chunks.length, contextState));
      return;
    }
    callbacks.onUtterance(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }));
  };

  // Loudness, measured rather than guessed. An utterance ends when the room
  // goes quiet for long enough, which is what makes this hands free.
  const watchLevel = () => {
    if (finished) return;
    const level = microphone.level();
    // -1 means the analyser is not running, which reads as silence however
    // loudly anybody talks. Recorded so the notice can say so.
    if (level < 0) {
      contextState = 'suspended';
    } else if (level > peakLevel) {
      peakLevel = level;
    }

    if (level > SILENCE_THRESHOLD) {
      if (!heardSpeech) {
        heardSpeech = true;
        speechStartedAt = Date.now();
      }
      window.clearTimeout(timers.silence);
      timers.silence = window.setTimeout(finish, SILENCE_MS);
    }
    frame = requestAnimationFrame(watchLevel);
  };

  recorder.start();
  callbacks.onListening?.();
  frame = requestAnimationFrame(watchLevel);
  timers.maximum = window.setTimeout(finish, MAX_UTTERANCE_MS);

  return {
    stop: finish,
    cancel: () => {
      if (finished) return;
      finished = true;
      releaseWatchers();
      // Silence the delivery handler before stopping, so cancelling never
      // reports an utterance nobody asked for.
      recorder.onstop = null;
      if (recorder.state !== 'inactive') recorder.stop();
    },
  };
}
