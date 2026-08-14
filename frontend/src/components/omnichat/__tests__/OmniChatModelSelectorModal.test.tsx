import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import OmniChatModelSelectorModal from '../OmniChatModelSelectorModal';

describe('OmniChatModelSelectorModal', () => {
  it('shows the five user-facing conversation profiles without provider configuration', () => {
    render(
      <OmniChatModelSelectorModal
        isOpen
        accountTier="premium"
        currentModelKey="standard"
        isGuest={false}
        onClose={vi.fn()}
        onApply={vi.fn()}
        onRequestAuth={vi.fn()}
        onRequestUpgrade={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: /select standard/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /select plus/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /select premium quick/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /select premium deep/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /select advanced/i })).toBeInTheDocument();
    expect(
      screen.getByText(/advanced reasoning for complex character and scene continuity/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/a plus profile for conversations you return to/i)).toBeInTheDocument();
    expect(
      screen.queryByText(
        /best quality|more capable|stronger character consistency|more responsive|nuanced|highest-capability/i
      )
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/ultra fast/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/claude|sonnet|opus|effort/i)).not.toBeInTheDocument();
  });

  it('asks an eligible member whether to apply a profile to this chat or all chats', () => {
    const onApply = vi.fn();
    render(
      <OmniChatModelSelectorModal
        isOpen
        accountTier="premium"
        currentModelKey="standard"
        isGuest={false}
        onClose={vi.fn()}
        onApply={onApply}
        onRequestAuth={vi.fn()}
        onRequestUpgrade={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /select premium deep/i }));
    expect(screen.getByRole('heading', { name: /use premium deep where/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /only this chat/i }));
    expect(onApply).toHaveBeenCalledWith('premium_deep', 'this_chat');
  });

  it('opens authentication instead of changing a guest model', () => {
    const onRequestAuth = vi.fn();
    render(
      <OmniChatModelSelectorModal
        isOpen
        accountTier="free"
        currentModelKey="standard"
        isGuest
        onClose={vi.fn()}
        onApply={vi.fn()}
        onRequestAuth={onRequestAuth}
        onRequestUpgrade={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /select plus/i }));
    expect(onRequestAuth).toHaveBeenCalledOnce();
  });

  it('opens the upgrade comparison for a locked model', () => {
    const onRequestUpgrade = vi.fn();
    render(
      <OmniChatModelSelectorModal
        isOpen
        accountTier="free"
        currentModelKey="standard"
        isGuest={false}
        onClose={vi.fn()}
        onApply={vi.fn()}
        onRequestAuth={vi.fn()}
        onRequestUpgrade={onRequestUpgrade}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /select premium quick/i }));
    expect(onRequestUpgrade).toHaveBeenCalledWith('premium');
  });

  it('offers Advanced to Premium members with accurate OmniCredits pricing copy', () => {
    const onApply = vi.fn();
    render(
      <OmniChatModelSelectorModal
        isOpen
        accountTier="premium"
        currentModelKey="premium_deep"
        isGuest={false}
        onClose={vi.fn()}
        onApply={onApply}
        onRequestAuth={vi.fn()}
        onRequestUpgrade={vi.fn()}
      />
    );

    expect(screen.getByText(/uses 2 omnicredits per response/i)).toBeInTheDocument();
    const advanced = screen.getByRole('button', { name: /select advanced/i });
    fireEvent.click(advanced);
    fireEvent.click(screen.getByRole('button', { name: /only this chat/i }));
    expect(onApply).toHaveBeenCalledWith('ultra_fast', 'this_chat');
  });
});
