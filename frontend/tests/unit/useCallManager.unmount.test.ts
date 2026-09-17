/**
 * Leaving the screen while the camera or microphone prompt is open.
 *
 * Every acquisition in useCallManager awaits the person's permission and then
 * hands the stream to setLocalStream. The unmount cleanup stops whatever is in
 * state, so a stream that arrives after the unmount has no owner: the device
 * stays live, with its indicator on, until the page is reloaded.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCallManager } from '../../src/hooks/useCallManager';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../../src/services/callsService', () => ({
  callsService: {
    startCall: vi.fn(async () => ({ id: 1, call_type: 'voice', status: 'ringing' })),
    answerCall: vi.fn(async () => undefined),
    endCall: vi.fn(async () => undefined),
    sendSignal: vi.fn(async () => undefined),
    getIceServers: vi.fn(async () => []),
  },
}));

const track = () => ({ stop: vi.fn(), kind: 'audio', enabled: true, getSettings: () => ({}) });

describe('useCallManager: the screen closes before permission arrives', () => {
  let stopCalls: Array<ReturnType<typeof vi.fn>>;
  let grant: (stream: MediaStream) => void;

  beforeEach(() => {
    stopCalls = [];
    grant = () => {};
    const getUserMedia = vi.fn(
      () =>
        new Promise<MediaStream>((resolve) => {
          grant = resolve;
        })
    );
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia,
        enumerateDevices: vi.fn(async () => []),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
      configurable: true,
      writable: true,
    });
  });

  const streamWithTracks = (): MediaStream => {
    const tracks = [track(), track()];
    stopCalls = tracks.map((t) => t.stop);
    return {
      getTracks: () => tracks,
      getAudioTracks: () => tracks,
      getVideoTracks: () => [],
    } as unknown as MediaStream;
  };

  it('stops the microphone when an outgoing call is abandoned mid-prompt', async () => {
    const { result, unmount } = renderHook(() => useCallManager());

    act(() => {
      void result.current.startCall(7, 'voice');
    });
    await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled());

    unmount();
    await act(async () => {
      grant(streamWithTracks());
    });

    expect(stopCalls).toHaveLength(2);
    for (const stop of stopCalls) {
      expect(stop).toHaveBeenCalledTimes(1);
    }
  });
});
