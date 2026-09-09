import { describe, expect, it, vi } from 'vitest';
import { playCallSentences } from '../callSentenceSpeech';

const TURN = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';

function announce(sequence: number) {
  window.dispatchEvent(
    new CustomEvent('omnichat_call_sentence', {
      detail: { conversation_id: 12, turn: TURN, sequence },
    })
  );
}

function done(spoken: number) {
  window.dispatchEvent(
    new CustomEvent('omnichat_call_sentences_done', {
      detail: { conversation_id: 12, turn: TURN, spoken },
    })
  );
}

// Identity, not content. jsdom's Blob has no working text(), and reading it
// threw inside the player -- where the catch that exists for a speaker that
// refuses a sentence swallowed it, and the test reported an empty list with no
// sign of why.
function run(overrides: Partial<Parameters<typeof playCallSentences>[0]> = {}) {
  const madeFor = new Map<Blob, number>();
  const played: number[] = [];
  const fetchSentence = vi.fn(async (_turn: string, sequence: number) => {
    if (sequence === 2) return null;
    const audio = new Blob([`sentence ${sequence}`]);
    madeFor.set(audio, sequence);
    return audio;
  });
  const handle = playCallSentences({
    conversationId: 12,
    fetchSentence,
    play: async (audio: Blob) => {
      played.push(madeFor.get(audio) ?? -1);
    },
    ...overrides,
  });
  return { handle, played, fetchSentence };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('playCallSentences', () => {
  it('plays sentences in order however they are announced', async () => {
    const { handle, played } = run();
    announce(1);
    announce(2);
    announce(3);
    done(3);

    await expect(handle.finished).resolves.toBe(true);
    // Sentence two carries no speech -- pure narration -- so it is skipped
    // rather than played as silence.
    expect(played).toEqual([1, 3]);
  });

  // The websocket is allowed to drop a notice; the hub does exactly that when
  // its channel is full, which is why the audio itself does not travel on it.
  //
  // The cost of a dropped notice is meant to be one sentence. It was every
  // sentence after it: the player stalled on the missing number, the terminal
  // check could never be reached, and the turn hung until the 45-second
  // timeout with her half-way through a reply.
  it('skips a lost notice instead of stalling on it', async () => {
    const { handle, played } = run();
    announce(1);
    // Two is never announced. Three is.
    announce(3);
    done(3);

    // Raced against a short timer rather than awaited, because the defect this
    // covers is a hang: without the fix the turn sits until the 45-second
    // give-up, and a test that waits for that proves the same thing far more
    // slowly.
    const outcome = await Promise.race([
      handle.finished,
      new Promise((resolve) => setTimeout(() => resolve('still waiting'), 50)),
    ]);

    expect(outcome).toBe(true);
    expect(played).toEqual([1, 3]);
  });

  it('reports that nothing was spoken when she wrote nothing to say', async () => {
    const { handle, fetchSentence } = run();
    done(0);

    await expect(handle.finished).resolves.toBe(false);
    expect(fetchSentence).not.toHaveBeenCalled();
  });

  // Ending the call stops her mid-sentence, and nothing announced afterwards
  // is fetched.
  it('fetches nothing once it is cancelled', async () => {
    const { handle, fetchSentence } = run();
    handle.cancel();
    announce(1);
    await settle();

    await expect(handle.finished).resolves.toBe(false);
    expect(fetchSentence).not.toHaveBeenCalled();
  });

  it('ignores another conversation entirely', async () => {
    const { handle, fetchSentence } = run();
    window.dispatchEvent(
      new CustomEvent('omnichat_call_sentence', {
        detail: { conversation_id: 99, turn: TURN, sequence: 1 },
      })
    );
    await settle();

    expect(fetchSentence).not.toHaveBeenCalled();
    handle.cancel();
    await handle.finished;
  });
});
