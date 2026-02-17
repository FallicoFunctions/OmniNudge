import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useVoiceRecorder } from '../../src/hooks/useVoiceRecorder';

let mockMicDeviceId = '';

vi.mock('../../src/contexts/SettingsContext', () => ({
  useSettings: () => ({
    micDeviceId: mockMicDeviceId,
  }),
}));

type MockTrack = { stop: ReturnType<typeof vi.fn> };
type MockStream = { getTracks: () => MockTrack[] };

class FakeScriptProcessor {
  onaudioprocess: ((event: { inputBuffer: { getChannelData: (channel: number) => Float32Array } }) => void) | null = null;
  connect = vi.fn();
  disconnect = vi.fn();
}

class FakeAudioContext {
  static lastInstance: FakeAudioContext | null = null;
  sampleRate = 44100;
  destination = {};
  processor = new FakeScriptProcessor();
  createMediaStreamSource = vi.fn(() => ({ connect: vi.fn() }));
  createScriptProcessor = vi.fn(() => this.processor as unknown as ScriptProcessorNode);
  close = vi.fn(async () => undefined);

  constructor() {
    FakeAudioContext.lastInstance = this;
  }
}

describe('useVoiceRecorder', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockMicDeviceId = '';
    localStorage.setItem('auth_token', 'test-token');

    Object.defineProperty(globalThis, 'AudioContext', {
      value: FakeAudioContext,
      configurable: true,
      writable: true,
    });
  });

  it('reports MediaRecorder support when available', () => {
    class MediaRecorderMock {
      static isTypeSupported(type: string): boolean {
        return type === 'audio/webm';
      }
    }
    Object.defineProperty(globalThis, 'MediaRecorder', {
      value: MediaRecorderMock,
      configurable: true,
      writable: true,
    });

    const { result } = renderHook(() => useVoiceRecorder());
    expect(result.current.isMediaRecorderSupported).toBe(true);
  });

  it('uses Web Audio fallback and completes server-side encoding flow when MediaRecorder is unavailable', async () => {
    Object.defineProperty(globalThis, 'MediaRecorder', {
      value: undefined,
      configurable: true,
      writable: true,
    });

    const stop = vi.fn();
    const stream: MockStream = {
      getTracks: () => [{ stop }],
    };
    const getUserMedia = vi.fn(async () => stream as unknown as MediaStream);
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia },
      configurable: true,
    });

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ url: '/uploads/voice/test.webm' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        blob: async () => new Blob(['encoded'], { type: 'audio/webm' }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const onRecordingComplete = vi.fn();
    const { result } = renderHook(() =>
      useVoiceRecorder({
        onRecordingComplete,
      })
    );

    await act(async () => {
      await result.current.startRecording();
    });

    const audioContext = FakeAudioContext.lastInstance;
    expect(audioContext).not.toBeNull();
    audioContext?.processor.onaudioprocess?.({
      inputBuffer: { getChannelData: () => new Float32Array([0.2, -0.2, 0.1]) },
    });

    await act(async () => {
      await result.current.stopRecording();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(onRecordingComplete).toHaveBeenCalledTimes(1);
    expect(stop).toHaveBeenCalled();
  });

  it('applies selected microphone device id to getUserMedia constraints', async () => {
    Object.defineProperty(globalThis, 'MediaRecorder', {
      value: undefined,
      configurable: true,
      writable: true,
    });
    mockMicDeviceId = 'mic-123';

    const stop = vi.fn();
    const stream: MockStream = {
      getTracks: () => [{ stop }],
    };
    const getUserMedia = vi.fn(async () => stream as unknown as MediaStream);
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia },
      configurable: true,
    });

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ url: '/uploads/voice/test.webm' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        blob: async () => new Blob(['encoded'], { type: 'audio/webm' }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useVoiceRecorder());
    await act(async () => {
      await result.current.startRecording();
    });

    expect(getUserMedia).toHaveBeenCalledWith({
      audio: { deviceId: { exact: 'mic-123' } },
    });

    await act(async () => {
      await result.current.cancelRecording();
    });
    expect(stop).toHaveBeenCalled();
  });
});

