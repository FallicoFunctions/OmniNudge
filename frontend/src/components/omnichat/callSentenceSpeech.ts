/**
 * Plays a call reply sentence by sentence, as it is written.
 *
 * The whole-reply route cannot start until the last word exists. Measured on a
 * real call that was 5.8 seconds of silence after the caller stopped talking:
 * the model wrote the whole reply, then the whole reply was synthesised, and
 * only then did she say the first word.
 *
 * Here the server announces each sentence the moment it is finished. Every
 * announced sentence is fetched immediately, in parallel, and they are played
 * in order -- so sentence two is already synthesised and waiting while sentence
 * one is still being spoken.
 */

/** The turn is gone long before this. It exists so a lost notice cannot hang a call. */
const TURN_TIMEOUT_MS = 45_000;

export type CallSentenceEvent = {
  conversation_id: number;
  turn: string;
  sequence: number;
};

export type CallSentencesDoneEvent = {
  conversation_id: number;
  turn: string;
  spoken: number;
};

export type SentenceRun = {
  /** True when at least one sentence was spoken, so the caller has heard her. */
  finished: Promise<boolean>;
  /** Stops playback and releases the listeners. Safe to call twice. */
  cancel: () => void;
};

export type SentenceRunOptions = {
  conversationId: number;
  fetchSentence: (turn: string, sequence: number) => Promise<Blob | null>;
  play: (audio: Blob) => Promise<void>;
  onSpeaking?: (speaking: boolean) => void;
};

/**
 * Begins listening for this turn's sentences. Call it before sending, because
 * the first sentence can be announced before the send request settles.
 */
export function playCallSentences(options: SentenceRunOptions): SentenceRun {
  const { conversationId, fetchSentence, play, onSpeaking } = options;

  // Keyed by sequence, and holding the fetch rather than the audio: a sentence
  // is requested ahead of when it is needed, so the wait for one overlaps the
  // playing of the one before it.
  const pending = new Map<number, Promise<Blob | null>>();

  // One synthesis at a time, and this is the whole reason the chain exists.
  //
  // Every announced sentence used to be fetched the instant it was announced,
  // which meant a four-sentence reply asked the synthesiser for four clips at
  // once. The synthesiser is one local process on one GPU: it took the first
  // reply, and the concurrency wedged its worker for good -- every later
  // request returned 500, she stopped mid-reply, and it stayed broken after
  // the call had ended.
  //
  // Chaining costs nothing that matters. The clips are still fetched ahead of
  // the one being played, which is where the overlap comes from; they are just
  // no longer all in the air together.
  let fetchChain: Promise<unknown> = Promise.resolve();
  const fetchInTurn = (turn: string, sequence: number): Promise<Blob | null> => {
    const audio = fetchChain.then(() => (settled ? null : fetchSentence(turn, sequence)));
    // The chain must not break on a failure, or every later sentence inherits
    // the rejection and is never fetched at all.
    fetchChain = audio.catch(() => undefined);
    return audio;
  };
  let turn: string | null = null;
  let expected: number | null = null;
  let spokeSomething = false;
  let next = 1;
  let pumping = false;
  let settled = false;
  let announcedSpeaking = false;

  let resolveFinished: (spoke: boolean) => void = () => undefined;
  const finished = new Promise<boolean>((resolve) => {
    resolveFinished = resolve;
  });

  const stop = (spoke: boolean) => {
    if (settled) return;
    settled = true;
    window.removeEventListener('omnichat_call_sentence', onSentence);
    window.removeEventListener('omnichat_call_sentences_done', onDone);
    window.clearTimeout(timer);
    if (announcedSpeaking) onSpeaking?.(false);
    resolveFinished(spoke);
  };

  const timer = window.setTimeout(() => stop(spokeSomething), TURN_TIMEOUT_MS);

  const pump = async () => {
    if (pumping) return;
    pumping = true;
    try {
      while (!settled) {
        const waiting = pending.get(next);
        if (!waiting) {
          // Nothing for this number. Before the turn ends that means the
          // sentence has not been announced yet, so wait for it.
          if (expected === null || next > expected) break;
          // After it ends, it means the notice was lost -- which the websocket
          // is allowed to do, and is why the audio does not travel on it. Skip
          // the gap. Stalling here cost every sentence after the lost one and
          // hung the turn until the timeout, rather than costing the one
          // sentence the design accepts losing.
          next += 1;
          continue;
        }
        pending.delete(next);
        next += 1;
        let audio: Blob | null = null;
        try {
          audio = await waiting;
        } catch {
          // One sentence that could not be fetched is a gap, not a failed call.
          // Her words are in the conversation either way.
          audio = null;
        }
        if (settled) return;
        if (audio) {
          if (!announcedSpeaking) {
            announcedSpeaking = true;
            onSpeaking?.(true);
          }
          spokeSomething = true;
          try {
            await play(audio);
          } catch {
            // A speaker that refuses one sentence will refuse the next. Stop
            // rather than working through the reply in silence.
            stop(spokeSomething);
            return;
          }
        }
        if (settled) return;
      }
    } finally {
      pumping = false;
    }
    // The turn is over only once every announced sentence has been played.
    if (expected !== null && next > expected) stop(spokeSomething);
  };

  function onSentence(event: Event) {
    const detail = (event as CustomEvent<CallSentenceEvent>).detail;
    if (settled || !detail || detail.conversation_id !== conversationId) return;
    // The first sentence names the turn. Anything from another turn belongs to
    // a reply this run is not playing.
    if (turn === null) turn = detail.turn;
    if (detail.turn !== turn || detail.sequence < next) return;
    if (pending.has(detail.sequence)) return;
    pending.set(detail.sequence, fetchInTurn(detail.turn, detail.sequence));
    void pump();
  }

  function onDone(event: Event) {
    const detail = (event as CustomEvent<CallSentencesDoneEvent>).detail;
    if (settled || !detail || detail.conversation_id !== conversationId) return;
    if (turn !== null && detail.turn !== turn) return;
    if (detail.spoken < 1) {
      // She wrote nothing that could be spoken. The caller falls back to the
      // whole-reply voice rather than hearing nothing at all.
      stop(spokeSomething);
      return;
    }
    expected = detail.spoken;
    void pump();
  }

  window.addEventListener('omnichat_call_sentence', onSentence);
  window.addEventListener('omnichat_call_sentences_done', onDone);

  return { finished, cancel: () => stop(spokeSomething) };
}
