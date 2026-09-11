/**
 * The audio of a live call: the microphone going out as 16 kHz PCM, and her
 * voice coming back as 24 kHz PCM, played without gaps.
 *
 * Gemini Live takes and gives raw 16-bit little-endian mono PCM. Nothing here
 * encodes or decodes a container: a frame is exactly the samples it carries.
 */

export const LIVE_INPUT_RATE = 16_000;
export const LIVE_OUTPUT_RATE = 24_000;
const CHUNK_SECONDS = 0.1;
/**
 * How far ahead the first chunk of a reply is scheduled. Without it the first
 * chunk is due the instant it arrives, and a chunk that is late by a few
 * milliseconds is heard as a click.
 */
const PLAYBACK_LEAD_SECONDS = 0.05;
const CAPTURE_MODULE_URL = '/omnichat/live-call-capture.js';
const CAPTURE_PROCESSOR = 'live-call-capture';

/** One float sample as a signed 16-bit value, clipped rather than wrapped. */
export function floatToPcm16(sample: number): number {
  const clipped = Math.max(-1, Math.min(1, sample));
  return clipped < 0 ? Math.round(clipped * 0x8000) : Math.round(clipped * 0x7fff);
}

/**
 * Turns one chunk of microphone samples into 16 kHz PCM.
 *
 * Each output sample averages the input samples it covers. At these ratios
 * that box filter is also the low-pass a voice needs before decimation, so a
 * 48 kHz microphone does not fold hiss down into the speech band.
 */
export function downsampleToPcm16(
  input: Float32Array,
  fromRate: number,
  toRate: number = LIVE_INPUT_RATE
): Int16Array {
  const ratio = fromRate / toRate;
  const length = Math.floor(input.length / ratio);
  const output = new Int16Array(length);
  for (let i = 0; i < length; i += 1) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.max(start + 1, Math.floor((i + 1) * ratio)));
    let sum = 0;
    for (let j = start; j < end; j += 1) sum += input[j];
    output[i] = floatToPcm16(sum / (end - start));
  }
  return output;
}

/** Her voice as the samples Web Audio plays. A trailing odd byte is dropped. */
export function pcm16ToFloat32(bytes: ArrayBuffer): Float32Array<ArrayBuffer> {
  const view = new DataView(bytes);
  const samples = new Float32Array(Math.floor(bytes.byteLength / 2));
  for (let i = 0; i < samples.length; i += 1) {
    samples[i] = view.getInt16(i * 2, true) / 0x8000;
  }
  return samples;
}

/**
 * Gathers microphone frames into 100 ms chunks of 16 kHz PCM.
 *
 * A chunk is always exactly 100 ms of input: every sample rate a browser uses
 * divides by ten, so there is never a fractional sample left over to drift.
 */
export function createPcmChunker(fromRate: number, onChunk: (pcm: ArrayBuffer) => void) {
  const perChunk = Math.round(fromRate * CHUNK_SECONDS);
  let pending = new Float32Array(perChunk * 2);
  let filled = 0;
  return {
    push(frame: Float32Array) {
      if (filled + frame.length > pending.length) {
        const grown = new Float32Array(Math.max(pending.length * 2, filled + frame.length));
        grown.set(pending.subarray(0, filled));
        pending = grown;
      }
      pending.set(frame, filled);
      filled += frame.length;
      let offset = 0;
      while (filled - offset >= perChunk) {
        const pcm = downsampleToPcm16(pending.subarray(offset, offset + perChunk), fromRate);
        onChunk(pcm.buffer as ArrayBuffer);
        offset += perChunk;
      }
      if (offset > 0) {
        pending.copyWithin(0, offset, filled);
        filled -= offset;
      }
    },
  };
}

export type LiveCallCapture = { stop: () => void };

/**
 * Streams the microphone out of an already-running call context.
 *
 * The context is the call's, created and resumed while the call was starting,
 * so a browser that ties audio to a recent click has already allowed it.
 */
export async function startLiveCallCapture(
  context: AudioContext,
  stream: MediaStream,
  onChunk: (pcm: ArrayBuffer) => void
): Promise<LiveCallCapture> {
  await context.audioWorklet.addModule(CAPTURE_MODULE_URL);
  const source = context.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(context, CAPTURE_PROCESSOR, {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    channelCount: 1,
  });
  // A node that reaches no destination is not guaranteed to be pulled, so it
  // is routed to the speakers at a gain of zero, as the microphone meter is.
  const silent = context.createGain();
  silent.gain.value = 0;
  const chunker = createPcmChunker(context.sampleRate, onChunk);
  node.port.onmessage = (event: MessageEvent<Float32Array>) => chunker.push(event.data);
  source.connect(node);
  node.connect(silent);
  silent.connect(context.destination);
  return {
    stop: () => {
      node.port.onmessage = null;
      source.disconnect();
      node.disconnect();
      silent.disconnect();
    },
  };
}

export type LivePcmPlayer = {
  /** Plays a chunk straight after whatever is already queued. */
  enqueue: (pcm: ArrayBuffer) => void;
  /** Drops everything queued or playing: she has been talked over. */
  clear: () => void;
  isPlaying: () => boolean;
};

/**
 * Plays her voice as it streams in.
 *
 * Each chunk is scheduled to start exactly when the one before it ends, on the
 * context's own clock, which is what makes a stream of 40 ms pieces sound like
 * one voice rather than a stutter.
 */
export function createLivePcmPlayer(
  context: AudioContext,
  onPlayingChange?: (playing: boolean) => void
): LivePcmPlayer {
  const playing = new Set<AudioBufferSourceNode>();
  let nextStart = 0;

  const settle = () => {
    if (playing.size === 0) onPlayingChange?.(false);
  };

  return {
    enqueue: (pcm) => {
      const samples = pcm16ToFloat32(pcm);
      if (samples.length === 0) return;
      const buffer = context.createBuffer(1, samples.length, LIVE_OUTPUT_RATE);
      buffer.copyToChannel(samples, 0);
      const node = context.createBufferSource();
      node.buffer = buffer;
      node.connect(context.destination);
      const startAt = Math.max(nextStart, context.currentTime + PLAYBACK_LEAD_SECONDS);
      nextStart = startAt + buffer.duration;
      const wasSilent = playing.size === 0;
      playing.add(node);
      node.onended = () => {
        playing.delete(node);
        settle();
      };
      node.start(startAt);
      if (wasSilent) onPlayingChange?.(true);
    },
    clear: () => {
      const stopping = [...playing];
      playing.clear();
      nextStart = 0;
      for (const node of stopping) {
        node.onended = null;
        try {
          node.stop();
        } catch {
          // Already finished; nothing to stop.
        }
        node.disconnect();
      }
      if (stopping.length > 0) onPlayingChange?.(false);
    },
    isPlaying: () => playing.size > 0,
  };
}
