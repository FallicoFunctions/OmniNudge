/**
 * Whose blob URL the voice player may revoke.
 *
 * The player makes a blob URL itself for a recording it fetches, and must free
 * it. An encrypted recording arrives already decrypted, as a blob URL its
 * caller owns; the player revoked that one too when playback ended or stopped,
 * so the message could never be played a second time.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useVoicePlayer } from '../useVoicePlayer';
import { authenticatedFetch } from '../../services/authSession';

vi.mock('../../services/authSession', () => ({ authenticatedFetch: vi.fn() }));

class FakeAudio {
  static made: FakeAudio[] = [];
  src: string;
  playbackRate = 1;
  duration = 1;
  currentTime = 0;
  ended = false;
  private listeners: Record<string, Array<() => void>> = {};
  constructor(src: string) {
    this.src = src;
    FakeAudio.made.push(this);
  }
  addEventListener(type: string, listener: () => void) {
    (this.listeners[type] ??= []).push(listener);
  }
  play() {
    return Promise.resolve();
  }
  pause() {}
  emit(type: string) {
    this.listeners[type]?.forEach((listener) => listener());
  }
}

const revoked: string[] = [];

beforeEach(() => {
  FakeAudio.made = [];
  revoked.length = 0;
  vi.stubGlobal('Audio', FakeAudio);
  Object.assign(URL, {
    createObjectURL: vi.fn(() => 'blob:made-by-the-player'),
    revokeObjectURL: vi.fn((url: string) => revoked.push(url)),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useVoicePlayer', () => {
  it('leaves a blob URL its caller owns alive, so the message plays again', async () => {
    const { result } = renderHook(() => useVoicePlayer());
    act(() => result.current.play('blob:decrypted-owned-by-the-caller'));
    await waitFor(() => expect(FakeAudio.made).toHaveLength(1));

    act(() => {
      FakeAudio.made[0].ended = true;
      FakeAudio.made[0].emit('ended');
    });

    expect(revoked).not.toContain('blob:decrypted-owned-by-the-caller');
  });

  it('still frees the blob URL it made for a fetched recording', async () => {
    vi.mocked(authenticatedFetch).mockResolvedValue(new Response(new Blob(['audio'])));
    const { result } = renderHook(() => useVoicePlayer());
    act(() => result.current.play('http://localhost:8080/api/v1/voice/5/download'));
    await waitFor(() => expect(FakeAudio.made).toHaveLength(1));

    act(() => {
      FakeAudio.made[0].ended = true;
      FakeAudio.made[0].emit('ended');
    });

    expect(revoked).toContain('blob:made-by-the-player');
  });
});
