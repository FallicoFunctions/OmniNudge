import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import OmniChatVideoPaywallModal from '../OmniChatVideoPaywallModal';

describe('OmniChatVideoPaywallModal', () => {
  it('explains the server-required entitlement and opens the relevant commerce surface', () => {
    const onViewOptions = vi.fn();
    render(
      <OmniChatVideoPaywallModal
        isOpen
        feature="scene_video"
        onClose={vi.fn()}
        onViewOptions={onViewOptions}
      />
    );
    expect(screen.getByRole('heading', { name: /unlock scene video/i })).toBeInTheDocument();
    expect(screen.getByText(/this needs omnicredits/i)).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toHaveAttribute(
      'aria-describedby',
      'omnichat-video-paywall-description'
    );
    fireEvent.click(screen.getByRole('button', { name: /view plans and credits/i }));
    expect(onViewOptions).toHaveBeenCalledOnce();
  });

  // A voice call is paid by the minute, and the same screen offers it: its
  // wording is not about video, because this is not video.
  it('offers a voice call without calling it video', () => {
    render(
      <OmniChatVideoPaywallModal isOpen feature="voice_call" onClose={vi.fn()} onViewOptions={vi.fn()} />
    );
    expect(screen.getByRole('heading', { name: /unlock voice calls/i })).toBeInTheDocument();
    expect(screen.getByText(/this needs omnicredits/i)).toBeInTheDocument();
    expect(screen.queryByText(/video/i)).not.toBeInTheDocument();
    const dialog = screen.getByRole('dialog');
    expect(dialog.querySelector('.lucide-phone')).not.toBeNull();
    expect(dialog.querySelector('.lucide-film')).toBeNull();
  });

  it('keeps the film icon for video', () => {
    render(
      <OmniChatVideoPaywallModal isOpen feature="scene_video" onClose={vi.fn()} onViewOptions={vi.fn()} />
    );
    expect(screen.getByRole('dialog').querySelector('.lucide-film')).not.toBeNull();
  });
});
