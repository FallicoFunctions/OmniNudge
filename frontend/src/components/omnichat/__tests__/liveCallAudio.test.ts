import { describe, expect, it, vi } from 'vitest';
import {
  createLivePcmPlayer,
  createPcmChunker,
  downsampleToPcm16,
  floatToPcm16,
  pcm16ToFloat32,
} from '../liveCallAudio';

function pcmBytes(samples: number[]): ArrayBuffer {
  const view = new DataView(new ArrayBuffer(samples.length * 2));
  samples.forEach((sample, i) => view.setInt16(i * 2, sample, true));
  return view.buffer;
}

describe('floatToPcm16', () => {
  it('clips instead of wrapping', () => {
    expect(floatToPcm16(1.5)).toBe(32767);
    expect(floatToPcm16(-1.5)).toBe(-32768);
    expect(floatToPcm16(0)).toBe(0);
  });
});

describe('downsampleToPcm16', () => {
  it('turns 100 ms at 48 kHz into 100 ms at 16 kHz', () => {
    const out = downsampleToPcm16(new Float32Array(4800).fill(0.5), 48_000);
    expect(out.length).toBe(1600);
    expect(out[0]).toBe(16384);
    expect(out[1599]).toBe(16384);
  });

  it('turns 100 ms at 44.1 kHz into exactly 1600 samples', () => {
    expect(downsampleToPcm16(new Float32Array(4410).fill(0.25), 44_100).length).toBe(1600);
  });

  it('averages the samples each output covers', () => {
    // 3:1, so each output sample is the mean of three inputs.
    const out = downsampleToPcm16(Float32Array.from([0.3, 0.6, 0.9, -0.3, -0.6, -0.9]), 48_000);
    expect(Array.from(out)).toEqual([floatToPcm16(0.6), floatToPcm16(-0.6)]);
  });
});

describe('pcm16ToFloat32', () => {
  it('reads little-endian samples and drops a trailing odd byte', () => {
    const bytes = new Uint8Array([...new Uint8Array(pcmBytes([16384, -32768])), 7]).buffer;
    expect(Array.from(pcm16ToFloat32(bytes))).toEqual([0.5, -1]);
  });
});

describe('createPcmChunker', () => {
  it('emits one 3,200-byte chunk per 100 ms and keeps the remainder', () => {
    const chunks: ArrayBuffer[] = [];
    const chunker = createPcmChunker(48_000, (pcm) => chunks.push(pcm));
    // 4800 * 2 + 100 samples, in the 128-sample pieces a worklet delivers.
    const total = 4800 * 2 + 100;
    for (let sent = 0; sent < total; sent += 128) {
      chunker.push(new Float32Array(Math.min(128, total - sent)).fill(0.1));
    }
    expect(chunks.map((chunk) => chunk.byteLength)).toEqual([3200, 3200]);
    chunker.push(new Float32Array(4700).fill(0.1));
    expect(chunks.length).toBe(3);
  });

  it('copes with a frame larger than its buffer', () => {
    const chunks: ArrayBuffer[] = [];
    createPcmChunker(16_000, (pcm) => chunks.push(pcm)).push(new Float32Array(16_000));
    expect(chunks.length).toBe(10);
  });
});

type FakeNode = {
  buffer: { duration: number } | null;
  startedAt: number | null;
  stopped: boolean;
  onended: (() => void) | null;
  connect: () => void;
  disconnect: () => void;
  start: (at: number) => void;
  stop: () => void;
};

function fakeContext() {
  const nodes: FakeNode[] = [];
  const context = {
    currentTime: 10,
    destination: {},
    createBuffer: (_channels: number, length: number, rate: number) => ({
      duration: length / rate,
      copyToChannel: vi.fn(),
    }),
    createBufferSource: () => {
      const node: FakeNode = {
        buffer: null,
        startedAt: null,
        stopped: false,
        onended: null,
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: (at) => {
          node.startedAt = at;
        },
        stop: () => {
          node.stopped = true;
        },
      };
      nodes.push(node);
      return node;
    },
  };
  return { context: context as unknown as AudioContext, nodes, clock: context };
}

describe('createLivePcmPlayer', () => {
  it('plays each chunk the instant the previous one ends', () => {
    const { context, nodes } = fakeContext();
    const player = createLivePcmPlayer(context);
    // 2,400 samples at 24 kHz is 100 ms.
    player.enqueue(pcmBytes(new Array(2400).fill(1000)));
    player.enqueue(pcmBytes(new Array(2400).fill(1000)));
    expect(nodes[0].startedAt).toBeCloseTo(10.05);
    expect(nodes[1].startedAt).toBeCloseTo(10.15);
    expect(player.isPlaying()).toBe(true);
  });

  it('starts a new reply a moment ahead, not in the past', () => {
    const { context, nodes, clock } = fakeContext();
    const player = createLivePcmPlayer(context);
    player.enqueue(pcmBytes(new Array(2400).fill(1)));
    nodes[0].onended?.();
    clock.currentTime = 30;
    player.enqueue(pcmBytes(new Array(2400).fill(1)));
    expect(nodes[1].startedAt).toBeCloseTo(30.05);
  });

  it('stops everything at once when she is talked over', () => {
    const { context, nodes } = fakeContext();
    const changes: boolean[] = [];
    const player = createLivePcmPlayer(context, (playing) => changes.push(playing));
    player.enqueue(pcmBytes(new Array(2400).fill(1)));
    player.enqueue(pcmBytes(new Array(2400).fill(1)));
    player.clear();
    expect(nodes.every((node) => node.stopped)).toBe(true);
    expect(player.isPlaying()).toBe(false);
    expect(changes).toEqual([true, false]);
    // What comes after the interruption starts fresh, not after the dropped audio.
    player.enqueue(pcmBytes(new Array(2400).fill(1)));
    expect(nodes[2].startedAt).toBeCloseTo(10.05);
  });

  it('says when she has finished speaking', () => {
    const { context, nodes } = fakeContext();
    const changes: boolean[] = [];
    const player = createLivePcmPlayer(context, (playing) => changes.push(playing));
    player.enqueue(pcmBytes(new Array(2400).fill(1)));
    player.enqueue(pcmBytes(new Array(2400).fill(1)));
    nodes[0].onended?.();
    expect(changes).toEqual([true]);
    nodes[1].onended?.();
    expect(changes).toEqual([true, false]);
  });

  it('ignores an empty chunk', () => {
    const { context, nodes } = fakeContext();
    createLivePcmPlayer(context).enqueue(new ArrayBuffer(1));
    expect(nodes.length).toBe(0);
  });
});
