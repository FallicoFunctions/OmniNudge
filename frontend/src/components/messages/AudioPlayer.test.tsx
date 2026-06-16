import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import AudioPlayer from './AudioPlayer';

describe('AudioPlayer', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('supports play/pause, seek, speed, and download actions', async () => {
    const playMock = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (
      this: HTMLMediaElement
    ) {
      Object.defineProperty(this, 'paused', { configurable: true, get: () => false });
      this.dispatchEvent(new Event('play'));
      return Promise.resolve();
    });
    const pauseMock = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (
      this: HTMLMediaElement
    ) {
      Object.defineProperty(this, 'paused', { configurable: true, get: () => true });
      this.dispatchEvent(new Event('pause'));
    });

    const { container } = render(
      <AudioPlayer src="/uploads/voice-note.mp3" mimeType="audio/mpeg" fileName="voice-note.mp3" />
    );
    const audioEl = container.querySelector('audio');
    expect(audioEl).toBeTruthy();

    if (!audioEl) throw new Error('Audio element missing');

    Object.defineProperty(audioEl, 'duration', { configurable: true, value: 245 });
    Object.defineProperty(audioEl, 'currentTime', { configurable: true, writable: true, value: 0 });
    Object.defineProperty(audioEl, 'paused', { configurable: true, get: () => true });

    fireEvent.loadedMetadata(audioEl);
    expect(screen.getByText('0:00 / 4:05')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    });
    expect(playMock).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();

    audioEl.currentTime = 30;
    fireEvent.timeUpdate(audioEl);
    expect(screen.getByText('0:30 / 4:05')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('slider', { name: 'Seek' }), { target: { value: '60' } });
    expect(audioEl.currentTime).toBe(60);

    fireEvent.change(screen.getByRole('combobox', { name: 'Playback speed' }), {
      target: { value: '1.5' },
    });
    expect(audioEl.playbackRate).toBe(1.5);
    expect(screen.getByText('Speed: 1.5x')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(pauseMock).toHaveBeenCalledOnce();

    expect(screen.getByRole('link', { name: 'Download' })).toHaveAttribute(
      'download',
      'voice-note.mp3'
    );
  });
});
