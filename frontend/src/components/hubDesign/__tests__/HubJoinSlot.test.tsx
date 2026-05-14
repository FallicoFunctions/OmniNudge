import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HubJoinSlot } from '../HubDesignSlots';

describe('HubJoinSlot', () => {
  it('reacts to isSubscribed prop changes', () => {
    const { rerender } = render(
      <HubJoinSlot hubName="testHub" isSubscribed={false} userId={123} />,
    );

    expect(screen.getByRole('button', { name: 'Join' })).toBeInTheDocument();

    rerender(<HubJoinSlot hubName="testHub" isSubscribed userId={123} />);

    expect(screen.getByRole('button', { name: 'Leave' })).toBeInTheDocument();
  });
});
