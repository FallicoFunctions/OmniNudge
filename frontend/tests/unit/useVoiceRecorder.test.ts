import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useVoiceRecorder } from '../../src/hooks/useVoiceRecorder';

type MockTrack = { stop: ReturnType<typeof vi.fn> };
type MockStream = { getTracks: () => MockTrack[] };

class FakeMediaRecorder {
  static isTypeSupported(type: string): boolean {
    return type === 'audio/webm;codecs=opus';
  }

  state: 'inactive' | 'recording' | 'paused' = 'inactive';
  mimeType = 'audio/webm;codecs=opus';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  private readonly chunk = new Blob(['voice-bytes'], { type: 'audio/webm' });

  constructor(_stream: MediaStream, _options?: MediaRecorderOptions) {}

  start(_timeslice?: number) {
    this.state = 'recording';
  }

  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: this.chunk });
    this.onstop?.();
  }

  pause() {
    this.state = 'paused';
  }

  resume() {
    this.state = 'recording';
  }
}

class FakeAnalyser {
  fftSize = 0;
  frequencyBinCount = 32;
  getByteFrequencyData = vi.fn((arr: Uint8Array) => {
    arr.fill(10);
  });
}

class FakeAudioContext {
  createMediaStreamSource = vi.fn(() => ({ connect: vi.fn() }));
  createAnalyser = vi.fn(() => new FakeAnalyser() as unknown as AnalyserNode);
  close = vi.fn(async () => undefined);
}

describe('useVoiceRecorder', () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    Object.defineProperty(globalThis, 'MediaRecorder', {
      value: FakeMediaRecorder,
      configurable: true,
      writable: true,
    });

    Object.defineProperty(globalThis, 'AudioContext', {
      value: FakeAudioContext,
      configurable: true,
      writable: true,
    });
  });

  it('starts and stops recording, producing an audio blob', async () => {
    const stop = vi.fn();
    const stream: MockStream = { getTracks: () => [{ stop }] };
    const getUserMedia = vi.fn(async () => stream as unknown as MediaStream);
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia },
      configurable: true,
    });

    const { result } = renderHook(() => useVoiceRecorder());

    await act(async () => {
      await result.current.start();
    });
    expect(result.current.state).toBe('recording');
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });

    act(() => {
      result.current.stop();
    });

    await waitFor(() => {
      expect(result.current.state).toBe('stopped');
      expect(result.current.audioBlob).not.toBeNull();
    });
    expect(stop).toHaveBeenCalled();
  });

  it('handles microphone permission errors', async () => {
    const getUserMedia = vi.fn(async () => {
      throw Object.assign(new Error('denied'), { name: 'NotAllowedError' });
    });
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia },
      configurable: true,
    });

    const { result } = renderHook(() => useVoiceRecorder());

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.state).toBe('error');
    expect(result.current.error).toBeTruthy();
  });

  it('resets recording state on cancel', async () => {
    const stop = vi.fn();
    const stream: MockStream = { getTracks: () => [{ stop }] };
    const getUserMedia = vi.fn(async () => stream as unknown as MediaStream);
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia },
      configurable: true,
    });

    const { result } = renderHook(() => useVoiceRecorder());
    await act(async () => {
      await result.current.start();
    });

    act(() => {
      result.current.cancel();
    });

    expect(result.current.state).toBe('idle');
    expect(result.current.audioBlob).toBeNull();
    expect(result.current.durationSeconds).toBe(0);
    expect(stop).toHaveBeenCalled();
  });
});
