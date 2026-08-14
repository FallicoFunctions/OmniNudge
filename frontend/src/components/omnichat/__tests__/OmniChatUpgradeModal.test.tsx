import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import OmniChatUpgradeModal from '../OmniChatUpgradeModal';

describe('OmniChatUpgradeModal', () => {
  it('compares all three tiers and offers both paid choices', () => {
    const onChoosePlan = vi.fn();
    render(
      <OmniChatUpgradeModal
        isOpen
        currentTier="free"
        preferredTier="plus"
        onClose={vi.fn()}
        onChoosePlan={onChoosePlan}
      />
    );
    expect(screen.getByRole('heading', { name: 'Standard' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Plus' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Premium' })).toBeInTheDocument();
    expect(screen.getByText(/premium quick and premium deep/i)).toBeInTheDocument();
    expect(
      screen.getByText(/advanced available with omnicredits after launch/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/^standard and plus conversation profiles$/i)).toBeInTheDocument();
    expect(screen.getByText(/expanded profile access/i)).toBeInTheDocument();
    expect(
      screen.queryByText(
        /stronger models|more consistent|emotionally aware|improved character consistency|better handling|most nuanced|highest-quality|best experience|more capable/i
      )
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/best quality/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/ultra fast/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /choose plus/i }));
    expect(onChoosePlan).toHaveBeenCalledWith('plus');
    fireEvent.click(screen.getByRole('button', { name: /choose premium/i }));
    expect(onChoosePlan).toHaveBeenCalledWith('premium');
  });
});
