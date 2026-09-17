/**
 * Leaving the call while the screen picker is open.
 *
 * getDisplayMedia waits on the person choosing a window, which takes as long as
 * they take. The unmount cleanup stops whatever screenStreamRef holds, so a
 * capture that arrives after the unmount has no owner: the browser keeps
 * sharing the screen until the page is reloaded.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useScreenShare } from '../../src/hooks/useScreenShare';

vi.mock('../../src/services/callsService', () => ({
  callsService: {
    startScreenShare: vi.fn(async () => undefined),
    stopScreenShare: vi.fn(async () => undefined),
  },
}));

describe('useScreenShare: the call screen closes before a window is chosen', () => {
  let grant: (stream: MediaStream) => void;

  beforeEach(() => {
    grant = () => {};
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getDisplayMedia: vi.fn(
          () =>
            new Promise<MediaStream>((resolve) => {
              grant = resolve;
            })
        ),
      },
      configurable: true,
      writable: true,
    });
  });

  it('stops the screen capture that arrives after the screen is gone', async () => {
    const stop = vi.fn();
    const videoTrack = { stop, kind: 'video', onended: null };
    const stream = {
      getTracks: () => [videoTrack],
      getVideoTracks: () => [videoTrack],
      getAudioTracks: () => [],
    } as unknown as MediaStream;

    const peerConnectionRef = { current: null };
    const { result, unmount } = renderHook(() =>
      useScreenShare(7, peerConnectionRef as unknown as React.RefObject<RTCPeerConnection | null>)
    );

    act(() => {
      void result.current.startSharing();
    });
    await waitFor(() => expect(navigator.mediaDevices.getDisplayMedia).toHaveBeenCalled());

    unmount();
    await act(async () => {
      grant(stream);
    });

    expect(stop).toHaveBeenCalledTimes(1);
  });
});
