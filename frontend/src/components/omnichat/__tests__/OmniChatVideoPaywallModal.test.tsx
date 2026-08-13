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
    expect(screen.getByText(/video requires omnicredits/i)).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toHaveAttribute(
      'aria-describedby',
      'omnichat-video-paywall-description'
    );
    fireEvent.click(screen.getByRole('button', { name: /view plans and credits/i }));
    expect(onViewOptions).toHaveBeenCalledOnce();
  });
});
