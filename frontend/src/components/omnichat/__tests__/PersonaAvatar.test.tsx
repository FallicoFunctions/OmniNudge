import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import PersonaAvatar from '../PersonaAvatar';
import type { BotPersona } from '../../../types/omnichat';

const basePersona: BotPersona = {
  id: 7,
  slug: 'narrator',
  name: 'Narrator',
  description: 'A terse, old-school text-adventure narrator.',
  category: 'roleplay',
  avatar_url: '/uploads/persona-avatar.png',
  preview_video_url: '/uploads/persona-preview.mp4',
  is_nsfw: false,
  is_active: true,
  created_at: '2026-07-01T10:00:00Z',
  updated_at: '2026-07-01T10:00:00Z',
};

const playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play');
const pauseSpy = vi.spyOn(HTMLMediaElement.prototype, 'pause');
const loadSpy = vi.spyOn(HTMLMediaElement.prototype, 'load');

beforeAll(() => {
  playSpy.mockImplementation(() => Promise.resolve());
  pauseSpy.mockImplementation(() => undefined);
  loadSpy.mockImplementation(() => undefined);
});

beforeEach(() => {
  playSpy.mockClear();
  pauseSpy.mockClear();
  loadSpy.mockClear();
});

describe('PersonaAvatar', () => {
  it('renders the poster image by default', () => {
    render(<PersonaAvatar persona={basePersona} />);

    expect(screen.getByRole('img')).toHaveAttribute('src', '/uploads/persona-avatar.png');
    expect(screen.queryByTestId('persona-preview-video')).not.toBeInTheDocument();
  });

  it('renders the preview video when preview mode is active', () => {
    render(
      <PersonaAvatar
        persona={basePersona}
        previewEnabled
        previewActive
      />
    );

    const video = screen.getByTestId('persona-preview-video');
    expect(video).toBeInTheDocument();
    expect(video).toHaveAttribute('src', '/uploads/persona-preview.mp4');
    expect(video).toHaveAttribute('poster', '/uploads/persona-avatar.png');
  });

  it('does not render a preview video when the persona has no preview media', () => {
    render(
      <PersonaAvatar
        persona={{ ...basePersona, preview_video_url: undefined }}
        previewEnabled
        previewActive
      />
    );

    expect(screen.queryByTestId('persona-preview-video')).not.toBeInTheDocument();
  });

  it('rewinds and hides the preview when it becomes inactive without a hold state', () => {
    const { rerender } = render(
      <PersonaAvatar
        persona={basePersona}
        previewEnabled
        previewActive
      />
    );

    const video = screen.getByTestId('persona-preview-video') as HTMLVideoElement;
    video.currentTime = 2.4;

    rerender(
      <PersonaAvatar
        persona={basePersona}
        previewEnabled
        previewActive={false}
      />
    );

    expect(video.currentTime).toBe(0);
    expect(video).toHaveClass('opacity-0');
  });

  it('holds the last frame visible while mobile description overlay is expanded', () => {
    const { rerender } = render(
      <PersonaAvatar
        persona={basePersona}
        previewEnabled
        previewActive
      />
    );

    const video = screen.getByTestId('persona-preview-video') as HTMLVideoElement;
    video.currentTime = 2.4;

    rerender(
      <PersonaAvatar
        persona={basePersona}
        previewEnabled
        previewActive={false}
        previewVisibleWhenInactive
        resetOnInactive={false}
      />
    );

    expect(video.currentTime).toBe(2.4);
    expect(video).toHaveClass('opacity-100');
  });

  it('still attempts playback when rewinding to the first frame is not yet allowed', () => {
    const { rerender } = render(
      <PersonaAvatar
        persona={basePersona}
        previewEnabled
        previewActive={false}
      />
    );

    const video = screen.getByTestId('persona-preview-video') as HTMLVideoElement;

    Object.defineProperty(video, 'currentTime', {
      configurable: true,
      get: () => 0,
      set: () => {
        throw new DOMException('Metadata not ready', 'InvalidStateError');
      },
    });
    Object.defineProperty(video, 'readyState', {
      configurable: true,
      get: () => HTMLMediaElement.HAVE_CURRENT_DATA,
    });

    rerender(
      <PersonaAvatar
        persona={basePersona}
        previewEnabled
        previewActive
      />
    );

    expect(playSpy).toHaveBeenCalledTimes(1);
  });

  it('requests video data before playing when the preview is not ready yet', () => {
    const { rerender } = render(
      <PersonaAvatar
        persona={basePersona}
        previewEnabled
        previewActive={false}
      />
    );

    const video = screen.getByTestId('persona-preview-video') as HTMLVideoElement;

    Object.defineProperty(video, 'readyState', {
      configurable: true,
      get: () => HTMLMediaElement.HAVE_METADATA,
    });

    rerender(
      <PersonaAvatar
        persona={basePersona}
        previewEnabled
        previewActive
      />
    );

    expect(loadSpy).toHaveBeenCalledTimes(1);
  });
});
